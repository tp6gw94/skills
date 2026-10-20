import { createHash } from "node:crypto";
import { access, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { isDialogOpenedError, openProbe } from "./debug-kit.mjs";

function scanPage(input) {
  const documentId = String(performance.timeOrigin);
  const visible = (element) => {
    if (!element.getClientRects().length) return false;
    if (getComputedStyle(element).visibility === "hidden") return false;
    return getComputedStyle(element).display !== "none";
  };
  const disabled = (element) => {
    if (element.disabled) return true;
    if (element.getAttribute("aria-disabled") === "true") return true;
    return element.matches(":disabled");
  };
  const clean = (value) => String(value ?? "").replace(/\s+/g, " ").trim();
  const labelledText = (element) => {
    const labelledBy = element.getAttribute("aria-labelledby");
    if (!labelledBy) return "";
    return labelledBy.split(/\s+/).map((id) => document.getElementById(id)?.innerText ?? "").join(" ");
  };
  const associatedLabels = (element) => {
    if (!element.labels) return "";
    return [...element.labels].map((item) => {
      const copy = item.cloneNode(true);
      copy.querySelectorAll("select,textarea").forEach((control) => control.remove());
      return copy.textContent;
    }).join(" ");
  };
  const label = (element) => {
    const isSelect = element.localName === "select";
    const isButtonInput = element.localName === "input" && ["submit", "button", "reset"].includes(element.type);
    const sources = [
      () => element.getAttribute("aria-label"),
      () => labelledText(element),
      () => associatedLabels(element),
      () => (isButtonInput ? element.value : ""),
      () => (isSelect ? "" : element.innerText),
      () => (isSelect ? "" : element.textContent),
      () => element.querySelector?.("img[alt]")?.getAttribute("alt"),
      () => element.placeholder,
      () => element.title,
      () => element.name,
      () => element.id,
      () => element.localName,
    ];
    for (const source of sources) {
      const text = clean(source());
      if (text) return text.slice(0, 80);
    }
  };
  const fingerprint = (element) => ({
    tag: element.localName,
    type: element.type || "",
    role: element.getAttribute("role") || "",
    label: label(element),
    hrefPath: element.href ? new URL(element.href, location.href).pathname : "",
    name: element.name || "",
    checked: !!element.checked,
    disabled: disabled(element),
    readOnly: !!element.readOnly,
  });
  const unique = (selector) => document.querySelectorAll(selector).length === 1;
  const selectorFromUniqueId = (root, path) => {
    if (!unique(root)) return null;
    const selector = path.length ? `${root}>${path.join(">")}` : root;
    if (!unique(selector)) return null;
    return selector;
  };
  const selectorFor = (element) => {
    if (element.id) {
      const selector = `#${CSS.escape(element.id)}`;
      if (unique(selector)) return selector;
    }
    const testId = element.getAttribute("data-testid");
    if (testId !== null) {
      const selector = `[data-testid="${CSS.escape(testId)}"]`;
      if (unique(selector)) return selector;
    }
    if (element.name) {
      const selector = `${element.localName}[name="${CSS.escape(element.name)}"]`;
      if (unique(selector)) return selector;
    }
    const path = [];
    let current = element;
    while (current) {
      if (current.id) {
        const root = `#${CSS.escape(current.id)}`;
        const selector = selectorFromUniqueId(root, path);
        if (selector) return selector;
      }
      const siblings = [...(current.parentElement?.children ?? [])].filter((sibling) => sibling.localName === current.localName);
      path.unshift(`${current.localName}:nth-of-type(${siblings.indexOf(current) + 1})`);
      current = current.parentElement;
    }
    const selector = path.join(">");
    return unique(selector) ? selector : null;
  };
  const kindFor = (element) => {
    const tag = element.localName;
    const type = String(element.type || "").toLowerCase();
    const buttonTypes = ["button", "submit", "reset", "image", "checkbox", "radio"];
    if (tag === "select") return "select";
    if (tag === "textarea") return "fill";
    if (tag === "input" && buttonTypes.includes(type)) return "click";
    if (tag === "input") return "fill";
    if (tag === "a" && element.hasAttribute("href")) return "click";
    if (["button", "a"].includes(tag)) return "click";
    if (["button", "link"].includes(element.getAttribute("role"))) return "click";
    return null;
  };
  const eligible = (element, kind, fillValues, optionValue) => {
    const isVisible = visible(element);
    if (!isVisible) return false;
    const isDisabled = disabled(element);
    if (isDisabled) return false;
    if (kind === "fill") {
      if (element.readOnly) return false;
      return !fillValues.includes(String(element.value ?? ""));
    }
    if (kind !== "select") return true;
    return [...element.options].some((option) => {
      if (option.value !== optionValue) return false;
      if (option.selected || option.disabled) return false;
      return !option.matches(":disabled");
    });
  };
  if (input.mode === "verify") {
    const { candidate, expectedDocumentId, fillValues = [] } = input;
    if (documentId !== expectedDocumentId) {
      return { valid: false, documentId, reason: "document" };
    }
    const matches = document.querySelectorAll(candidate.selector);
    if (matches.length !== 1) return { valid: false, documentId, reason: "selector" };
    const element = matches[0];
    const fingerprintChanged = JSON.stringify(fingerprint(element)) !== JSON.stringify(candidate.fingerprint);
    if (fingerprintChanged) return { valid: false, documentId, reason: "fingerprint" };
    if (!eligible(element, candidate.kind, fillValues, candidate.optionValue)) {
      return { valid: false, documentId, reason: "ineligible" };
    }
    return { valid: true, documentId };
  }
  const unsupported = {
    iframes: document.querySelectorAll("iframe,frame").length,
    shadowRoots: [...document.querySelectorAll("*")].filter((element) => !!element.shadowRoot).length,
    canvas: document.querySelectorAll("canvas").length,
    contenteditable: document.querySelectorAll('[contenteditable]:not([contenteditable="false"])').length,
    fileInputs: document.querySelectorAll('input[type="file"]').length,
  };
  const fillValues = input.fillValues ?? [];
  const maxCandidates = input.maxCandidates ?? 24;
  const candidates = [];
  let truncated = false;
  let full = false;
  const add = (element, kind, optionValue, optionText) => {
    if (!eligible(element, kind, fillValues, optionValue)) return;
    const selector = selectorFor(element);
    if (!selector) return;
    if (candidates.length >= maxCandidates) {
      truncated = true;
      full = true;
      return;
    }
    const elementLabel = label(element);
    const isToggle = ["checkbox", "radio"].includes(element.type);
    let desc = `${kind} ${elementLabel}`;
    if (kind === "select") desc = `select ${elementLabel}: ${optionText}`;
    if (isToggle) desc = `${desc} [${element.checked ? "checked" : "unchecked"}]`;
    const candidate = {
      id: `c${candidates.length + 1}`,
      kind,
      selector,
      fingerprint: fingerprint(element),
      desc,
      fill: kind === "fill",
    };
    if (kind === "select") candidate.optionValue = optionValue;
    candidates.push(candidate);
  };
  const addSelectOptions = (element) => {
    let count = 0;
    for (const option of element.options) {
      if (full) break;
      if (option.selected || option.disabled || option.matches(":disabled")) continue;
      if (count >= 8) {
        truncated = true;
        break;
      }
      const optionText = String(option.innerText || option.textContent || option.value).trim().slice(0, 80);
      add(element, "select", option.value, optionText);
      count++;
    }
  };
  const elements = [...document.querySelectorAll('a[href],button,input,select,textarea,[role="button"],[role="link"]')];
  for (const element of elements) {
    if (full) break;
    const kind = kindFor(element);
    if (!kind) continue;
    if (kind === "fill") {
      const type = String(element.type || "").toLowerCase();
      if (type === "hidden" || type === "file") continue;
    }
    if (kind === "select") {
      addSelectOptions(element);
      continue;
    }
    add(element, kind);
  }
  return {
    url: location.href,
    title: document.title,
    documentId,
    textHead: (document.body?.innerText ?? "").slice(0, 2000),
    candidates,
    truncated,
    unsupported,
  };
}

function digest(value, length) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex").slice(0, length);
}

