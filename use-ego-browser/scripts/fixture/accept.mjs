import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { tmpdir } from "node:os";

const skillDir = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const baseUrl = `http://127.0.0.1:${process.env.PORT ?? 4317}`;
const evidenceDir = resolve(process.env.EGO_ACCEPT_DIR ?? join(tmpdir(), `ego-browser-accept-${Date.now()}`));
const stepUrl = pathToFileURL(join(skillDir, "scripts/explore-step.mjs")).href;
const kitUrl = pathToFileURL(join(skillDir, "scripts/debug-kit.mjs")).href;
await mkdir(evidenceDir, { recursive: true });

const spaces = [];
const failures = [];
const timestamp = Date.now();

function spaceName(scenario) {
  return `impl-${scenario}-${timestamp}-${spaces.length + 1}`;
}

function runRound(source, timeoutSec = 20) {
  return new Promise((resolveResult, reject) => {
    const child = spawn(
      "timeout",
      [`${timeoutSec}s`, "ego-browser", "nodejs"],
      { stdio: ["pipe", "ignore", "pipe"] },
    );
    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr = (stderr + chunk).slice(-12000);
    });
    child.on("error", reject);
    child.on("close", (code, signal) => resolveResult({ code, signal, stderr }));
    child.stdin.end(source);
  });
}

function stepSource(command) {
  const importStep = `const { runStep } = await import(${JSON.stringify(stepUrl)});`;
  const runStepCall = `await runStep(${JSON.stringify(command)});`;
  return `${importStep}\n${runStepCall}`;
}

async function runStep(command, timeoutSec = 20, allowMissing = false) {
  const processResult = await runRound(stepSource(command), timeoutSec);
  const stepName = `step-${String(command.step).padStart(3, "0")}`;
  const path = join(command.dir, `${stepName}.result.json`);
  const result = await readFile(path, "utf8").then(JSON.parse).catch(() => null);
  if (!result && !allowMissing) {
    throw new Error(`step ${command.step} exit ${processResult.code}: ${processResult.stderr}`);
  }
  return { processResult, result, path };
}

async function getState() {
  const response = await fetch(`${baseUrl}/state`);
  return response.json();
}

async function resetFixture() {
  await fetch(`${baseUrl}/reset`, { method: "POST" });
}

async function waitForState(predicate, message, timeoutMs = 5000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const state = await getState();
    if (predicate(state)) return state;
    await new Promise((resolveWait) => setTimeout(resolveWait, 50));
  }
  throw new Error(message);
}

async function saveSpace(name, path) {
  const source = [
    'const fs = await import("node:fs/promises");',
    `const task = await taskSpace(${JSON.stringify(name)});`,
    `await fs.writeFile(${JSON.stringify(path)}, JSON.stringify({name:task.name,spaceId:task.spaceId}));`,
    "await task.finish({keep:[]});",
  ].join("\n");
  const result = await runRound(source);
  assert.equal(result.code, 0, `finish TaskSpace ${name}`);
  const space = JSON.parse(await readFile(path, "utf8"));
  spaces.push(space);
}

const onlyScenarios = process.env.EGO_ACCEPT_ONLY?.split(",").map(Number);

async function scenario(number, evidence, operation) {
  if (onlyScenarios && !onlyScenarios.includes(number)) return;
  try {
    await operation();
    console.log(`PASS scenario ${number} evidence=${evidence}`);
  } catch (error) {
    failures.push({ number, error: String(error) });
    console.log(`FAIL scenario ${number} evidence=${evidence} reason=${String(error)}`);
  }
}

const case1 = join(evidenceDir, "scenario-1");
await mkdir(case1, { recursive: true });
await scenario(1, case1, async () => {
  await resetFixture();
  const name = spaceName("kit");
  const recordPath = join(case1, "submit.json");
  const source = `const { openProbe } = await import(${JSON.stringify(kitUrl)});
const task = await taskSpace(${JSON.stringify(name)});
const page = task.page("p1");
await page.goto(${JSON.stringify(`${baseUrl}/`)});
await page.fill("#email", "probe-error@example.test");
const probe = await openProbe(page);
await probe.around(() => page.click("#submit"), {
  dir: ${JSON.stringify(case1)},
  label: "submit",
  styles: [{
    name: "confirmation",
    selector: "#confirmation",
    props: ["color", "display"],
  }],
  window: { minMs: 500, idleMs: 250, capMs: 3000 },
});`;
  const run = await runRound(source);
  assert.equal(run.code, 0, `ego round exit ${run.code}: ${run.stderr}`);
  const record = JSON.parse(await readFile(recordPath, "utf8"));
  const order = record.requests.find((request) => request.url.endsWith("/order"));
  assert.ok(order, "captured POST /order");
  assert.equal(order.method, "POST");
  assert.ok(order.postData.includes("probe-error@example.test"), "captured request postData");
  assert.equal(await readFile(order.bodyPath, "utf8"), "ok");
  const sawOrderError = record.console.some((entry) => {
    return entry.level === "error" && entry.text.includes("order-failed-probe");
  });
  assert.ok(sawOrderError, "captured console.error");
  assert.equal(record.styles.confirmation.values[0].props.color, "rgb(12, 34, 56)");
  assert.equal(record.window.endedBy, "idle");
  await saveSpace(name, join(case1, "finished-space.json"));
});

const case2 = join(evidenceDir, "scenario-2");
await mkdir(case2, { recursive: true });
await scenario(2, case2, async () => {
  await resetFixture();
  const name = spaceName("window");
  const recordPath = join(case2, "window.json");
  const source = `const { openProbe } = await import(${JSON.stringify(kitUrl)});
const task = await taskSpace(${JSON.stringify(name)});
const page = task.page("p1");
await page.goto(${JSON.stringify(`${baseUrl}/?late=100&slow=1800`)});
await page.fill("#email", "window@example.test");
const probe = await openProbe(page);
await probe.around(() => page.click("#submit"), {
  dir: ${JSON.stringify(case2)},
  label: "window",
  window: {minMs:300,idleMs:200,capMs:750},
});`;
  const run = await runRound(source);
  assert.equal(run.code, 0, `ego round exit ${run.code}: ${run.stderr}`);
  const record = JSON.parse(await readFile(recordPath, "utf8"));
  const capturedLateRequest = record.requests.some((request) => request.url.includes("/delayed-ping"));
  assert.ok(capturedLateRequest, "captured late request inside minMs");
  assert.equal(record.window.endedBy, "cap");
  assert.ok(record.window.incomplete.length > 0, "reported in-flight request at cap");
  const slowRequestIsInFlight = record.requests.some((request) => {
    return request.state === "in_flight" && request.url.includes("/slow");
  });
  assert.ok(slowRequestIsInFlight, "slow request remains in flight");
  await saveSpace(name, join(case2, "finished-space.json"));
});

