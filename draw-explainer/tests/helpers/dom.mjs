export class Element {
  constructor(tag = "div", ownerDocument = null) {
    this.tagName = tag.toUpperCase();
    this.ownerDocument = ownerDocument;
    this.disabled = false;
    this.hidden = false;
    this.value = "";
    this.files = [];
    this.children = [];
    this.events = new Map();
    this.attributes = new Map();
    this.dataset = {};
    this.inert = false;
    this.parentNode = null;
    this._text = "";
    this.classes = new Set();
    this.classList = {
      add: (...names) => names.forEach(name => this.classes.add(name)),
      remove: (...names) => names.forEach(name => this.classes.delete(name)),
      contains: name => this.classes.has(name),
      toggle: (name, force = !this.classes.has(name)) => { if (force) this.classes.add(name); else this.classes.delete(name); return force; }
    };
    this.style = { display: "", removeProperty(name) { delete this[name]; } };
  }
  get parentElement() { return this.parentNode; }
  get firstChild() { return this.children[0] || null; }
  get nextElementSibling() { return this.parentNode?.children[this.parentNode.children.indexOf(this) + 1] || null; }
  get className() { return [...this.classes].join(" "); }
  set className(value) { this.classes = new Set(value.split(/\s+/).filter(Boolean)); }
  get textContent() { return this._text + this.children.map(child => child.textContent).join(""); }
  set textContent(value) {
    for (const child of this.children) child.parentNode = null;
    this.children = [];
    this._text = String(value);
  }
  setAttribute(name, value) {
    this.attributes.set(name, String(value));
    if (name === "class") this.className = String(value);
    if (name === "id") this.id = String(value);
    if (name.startsWith("data-")) this.dataset[name.slice(5)] = String(value);
  }
  getAttribute(name) {
    if (name.startsWith("data-")) return this.dataset[name.slice(5)] ?? null;
    return this.attributes.get(name) ?? null;
  }
  appendChild(element) { return this.insertBefore(element, null); }
  insertBefore(element, reference) {
    if (element === reference) return element;
    element.remove();
    const index = reference === null ? this.children.length : this.children.indexOf(reference);
    if (index < 0) throw new Error("Reference node is not a child");
    this.children.splice(index, 0, element);
    element.parentNode = this;
    element.ownerDocument = this.ownerDocument;
    return element;
  }
  replaceChild(element, previous) {
    this.insertBefore(element, previous);
    previous.remove();
    return previous;
  }
  remove() {
    if (this.parentNode) this.parentNode.children.splice(this.parentNode.children.indexOf(this), 1);
    this.parentNode = null;
  }
  contains(element) {
    for (let current = element; current; current = current.parentNode) if (current === this) return true;
    return false;
  }
  matches(selector) {
    const attribute = /\[([^=]+)="([^"]*)"\]/.exec(selector);
    if (attribute && this.getAttribute(attribute[1]) !== attribute[2]) return false;
    const simple = selector.replace(/\[[^\]]+\]/g, "");
    const tag = /^[a-z]+/i.exec(simple)?.[0];
    if (tag && this.tagName !== tag.toUpperCase()) return false;
    const id = /#([\w-]+)/.exec(simple)?.[1];
    if (id && this.id !== id) return false;
    return [...simple.matchAll(/\.([\w-]+)/g)].every(match => this.classes.has(match[1]));
  }
  querySelectorAll(selector) {
    const found = [];
    for (const child of this.children) {
      if (child.matches(selector)) found.push(child);
      found.push(...child.querySelectorAll(selector));
    }
    return found;
  }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
  addEventListener(name, handler, options = false) {
    const handlers = this.events.get(name) || [];
    handlers.push({ handler, capture: options === true || options.capture === true });
    this.events.set(name, handlers);
  }
  async emit(name, event = {}) {
    event.target ??= this;
    event.preventDefault ??= () => { event.defaultPrevented = true; };
    event.stopPropagation ??= () => { event.propagationStopped = true; };
    event.stopImmediatePropagation ??= () => { event.immediatePropagationStopped = true; };
    const handlers = [...(this.events.get(name) || [])].sort((a, b) => Number(b.capture) - Number(a.capture));
    const pending = [];
    for (const { handler } of handlers) {
      const result = handler(event);
      if (result?.then) pending.push(result);
      if (event.immediatePropagationStopped) break;
    }
    await Promise.all(pending);
  }
  click() { if (!this.disabled) return this.emit("click"); }
  focus() { if (this.ownerDocument) this.ownerDocument.activeElement = this; }
  blur() { if (this.ownerDocument?.activeElement === this) this.ownerDocument.activeElement = null; }
}
