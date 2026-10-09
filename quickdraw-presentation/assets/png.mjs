const PNG_SIGNATURE = Uint8Array.of(137, 80, 78, 71, 13, 10, 26, 10);
const QUICKDRAW_KEYWORD = 'quickdraw.nvim';
const ENCODER = new TextEncoder();
const ITXT_PREFIX = ENCODER.encode(QUICKDRAW_KEYWORD + '\0\0\0\0\0');
const MAX_CHUNK_LENGTH = 2147483647;
const CRC_TABLE = new Uint32Array(256);

for (let index = 0; index < CRC_TABLE.length; index++) {
  let value = index;
  for (let bit = 0; bit < 8; bit++) {
    value = (value >>> 1) ^ ((value & 1) ? 0xedb88320 : 0);
  }
  CRC_TABLE[index] = value;
}

function fail(code, message) {
  const error = new Error(message);
  error.code = code;
  throw error;
}

function readU32(bytes, offset) {
  return ((bytes[offset] * 256 + bytes[offset + 1]) * 256 + bytes[offset + 2]) * 256 + bytes[offset + 3];
}

function writeU32(bytes, offset, value) {
  bytes[offset] = value >>> 24;
  bytes[offset + 1] = value >>> 16;
  bytes[offset + 2] = value >>> 8;
  bytes[offset + 3] = value;
}

function crc32(bytes, start, end) {
  let crc = 0xffffffff;
  for (let index = start; index < end; index++) {
    crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ bytes[index]) & 255];
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function parseChunks(bytes) {
  if (!(bytes instanceof Uint8Array) || bytes.length < PNG_SIGNATURE.length) {
    fail('INVALID_PNG', 'PNG signature is invalid');
  }
  for (let index = 0; index < PNG_SIGNATURE.length; index++) {
    if (bytes[index] !== PNG_SIGNATURE[index]) {
      fail('INVALID_PNG', 'PNG signature is invalid');
    }
  }
  const chunks = [];
  let start = PNG_SIGNATURE.length;
  while (start < bytes.length) {
    if (bytes.length - start < 8) {
      fail('INVALID_CHUNK', 'PNG chunk is truncated');
    }
    const length = readU32(bytes, start);
    if (length > MAX_CHUNK_LENGTH) {
      fail('CHUNK_TOO_LARGE', 'PNG chunk is too large');
    }
    for (let index = start + 4; index < start + 8; index++) {
      const byte = bytes[index];
      if (!((byte >= 65 && byte <= 90) || (byte >= 97 && byte <= 122)) || (index === start + 6 && byte > 90)) {
        fail('INVALID_CHUNK', 'PNG chunk type is invalid');
      }
    }
    const type = String.fromCharCode(bytes[start + 4], bytes[start + 5], bytes[start + 6], bytes[start + 7]);
    const dataStart = start + 8;
    const dataEnd = dataStart + length;
    const end = dataEnd + 4;
    if (end > bytes.length) {
      fail('INVALID_CHUNK', 'PNG chunk is truncated');
    }
    if (crc32(bytes, start + 4, dataEnd) !== readU32(bytes, dataEnd)) {
      fail('INVALID_CRC', 'PNG chunk CRC is invalid');
    }
    if (chunks.length === 0 && (type !== 'IHDR' || length !== 13)) {
      fail('INVALID_CHUNK', 'PNG must begin with IHDR');
    }
    if (type === 'IHDR' && chunks.length > 0) {
      fail('INVALID_CHUNK', 'PNG contains more than one IHDR');
    }
    chunks.push({ start, dataStart, dataEnd, end, type, length });
    if (type === 'IEND') {
      if (length !== 0 || end !== bytes.length) {
        fail('INVALID_CHUNK', 'PNG IEND is invalid');
      }
      return chunks;
    }
    start = end;
  }
  fail('INVALID_CHUNK', 'PNG IEND is missing');
}