const case3 = join(evidenceDir, "scenario-3");
await mkdir(case3, { recursive: true });
await scenario(3, case3, async () => {
  await resetFixture();
  const name = spaceName("idempotent");
  const source = `const { openProbe } = await import(${JSON.stringify(kitUrl)});
const task = await taskSpace(${JSON.stringify(name)});
const page = task.page("p1");
await page.goto(${JSON.stringify(`${baseUrl}/`)});
await page.fill("#email", "once@example.test");
const probe = await openProbe(page);
await probe.around(() => page.click("#submit"), {
  dir: ${JSON.stringify(case3)},
  label: "same-label",
  window: {minMs:250,idleMs:200,capMs:2000},
});`;
  const first = await runRound(source);
  assert.equal(first.code, 0, `first ego round exit ${first.code}: ${first.stderr}`);
  const retrySource = `const { openProbe } = await import(${JSON.stringify(kitUrl)});
const task = await taskSpace(${JSON.stringify(name)});
const probe = await openProbe(task.page("p1"));
await probe.around(() => task.page("p1").click("#submit"), {dir:${JSON.stringify(case3)},label:"same-label"});`;
  const second = await runRound(retrySource);
  assert.notEqual(second.code, 0, "same label refuses a second action");
  const state = await getState();
  assert.equal(state.received, 1);
  await saveSpace(name, join(case3, "finished-space.json"));
});

const case4 = join(evidenceDir, "scenario-4");
await mkdir(case4, { recursive: true });
await scenario(4, case4, async () => {
  await resetFixture();
  const name = spaceName("explore");
  const fill = "buyer@example.test";
  const common = {
    dir: case4,
    space: { name },
    page: "p1",
    fillValues: [fill],
    maxCandidates: 24,
    deadlineMs: 20000,
    capture: { window: { minMs: 250, idleMs: 200, capMs: 2500 } },
  };
  const first = await runStep({ ...common, step: 1, op: { kind: "navigate", url: `${baseUrl}/` } });
  assert.equal(first.processResult.code, 0);
  assert.equal(first.result.outcome, "acted");
  const firstRecord = JSON.parse(await readFile(join(case4, "step-001.json"), "utf8"));
  assert.ok(firstRecord.requests.length > 0, "first step recorded requests");
  const chromeRequests = firstRecord.requests
    .filter((request) => request.url.startsWith("chrome:"))
    .map((request) => request.url);
  assert.deepEqual(chromeRequests, [], "no chrome: requests in record");
  const summaryParts = first.result.summary.split("; ");
  assert.equal(summaryParts.length, firstRecord.requests.length + 2, "summary lists only recorded requests");
  const second = await runStep({ ...common, step: 2, op: { kind: "observe" } });
  assert.equal(second.processResult.code, 0);
  assert.ok(second.result.choices.length > 0);
  assert.ok(second.result.stateKey);
  const email = second.result.choices.find((choice) => choice.fill && choice.desc.includes("Email"));
  assert.ok(email, "email fill choice");
  const third = await runStep({ ...common, step: 3, op: { kind: "pick", from: 2, id: email.id, text: fill } });
  assert.equal(third.processResult.code, 0);
  const submit = third.result.choices.find((choice) => !choice.fill && choice.desc.includes("Place order"));
  assert.ok(submit, "submit choice after fill");
  const fourth = await runStep({ ...common, step: 4, op: { kind: "pick", from: 3, id: submit.id } });
  assert.equal(fourth.processResult.code, 0);
  assert.equal(fourth.result.outcome, "acted");
  const state = await getState();
  assert.equal(state.received, 1);
  assert.equal(state.orders[0].email, fill);
  assert.ok([second, third, fourth].every(({ result }) => result.choices && result.stateKey));
  await saveSpace(name, join(case4, "finished-space.json"));
});

const case5 = join(evidenceDir, "scenario-5");
await mkdir(case5, { recursive: true });
await scenario(5, case5, async () => {
  await resetFixture();
  const name = spaceName("stale");
  const common = {
    dir: case5,
    space: { name },
    page: "p1",
    fillValues: [],
    maxCandidates: 24,
    deadlineMs: 20000,
    capture: { window: { minMs: 250, idleMs: 200, capMs: 2500 } },
  };
  const first = await runStep({ ...common, step: 1, op: { kind: "navigate", url: `${baseUrl}/?replace-watch=1` } });
  assert.equal(first.result.outcome, "acted");
  const second = await runStep({ ...common, step: 2, op: { kind: "observe" } });
  const submit = second.result.choices.find((choice) => choice.desc.includes("Place order"));
  assert.ok(submit, "observed original submit button");
  await fetch(`${baseUrl}/arm-replace`, { method: "POST" });
  await waitForState(
    (state) => state.replacementApplied,
    "fixture did not replace the submit button",
  );
  const third = await runStep({ ...common, step: 3, op: { kind: "pick", from: 2, id: submit.id } });
  assert.equal(third.processResult.code, 0);
  assert.equal(third.result.outcome, "stale");
  assert.equal(third.result.dispatched, false);
  const replacementChoice = third.result.choices.some((choice) => choice.desc.includes("Replaced submit"));
  assert.ok(replacementChoice);
  assert.equal((await getState()).received, 0);
  await saveSpace(name, join(case5, "finished-space.json"));
});

