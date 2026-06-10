/**
 * 二维码文件传输协议
 *
 * 文件整体格式（未切分）：
 *  filename_len(1) | filename(utf-8) | filesize(4, big-endian) | sha256(32) | filedata
 *
 * 分片格式：
 *  magic(2) | index(2 big-endian) | total(2) | crc16(2) | payload(equal length, last padded with 0x00)
 */
const GF_MAGIC = new Uint8Array([0x47, 0x46]);

// 计算 CRC16-CCITT (0x1021) 对于 Uint8Array
function crc16(buf) {
  let crc = 0xFFFF;
  for (let i = 0; i < buf.length; i++) {
    crc ^= (buf[i] << 8);
    for (let j = 0; j < 8; j++) {
      if ((crc & 0x8000) !== 0) crc = ((crc << 1) ^ 0x1021) & 0xFFFF;
      else crc = (crc << 1) & 0xFFFF;
    }
  }
  return crc & 0xFFFF;
}

function writeUint16BE(buf, offset, v) {
  buf[offset] = (v >> 8) & 0xFF;
  buf[offset + 1] = v & 0xFF;
}

function writeUint32BE(buf, offset, v) {
  buf[offset] = (v >>> 24) & 0xFF;
  buf[offset + 1] = (v >>> 16) & 0xFF;
  buf[offset + 2] = (v >>> 8) & 0xFF;
  buf[offset + 3] = v & 0xFF;
}

function readUint16BE(buf, offset) {
  return (buf[offset] << 8) | buf[offset + 1];
}

function readUint32BE(buf, offset) {
  return (buf[offset] << 24) | (buf[offset + 1] << 16) | (buf[offset + 2] << 8) | buf[offset + 3];
}

const TEXT_ENCODER = typeof TextEncoder !== 'undefined' ? new TextEncoder() : null;
const TEXT_DECODER = typeof TextDecoder !== 'undefined' ? new TextDecoder() : null;

function normalizeBuffer(buffer) {
  if (buffer instanceof Uint8Array) return buffer;
  if (buffer instanceof ArrayBuffer) return new Uint8Array(buffer);
  if (ArrayBuffer.isView(buffer)) {
    return new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  }
  return new Uint8Array(buffer);
}

const SHA256_K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
]);

function rotr32(v, n) {
  return (v >>> n) | (v << (32 - n));
}

// 兼容低版本浏览器（无 sha256）
function sha256BytesFallback(buffer) {
  const bytes = normalizeBuffer(buffer);
  const bitLen = bytes.length * 8;
  const paddedLen = (((bytes.length + 1 + 8 + 63) >> 6) << 6);
  const msg = new Uint8Array(paddedLen);
  msg.set(bytes);
  msg[bytes.length] = 0x80;
  writeUint32BE(msg, paddedLen - 8, Math.floor(bitLen / 0x100000000));
  writeUint32BE(msg, paddedLen - 4, bitLen >>> 0);

  let h0 = 0x6a09e667;
  let h1 = 0xbb67ae85;
  let h2 = 0x3c6ef372;
  let h3 = 0xa54ff53a;
  let h4 = 0x510e527f;
  let h5 = 0x9b05688c;
  let h6 = 0x1f83d9ab;
  let h7 = 0x5be0cd19;
  const w = new Uint32Array(64);

  for (let offset = 0; offset < msg.length; offset += 64) {
    for (let i = 0; i < 16; i++) {
      const j = offset + i * 4;
      w[i] = ((msg[j] << 24) | (msg[j + 1] << 16) | (msg[j + 2] << 8) | msg[j + 3]) >>> 0;
    }
    for (let i = 16; i < 64; i++) {
      const s0 = (rotr32(w[i - 15], 7) ^ rotr32(w[i - 15], 18) ^ (w[i - 15] >>> 3)) >>> 0;
      const s1 = (rotr32(w[i - 2], 17) ^ rotr32(w[i - 2], 19) ^ (w[i - 2] >>> 10)) >>> 0;
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
    }

    let a = h0;
    let b = h1;
    let c = h2;
    let d = h3;
    let e = h4;
    let f = h5;
    let g = h6;
    let h = h7;

    for (let i = 0; i < 64; i++) {
      const s1 = (rotr32(e, 6) ^ rotr32(e, 11) ^ rotr32(e, 25)) >>> 0;
      const ch = ((e & f) ^ (~e & g)) >>> 0;
      const temp1 = (h + s1 + ch + SHA256_K[i] + w[i]) >>> 0;
      const s0 = (rotr32(a, 2) ^ rotr32(a, 13) ^ rotr32(a, 22)) >>> 0;
      const maj = ((a & b) ^ (a & c) ^ (b & c)) >>> 0;
      const temp2 = (s0 + maj) >>> 0;

      h = g;
      g = f;
      f = e;
      e = (d + temp1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) >>> 0;
    }

    h0 = (h0 + a) >>> 0;
    h1 = (h1 + b) >>> 0;
    h2 = (h2 + c) >>> 0;
    h3 = (h3 + d) >>> 0;
    h4 = (h4 + e) >>> 0;
    h5 = (h5 + f) >>> 0;
    h6 = (h6 + g) >>> 0;
    h7 = (h7 + h) >>> 0;
  }

  const out = new Uint8Array(32);
  writeUint32BE(out, 0, h0);
  writeUint32BE(out, 4, h1);
  writeUint32BE(out, 8, h2);
  writeUint32BE(out, 12, h3);
  writeUint32BE(out, 16, h4);
  writeUint32BE(out, 20, h5);
  writeUint32BE(out, 24, h6);
  writeUint32BE(out, 28, h7);
  return out;
}