function matchingMetadata(bytes, chunk) {
  if (chunk.type !== 'iTXt' || chunk.length < QUICKDRAW_KEYWORD.length + 1) {
    return false;
  }
  for (let index = 0; index <= QUICKDRAW_KEYWORD.length; index++) {
    if (bytes[chunk.dataStart + index] !== ITXT_PREFIX[index]) {
      return false;
    }
  }
  return true;
}

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function decodeMetadata(bytes, chunk) {
  if (chunk.length < ITXT_PREFIX.length) {
    fail('INVALID_METADATA', 'Quickdraw iTXt layout is invalid');
  }
  for (let index = 0; index < ITXT_PREFIX.length; index++) {
    if (bytes[chunk.dataStart + index] !== ITXT_PREFIX[index]) {
      fail('INVALID_METADATA', 'Quickdraw iTXt layout is invalid');
    }
  }
  let envelope;
  try {
    const json = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes.subarray(chunk.dataStart + ITXT_PREFIX.length, chunk.dataEnd));
    envelope = JSON.parse(json);
  } catch {
    fail('INVALID_METADATA', 'Quickdraw metadata JSON is invalid');
  }
  if (!isObject(envelope)) {
    fail('INVALID_METADATA', 'Quickdraw metadata JSON is invalid');
  }
  for (const key of Object.keys(envelope)) {
    if (key !== 'schema' && key !== 'version' && key !== 'snapshot') {
      fail('INVALID_METADATA', 'Quickdraw metadata shape is invalid');
    }
  }
  if (envelope.schema !== QUICKDRAW_KEYWORD || typeof envelope.version !== 'number') {
    fail('INVALID_METADATA', 'Quickdraw metadata schema is invalid');
  }
  if (!Number.isInteger(envelope.version)) {
    fail('INVALID_METADATA', 'Quickdraw metadata version is invalid');
  }
  if (envelope.version !== 1) {
    fail('UNSUPPORTED_VERSION', 'Quickdraw metadata version is unsupported');
  }
  if (!isObject(envelope.snapshot)) {
    fail('INVALID_METADATA', 'Quickdraw snapshot shape is invalid');
  }
  return envelope.snapshot;
}

function encodeSnapshot(snapshot) {
  if (snapshot === null || typeof snapshot !== 'object') {
    fail('ENCODE_FAILED', 'Quickdraw snapshot could not be encoded');
  }
  if (Array.isArray(snapshot)) {
    fail('INVALID_METADATA', 'Quickdraw snapshot must be an object');
  }
  let json;
  try {
    json = JSON.stringify({ schema: QUICKDRAW_KEYWORD, version: 1, snapshot });
  } catch {
    fail('ENCODE_FAILED', 'Quickdraw snapshot could not be encoded');
  }
  if (!isObject(JSON.parse(json).snapshot)) {
    fail('INVALID_METADATA', 'Quickdraw snapshot must be an object');
  }
  const text = ENCODER.encode(json);
  const length = ITXT_PREFIX.length + text.length;
  if (length > MAX_CHUNK_LENGTH) {
    fail('CHUNK_TOO_LARGE', 'PNG chunk is too large');
  }
  const chunk = new Uint8Array(length + 12);
  writeU32(chunk, 0, length);
  chunk.set(ENCODER.encode('iTXt'), 4);
  chunk.set(ITXT_PREFIX, 8);
  chunk.set(text, 8 + ITXT_PREFIX.length);
  writeU32(chunk, length + 8, crc32(chunk, 4, length + 8));
  return chunk;
}

export function embedSnapshot(pngBytes, snapshot) {
  const chunks = parseChunks(pngBytes);
  const metadata = encodeSnapshot(snapshot);
  const preserved = chunks.filter(chunk => !matchingMetadata(pngBytes, chunk));
  const length = preserved.reduce((total, chunk) => total + chunk.end - chunk.start, PNG_SIGNATURE.length + metadata.length);
  const output = new Uint8Array(length);
  output.set(PNG_SIGNATURE);
  let offset = PNG_SIGNATURE.length;
  for (const chunk of preserved) {
    if (chunk.type === 'IEND') {
      output.set(metadata, offset);
      offset += metadata.length;
    }
    output.set(pngBytes.subarray(chunk.start, chunk.end), offset);
    offset += chunk.end - chunk.start;
  }
  return output;
}

export function extractSnapshot(pngBytes) {
  const chunks = parseChunks(pngBytes);
  const metadata = chunks.filter(chunk => matchingMetadata(pngBytes, chunk));
  if (metadata.length === 0) {
    return null;
  }
  if (metadata.length > 1) {
    fail('DUPLICATE_METADATA', 'multiple metadata chunks');
  }
  return decodeMetadata(pngBytes, metadata[0]);
}