const case6 = join(evidenceDir, "scenario-6");
await mkdir(case6, { recursive: true });
await scenario(6, case6, async () => {
  await resetFixture();
  await fetch(`${baseUrl}/delay?ms=30000`, { method: "POST" });
  const name = spaceName("timeout");
  const fill = "timeout@example.test";
  const common = {
    dir: case6,
    space: { name },
    page: "p1",
    fillValues: [fill],
    maxCandidates: 24,
    deadlineMs: 30000,
    capture: { window: { minMs: 250, idleMs: 200, capMs: 1500 } },
  };
  const first = await runStep({ ...common, step: 1, op: { kind: "navigate", url: `${baseUrl}/` } });
  assert.equal(first.result.outcome, "acted");
  const second = await runStep({ ...common, step: 2, op: { kind: "observe" } });
  assert.equal(second.result.outcome, "observed");
  const email = second.result.choices.find((choice) => choice.fill && choice.desc.includes("Email"));
  const third = await runStep({ ...common, step: 3, op: { kind: "pick", from: 2, id: email.id, text: fill } });
  assert.equal(third.result.outcome, "acted");
  const submit = third.result.choices.find((choice) => !choice.fill && choice.desc.includes("Place order"));
  assert.ok(submit, "submit choice before timeout");
  const timedCapture = { ...common.capture, window: { ...common.capture.window, capMs: 20000 } };
  const timed = await runStep({ ...common, step: 4, op: { kind: "pick", from: 3, id: submit.id }, capture: timedCapture }, 5, true);
  assert.equal(timed.processResult.code, 124, `shell timeout exit ${timed.processResult.code}`);
  const state = await waitForState((value) => value.received === 1, "fixture did not receive timed order");
  const recordPath = join(case6, "step-004.json");
  const record = JSON.parse(await readFile(recordPath, "utf8"));
  const dispatchMayHaveSettled = record.phase === "dispatching"
    || record.phase === "settled" && record.outcome === "uncertain_effect";
  assert.ok(dispatchMayHaveSettled);
  await fetch(`${baseUrl}/arm-replace`, { method: "POST" });
  const replacement = await runRound(`const task = await taskSpace(${JSON.stringify(name)});
const page = task.page("p1");
await page.goto(${JSON.stringify(`${baseUrl}/?replace-watch=1`)});
await page.waitForFunction(
  () => document.querySelector("#submit")?.textContent === "Replaced submit",
  undefined,
  {timeout:5000},
);`);
  assert.equal(replacement.code, 0, `page replacement exit ${replacement.code}: ${replacement.stderr}`);
  await waitForState(
    (value) => value.replacementApplied,
    "fixture did not replace the submit button after timed dispatch",
  );
  const rerun = await runStep({ ...common, step: 4, op: { kind: "pick", from: 3, id: submit.id } });
  const afterRerun = await getState();
  await saveSpace(name, join(case6, "finished-space.json"));
  assert.equal(rerun.processResult.code, 0);
  assert.equal(afterRerun.received, 1);
  assert.equal(state.received, 1);
  assert.equal(rerun.result.outcome, "uncertain_effect", "step 4 rerun recovers the dispatch record after page change");
  assert.equal(rerun.result.dispatched, true);
});

const case7 = join(evidenceDir, "scenario-7");
await mkdir(case7, { recursive: true });
await scenario(7, case7, async () => {
  await resetFixture();
  const name = spaceName("navigation");
  const recordPath = join(case7, "navigation.json");
  const source = `const { openProbe } = await import(${JSON.stringify(kitUrl)});
const task = await taskSpace(${JSON.stringify(name)});
const page = task.page("p1");
await page.goto(${JSON.stringify(`${baseUrl}/`)});
const probe = await openProbe(page);
await probe.around(() => page.click("#navigate"), {
  dir: ${JSON.stringify(case7)},
  label: "navigation",
  window: {minMs:500,idleMs:250,capMs:3000},
});`;
  const run = await runRound(source);
  assert.equal(run.code, 0, `ego round exit ${run.code}: ${run.stderr}`);
  const record = JSON.parse(await readFile(recordPath, "utf8"));
  const sawNavigationError = record.console.some((entry) => {
    return entry.level === "error" && entry.text.includes("navigation-console-probe");
  });
  assert.ok(sawNavigationError, "captured old-document console before navigation");
  await saveSpace(name, join(case7, "finished-space.json"));
});


async function aroundRecord(dir, { name, url, label, setup = "", probePage = "page", action, options }) {
  const source = `const { openProbe } = await import(${JSON.stringify(kitUrl)});
const task = await taskSpace(${JSON.stringify(name)});
const page = task.page("p1");
await page.goto(${JSON.stringify(url)});
${setup}
const probe = await openProbe(${probePage});
await probe.around(${action}, { dir: ${JSON.stringify(dir)}, label: ${JSON.stringify(label)}, ...${options} });`;
  const run = await runRound(source);
  assert.equal(run.code, 0, `ego round exit ${run.code}: ${run.stderr}`);
  const record = JSON.parse(await readFile(join(dir, `${label}.json`), "utf8"));
  await saveSpace(name, join(dir, `${label}.space.json`));
  return record;
}

function exploreCommon(dir, name, extra = {}) {
  return {
    dir,
    space: { name },
    page: "p1",
    fillValues: [],
    maxCandidates: 24,
    deadlineMs: 20000,
    capture: { window: { minMs: 250, idleMs: 200, capMs: 2500 } },
    ...extra,
  };
}

const case8 = join(evidenceDir, "scenario-8");
await mkdir(case8, { recursive: true });
await scenario(8, case8, async () => {
  await resetFixture();
  const name = spaceName("identity");
  const common = exploreCommon(case8, name);
  await runStep({ ...common, step: 1, op: { kind: "navigate", url: `${baseUrl}/` } });
  const observed = await runStep({ ...common, step: 2, op: { kind: "observe" } });
  const pro = observed.result.choices.find((choice) => choice.desc === "select Plan: Pro");
  const team = observed.result.choices.find((choice) => choice.desc === "select Plan: Team");
  assert.ok(pro && team, "two select options on the same select");
  assert.match(pro.key, /^[0-9a-f]{12}$/);
  assert.match(team.key, /^[0-9a-f]{12}$/);
  assert.notEqual(pro.key, team.key, "different options of one select have different identities");
  const newsletter = observed.result.choices.find((choice) => choice.desc === "click Newsletter [unchecked]");
  assert.ok(newsletter, "unchecked checkbox choice");
  const checked = await runStep({ ...common, step: 3, op: { kind: "pick", from: 2, id: newsletter.id } });
  assert.equal(checked.result.outcome, "acted");
  assert.notEqual(checked.result.stateKey, observed.result.stateKey, "checkbox click changes stateKey");
  const checkedChoice = checked.result.choices.find((choice) => choice.desc === "click Newsletter [checked]");
  assert.ok(checkedChoice, "checkbox choice reports checked state");
  assert.notEqual(checkedChoice.key, newsletter.key, "checkbox identity changes with checked state");
  const proAfterCheck = checked.result.choices.find((choice) => choice.desc === "select Plan: Pro");
  const selected = await runStep({ ...common, step: 4, op: { kind: "pick", from: 3, id: proAfterCheck.id } });
  assert.equal(selected.result.outcome, "acted");
  assert.notEqual(selected.result.stateKey, checked.result.stateKey, "select option pick changes stateKey");
  assert.ok(selected.result.choices.some((choice) => choice.desc === "select Plan: Basic"));
  await saveSpace(name, join(case8, "finished-space.json"));
});

