import { mkdir, open, rename, writeFile } from "node:fs/promises";
import { extname, join, resolve } from "node:path";

const bodyTypes = new Set(["Document", "XHR", "Fetch"]);
const trackedUrl = /^(https?|wss?):/;
const requestLimit = 200;
const consoleLimit = 100;
const replayLimit = 20;
const dialogMessageLimit = 500;
const styleBudget = 8192;
const recordLimit = 32768;
const dialogSummary = "javascript dialog open";
const summaryLimit = 3000;
const styleValueLimit = 500;
const errorLevels = new Set(["error", "exception"]);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const truncate = (value, length) => String(value ?? "").slice(0, length);

function parseConsole(event, phase) {
  const params = event.params;
  const argumentsText = params.args?.map((arg) => {
    if (arg.value !== undefined) return String(arg.value);
    return arg.description ?? arg.unserializableValue ?? "";
  }).join(" ");
  const exception = params.exceptionDetails;
  const text = argumentsText ?? exception?.exception?.description ?? exception?.text ?? "";
  const frame = params.stackTrace?.callFrames?.[0];
  const level = params.type ?? (exception ? "exception" : "log");
  const url = frame?.url ?? exception?.url ?? "";
  const key = `${params.executionContextId ?? ""}|${params.timestamp ?? exception?.timestamp ?? ""}|${event.method}|${text}`;
  return { key, entry: { level, text: truncate(text, 2000), phase, url } };
}

export function isDialogOpenedError(error) {
  return /^PageDialogOpenedError\b/.test(String(error));
}

function boundDialog(params) {
  return {
    ...params,
    message: truncate(params.message, dialogMessageLimit),
    url: truncate(params.url, 512),
    defaultPrompt: truncate(params.defaultPrompt, dialogMessageLimit),
  };
}

function bodyExtension(mimeType, url) {
  const type = String(mimeType ?? "").split(";")[0].trim().toLowerCase();
  const known = { "application/json": ".json", "text/html": ".html", "text/plain": ".txt", "application/xml": ".xml", "text/xml": ".xml" };
  if (known[type]) return known[type];
  return extname(new URL(url).pathname) || ".bin";
}

async function pageDigest(page) {
  return page.evaluate(() => ({
    url: location.href,
    title: document.title,
    documentId: String(performance.timeOrigin),
    textHead: (document.body?.innerText ?? "").slice(0, 2000),
  }));
}

async function collectStyles(page, styles) {
  return page.evaluate(({ entries, limit }) => {
    const results = entries.map(({ name, selector, props }) => {
      let nodes;
      try {
        nodes = [...document.querySelectorAll(selector)];
      } catch (error) {
        return [name, { error: String(error.message ?? error).slice(0, 512) }];
      }
      const values = nodes.slice(0, 10).map((node) => {
        const computed = getComputedStyle(node);
        const rect = node.getBoundingClientRect();
        const properties = {};
        const truncated = [];
        for (const property of props) {
          const value = computed.getPropertyValue(property);
          if (value.length > limit) truncated.push(property);
          properties[property] = value.slice(0, limit);
        }
        const hasArea = rect.width > 0 && rect.height > 0;
        const isVisible = hasArea && computed.visibility !== "hidden";
        const visible = isVisible && computed.display !== "none";
        return {
          props: properties,
          rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
          visible,
          ...(truncated.length ? { truncated } : {}),
        };
      });
      return [name, { matchCount: nodes.length, values }];
    });
    return Object.fromEntries(results);
  }, { entries: styles, limit: styleValueLimit });
}

async function atomicWrite(path, value) {
  const temporary = `${path}.tmp`;
  await writeFile(temporary, JSON.stringify(value));
  await rename(temporary, path);
}

const jsonBytes = (value) => Buffer.byteLength(JSON.stringify(value));

