import assert from 'node:assert/strict';
import test from 'node:test';
import { deflateSync, inflateSync } from 'node:zlib';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import * as codec from '../assets/png.mjs';

const { embedSnapshot, extractSnapshot } = codec;
const encoder = new TextEncoder();
const decoder = new TextDecoder();
const signature = Uint8Array.of(137, 80, 78, 71, 13, 10, 26, 10);
const prefix = encoder.encode('quickdraw.nvim\0\0\0\0\0');

function join(...parts) {
  const result = new Uint8Array(parts.reduce((length, part) => length + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.length;
  }
  return result;
}

function u32(value) {
  return Uint8Array.of(value >>> 24, value >>> 16, value >>> 8, value);
}

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) {
      crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data = new Uint8Array()) {
  const body = join(encoder.encode(type), data);
  return join(u32(data.length), body, u32(crc32(body)));
}

const ihdr = chunk('IHDR', join(u32(1), u32(1), Uint8Array.of(8, 6, 0, 0, 0)));
const pixels = Uint8Array.of(0, 255, 0, 128, 255);
const idat = chunk('IDAT', new Uint8Array(deflateSync(pixels)));
const iend = chunk('IEND');
const tinyPng = join(signature, ihdr, idat, iend);

function pngWith(...metadata) {
  return join(signature, ihdr, idat, ...metadata, iend);
}

function metadataJson(json) {
  return chunk('iTXt', join(prefix, encoder.encode(json)));
}

function metadata(envelope) {
  return metadataJson(JSON.stringify(envelope));
}

function envelope(snapshot = {}, version = 1) {
  return { schema: 'quickdraw.nvim', version, snapshot };
}

function chunks(bytes) {
  const result = [];
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  for (let offset = 8; offset < bytes.length;) {
    const length = view.getUint32(offset);
    const end = offset + length + 12;
    const type = decoder.decode(bytes.subarray(offset + 4, offset + 8));
    assert.equal(view.getUint32(end - 4), crc32(bytes.subarray(offset + 4, end - 4)));
    result.push({ type, data: bytes.slice(offset + 8, end - 4), bytes: bytes.slice(offset, end) });
    offset = end;
  }
  return result;
}

function rejectsCode(operation, code) {
  assert.throws(operation, error => error instanceof Error && error.code === code);
}

function rejectsBoth(bytes, code) {
  const original = bytes instanceof Uint8Array ? bytes.slice() : null;
  rejectsCode(() => extractSnapshot(bytes), code);
  rejectsCode(() => embedSnapshot(bytes, {}), code);
  if (original !== null) {
    assert.deepEqual(bytes, original);
  }
}

test('public exports contain only the two synchronous functions', () => {
  assert.deepEqual(Object.keys(codec).sort(), ['embedSnapshot', 'extractSnapshot']);
  assert.equal(typeof embedSnapshot, 'function');
  assert.equal(typeof extractSnapshot, 'function');
});

test('tiny fixture has valid CRCs and a complete one-pixel RGBA image', () => {
  assert.deepEqual(tinyPng.subarray(0, 8), signature);
  const parsed = chunks(tinyPng);
  assert.deepEqual(parsed.map(entry => entry.type), ['IHDR', 'IDAT', 'IEND']);
  assert.deepEqual(parsed[0].data, join(u32(1), u32(1), Uint8Array.of(8, 6, 0, 0, 0)));
  assert.deepEqual(new Uint8Array(inflateSync(parsed[1].data)), pixels);
  assert.equal(extractSnapshot(tinyPng), null);
});