const case9 = join(evidenceDir, "scenario-9");
await mkdir(case9, { recursive: true });
await scenario(9, case9, async () => {
  await resetFixture();
  const name = spaceName("labels");
  const common = exploreCommon(case9, name);
  await runStep({ ...common, step: 1, op: { kind: "navigate", url: `${baseUrl}/` } });
  const observed = await runStep({ ...common, step: 2, op: { kind: "observe" } });
  const descriptions = observed.result.choices.map((choice) => choice.desc);
  assert.ok(descriptions.includes("click Apply promo"), `button input uses value: ${descriptions}`);
  assert.ok(descriptions.includes("select Plan: Team"), `select label excludes option texts: ${descriptions}`);
  assert.ok(descriptions.includes("click Company logo"), `image link uses alt: ${descriptions}`);
  await saveSpace(name, join(case9, "finished-space.json"));
});

const case10 = join(evidenceDir, "scenario-10");
await mkdir(case10, { recursive: true });
await scenario(10, case10, async () => {
  await resetFixture();
  const record = await aroundRecord(case10, {
    name: spaceName("redirect"),
    url: `${baseUrl}/`,
    label: "redirect",
    action: `() => page.goto(${JSON.stringify(`${baseUrl}/redirect`)})`,
    options: "{ window: { minMs: 300, idleMs: 250, capMs: 3000 } }",
  });
  const first = record.requests.find((request) => request.url.endsWith("/redirect"));
  const second = record.requests.find((request) => request.url.endsWith("/?landed=1"));
  assert.ok(first && second, "both hops recorded");
  assert.equal(first.status, 302);
  assert.equal(first.state, "redirected");
  assert.equal(second.status, 200);
  assert.equal(second.state, "finished");
  assert.deepEqual(record.requests.filter((request) => request.state === "in_flight"), []);
  assert.deepEqual(record.window.incomplete, []);
});

const case11 = join(evidenceDir, "scenario-11");
await mkdir(case11, { recursive: true });
await scenario(11, case11, async () => {
  await resetFixture();
  const name = spaceName("recover");
  const common = exploreCommon(case11, name);
  await runStep({ ...common, step: 1, op: { kind: "navigate", url: `${baseUrl}/` } });
  const observed = await runStep({ ...common, step: 2, op: { kind: "observe" } });
  const submit = observed.result.choices.find((choice) => choice.desc.includes("Place order"));
  await writeFile(join(case11, "step-003.json"), JSON.stringify({
    phase: "settled",
    outcome: "uncertain_effect",
    dispatchedAt: 1,
    issue: "synthetic",
    summary: "synthetic uncertain effect",
  }));
  const rerun = await runStep({ ...common, step: 3, op: { kind: "pick", from: 2, id: submit.id } });
  assert.equal(rerun.result.outcome, "uncertain_effect");
  assert.equal(rerun.result.dispatched, true);
  assert.equal((await getState()).received, 0);
  await saveSpace(name, join(case11, "finished-space.json"));
});

const case12 = join(evidenceDir, "scenario-12");
await mkdir(case12, { recursive: true });
await scenario(12, case12, async () => {
  await resetFixture();
  await mkdir(join(case12, "style.png"), { recursive: true });
  const record = await aroundRecord(case12, {
    name: spaceName("style"),
    url: `${baseUrl}/`,
    label: "style",
    setup: 'await page.fill("#email", "style@example.test");',
    action: '() => page.click("#submit")',
    options: `{
  styles: [
    { name: "bad", selector: "##bad", props: ["color"] },
    { name: "confirmation", selector: "#confirmation", props: ["color"] },
  ],
  screenshot: true,
  window: { minMs: 300, idleMs: 250, capMs: 3000 },
}`,
  });
  assert.equal(record.outcome, "captured");
  assert.ok(record.requests.some((request) => request.url.endsWith("/order")), "request evidence kept");
  assert.equal(typeof record.styles.bad.error, "string");
  assert.equal(record.styles.confirmation.values[0].props.color, "rgb(12, 34, 56)");
  assert.equal(typeof record.screenshotError, "string");
});

const case13 = join(evidenceDir, "scenario-13");
await mkdir(case13, { recursive: true });
await scenario(13, case13, async () => {
  await resetFixture();
  const capped = await aroundRecord(case13, {
    name: spaceName("deadline"),
    url: `${baseUrl}/?slow=5000`,
    label: "capped",
    setup: 'await page.fill("#email", "deadline@example.test");',
    action: '() => page.click("#submit")',
    options: "{ deadlineAt: Date.now() + 1500, window: { minMs: 300, idleMs: 200, capMs: 20000 } }",
  });
  assert.equal(capped.phase, "settled");
  assert.equal(capped.window.endedBy, "cap");
  assert.ok(capped.window.endedAt - capped.window.actionAt < 3500, "window ended with the step budget");
  const skipped = await aroundRecord(case13, {
    name: spaceName("budget"),
    url: `${baseUrl}/`,
    label: "skipped",
    action: "() => page.evaluate(() => fetch('/slow?ms=100').then((response) => response.text()))",
    options: "{ deadlineAt: Date.now() - 1, window: { minMs: 300, idleMs: 200, capMs: 3000 } }",
  });
  const slow = skipped.requests.find((request) => request.url.includes("/slow"));
  assert.ok(slow, "slow request recorded");
  assert.equal(slow.bodyPath, undefined);
  assert.equal(slow.bodySkipped, "budget");
});

const case14 = join(evidenceDir, "scenario-14");
await mkdir(case14, { recursive: true });
await scenario(14, case14, async () => {
  await resetFixture();
  const name = spaceName("dialog");
  const common = exploreCommon(case14, name);
  try {
    await runStep({ ...common, step: 1, op: { kind: "navigate", url: `${baseUrl}/` } });
    const observed = await runStep({ ...common, step: 2, op: { kind: "observe" } });
    const dialog = observed.result.choices.find((choice) => choice.desc === "click Dialog");
    assert.ok(dialog, "dialog button choice");
    const startedAt = Date.now();
    const picked = await runStep({ ...common, step: 3, op: { kind: "pick", from: 2, id: dialog.id }, deadlineMs: 11000 }, 30, true);
    assert.equal(picked.result?.outcome, "dialog", `dialog outcome, exit ${picked.processResult.code}`);
    assert.equal(picked.result.dispatched, true);
    const settledAfterMs = (await stat(picked.path)).mtimeMs - startedAt;
    assert.ok(settledAfterMs < 8000, `result settled after ${settledAfterMs}ms`);
  } finally {
    const cleanup = await runRound(`await taskSpace(${JSON.stringify(name)}).then((task) => task.page("p1").dismissDialog());`);
    assert.equal(cleanup.code, 0, `dismiss dialog: ${cleanup.stderr}`);
    await saveSpace(name, join(case14, "finished-space.json"));
  }
});

