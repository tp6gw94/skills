# Explore loop

Resolve the skill directory and set `cfg.stepUrl` to the absolute `file://` URL for `scripts/explore-step.mjs`. Set a unique evidence directory, TaskSpace name, goal, starting URL, text-key map, caps, and timeouts. Run the entire script as one codemode call. Use localhost or an approved staging URL.

The loop starts by navigating the new TaskSpace's `p1` to `cfg.start`. Every step then runs in a fresh Ego Node process. Each result comes from `tools.read`, never Ego stdout or stderr. Each result choice is `{id, desc, fill, key}`. The `key` hashes the candidate's kind, selector, option value, and fingerprint, so the repeat check separates different options of one select and different checked states of one checkbox. The classifier sees only the `{id, desc, fill}` projection. It chooses actions and configured text keys. `DONE` and `STOP` return control to the main agent; neither is a test verdict. The loop never finishes the TaskSpace. After `DONE`, `STOP`, or any other stop, the coordinating agent reviews the evidence and then calls `task.finish({keep:[]})` once, or keeps the space for follow-up work.

```js
// @options: {"max_output_tokens":4000,"timeout_ms":600000}
const cfg = {
  stepUrl: "file://<resolved-skill-directory>/scripts/explore-step.mjs",
  dir: "<absolute-evidence-directory>",
  name: `explore-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
  goal: "Place one order with the configured email",
  start: "http://127.0.0.1:4317/",
  texts: { email: "buyer@example.test" },
  caps: { steps: 12, candidates: 24 },
  timeouts: { totalMs: 540000, stepTimeoutSec: 30, marginSec: 5 },
  capture: { bodies: "api", window: { minMs: 300, idleMs: 400, capMs: 10000 } },
};

const startedAt = Date.now();
const seen = new Set();
let nextOp = { kind: "navigate", url: cfg.start };

async function classify(context) {
  const first = await models.classify({ provider: "typesafe", id: "jev-latest" }, context);
  if (first.stopReason !== "error") return first;
  return models.classify({ provider: "vercel-ai-gateway", id: "typesafe-ai/jev" }, context);
}