test('Unicode and data URLs round-trip in the exact version-one layout', () => {
  const snapshot = {
    title: '繁體中文 🎨 café e\u0301',
    layers: [{ name: '背景', source: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==' }],
    text: 'line\nquote"\\\u0000',
    values: [null, true, false, 123.5]
  };
  const original = structuredClone(snapshot);
  const output = embedSnapshot(tinyPng, snapshot);
  assert.ok(output instanceof Uint8Array);
  assert.deepEqual(extractSnapshot(output), snapshot);
  assert.deepEqual(snapshot, original);
  assert.deepEqual(output, pngWith(metadata(envelope(snapshot))));
  assert.deepEqual(extractSnapshot(embedSnapshot(tinyPng, {})), {});
});

test('embedding preserves unrelated chunks, order, image bytes, and input ownership', () => {
  const unrelated = [
    chunk('tEXt', encoder.encode('quickdraw.nvim\0ordinary text')),
    chunk('iTXt', encoder.encode('other\0\0\0\0\0{}')),
    chunk('iTXt', encoder.encode('quickdraw.nvim')),
    chunk('iTXt', encoder.encode('quickdraw.nvim.extra\0\0\0\0\0{}')),
    chunk('vpAg', Uint8Array.of(0, 255, 1))
  ];
  const input = join(signature, ihdr, unrelated[0], idat, ...unrelated.slice(1), iend);
  const copy = input.slice();
  const output = embedSnapshot(input, { current: true });
  assert.deepEqual(input, copy);
  assert.notEqual(output.buffer, input.buffer);
  const before = chunks(input);
  const after = chunks(output);
  assert.deepEqual(after.filter((entry, index) => index !== after.length - 2), before);
  output[0] = 0;
  assert.deepEqual(input, copy);
});

test('Uint8Array views respect byte offsets and do not expose backing storage', () => {
  const backing = join(Uint8Array.of(11, 22), tinyPng, Uint8Array.of(33, 44));
  const view = backing.subarray(2, backing.length - 2);
  const before = backing.slice();
  const encoded = embedSnapshot(view, { offset: true });
  assert.deepEqual(extractSnapshot(encoded), { offset: true });
  assert.equal(extractSnapshot(view), null);
  assert.deepEqual(backing, before);
});

test('re-embedding replaces metadata and leaves exactly one matching chunk', () => {
  const first = embedSnapshot(tinyPng, { old: true });
  const second = embedSnapshot(first, { new: true });
  assert.deepEqual(second, pngWith(metadata(envelope({ new: true }))));
  assert.deepEqual(extractSnapshot(first), { old: true });
  assert.deepEqual(extractSnapshot(second), { new: true });
});

test('duplicate metadata is rejected before decoding and all matches are replaced', () => {
  const input = join(signature, ihdr, metadataJson('{'), idat, metadata(envelope({}, 9)), iend);
  rejectsCode(() => extractSnapshot(input), 'DUPLICATE_METADATA');
  assert.deepEqual(embedSnapshot(input, { repaired: true }), pngWith(metadata(envelope({ repaired: true }))));
});

test('embedding repairs every structurally valid malformed or unsupported payload', () => {
  const cases = [
    metadataJson('{'),
    metadata(envelope({}, 2)),
    metadata({ ...envelope(), extra: true }),
    chunk('iTXt', encoder.encode('quickdraw.nvim\0')),
    chunk('iTXt', join(encoder.encode('quickdraw.nvim\0\u0001\0\0\0'), Uint8Array.of(255)))
  ];
  for (const old of cases) {
    assert.deepEqual(embedSnapshot(pngWith(old), { repaired: true }), pngWith(metadata(envelope({ repaired: true }))));
  }
  assert.deepEqual(embedSnapshot(pngWith(...cases), {}), pngWith(metadata(envelope())));
});

test('invalid signatures and byte input types report INVALID_PNG', () => {
  for (const input of [null, undefined, 'PNG', [], new ArrayBuffer(8), new DataView(new ArrayBuffer(8)), new Uint8Array(), tinyPng.slice(1)]) {
    rejectsBoth(input, 'INVALID_PNG');
  }
  for (let index = 0; index < 8; index++) {
    const broken = tinyPng.slice();
    broken[index] ^= 1;
    rejectsBoth(broken, 'INVALID_PNG');
  }
});

test('all truncation boundaries are rejected with stable codes', () => {
  for (let length = 0; length < tinyPng.length; length++) {
    rejectsBoth(tinyPng.slice(0, length), length < 8 ? 'INVALID_PNG' : 'INVALID_CHUNK');
  }
});

test('CRC failures in every chunk including metadata prevent extraction and repair', () => {
  const input = pngWith(metadata(envelope()));
  let offset = 8;
  for (const entry of chunks(input)) {
    const broken = input.slice();
    broken[offset + entry.bytes.length - 1] ^= 1;
    rejectsBoth(broken, 'INVALID_CRC');
    offset += entry.bytes.length;
  }
  const changedData = tinyPng.slice();
  changedData[16] ^= 1;
  rejectsBoth(changedData, 'INVALID_CRC');
});

test('chunk types reject nonletters and a lowercase reserved third byte', () => {
  for (const type of ['a1Cd', 'a-Cd', 'abcd', 'ab\u0080d', '\0BCD']) {
    rejectsBoth(join(signature, ihdr, chunk(type), idat, iend), 'INVALID_CHUNK');
  }
});

test('IHDR must be first, length thirteen, and unique', () => {
  for (const input of [
    join(signature, idat, ihdr, iend),
    join(signature, iend),
    join(signature, chunk('IHDR', new Uint8Array(12)), idat, iend),
    join(signature, chunk('IHDR', new Uint8Array(14)), idat, iend),
    join(signature, ihdr, idat, ihdr, iend)
  ]) {
    rejectsBoth(input, 'INVALID_CHUNK');
  }
});

test('IEND must be present, empty, and final', () => {
  for (const input of [
    join(signature, ihdr, idat),
    join(signature, ihdr, idat, chunk('IEND', Uint8Array.of(0))),
    join(tinyPng, Uint8Array.of(0)),
    join(tinyPng, iend),
    join(tinyPng, metadata(envelope()))
  ]) {
    rejectsBoth(input, 'INVALID_CHUNK');
  }
});

test('the PNG chunk length limit is enforced without an arbitrary payload cap', () => {
  rejectsBoth(join(signature, ihdr, u32(0x80000000), encoder.encode('iTXt')), 'CHUNK_TOO_LARGE');
  rejectsBoth(join(signature, ihdr, u32(0xffffffff), encoder.encode('iTXt')), 'CHUNK_TOO_LARGE');
  rejectsBoth(join(signature, ihdr, u32(0x7fffffff), encoder.encode('iTXt')), 'INVALID_CHUNK');
});

test('ordinary PNGs with unrelated text metadata return null', () => {
  assert.equal(extractSnapshot(pngWith(chunk('iTXt', encoder.encode('other\0\0\0\0\0not JSON')))), null);
  assert.equal(extractSnapshot(pngWith(chunk('tEXt', encoder.encode('quickdraw.nvim\0{}')))), null);
  assert.equal(extractSnapshot(pngWith(chunk('iTXt', encoder.encode('quickdraw.nvim')))), null);
});

test('malformed JSON and invalid metadata envelopes report INVALID_METADATA', () => {
  const cases = [
    '{', '', 'null', '[]', 'true', '123', '"text"',
    JSON.stringify({ ...envelope(), extra: true }),
    JSON.stringify({ ...envelope(), schema: 'other' }),
    JSON.stringify({ version: 1, snapshot: {} }),
    JSON.stringify({ schema: 'quickdraw.nvim', snapshot: {} }),
    JSON.stringify({ schema: 'quickdraw.nvim', version: 1 }),
    JSON.stringify(envelope([], 1)),
    JSON.stringify(envelope(null, 1)),
    JSON.stringify(envelope('text', 1)),
    JSON.stringify(envelope(42, 1)),
    JSON.stringify(envelope({}, '1')),
    JSON.stringify(envelope({}, 1.5)),
    JSON.stringify(envelope({}, null)),
    '{"schema":"quickdraw.nvim","version":1e999,"snapshot":{}}'
  ];
  for (const json of cases) {
    rejectsCode(() => extractSnapshot(pngWith(metadataJson(json))), 'INVALID_METADATA');
  }
});

test('unsupported integer versions report UNSUPPORTED_VERSION', () => {
  for (const version of [-1, 0, 2, 99, 2147483647]) {
    rejectsCode(() => extractSnapshot(pngWith(metadata(envelope({}, version)))), 'UNSUPPORTED_VERSION');
  }
});

test('compression, language, translated keyword, and incomplete layouts are rejected', () => {
  const fields = [
    'quickdraw.nvim\0',
    'quickdraw.nvim\0\0',
    'quickdraw.nvim\0\0\0\0',
    'quickdraw.nvim\0\u0001\0\0\0{}',
    'quickdraw.nvim\0\0\u0001\0\0{}',
    'quickdraw.nvim\0\0\0en\0\0{}',
    'quickdraw.nvim\0\0\0\0translated\0{}'
  ];
  for (const data of fields) {
    rejectsCode(() => extractSnapshot(pngWith(chunk('iTXt', encoder.encode(data)))), 'INVALID_METADATA');
  }
});

test('invalid UTF-8 is rejected even where replacement characters would form valid JSON', () => {
  for (const invalid of [Uint8Array.of(255), Uint8Array.of(0xc0, 0xaf), Uint8Array.of(0xed, 0xa0, 0x80), Uint8Array.of(0xe2, 0x82)]) {
    const data = join(prefix, encoder.encode('{"schema":"quickdraw.nvim","version":1,"snapshot":{"text":"'), invalid, encoder.encode('"}}'));
    const input = pngWith(chunk('iTXt', data));
    rejectsCode(() => extractSnapshot(input), 'INVALID_METADATA');
    assert.deepEqual(embedSnapshot(input, { repaired: true }), pngWith(metadata(envelope({ repaired: true }))));
  }
});

test('non-object snapshots and failed serialization have stable errors', () => {
  for (const snapshot of [null, undefined, true, 1, 'text', () => {}, Symbol('value')]) {
    rejectsCode(() => embedSnapshot(tinyPng, snapshot), 'ENCODE_FAILED');
  }
  for (const snapshot of [[], [1]]) {
    rejectsCode(() => embedSnapshot(tinyPng, snapshot), 'INVALID_METADATA');
  }
  const cycle = {};
  cycle.self = cycle;
  for (const snapshot of [cycle, { value: 1n }, { toJSON() { throw new Error('serialization failed'); } }]) {
    rejectsCode(() => embedSnapshot(tinyPng, snapshot), 'ENCODE_FAILED');
  }
  rejectsCode(() => embedSnapshot(new Uint8Array(), cycle), 'INVALID_PNG');
});

test('source can be inlined into an IIFE without Node or module facilities', () => {
  const source = readFileSync(new URL('../assets/png.mjs', import.meta.url), 'utf8');
  assert.equal(source.toLowerCase().includes('<' + '/script'), false);
  const inline = source.replace(/^export function /gm, 'function ');
  const api = runInNewContext(`(() => {${inline}\nreturn { embedSnapshot, extractSnapshot };})()`, { Uint8Array, TextEncoder, TextDecoder });
  assert.deepEqual(JSON.parse(JSON.stringify(api.extractSnapshot(api.embedSnapshot(tinyPng, { inline: '離線' })))), { inline: '離線' });
});

test('snapshots larger than sixteen MiB round-trip and produce independently valid CRCs', () => {
  const snapshot = { dataURL: 'data:image/png;base64,' + 'A'.repeat(16 * 1024 * 1024 + 1), title: '大圖 🎨' };
  const output = embedSnapshot(tinyPng, snapshot);
  assert.deepEqual(extractSnapshot(output), snapshot);
  const parsed = chunks(output);
  assert.deepEqual(parsed.map(entry => entry.type), ['IHDR', 'IDAT', 'iTXt', 'IEND']);
  assert.ok(parsed[2].data.length > 16 * 1024 * 1024);
  assert.deepEqual(parsed[1].bytes, idat);
});