const case15 = join(evidenceDir, "scenario-15");
await mkdir(case15, { recursive: true });
await scenario(15, case15, async () => {
  await resetFixture();
  const record = await aroundRecord(case15, {
    name: spaceName("console"),
    url: `${baseUrl}/?load-error=1`,
    label: "console",
    setup: 'await page.fill("#email", "probe-error@example.test");',
    action: '() => page.click("#submit")',
    options: "{ window: { minMs: 300, idleMs: 250, capMs: 3000 } }",
  });
  const replayError = record.console.find((entry) => entry.phase === "replay" && entry.level === "error");
  assert.ok(replayError?.text.includes("load-error-probe"), "replay error present");
  assert.ok(record.summary.endsWith("; 1 console errors"), `summary counts window errors only: ${record.summary}`);
  assert.deepEqual(record.console.filter((entry) => "key" in entry), []);
  assert.equal(record.counts.console, record.console.length);
});

const case16 = join(evidenceDir, "scenario-16");
await mkdir(case16, { recursive: true });
await scenario(16, case16, async () => {
  await resetFixture();
  const record = await aroundRecord(case16, {
    name: spaceName("duration"),
    url: `${baseUrl}/`,
    label: "duration",
    action: "() => page.evaluate(() => fetch('/slow?ms=800').then((response) => response.text()))",
    options: "{ window: { minMs: 300, idleMs: 250, capMs: 3000 } }",
  });
  const slow = record.requests.find((request) => request.url.includes("/slow"));
  assert.ok(slow.durationMs >= 700 && slow.durationMs < 2000, `network duration ${slow.durationMs}`);
});

async function dismissAndFinish(name, dir) {
  const cleanup = await runRound(`await taskSpace(${JSON.stringify(name)}).then((task) => task.page("p1").dismissDialog());`);
  assert.equal(cleanup.code, 0, `dismiss dialog: ${cleanup.stderr}`);
  await saveSpace(name, join(dir, "finished-space.json"));
}

const case17 = join(evidenceDir, "scenario-17");
await mkdir(case17, { recursive: true });
await scenario(17, case17, async () => {
  await resetFixture();
  const name = spaceName("late-dialog");
  const common = exploreCommon(case17, name);
  try {
    await runStep({ ...common, step: 1, op: { kind: "navigate", url: `${baseUrl}/` } });
    const observed = await runStep({ ...common, step: 2, op: { kind: "observe" } });
    const late = observed.result.choices.find((choice) => choice.desc === "click Late dialog");
    assert.ok(late, "late dialog button choice");
    const startedAt = Date.now();
    const picked = await runStep({ ...common, step: 3, op: { kind: "pick", from: 2, id: late.id }, deadlineMs: 11000 }, 30, true);
    assert.equal(picked.result?.outcome, "dialog", `late dialog outcome, exit ${picked.processResult.code}`);
    assert.equal(picked.result.dispatched, true);
    const settledAfterMs = (await stat(picked.path)).mtimeMs - startedAt;
    assert.ok(settledAfterMs < 8000, `result settled after ${settledAfterMs}ms`);
    const record = JSON.parse(await readFile(join(case17, "step-003.json"), "utf8"));
    assert.equal(record.window.endedBy, "dialog");
    assert.ok(record.window.endedAt - record.window.actionAt < 1500, "window stopped when the dialog opened");
    assert.equal(record.dialog.message, "Late dialog");
    assert.equal(record.after, null);
  } finally {
    await dismissAndFinish(name, case17);
  }
});

const case18 = join(evidenceDir, "scenario-18");
await mkdir(case18, { recursive: true });
await scenario(18, case18, async () => {
  await resetFixture();
  const name = spaceName("fetch-dialog");
  try {
    const source = `const { openProbe } = await import(${JSON.stringify(kitUrl)});
const task = await taskSpace(${JSON.stringify(name)});
const page = task.page("p1");
await page.goto(${JSON.stringify(`${baseUrl}/`)});
const probe = await openProbe(page);
await probe.around(() => page.evaluate(() => { fetch('/slow?ms=200').then(() => alert('after fetch')); }), {
  dir: ${JSON.stringify(case18)},
  label: "fetch-dialog",
  styles: [{ name: "title", selector: "h1", props: ["color"] }],
  window: { minMs: 300, idleMs: 200, capMs: 5000 },
});`;
    const run = await runRound(source, 30);
    assert.equal(run.code, 0, `ego round exit ${run.code}: ${run.stderr}`);
    const record = JSON.parse(await readFile(join(case18, "fetch-dialog.json"), "utf8"));
    assert.equal(record.outcome, "dialog");
    assert.equal(record.window.endedBy, "dialog");
    assert.equal(record.dialog.message, "after fetch");
    assert.equal(record.after, null);
    assert.deepEqual(record.styles, {});
    const slow = record.requests.find((request) => request.url.includes("/slow"));
    assert.ok(slow, "request evidence kept");
    assert.equal(slow.state, "in_flight", "a request unfinished when the dialog opened stays in flight");
    assert.deepEqual(record.window.incomplete, [slow.n]);
    assert.ok(record.summary.endsWith("javascript dialog open"), record.summary);
  } finally {
    await dismissAndFinish(name, case18);
  }
});

const case19 = join(evidenceDir, "scenario-19");
await mkdir(case19, { recursive: true });
await scenario(19, case19, async () => {
  await resetFixture();
  const record = await aroundRecord(case19, {
    name: spaceName("noisy"),
    url: `${baseUrl}/?noisy=150`,
    label: "noisy",
    setup: 'await page.fill("#email", "probe-error@example.test");',
    action: '() => page.click("#submit")',
    options: "{ window: { minMs: 300, idleMs: 250, capMs: 3000 } }",
  });
  const replayCount = record.console.filter((entry) => entry.phase === "replay").length;
  assert.equal(replayCount, 20, "replay capped at the most recent entries");
  const replayEntries = record.console.filter((entry) => entry.phase === "replay");
  assert.equal(replayEntries.at(-1).text, "noise-149", "most recent replay entry kept");
  assert.equal(record.counts.consoleDropped, 131, "older replay entries counted as dropped");
  assert.equal(record.counts.console, 152, "distinct console entries counted");
  const windowError = record.console.find((entry) => entry.phase === "window" && entry.level === "error");
  assert.ok(windowError?.text.includes("order-failed-probe"), "window console.error retained");
  assert.ok(record.summary.endsWith("; 1 console errors"), `summary counts the window error: ${record.summary}`);
});

