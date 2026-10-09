import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

export const FONT_SIZES = { s: 20, m: 26, l: 36, xl: 48 };

function widthOf(character, size) {
  if (/\s/.test(character)) return size * 0.35;
  if (/[MW@%&#]/.test(character)) return size;
  return size * (character.codePointAt(0) < 128 ? 0.65 : 1.1);
}

export function wrapText(text, width, size) {
  if (!Number.isFinite(width) || width <= 0) throw new Error("Text width must be finite and positive");
  if (!Number.isFinite(size) || size <= 0) throw new Error("Font size must be finite and positive");
  const lines = [];
  for (const paragraph of String(text).split("\n")) {
    let line = "";
    let used = 0;
    for (const character of paragraph) {
      const advance = widthOf(character, size);
      if (line && used + advance > width) {
        lines.push(line);
        line = "";
        used = 0;
      }
      line += character;
      used += advance;
    }
    lines.push(line);
  }
  return lines.join("\n");
}

export function createBoard(slug) {
  const records = {};
  function put(id, type, x, y, props, z) {
    const key = "shape:" + slug + ":" + id;
    if (records[key]) throw new Error("Duplicate shape ID: " + id);
    records[key] = { id: key, typeName: "shape", type, x, y, rot: 0, z, props };
    return records[key];
  }
  function styles(options) {
    return { color: options.color || "black", size: options.size || "s", dash: options.dash || "solid", fill: options.fill || "none", font: "sans" };
  }
  return {
    box(id, x, y, w, h, content, options = {}) {
      const labelSize = options.labelSize || "s";
      if (!Number.isFinite(w) || w <= 0 || !Number.isFinite(h) || h <= 0) throw new Error("Box dimensions must be finite and positive: " + id);
      if (!FONT_SIZES[labelSize]) throw new Error("Unsupported label size: " + labelSize);
      const label = String(content) === "" ? "" : wrapText(content, w - 40, FONT_SIZES[labelSize]);
      if (label && label.split("\n").length * FONT_SIZES[labelSize] * 1.3 > h - 28) {
        throw new Error("Box text exceeds estimated height: " + id);
      }
      return put(id, "geo", x, y, {
        ...styles(options), geo: options.geo || "rectangle", w, h, label, labelSize
      }, options.z ?? 20);
    },
    text(id, x, y, w, content, options = {}) {
      const size = options.size || "s";
      return put(id, "text", x, y, {
        ...styles({ ...options, size }), w,
        text: wrapText(content, w - 8, FONT_SIZES[size]), autosize: false, scale: 1, align: "start"
      }, options.z ?? 30);
    },
    arrow(id, x1, y1, x2, y2, options = {}) {
      return put(id, "arrow", x1, y1, {
        ...styles(options), dx: x2 - x1, dy: y2 - y1, bend: options.bend || 0
      }, options.z ?? 10);
    },
    line(id, x1, y1, x2, y2, options = {}) {
      return put(id, "line", x1, y1, {
        ...styles(options), dx: x2 - x1, dy: y2 - y1, bend: options.bend || 0
      }, options.z ?? 10);
    },
    snapshot() {
      return { document: { store: records } };
    },
    save(path) {
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, JSON.stringify(this.snapshot(), null, 2) + "\n");
      return Object.keys(records).length;
    }
  };
}