function trimStyles(styles) {
  const trimmable = Object.entries(styles).filter(([, entry]) => !entry.omitted);
  if (!trimmable.length) return false;
  const [name, entry] = trimmable.reduce((largest, current) => {
    return jsonBytes(current[1]) > jsonBytes(largest[1]) ? current : largest;
  });
  if (entry.values?.length > 1) {
    entry.values.pop();
    entry.valuesDropped = (entry.valuesDropped ?? 0) + 1;
    return true;
  }
  styles[name] = { omitted: "size" };
  return true;
}

async function finalizeRecord(path, record, summary) {
  const marker = record.dialog ? `; ${dialogSummary}` : "";
  record.summary = truncate(summary, summaryLimit - marker.length) + marker;
  record.phase = "settled";
  fitRecord(record);
  await atomicWrite(path, record);
}

function fitRecord(record) {
  const exceedsLimit = () => jsonBytes(record) > recordLimit;
  const dropReplay = () => {
    const index = record.console.findIndex((entry) => entry.phase === "replay");
    if (index < 0) return false;
    record.console.splice(index, 1);
    record.counts.consoleDropped++;
    return true;
  };
  const dropWindowConsole = () => {
    if (record.console.length <= 1) return false;
    record.console.pop();
    record.counts.consoleDropped++;
    return true;
  };
  const dropRequest = () => {
    if (record.requests.length <= 1) return false;
    record.requests.pop();
    record.counts.requestDropped++;
    return true;
  };
  while (jsonBytes(record.styles) > styleBudget && trimStyles(record.styles));
  const stages = [dropReplay, () => trimStyles(record.styles), dropWindowConsole, dropRequest];
  for (const stage of stages) {
    while (exceedsLimit() && stage());
  }
  if (exceedsLimit() && record.console.length) {
    record.console[0].text = record.console[0].text.slice(0, 128);
  }
}