const case20 = join(evidenceDir, "scenario-20");
await mkdir(case20, { recursive: true });
await scenario(20, case20, async () => {
  await resetFixture();
  const record = await aroundRecord(case20, {
    name: spaceName("bodies"),
    url: `${baseUrl}/`,
    label: "bodies",
    setup: `const sleep = (ms) => new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
const slowBodies = new Proxy(page, {
  get(target, key) {
    const value = target[key];
    if (typeof value !== "function") return value;
    if (key !== "cdp") return value.bind(target);
    return async (method, ...rest) => {
      if (method === "Network.getResponseBody") await sleep(400);
      return target.cdp(method, ...rest);
    };
  },
});`,
    probePage: "slowBodies",
    action: "() => page.evaluate(() => { for (let index = 0; index < 6; index++) fetch('/slow?ms=1&i=' + index); })",
    options: "{ window: { minMs: 300, idleMs: 250, capMs: 600 } }",
  });
  assert.equal(record.requests.length, 6);
  assert.ok(record.window.endedAt - record.window.actionAt < 1600, `window lasted ${record.window.endedAt - record.window.actionAt}ms`);
  assert.ok(record.requests.some((request) => request.bodyPath), "first bodies saved inside the budget");
  const skipped = record.requests.filter((request) => request.bodySkipped === "budget");
  assert.ok(skipped.length >= 3, `bodies skipped once the cap budget ran out: ${skipped.length}`);
  assert.ok(skipped.every((request) => request.state === "finished"));
});

const case21 = join(evidenceDir, "scenario-21");
await mkdir(case21, { recursive: true });
await scenario(21, case21, async () => {
  await resetFixture();
  const name = spaceName("after-failure");
  const source = `const { openProbe } = await import(${JSON.stringify(kitUrl)});
const task = await taskSpace(${JSON.stringify(name)});
const page = task.page("p1");
await page.goto(${JSON.stringify(`${baseUrl}/`)});
await page.fill("#email", "after@example.test");
let armed = false;
const flaky = new Proxy(page, {
  get(target, key) {
    const value = target[key];
    if (typeof value !== "function") return value;
    if (key !== "evaluate") return value.bind(target);
    return (...args) => {
      if (armed) throw new Error("Execution context was destroyed, most likely because of a navigation");
      return target.evaluate(...args);
    };
  },
});
const probe = await openProbe(flaky);
const window = { minMs: 300, idleMs: 250, capMs: 3000 };
await probe.around(() => { armed = true; return page.click("#submit"); }, { dir: ${JSON.stringify(case21)}, label: "plain", window });
armed = false;
await probe.around(() => { armed = true; }, {
  dir: ${JSON.stringify(case21)},
  label: "styled",
  styles: [{ name: "confirmation", selector: "#confirmation", props: ["color"] }],
  window,
});`;
  try {
    const run = await runRound(source);
    assert.equal(run.code, 0, `ego round exit ${run.code}: ${run.stderr}`);
    const plain = JSON.parse(await readFile(join(case21, "plain.json"), "utf8"));
    assert.equal(plain.outcome, "captured");
    assert.ok(plain.requests.some((request) => request.url.endsWith("/order") && request.state === "finished"), "request evidence kept");
    assert.ok(plain.summary.includes("POST /order 200"), plain.summary);
    assert.equal(plain.after, null);
    assert.match(plain.afterError, /Execution context was destroyed/);
    assert.equal(plain.stylesError, undefined, "no styles requested, no styles evaluate");
    const styled = JSON.parse(await readFile(join(case21, "styled.json"), "utf8"));
    assert.equal(styled.outcome, "captured");
    assert.match(styled.stylesError, /Execution context was destroyed/);
  } finally {
    await saveSpace(name, join(case21, "finished-space.json"));
  }
});

const case22 = join(evidenceDir, "scenario-22");
await mkdir(case22, { recursive: true });
await scenario(22, case22, async () => {
  await resetFixture();
  const name = spaceName("formatted-labels");
  const common = exploreCommon(case22, name);
  await runStep({ ...common, step: 1, op: { kind: "navigate", url: `${baseUrl}/` } });
  const observed = await runStep({ ...common, step: 2, op: { kind: "observe" } });
  const descriptions = observed.result.choices.map((choice) => choice.desc);
  assert.ok(descriptions.includes("click Settings icon"), `formatted image link uses alt: ${descriptions}`);
  assert.ok(descriptions.includes("select Region: EU"), `whitespace-only label falls through to title: ${descriptions}`);
  await saveSpace(name, join(case22, "finished-space.json"));
});

const case23 = join(evidenceDir, "scenario-23");
await mkdir(case23, { recursive: true });
await scenario(23, case23, async () => {
  await resetFixture();
  const record = await aroundRecord(case23, {
    name: spaceName("huge-style"),
    url: `${baseUrl}/?huge-style=1&late=50&slow=300`,
    label: "huge-style",
    setup: 'await page.fill("#email", "style@example.test");',
    action: '() => page.click("#submit")',
    options: `{
  styles: [{ name: "payload", selector: "html", props: ["--payload"] }],
  window: { minMs: 400, idleMs: 300, capMs: 3000 },
}`,
  });
  const size = (await stat(join(case23, "huge-style.json"))).size;
  assert.ok(size < 32768, `record size ${size}`);
  const value = record.styles.payload.values[0];
  assert.equal(value.props["--payload"].length, 500);
  assert.deepEqual(value.truncated, ["--payload"]);
  assert.equal(record.requests.length, 3, "network evidence kept");
  assert.equal(record.counts.requestDropped, 0);
});

const case24 = join(evidenceDir, "scenario-24");
await mkdir(case24, { recursive: true });
await scenario(24, case24, async () => {
  await resetFixture();
  const name = spaceName("candidate-cap");
  const common = exploreCommon(case24, name, { maxCandidates: 3 });
  await runStep({ ...common, step: 1, op: { kind: "navigate", url: `${baseUrl}/` } });
  const observed = await runStep({ ...common, step: 2, op: { kind: "observe" } });
  assert.equal(observed.result.choices.length, 3);
  assert.equal(observed.result.truncated, true);
  await saveSpace(name, join(case24, "finished-space.json"));
});

async function aroundDialogRecord(dir, { name, url, label, setup = "", probePage = "page", action, options }) {
  try {
    const source = `const { openProbe } = await import(${JSON.stringify(kitUrl)});
const task = await taskSpace(${JSON.stringify(name)});
const page = task.page("p1");
await page.goto(${JSON.stringify(url)});
${setup}
const probe = await openProbe(${probePage});
await probe.around(${action}, { dir: ${JSON.stringify(dir)}, label: ${JSON.stringify(label)}, ...${options} });`;
    const run = await runRound(source, 30);
    assert.equal(run.code, 0, `ego round exit ${run.code}: ${run.stderr}`);
    return JSON.parse(await readFile(join(dir, `${label}.json`), "utf8"));
  } finally {
    await dismissAndFinish(name, dir);
  }
}

