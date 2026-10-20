import { createServer } from "node:http";

const maxDelayMs = 30000;
let received = 0;
let delayMs = 0;
let orders = [];
let replacementArmed = false;
let replacementApplied = false;
const html = `<!doctype html><html><head><title>Ego local checkout</title><style>#confirmation { color: rgb(12, 34, 56); }</style></head><body>
<h1>Local checkout</h1><form id="checkout"><label>Email <input id="email" name="email" type="email" required></label><label>Plan <select id="plan" name="plan"><option value="basic">Basic</option><option value="pro">Pro</option><option value="team">Team</option></select></label><button id="submit" type="submit">Place order</button></form>
<label><input id="newsletter" type="checkbox"> Newsletter</label><input id="apply" type="button" value="Apply promo"><a id="logo" href="/?logo=1"><img alt="Company logo" width="16" height="16" src="data:image/gif;base64,R0lGODlhAQABAAAAACw="></a>
<a id="navigate" href="/?navigated=1">Navigate after console</a><button id="dialog" onclick="alert('Manual user action required')">Dialog</button><button id="late-dialog" onclick="setTimeout(() => alert('Late dialog'), 100)">Late dialog</button><button id="slow-dialog" onclick="setTimeout(() => alert('Slow dialog'), 1500)">Slow dialog</button>
<a id="icon-link" href="/?icon=1">
  <img alt="Settings icon" width="16" height="16" src="data:image/gif;base64,R0lGODlhAQABAAAAACw=">
</a>
<label>
  <select id="region" name="region" title="Region">
    <option value="us">US</option>
    <option value="eu">EU</option>
  </select>
</label><button id="disabled" disabled>Disabled</button><div contenteditable id="custom">Unsupported editor</div>
<script>
const query = new URLSearchParams(location.search);
console.info("order-fixture-loaded");
const noisy = Number(query.get('noisy'));
for (let index = 0; index < noisy; index++) console.info('noise-' + index);
if (query.has('huge-style')) document.documentElement.style.setProperty('--payload', 'x'.repeat(40000));
if (query.has('load-error')) console.error('load-error-probe');
document.querySelector('#navigate').addEventListener('click', () => console.error('navigation-console-probe'));
document.querySelector('#checkout').onsubmit = async (event) => {
  event.preventDefault();
  const email = document.querySelector('#email').value;
  if (email === 'probe-error@example.test') {
    console.error('order-failed-probe');
  }
  const late = Number(query.get('late'));
  if (query.has('late') && Number.isFinite(late) && late >= 0) {
    setTimeout(() => fetch('/delayed-ping?ms=' + late), late);
  }
  const slow = Number(query.get('slow'));
  if (Number.isFinite(slow) && slow > 0) {
    fetch('/slow?ms=' + slow);
  }
  const response = await fetch('/order', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, plan: document.querySelector('#plan').value }),
  });
  if (response.ok) {
    const result = document.createElement('p');
    result.id = 'confirmation';
    result.textContent = 'Order confirmed';
    document.body.append(result);
  }
};
if (query.has('replace-watch')) {
  const poll = async () => {
    const response = await fetch('/replacement');
    const state = await response.json();
    if (state.replace) {
      const button = document.querySelector('#submit');
      const replacement = document.createElement('button');
      replacement.id = 'submit';
      replacement.type = 'submit';
      replacement.textContent = 'Replaced submit';
      button.replaceWith(replacement);
      await fetch('/replacement-applied', { method: 'POST' });
      return;
    }
    setTimeout(poll, 500);
  };
  setTimeout(poll, 500);
}
</script></body></html>`;
const json = (response, value) => {
  response.setHeader("content-type", "application/json");
  response.end(JSON.stringify(value));
};
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const boundedDelay = (value) => Math.min(maxDelayMs, Math.max(0, Number(value) || 0));
const server = createServer(async (request, response) => {
  const url = new URL(request.url, "http://127.0.0.1");
  if (url.pathname === "/state") {
    return json(response, { received, mutations: orders.length, delayMs, orders, replacementArmed, replacementApplied });
  }
  if (url.pathname === "/reset" && request.method === "POST") {
    received = 0;
    delayMs = 0;
    orders = [];
    replacementArmed = false;
    replacementApplied = false;
    response.end("reset");
    return;
  }
  if (url.pathname === "/delay" && request.method === "POST") {
    delayMs = boundedDelay(url.searchParams.get("ms"));
    return json(response, { delayMs });
  }
  if (url.pathname === "/arm-replace" && request.method === "POST") {
    replacementArmed = true;
    replacementApplied = false;
    response.end("armed");
    return;
  }
  if (url.pathname === "/replacement") {
    const replace = replacementArmed;
    replacementArmed = false;
    return json(response, { replace });
  }
  if (url.pathname === "/replacement-applied" && request.method === "POST") {
    replacementApplied = true;
    response.end("applied");
    return;
  }
  if (url.pathname === "/order" && request.method === "POST") {
    const seq = ++received;
    let data = "";
    for await (const chunk of request) data += chunk;
    if (delayMs) await delay(delayMs);
    orders.push({ seq, acceptedAt: new Date().toISOString(), ...JSON.parse(data) });
    response.setHeader("content-type", "text/plain");
    response.end("ok");
    return;
  }
  if (url.pathname === "/delayed-ping") {
    await delay(boundedDelay(url.searchParams.get("ms")));
    return json(response, { pong: true });
  }
  if (url.pathname === "/redirect") {
    response.statusCode = 302;
    response.setHeader("location", "/?landed=1");
    response.end();
    return;
  }
  if (url.pathname === "/slow") {
    await delay(boundedDelay(url.searchParams.get("ms")));
    response.setHeader("content-type", "text/plain");
    response.end("slow");
    return;
  }
  response.setHeader("content-type", "text/html");
  const hiddenText = url.searchParams.has("hidden-text")
    ? '<div id="confirmation">Pending<span hidden>Order confirmed</span><span style="display:none">Order confirmed</span><span style="visibility:hidden">Order confirmed</span></div>'
    : "";
  response.end(html.replace("<script>", `${hiddenText}<script>`));
});
server.listen(Number(process.env.PORT ?? 4317), "127.0.0.1", () => {
  console.log(`Fixture http://127.0.0.1:${server.address().port}`);
});