function candidateKey({ kind, selector, optionValue, fingerprint }) {
  return digest([kind, selector, optionValue ?? null, fingerprint], 12);
}

function stateKeyFor(scan) {
  const url = new URL(scan.url);
  url.hash = "";
  const textHash = createHash("sha256").update(scan.textHead).digest("hex");
  return digest([url.toString(), textHash, scan.candidates.map(candidateKey)], 24);
}

function choicesFor(candidates) {
  return candidates.map((candidate) => ({
    id: candidate.id,
    desc: candidate.desc,
    fill: candidate.fill,
    key: candidateKey(candidate),
  }));
}

const terminalOutcomes = ["action_error", "uncertain_effect", "dialog"];

function interpretRecord(record, op, { dispatchedNow, failed }) {
  const dispatched = dispatchedNow || record?.dispatchedAt !== undefined;
  if (terminalOutcomes.includes(record?.outcome)) return { outcome: record.outcome, dispatched };
  if (failed || record?.phase !== "settled") return { outcome: dispatched ? "uncertain_effect" : "error", dispatched };
  return { outcome: op.kind === "observe" ? "observed" : "acted", dispatched };
}

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch (error) {
    if (error.code === "ENOENT") return false;
    throw error;
  }
}

async function writeJson(path, value) {
  const temporary = `${path}.tmp`;
  await writeFile(temporary, JSON.stringify(value));
  await rename(temporary, path);
}

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