const delayEvaluate = `const sleep = (ms) => new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
let armed = false;
const delayed = new Proxy(page, {
  get(target, key) {
    const value = target[key];
    if (typeof value !== "function") return value;
    if (key !== "evaluate") return value.bind(target);
    return async (...args) => {
      if (armed) {
        armed = false;
        await sleep(1400);
      }
      return target.evaluate(...args);
    };
  },
});`;

const case25 = join(evidenceDir, "scenario-25");
await mkdir(case25, { recursive: true });
await scenario(25, case25, async () => {
  await resetFixture();
  const record = await aroundDialogRecord(case25, {
    name: spaceName("after-window-dialog"),
    url: `${baseUrl}/`,
    label: "after-window",
    setup: delayEvaluate,
    probePage: "delayed",
    action: "() => { armed = true; return page.click('#slow-dialog'); }",
    options: `{
  styles: [{ name: "title", selector: "h1", props: ["color"] }],
  window: { minMs: 300, idleMs: 200, capMs: 3000 },
}`,
  });
  assert.equal(record.window.endedBy, "idle");
  assert.equal(record.outcome, "dialog");
  assert.equal(record.dialog.message, "Slow dialog");
  assert.equal(record.after, null);
  assert.equal(record.afterError, undefined);
  assert.deepEqual(record.styles, {});
  assert.ok(record.summary.endsWith("javascript dialog open"), record.summary);
});

const case26 = join(evidenceDir, "scenario-26");
await mkdir(case26, { recursive: true });
await scenario(26, case26, async () => {
  await resetFixture();
  const name = spaceName("slow-dialog");
  const common = exploreCommon(case26, name, { capture: { screenshot: true, window: { minMs: 3000, idleMs: 50, capMs: 5000 } } });
  try {
    await runStep({ ...common, step: 1, op: { kind: "navigate", url: `${baseUrl}/` } });
    const observed = await runStep({ ...common, step: 2, op: { kind: "observe" } });
    const slow = observed.result.choices.find((choice) => choice.desc === "click Slow dialog");
    assert.ok(slow, "slow dialog button choice");
    const picked = await runStep({ ...common, step: 3, op: { kind: "pick", from: 2, id: slow.id }, deadlineMs: 11000 }, 30, true);
    assert.equal(picked.result?.outcome, "dialog", `slow dialog outcome, exit ${picked.processResult.code}`);
    assert.equal(picked.result.dispatched, true);
    assert.equal(picked.result.record, "step-003.json");
    const record = JSON.parse(await readFile(join(case26, "step-003.json"), "utf8"));
    assert.equal(record.outcome, "dialog");
    assert.equal(record.window.endedBy, "dialog");
    assert.equal(record.dialog.message, "Slow dialog");
  } finally {
    await dismissAndFinish(name, case26);
  }
});

const case27 = join(evidenceDir, "scenario-27");
await mkdir(case27, { recursive: true });
await scenario(27, case27, async () => {
  await resetFixture();
  const record = await aroundDialogRecord(case27, {
    name: spaceName("body-dialog"),
    url: `${baseUrl}/`,
    label: "body-dialog",
    setup: `const sleep = (ms) => new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
const slowBodies = new Proxy(page, {
  get(target, key) {
    const value = target[key];
    if (typeof value !== "function") return value;
    if (key !== "cdp") return value.bind(target);
    return async (method, ...rest) => {
      if (method === "Network.getResponseBody") await sleep(400);
      return target.cdp(method, ...rest);
    };
  },
});`,
    probePage: "slowBodies",
    action: "() => page.evaluate(() => { fetch('/slow?ms=1'); setTimeout(() => alert('during body'), 250); })",
    options: "{ window: { minMs: 300, idleMs: 100, capMs: 5000 } }",
  });
  assert.equal(record.outcome, "dialog");
  assert.equal(record.window.endedBy, "dialog");
  assert.equal(record.dialog.message, "during body");
  assert.equal(record.after, null);
  assert.equal(record.afterError, undefined);
});

const case28 = join(evidenceDir, "scenario-28");
await mkdir(case28, { recursive: true });
await scenario(28, case28, async () => {
  await resetFixture();
  const record = await aroundDialogRecord(case28, {
    name: spaceName("long-dialog"),
    url: `${baseUrl}/`,
    label: "long-dialog",
    action: `() => page.evaluate(() => {
  for (let index = 0; index < 3; index++) fetch('/slow?ms=1&i=' + index);
  setTimeout(() => alert('x'.repeat(40000)), 50);
})`,
    options: "{ window: { minMs: 300, idleMs: 200, capMs: 3000 } }",
  });
  const size = (await stat(join(case28, "long-dialog.json"))).size;
  assert.ok(size < 32768, `record size ${size}`);
  assert.equal(record.outcome, "dialog");
  assert.equal(record.dialog.message, "x".repeat(500));
  assert.equal(record.requests.length, 3, "network evidence kept");
  assert.equal(record.counts.requestDropped, 0);
});

const case29 = join(evidenceDir, "scenario-29");
await mkdir(case29, { recursive: true });
await scenario(29, case29, async () => {
  await resetFixture();
  const record = await aroundRecord(case29, {
    name: spaceName("many-styles"),
    url: `${baseUrl}/`,
    label: "many-styles",
    action: `() => page.evaluate(() => {
  for (const element of document.querySelectorAll('*')) {
    for (let index = 0; index < 8; index++) element.style.setProperty('--p' + index, 'y'.repeat(500));
  }
  for (let index = 0; index < 3; index++) fetch('/slow?ms=1&i=' + index);
})`,
    options: `{
  styles: [{ name: "all", selector: "*", props: ["--p0", "--p1", "--p2", "--p3", "--p4", "--p5", "--p6", "--p7"] }],
  window: { minMs: 300, idleMs: 200, capMs: 3000 },
}`,
  });
  const size = (await stat(join(case29, "many-styles.json"))).size;
  assert.ok(size < 32768, `record size ${size}`);
  assert.equal(record.outcome, "captured");
  assert.equal(record.requests.length, 3, "network evidence kept");
  assert.equal(record.counts.requestDropped, 0);
  assert.ok(record.styles.all.matchCount > 10, "style evidence kept");
  assert.ok(Buffer.byteLength(JSON.stringify(record.styles)) <= 8192, "styles stay within their budget");
});

