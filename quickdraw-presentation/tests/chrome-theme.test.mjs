import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const template = readFileSync(new URL("../assets/viewer-template.html", import.meta.url), "utf8");
const css = /<style>([\s\S]*?)<\/style>/.exec(template)[1];
const rules = new Map([...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(([, selector, block]) => [
  selector.trim(),
  Object.fromEntries(block.split(";").filter(value => value.trim()).map(value => {
    const split = value.indexOf(":");
    return [value.slice(0, split).trim(), value.slice(split + 1).trim()];
  }))
]));

test("board selector delegates its foreground, background and border to the SDK theme", () => {
  const selector = rules.get("#boards");
  assert.equal(selector.color, "var(--qd-ink)");
  assert.equal(selector.background, "var(--qd-pop-bg)");
  assert.equal(selector.border, "1px solid var(--qd-border)");
  assert.equal(selector["color-scheme"], "light");
  assert.equal(rules.get('#board[data-qd-theme="dark"] #boards')["color-scheme"], "dark");
});

test("sticky menu uses paired SDK theme colors only while inactive and preserves native active colors", () => {
  const menu = '#board .qd-dock > button[data-name="menu"]';
  const base = rules.get(menu);
  assert.equal(base.background, undefined);
  assert.equal(base.color, undefined);
  const inactive = rules.get(menu + ":not(.on)");
  assert.equal(inactive.background, "var(--qd-pop-bg)");
  assert.equal(inactive.color, "var(--qd-ink)");
  assert.equal(rules.get(menu + ".on"), undefined);
});