export async function openProbe(page) {
  await page.cdp("Runtime.enable", {});
  const seenConsole = new Set();
  const replayConsole = [];
  const lateSettlers = new WeakMap();
  let replayDropped = 0;
  const drain = async () => {
    for (const event of await page.events()) {
      if (event.method !== "Runtime.consoleAPICalled" && event.method !== "Runtime.exceptionThrown") continue;
      const { key, entry } = parseConsole(event, "replay");
      if (seenConsole.has(key)) continue;
      seenConsole.add(key);
      replayConsole.push(entry);
      if (replayConsole.length > replayLimit) {
        replayConsole.shift();
        replayDropped++;
      }
    }
  };
  await drain();

  const markDialog = async (record, error) => {
    const settleLate = lateSettlers.get(record);
    if (!settleLate) return false;
    await settleLate(error);
    return true;
  };

  const around = async (action, options) => {
    const dir = resolve(options.dir);
    const label = options.label;
    const path = join(dir, `${label}.json`);
    await mkdir(dir, { recursive: true });
    const handle = await open(path, "wx");
    const record = { phase: "open" };
    await handle.writeFile(JSON.stringify(record));
    await handle.close();
    await drain();

    const boundaryAt = Date.now();
    const window = { startedAt: boundaryAt, actionAt: null, endedAt: null, endedBy: null, incomplete: [] };
    const requests = [];
    const byRequestId = new Map();
    const pendingBodies = [];
    const consoleEntries = replayConsole.splice(0);
    const counts = {
      requests: 0,
      console: consoleEntries.length + replayDropped,
      consoleDropped: replayDropped,
      requestDropped: 0,
    };
    replayDropped = 0;
    Object.assign(record, { before: null, after: null, styles: {}, requests, counts, console: consoleEntries, window });
    if (!action) record.action = { ok: true };
    let windowEntries = 0;
    let windowErrors = 0;
    let lastActivity = boundaryAt;
    let dialog;
    let dispatched = false;
    const limits = {
      minMs: options.window?.minMs ?? 300,
      idleMs: options.window?.idleMs ?? 400,
      capMs: options.window?.capMs ?? 10000,
    };
    const deadlineAt = options.deadlineAt ?? Infinity;
    const capAt = () => Math.min((window.actionAt ?? boundaryAt) + limits.capMs, deadlineAt);
    const captureBodies = options.bodies ?? "api";
    const bodyMaxBytes = options.bodyMaxBytes ?? 262144;
    const addConsole = (event) => {
      const { key, entry } = parseConsole(event, "window");
      if (seenConsole.has(key)) return;
      seenConsole.add(key);
      counts.console++;
      if (errorLevels.has(entry.level)) windowErrors++;
      if (windowEntries < consoleLimit) {
        windowEntries++;
        consoleEntries.push(entry);
        return;
      }
      counts.consoleDropped++;
    };
    const addRequest = (requestId, request, timestamp) => {
      if (!trackedUrl.test(request.url)) return;
      counts.requests++;
      const item = {
        n: counts.requests,
        url: truncate(request.url, 512),
        method: request.method ?? "GET",
        type: request.type ?? "Other",
        postData: truncate(request.postData, 1024),
        startedTimestamp: timestamp,
        status: null,
        mimeType: null,
        durationMs: null,
        state: "in_flight",
      };
      if (requests.length < requestLimit) requests.push(item);
      else counts.requestDropped++;
      byRequestId.set(requestId, item);
      lastActivity = Date.now();
    };
    const finishRequest = (requestId, state, params) => {
      const item = byRequestId.get(requestId);
      if (!item) return;
      item.state = state;
      item.durationMs = Math.round((params.timestamp - item.startedTimestamp) * 1000);
      if (params.errorText) item.error = truncate(params.errorText, 256);
      byRequestId.delete(requestId);
      lastActivity = Date.now();
    };
    const applyEvent = (event) => {
      const { method, params } = event;
      if (method === "Page.javascriptDialogOpening") {
        dialog ??= params;
        return;
      }
      const isConsoleEvent = method === "Runtime.consoleAPICalled" || method === "Runtime.exceptionThrown";
      if (isConsoleEvent) {
        addConsole(event);
        return;
      }
      if (method === "Network.requestWillBeSent") {
        if (params.redirectResponse) {
          const previous = byRequestId.get(params.requestId);
          if (previous) previous.status = params.redirectResponse.status;
          finishRequest(params.requestId, "redirected", params);
        }
        addRequest(params.requestId, { ...params.request, type: params.type }, params.timestamp);
        return;
      }
      if (method === "Network.responseReceived") {
        const item = byRequestId.get(params.requestId);
        if (!item) return;
        item.status = params.response.status;
        item.mimeType = params.response.mimeType;
        item.responseUrl = truncate(params.response.url, 512);
        lastActivity = Date.now();
        return;
      }
      if (method === "Network.loadingFailed") {
        finishRequest(params.requestId, "failed", params);
        return;
      }
      if (method !== "Network.loadingFinished") return;
      const item = byRequestId.get(params.requestId);
      if (!item) return;
      finishRequest(params.requestId, "finished", params);
      const shouldSave = captureBodies === "all" || captureBodies === "api" && bodyTypes.has(item.type);
      if (shouldSave) pendingBodies.push({ requestId: params.requestId, item });
    };
    const readEvents = async () => {
      for (const event of await page.events()) applyEvent(event);
    };
    const dialogGuard = async (error) => {
      if (!isDialogOpenedError(error)) return false;
      await readEvents();
      dialog ??= { message: String(error) };
      return true;
    };
    const saveResponseBody = async (requestId, item) => {
      const budgetMs = capAt() - Date.now();
      if (budgetMs <= 0) {
        item.bodySkipped = "budget";
        return;
      }
      try {
        const response = await page.cdp("Network.getResponseBody", { requestId }, { timeout: Math.min(2000, budgetMs) });
        const bytes = response.base64Encoded ? Buffer.from(response.body, "base64") : Buffer.from(response.body);
        const saved = bytes.subarray(0, bodyMaxBytes);
        const bodyDir = join(dir, `${label}.bodies`);
        await mkdir(bodyDir, { recursive: true });
        item.bodyPath = join(bodyDir, `${item.n}${bodyExtension(item.mimeType, item.url)}`);
        item.bodyTruncated = bytes.length > bodyMaxBytes;
        await writeFile(item.bodyPath, saved);
      } catch (error) {
        item.bodyError = truncate(error, 512);
        await dialogGuard(error);
      }
    };
    const fetchBodies = async () => {
      while (pendingBodies.length && !dialog) {
        const { requestId, item } = pendingBodies.shift();
        await saveResponseBody(requestId, item);
      }
    };
    const capture = async (key, produce) => {
      if (dialog) return;
      try {
        record[key] = await produce();
      } catch (error) {
        if (!await dialogGuard(error)) record[`${key}Error`] = truncate(error, 512);
      }
    };
    const actionSummary = () => {
      if (!action) return "observe";
      if (!record.action) return dispatched ? "action unknown" : "action not sent";
      return `action ${record.action.ok ? "ok" : "error"}`;
    };
    const settle = async (outcome) => {
      window.incomplete = [...byRequestId.values()].map((request) => request.n);
      for (const { item } of pendingBodies.splice(0)) item.bodySkipped = "budget";
      if (dialog) {
        if (outcome !== "uncertain_effect") outcome = "dialog";
        record.dialog = boundDialog(dialog);
      }
      record.outcome = outcome;
      const requestSummary = requests.map((request) => {
        const status = request.status ?? request.state;
        return `${request.method} ${new URL(request.url).pathname} ${status} ${request.durationMs ?? "-"}ms`;
      });
      const parts = [actionSummary(), ...requestSummary, `${windowErrors} console errors`];
      await finalizeRecord(path, record, parts.join("; "));
    };

    try {
      try {
        record.before = await pageDigest(page);
      } catch (error) {
        if (!await dialogGuard(error)) throw error;
      }
      if (action && !dialog) {
        Object.assign(record, { phase: "dispatching", dispatchedAt: Date.now() });
        await atomicWrite(path, record);
        dispatched = true;
        window.actionAt = Date.now();
        lastActivity = window.actionAt;
        try {
          let receipt = await action();
          if (receipt?.dialog) {
            const { dialog: opened, ...rest } = receipt;
            receipt = rest;
            applyEvent({ method: "Page.javascriptDialogOpening", params: opened });
          }
          record.action = { ok: true, receipt };
        } catch (error) {
          record.action = { ok: false, error: truncate(error, 2000) };
          await dialogGuard(error);
        }
      }

      let endedBy;
      while (true) {
        await readEvents();
        await fetchBodies();
        await readEvents();
        const now = Date.now();
        if (dialog) {
          endedBy = "dialog";
          break;
        }
        if (now >= capAt()) {
          endedBy = "cap";
          break;
        }
        const minimumWindowElapsed = now - (window.actionAt ?? boundaryAt) >= limits.minMs;
        if (minimumWindowElapsed) {
          const noRequestsInFlight = byRequestId.size === 0 && pendingBodies.length === 0;
          const idlePeriodElapsed = noRequestsInFlight && now - lastActivity >= limits.idleMs;
          if (idlePeriodElapsed) {
            endedBy = "idle";
            break;
          }
        }
        await sleep(Math.min(50, capAt() - now));
      }
      window.endedAt = Date.now();
      window.endedBy = endedBy;
      await capture("after", () => pageDigest(page));
      if (options.styles?.length) await capture("styles", () => collectStyles(page, options.styles));
      if (options.screenshot) await capture("screenshot", () => page.screenshot({ path: join(dir, `${label}.png`) }));
      await settle(record.action?.ok === false ? "action_error" : "captured");
      lateSettlers.set(record, async (error) => {
        await dialogGuard(error);
        await settle(record.outcome);
      });
      return record;
    } catch (error) {
      if (!dispatched) throw error;
      record.issue = truncate(error, 2000);
      await settle("uncertain_effect");
      return record;
    }
  };

  return { around, markDialog };
}