const case30 = join(evidenceDir, "scenario-30");
await mkdir(case30, { recursive: true });
await scenario(30, case30, async () => {
  await resetFixture();
  const name = spaceName("resume-dialog");
  const common = exploreCommon(case30, name);
  try {
    await runStep({ ...common, step: 1, op: { kind: "navigate", url: `${baseUrl}/` } });
    const observed = await runStep({ ...common, step: 2, op: { kind: "observe" } });
    const submit = observed.result.choices.find((choice) => choice.desc.includes("Place order"));
    assert.ok(submit, "submit choice");
    const recordPath = join(case30, "step-003.json");
    await writeFile(recordPath, JSON.stringify({ phase: "dispatching", dispatchedAt: 1 }));
    const before = await readFile(recordPath);
    const command = { ...common, step: 3, op: { kind: "pick", from: 2, id: submit.id } };
    const source = `const { runStep } = await import(${JSON.stringify(stepUrl)});
const real = await taskSpace(${JSON.stringify(name)});
const page = real.page("p1");
await page.evaluate(() => { setTimeout(() => alert("Open before resume"), 0); });
await new Promise((resolveWait) => setTimeout(resolveWait, 500));
const probeReady = new Proxy(page, {
  get(target, key) {
    const value = target[key];
    if (typeof value !== "function") return value;
    if (key !== "cdp") return value.bind(target);
    return async (method, ...rest) => method === "Runtime.enable" ? {} : target.cdp(method, ...rest);
  },
});
globalThis.taskSpace = async () => ({ spaceId: real.spaceId, page: () => probeReady });
await runStep(${JSON.stringify(command)});`;
    await runRound(source, 30);
    const result = JSON.parse(await readFile(join(case30, "step-003.result.json"), "utf8"));
    assert.equal(result.outcome, "uncertain_effect");
    assert.equal(result.dispatched, true);
    assert.match(result.issue, /PageDialogOpenedError/);
    assert.ok(before.equals(await readFile(recordPath)), "the resumed record file is untouched");
    assert.equal((await getState()).received, 0);
  } finally {
    await dismissAndFinish(name, case30);
  }
});

const case31 = join(evidenceDir, "scenario-31");
await mkdir(case31, { recursive: true });
await scenario(31, case31, async () => {
  await resetFixture();
  const record = await aroundDialogRecord(case31, {
    name: spaceName("same-tick"),
    url: `${baseUrl}/`,
    label: "same-tick",
    setup: delayEvaluate,
    probePage: "delayed",
    action: `() => {
  armed = true;
  return page.evaluate(() => { setTimeout(() => { console.error("same-tick-error"); alert("same tick"); }, 800); });
}`,
    options: "{ window: { minMs: 300, idleMs: 200, capMs: 3000 } }",
  });
  assert.equal(record.window.endedBy, "idle");
  assert.equal(record.outcome, "dialog");
  assert.equal(record.dialog.message, "same tick");
  const sameTick = record.console.find((entry) => entry.text === "same-tick-error");
  assert.equal(sameTick?.phase, "window");
  assert.equal(sameTick.level, "error");
  assert.ok(record.summary.endsWith("; 1 console errors; javascript dialog open"), record.summary);
});

const case32 = join(evidenceDir, "scenario-32");
await mkdir(case32, { recursive: true });
await scenario(32, case32, async () => {
  await resetFixture();
  const name = spaceName("near-limit");
  try {
    const source = `const { openProbe } = await import(${JSON.stringify(kitUrl)});
const { stat, writeFile } = await import("node:fs/promises");
const task = await taskSpace(${JSON.stringify(name)});
const page = task.page("p1");
await page.goto(${JSON.stringify(`${baseUrl}/`)});
const probe = await openProbe(page);
const record = await probe.around(() => page.evaluate(() => {
  for (let index = 0; index < 200; index++) fetch('/slow?ms=1&i=' + index);
  for (let index = 0; index < 40; index++) console.log('c' + index + ' ' + 'z'.repeat(1850));
}), { dir: ${JSON.stringify(case32)}, label: "near-limit", bodies: "none", window: { minMs: 300, idleMs: 200, capMs: 5000 } });
const sizeBefore = (await stat(${JSON.stringify(join(case32, "near-limit.json"))})).size;
await writeFile(${JSON.stringify(join(case32, "size-before.txt"))}, String(sizeBefore));
await page.evaluate(() => { setTimeout(() => prompt("问".repeat(1000), "答".repeat(1000)), 0); });
await new Promise((resolveWait) => setTimeout(resolveWait, 300));
try {
  await page.evaluate(() => 1);
} catch (error) {
  await probe.markDialog(record, error);
}`;
    const run = await runRound(source, 40);
    assert.equal(run.code, 0, `ego round exit ${run.code}: ${run.stderr}`);
    const sizeBefore = Number(await readFile(join(case32, "size-before.txt"), "utf8"));
    assert.ok(sizeBefore > 30000 && sizeBefore < 32768, `record was near the limit: ${sizeBefore}`);
    const path = join(case32, "near-limit.json");
    const record = JSON.parse(await readFile(path, "utf8"));
    assert.equal(record.outcome, "dialog");
    assert.equal(record.dialog.message.length, 500);
    assert.equal(record.dialog.defaultPrompt.length, 500);
    const size = (await stat(path)).size;
    assert.ok(size < 32768, `record size ${size}`);
    assert.ok(record.summary.length <= 3000, `summary length ${record.summary.length}`);
    assert.ok(record.summary.endsWith("; javascript dialog open"), record.summary.slice(-80));
  } finally {
    await dismissAndFinish(name, case32);
  }
});

const case33 = join(evidenceDir, "scenario-33");
await mkdir(case33, { recursive: true });
await scenario(33, case33, async () => {
  await resetFixture();
  const record = await aroundDialogRecord(case33, {
    name: spaceName("pump-failure"),
    url: `${baseUrl}/`,
    label: "pump-failure",
    setup: `let armed = false;
const failing = new Proxy(page, {
  get(target, key) {
    const value = target[key];
    if (typeof value !== "function") return value;
    if (key !== "events") return value.bind(target);
    return async (...args) => {
      if (armed) throw new Error("page label not found: p1");
      return target.events(...args);
    };
  },
});`,
    probePage: "failing",
    action: "async () => { const receipt = await page.click('#dialog'); armed = true; return receipt; }",
    options: "{ window: { minMs: 300, idleMs: 200, capMs: 3000 } }",
  });
  assert.equal(record.outcome, "uncertain_effect");
  assert.match(record.issue, /page label not found/);
  assert.equal(record.dialog.message, "Manual user action required");
  assert.equal(typeof record.dispatchedAt, "number");
});

console.log(`TaskSpaces created and finished: ${spaces.map(({ name, spaceId }) => `${name}=${spaceId}`).join(", ")}`);
console.log(`Evidence directory: ${evidenceDir}`);
if (failures.length) process.exitCode = 1;