for (let step = 1; step <= cfg.caps.steps; step++) {
  const remainingMs = cfg.timeouts.totalMs - (Date.now() - startedAt);
  const shellTimeoutSec = Math.min(cfg.timeouts.stepTimeoutSec, Math.floor(remainingMs / 1000 - cfg.timeouts.marginSec));
  if (shellTimeoutSec <= 4) {
    text(`step ${step} stop deadline budget exhausted`);
    return { stopReason: "deadline" };
  }
  const deadlineMs = shellTimeoutSec * 1000 - 4000;
  const command = {
    dir: cfg.dir,
    step,
    space: { name: cfg.name },
    page: "p1",
    op: nextOp,
    fillValues: Object.values(cfg.texts),
    maxCandidates: cfg.caps.candidates,
    deadlineMs,
    capture: cfg.capture,
  };
  const resultPath = `${cfg.dir}/step-${String(step).padStart(3, "0")}.result.json`;
  const recordPath = `${cfg.dir}/step-${String(step).padStart(3, "0")}.json`;
  text(`step ${step} start ${nextOp.kind}`);
  await tools.bash({
    command: `timeout ${shellTimeoutSec}s ego-browser nodejs <<'EGO'\nconst { runStep } = await import(${JSON.stringify(cfg.stepUrl)});\nawait runStep(${JSON.stringify(command)});\nEGO`,
    timeout: shellTimeoutSec + 2,
  });

  let result;
  try {
    result = JSON.parse(await tools.read({ path: resultPath }));
  } catch {
    let record;
    try {
      record = JSON.parse(await tools.read({ path: recordPath }));
    } catch {}
    const stopReason = record && "dispatchedAt" in record ? "uncertain_effect" : "round_failed";
    text(`step ${step} stop ${stopReason}`);
    return { stopReason, step };
  }
  text(`step ${step} ${result.outcome} ${result.summary}`);
  if (["uncertain_effect", "action_error", "error", "dialog"].includes(result.outcome)) return { stopReason: result.outcome, step, summary: result.summary };

  const criteria = Object.fromEntries(result.choices.map((choice) => [choice.id, `${choice.desc}${choice.fill ? "; fill this field" : ""}`]));
  criteria.DONE = "The goal appears complete. Return control for main-agent review.";
  criteria.STOP = "The next step cannot be chosen safely.";
  const actionDecision = await classify({
    state: { goal: cfg.goal, step, page: result.page, summary: result.summary, choices: result.choices.map(({ id, desc, fill }) => ({ id, desc, fill })) },
    questions: {
      action: {
        type: "choice",
        instructions: "Choose one candidate that advances the goal, DONE for main-agent review, or STOP.",
        criteria,
      },
    },
  });
  if (actionDecision.stopReason !== "stop") return { stopReason: actionDecision.stopReason, step, issue: actionDecision.errorMessage };
  const actionChoice = actionDecision.answers.action;
  if (actionChoice?.type !== "choice") return { stopReason: "invalid_choice", step };
  if (actionChoice.choice === "DONE" || actionChoice.choice === "STOP") return { stopReason: actionChoice.choice.toLowerCase(), step };
  const choice = result.choices.find((item) => item.id === actionChoice.choice);
  if (!choice) return { stopReason: "invalid_choice", step };

  let textValue;
  if (choice.fill) {
    const textCriteria = Object.fromEntries(Object.keys(cfg.texts).map((key) => [key, `Use configured text key ${key}`]));
    textCriteria.NONE = "No configured text key belongs in this field.";
    const textDecision = await classify({
      state: { goal: cfg.goal, step, field: choice.desc, textKeys: Object.keys(cfg.texts) },
      questions: {
        textKey: {
          type: "choice",
          instructions: "Choose which configured text key belongs in this field, or NONE if no configured key fits.",
          criteria: textCriteria,
        },
      },
    });
    if (textDecision.stopReason !== "stop") return { stopReason: textDecision.stopReason, step, issue: textDecision.errorMessage };
    const textChoice = textDecision.answers.textKey;
    if (textChoice?.type === "choice" && textChoice.choice === "NONE") return { stopReason: "no_text_key", step };
    if (textChoice?.type !== "choice" || !Object.hasOwn(cfg.texts, textChoice.choice)) return { stopReason: "invalid_text_key", step };
    textValue = cfg.texts[textChoice.choice];
  }

  const repeatKey = `${result.stateKey}|${choice.key}|${textValue ?? ""}`;
  if (seen.has(repeatKey)) return { stopReason: "repeated_state", step };
  seen.add(repeatKey);
  nextOp = { kind: "pick", from: step, id: choice.id, ...(choice.fill ? { text: textValue } : {}) };
}

text(`stop step cap ${cfg.caps.steps}`);
return { stopReason: "step_cap", steps: cfg.caps.steps };
```

The shell timeout is bounded by the remaining codemode deadline and margin. The inner step deadline ends four seconds before the shell timeout. The loop emits a `text()` trace before each Ego round and after each result so a shell timeout does not erase earlier progress. A missing result file causes the loop to inspect the record; a record with `dispatchedAt` stops as `uncertain_effect`, and every other missing-result case stops as `round_failed`. The bash exit code is ignored.

The stop list is `uncertain_effect`, `action_error`, `error`, and `dialog`. A `dialog` outcome means the action opened a JavaScript dialog. The step records it, including a dialog that opens later in the window or after it (found by a failing after-window call or by the step's own scan, both `PageDialogOpenedError`), stops running page evaluations, never accepts or dismisses it, and the loop stops. When the scan of a resumed record from an earlier round fails with `PageDialogOpenedError`, the step keeps the interpreted outcome and `dispatched` flag, adds the error to `issue`, skips the scan, and leaves the record file unchanged. The coordinating agent handles the dialog with `page.acceptDialog()` or `page.dismissDialog()` before finishing the space. The Ego round can linger about 15 seconds after a dialog opens, so the step result file is authoritative and the shell timeout may expire after the result is written. The text-key question also offers `NONE`, which stops the loop as `no_text_key` instead of forcing a key into the field.

The first provider is `typesafe/jev-latest`. The Vercel AI Gateway provider `vercel-ai-gateway/typesafe-ai/jev` is used only when the first classifier result has `stopReason === "error"`. An aborted classification stops without fallback.