async function sha256Bytes(buffer) {
  try {
    const bytes = normalizeBuffer(buffer);
    // Browser API
    if (typeof crypto !== 'undefined' && crypto.subtle && crypto.subtle.digest) {
      const hash = await crypto.subtle.digest('SHA-256', bytes);
      return new Uint8Array(hash);
    }
    // Node.js
    if (typeof require === 'function') {
      const cryptoNode = require('crypto');
      return Uint8Array.from(cryptoNode.createHash('sha256').update(Buffer.from(bytes)).digest());
    }
  } catch (e) {
    console.error('sha256 error:', e);
  }
  return sha256BytesFallback(buffer);
}

// 同步版本用于生成时立即使用（fallback）
function sha256BytesSync(buffer) {
  try {
    const bytes = normalizeBuffer(buffer);
    if (typeof require === 'function') {
      const crypto = require('crypto');
      return Uint8Array.from(crypto.createHash('sha256').update(Buffer.from(bytes)).digest());
    }
  } catch (e) {
    // ignore
  }
  return sha256BytesFallback(buffer);
}

function bytesToHex(bytes) {
  let out = '';
  for (let i = 0; i < bytes.length; i++) {
    out += bytes[i].toString(16).padStart(2, '0');
  }
  return out;
}

function sameBytes(a, b) {
  if (!a || !b || a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

function buildFilePacket(buffer, fileName, sha256Override) {
  const fileBytes = normalizeBuffer(buffer);

  let nameBytes = TEXT_ENCODER ? TEXT_ENCODER.encode(fileName) : utf8Encode(fileName);
  if (nameBytes.length > 255) {
    const extIndex = fileName.lastIndexOf('.');
    const ext = extIndex > 0 ? fileName.slice(extIndex) : '';
    const baseName = fileName.slice(0, Math.max(0, 255 - ext.length - 4));
    const newName = baseName + '...' + ext;
    nameBytes = TEXT_ENCODER ? TEXT_ENCODER.encode(newName) : utf8Encode(newName);
  }

  const sha256 = sha256Override || sha256BytesSync(fileBytes);
  if (sha256.length !== 32) {
    throw new Error('SHA-256 must be 32 bytes');
  }

  const totalLen = 1 + nameBytes.length + 4 + 32 + fileBytes.length;
  const out = new Uint8Array(totalLen);
  let off = 0;
  out[off++] = nameBytes.length & 0xFF;
  out.set(nameBytes, off);
  off += nameBytes.length;
  writeUint32BE(out, off, fileBytes.length);
  off += 4;
  out.set(sha256, off);
  off += 32;
  out.set(fileBytes, off);
  return out;
}

function uint8ToBinaryString(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return s;
}

function binaryStringToUint8(str) {
  const bytes = new Uint8Array(str.length);
  for (let i = 0; i < str.length; i++) bytes[i] = str.charCodeAt(i) & 0xFF;
  return bytes;
}

function encodeFilePacket(filePacket, payloadSize = 500) {
  const totalChunks = Math.ceil(filePacket.length / payloadSize);

  const chunks = [];
  for (let i = 0; i < totalChunks; i++) {
    const start = i * payloadSize;
    const end = Math.min(start + payloadSize, filePacket.length);
    const payload = new Uint8Array(payloadSize);
    payload.fill(0);
    payload.set(filePacket.slice(start, end), 0);

    const header = new Uint8Array(2 + 2 + 2 + 2);
    header.set(GF_MAGIC, 0);
    writeUint16BE(header, 2, i);
    writeUint16BE(header, 4, totalChunks);
    const crc = crc16(payload);
    writeUint16BE(header, 6, crc);

    const pkt = new Uint8Array(header.length + payload.length);
    pkt.set(header, 0);
    pkt.set(payload, header.length);

    chunks.push(uint8ToBinaryString(pkt));
  }

  return chunks;
}

function encodeFile(buffer, fileName, payloadSize = 500, sha256Override) {
  const filePacket = buildFilePacket(buffer, fileName, sha256Override);
  return encodeFilePacket(filePacket, payloadSize);
}

function decodePacket(packet) {
  if (!packet) return null;
  let bytes;
  if (typeof packet === 'string') {
    bytes = binaryStringToUint8(packet);
  } else if (packet instanceof Uint8Array) {
    bytes = packet;
  } else if (packet.buffer instanceof ArrayBuffer) {
    bytes = new Uint8Array(packet.buffer);
  } else {
    return null;
  }

  if (bytes.length < 8) return null;
  if (bytes[0] !== GF_MAGIC[0] || bytes[1] !== GF_MAGIC[1]) return null;

  const index = readUint16BE(bytes, 2);
  const total = readUint16BE(bytes, 4);
  const crc = readUint16BE(bytes, 6);
  const payload = bytes.slice(8);

  if (crc16(payload) !== crc) {
    return { error: 'checksum_mismatch' };
  }

  return {
    index,
    totalChunks: total,
    crc,
    payload
  };
}

function mergeChunkPayloads(chunks, totalChunks) {
  if (chunks.size !== totalChunks) return null;

  let payloadLen = null;
  for (const v of chunks.values()) {
    let b = v;
    if (typeof b === 'string') b = binaryStringToUint8(b);
    payloadLen = b.length;
    break;
  }

  if (payloadLen === null) return null;

  const totalLen = payloadLen * totalChunks;
  const all = new Uint8Array(totalLen);
  for (let i = 0; i < totalChunks; i++) {
    let p = chunks.get(i);
    if (!p) return null;
    if (typeof p === 'string') p = binaryStringToUint8(p);
    all.set(p, i * payloadLen);
  }

  return all;
}

function parseFileHeader(all) {
  let off = 0;
  if (!all || all.length < 1) return null;
  const nameLen = all[off++];
  if (all.length < off + nameLen + 4 + 32) return null;
  const nameBytes = all.slice(off, off + nameLen);
  off += nameLen;
  const fileSize = readUint32BE(all, off);
  off += 4;
  const sha256 = all.slice(off, off + 32);
  off += 32;

  return {
    fileName: TEXT_DECODER ? TEXT_DECODER.decode(nameBytes) : '',
    fileSize,
    sha256,
    dataOffset: off
  };
}

function parseFilePacket(all) {
  const header = parseFileHeader(all);
  if (!header) return null;
  const off = header.dataOffset;
  if (all.length < off + header.fileSize) return null;
  const fileData = all.slice(off, off + header.fileSize);

  return {
    fileName: header.fileName,
    fileSize: header.fileSize,
    sha256: header.sha256,
    fileData
  };
}

function mergeChunksWithMetadata(chunks, totalChunks) {
  const all = mergeChunkPayloads(chunks, totalChunks);
  if (!all) return null;
  return parseFilePacket(all);
}

function mergeChunks(chunks, totalChunks) {
  const parsed = mergeChunksWithMetadata(chunks, totalChunks);
  if (!parsed) return null;
  return parsed.fileData;
}

function parseFirstPayloadMetadata(payload) {
  return parseFileHeader(payload);
}

function uint8ArrayToBase64(bytes) {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  if (typeof btoa !== 'undefined') return btoa(binary);
  if (typeof Buffer !== 'undefined') return Buffer.from(bytes).toString('base64');
  return '';
}

function base64ToUint8Array(base64) {
  if (typeof atob !== 'undefined') {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  }
  if (typeof Buffer !== 'undefined') return Uint8Array.from(Buffer.from(base64, 'base64'));
  return new Uint8Array(0);
}

// 旧设备兼容，用于文件名
function utf8Encode(str) {
  const res = [];
  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i);
    if (code < 0x80) res.push(code);
    else if (code < 0x800) { res.push(0xc0 | (code >> 6)); res.push(0x80 | (code & 0x3f)); }
    else { res.push(0xe0 | (code >> 12)); res.push(0x80 | ((code >> 6) & 0x3f)); res.push(0x80 | (code & 0x3f)); }
  }
  return new Uint8Array(res);
}

function formatFileSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / 1024 / 1024).toFixed(2) + ' MB';
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    GF_MAGIC,
    crc16,
    encodeFile,
    decodePacket,
    buildFilePacket,
    mergeChunks,
    mergeChunksWithMetadata,
    parseFileHeader,
    parseFirstPayloadMetadata,
    sha256Bytes,
    sha256BytesSync,
    bytesToHex,
    sameBytes,
    uint8ArrayToBase64,
    base64ToUint8Array,
    formatFileSize
  };
}