async function readRecord(path) {
  if (!await exists(path)) return null;
  return readJson(path);
}

async function saveCandidates(path, scan) {
  const candidates = {
    documentId: scan.documentId,
    url: scan.url,
    candidates: scan.candidates,
    truncated: scan.truncated,
    unsupported: scan.unsupported,
  };
  await writeJson(path, candidates);
}

function pageFrom(scan) {
  return { url: scan.url, title: scan.title, documentId: scan.documentId };
}

function makeResult(command, values) {
  return {
    step: command.step,
    outcome: values.outcome,
    dispatched: values.dispatched ?? false,
    spaceId: values.spaceId,
    page: values.page ?? { url: "", title: "", documentId: "" },
    lastAction: values.lastAction ?? null,
    choices: values.choices ?? [],
    truncated: values.truncated ?? false,
    unsupported: values.unsupported ?? {},
    stateKey: values.stateKey ?? "",
    summary: values.summary ?? "",
    record: values.record ?? null,
    ...(values.issue ? { issue: String(values.issue).slice(0, 2000) } : {}),
  };
}

export async function runStep(command) {
  const dir = resolve(command.dir);
  const stepName = `step-${String(command.step).padStart(3, "0")}`;
  const resultPath = join(dir, `${stepName}.result.json`);
  const candidatePath = join(dir, `${stepName}.candidates.json`);
  const recordPath = join(dir, `${stepName}.json`);
  const fillValues = command.fillValues ?? [];
  await mkdir(dir, { recursive: true });

  let task;
  let page;
  let probe;
  let spaceId;
  let dispatched = false;
  let lastAction = null;

  const scanNow = () => page.evaluate(scanPage, {
    mode: "scan",
    fillValues,
    maxCandidates: command.maxCandidates ?? 24,
  });

  const settle = async ({ record, interpreted, scan, summary, issue }) => {
    if (scan) await saveCandidates(candidatePath, scan);
    const result = makeResult(command, {
      ...interpreted,
      spaceId,
      lastAction,
      ...(scan ? {
        page: pageFrom(scan),
        choices: choicesFor(scan.candidates),
        truncated: scan.truncated,
        unsupported: scan.unsupported,
        stateKey: stateKeyFor(scan),
      } : {}),
      summary: summary ?? record?.summary ?? "step failed before evidence was settled",
      record: record ? `${stepName}.json` : null,
      issue,
    });
    await writeJson(resultPath, result);
    return result;
  };

  const settleRecord = async (record) => {
    let interpreted = interpretRecord(record, command.op, { dispatchedNow: dispatched });
    let scan = null;
    let issue = record.issue;
    if (interpreted.outcome !== "dialog") {
      try {
        scan = await scanNow();
      } catch (error) {
        if (!isDialogOpenedError(error)) throw error;
        if (await probe.markDialog(record, error)) {
          interpreted = interpretRecord(record, command.op, { dispatchedNow: dispatched });
        } else {
          issue = [issue, error].filter(Boolean).join("; ");
        }
      }
    }
    return settle({
      record,
      interpreted,
      scan,
      summary: record.summary ?? `recovered ${record.phase} record`,
      issue,
    });
  };

  try {
    task = "name" in command.space ? await taskSpace(command.space.name) : await taskSpace(command.space.id);
    spaceId = task.spaceId;
    page = task.page(command.page ?? "p1");
    probe = await openProbe(page);
    if (await exists(resultPath)) return await readJson(resultPath);
    const deadlineAt = Date.now() + command.deadlineMs;
    const remaining = () => Math.max(1, deadlineAt - Date.now());
    let previousCandidate;
    let previousDocumentId;
    if (command.op.kind === "pick") {
      const previousName = `step-${String(command.op.from).padStart(3, "0")}.candidates.json`;
      const previous = await readJson(join(dir, previousName));
      previousCandidate = previous.candidates.find((candidate) => candidate.id === command.op.id);
      previousDocumentId = previous.documentId;
      if (!previousCandidate) throw new Error(`Unknown candidate ${command.op.id}`);
      lastAction = { kind: previousCandidate.kind, desc: previousCandidate.desc };
    }
    if (command.op.kind === "navigate") {
      lastAction = { kind: "navigate", desc: `navigate ${command.op.url}` };
    }

    const existingRecord = await readRecord(recordPath);
    if (existingRecord) return await settleRecord(existingRecord);

    if (command.op.kind === "pick") {
      const verification = await page.evaluate(scanPage, {
        mode: "verify",
        candidate: previousCandidate,
        expectedDocumentId: previousDocumentId,
        fillValues,
      });
      if (!verification.valid) {
        return await settle({
          record: null,
          interpreted: { outcome: "stale", dispatched: false },
          scan: await scanNow(),
          summary: `stale candidate ${previousCandidate.id}: ${verification.reason}`,
        });
      }
    }

    const markDispatched = (operation) => () => {
      dispatched = true;
      return operation();
    };
    let action = null;
    if (command.op.kind === "navigate") {
      action = markDispatched(() => page.goto(command.op.url, { timeout: remaining() }));
    }
    if (command.op.kind === "pick" && previousCandidate.kind === "click") {
      action = markDispatched(() => page.click(previousCandidate.selector, { timeout: remaining() }));
    }
    if (command.op.kind === "pick" && previousCandidate.kind === "fill") {
      action = markDispatched(() => page.fill(previousCandidate.selector, command.op.text, { timeout: remaining() }));
    }
    if (command.op.kind === "pick" && previousCandidate.kind === "select") {
      action = markDispatched(() => page.selectOption(
        previousCandidate.selector,
        { value: previousCandidate.optionValue },
        { timeout: remaining() },
      ));
    }
    const record = await probe.around(action, {
      dir,
      label: stepName,
      styles: command.capture?.styles ?? [],
      bodies: command.capture?.bodies ?? "api",
      bodyMaxBytes: command.capture?.bodyMaxBytes ?? 262144,
      window: command.capture?.window ?? {},
      screenshot: command.capture?.screenshot ?? false,
      deadlineAt,
    });
    return await settleRecord(record);
  } catch (error) {
    if (await exists(resultPath)) return await readJson(resultPath);
    const record = await readRecord(recordPath);
    return settle({
      record,
      interpreted: interpretRecord(record, command.op, { dispatchedNow: dispatched, failed: true }),
      issue: error,
    });
  }
}
