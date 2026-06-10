/**
 * 二维码文件传输协议测试
 * 运行: node pages/qr-file-transfer/protocol.test.js
 */

const {
  GF_MAGIC,
  crc16,
  encodeFile,
  decodePacket,
  mergeChunks,
  mergeChunksWithMetadata,
  sha256BytesSync,
  bytesToHex,
  sameBytes,
  uint8ArrayToBase64,
  base64ToUint8Array,
  formatFileSize
} = require('./protocol.js');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`✓ ${name}`);
    passed++;
  } catch (e) {
    console.log(`✗ ${name}`);
    console.log(`  Error: ${e.message}`);
    failed++;
  }
}

function assertEqual(actual, expected, msg = '') {
  if (actual !== expected) {
    throw new Error(`${msg} Expected ${expected}, got ${actual}`);
  }
}

function assertTrue(condition, msg = '') {
  if (!condition) {
    throw new Error(msg || 'Assertion failed');
  }
}

// ========== 测试用例 ==========

test('crc16 对相同数据返回一致结果', () => {
  const a = new Uint8Array([1,2,3,4,5]);
  const b = new Uint8Array([1,2,3,4,5]);
  assertEqual(crc16(a), crc16(b), 'crc 应相等');
});

test('uint8ArrayToBase64 和 base64ToUint8Array 互逆', () => {
  const original = new Uint8Array([72, 101, 108, 108, 111]); // "Hello"
  const base64 = uint8ArrayToBase64(original);
  const decoded = base64ToUint8Array(base64);
  
  assertEqual(decoded.length, original.length, '长度应相等');
  for (let i = 0; i < original.length; i++) {
    assertEqual(decoded[i], original[i], `字节 ${i} 应相等`);
  }
});

test('encodeFile 生成正确数量的分片', () => {
  const data = new Uint8Array(100).fill(65);
  const buffer = data.buffer;
  const chunks = encodeFile(buffer, 'test.txt', 50);
  // 100 bytes -> 2 chunks if payload 50 each
  assertTrue(chunks.length >= 2, '应至少有 2 个分片');
  assertTrue(chunks.length <= 3, '不应超过 3 个分片');
});

test('encodeFile 分片格式正确（magic header）', () => {
  const data = new Uint8Array([1,2,3,4,5]);
  const buffer = data.buffer;
  const chunks = encodeFile(buffer, 'test.bin', 100);
  assertTrue(chunks.length >= 1, '应至少有 1 个分片');
  // chunk 是二进制字符串，前两字节应为 'Q' 'F'
  const first = chunks[0];
  assertTrue(first.charCodeAt(0) === 0x51 && first.charCodeAt(1) === 0x46, '应以 QF 魔法头开头');
});

test('decodePacket 解析正确的分片头', () => {
  const data = new Uint8Array([72,101,108,108,111]);
  const buffer = data.buffer;
  const chunks = encodeFile(buffer, 'hello.txt', 100);
  const packet = decodePacket(chunks[0]);
  assertTrue(packet !== null, '应能解析');
  assertEqual(packet.index, 0, '索引应为 0');
  assertTrue(packet.payload instanceof Uint8Array || typeof packet.payload !== 'undefined', '应包含 payload');
});

test('sha256BytesSync 返回真实 SHA-256', () => {
  const data = new TextEncoder().encode('abc');
  const hash = sha256BytesSync(data);
  const hex = bytesToHex(hash);
  assertEqual(hex, 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad', 'abc 的 SHA-256 应匹配标准值');
  assertTrue(!sameBytes(hash, new Uint8Array(32)), 'SHA-256 不应是全 0');
});

test('decodePacket 拒绝无效数据', () => {
  assertEqual(decodePacket(null), null, '应拒绝 null');
  assertEqual(decodePacket(''), null, '应拒绝空字符串');
  assertEqual(decodePacket('invalid'), null, '应拒绝无效格式');
});

test('decodePacket 检测校验码错误（通过修改 CRC）', () => {
  const data = new Uint8Array([1,2,3,4,5,6,7,8,9]);
  const chunks = encodeFile(data.buffer, 'x.bin', 5);
  // 修改首个 chunk 的某个字节来损坏 CRC
  let s = chunks[0].split('').map(c => c.charCodeAt(0));
  s[10] = (s[10] ^ 0xFF) & 0xFF;
  const broken = String.fromCharCode.apply(null, s);
  const res = decodePacket(broken);
  assertTrue(res && res.error === 'checksum_mismatch', '应检测到校验码错误');
});

test('mergeChunks 正确合并分片', () => {
  const original = new Uint8Array([1,2,3,4,5,6,7,8,9,10]);
  const buffer = original.buffer;
  const chunks = encodeFile(buffer, 'test.bin', 5);

  const chunkMap = new Map();
  let totalChunks = 0;
  for (const chunk of chunks) {
    const packet = decodePacket(chunk);
    assertTrue(packet !== null && !packet.error, '分片应能正确解析');
    chunkMap.set(packet.index, packet.payload);
    totalChunks = packet.totalChunks;
  }

  const merged = mergeChunks(chunkMap, totalChunks);
  assertTrue(merged !== null, '应能合并');
  assertEqual(merged.length, original.length, '长度应相等');
  for (let i = 0; i < original.length; i++) assertEqual(merged[i], original[i], `字节 ${i} 应相等`);
});

test('mergeChunksWithMetadata 返回头部 SHA-256 并可校验文件', () => {
  const original = new TextEncoder().encode('sha256 metadata test');
  const chunks = encodeFile(original, 'hash.txt', 20);
  const received = new Map();
  let totalChunks = 0;
  for (const chunk of chunks) {
    const packet = decodePacket(chunk);
    received.set(packet.index, packet.payload);
    totalChunks = packet.totalChunks;
  }

  const parsed = mergeChunksWithMetadata(received, totalChunks);
  assertTrue(parsed !== null, '应能合并并解析元信息');
  assertEqual(parsed.fileName, 'hash.txt', '文件名应正确');
  assertEqual(parsed.fileSize, original.length, '文件大小应正确');
  assertTrue(sameBytes(parsed.sha256, sha256BytesSync(parsed.fileData)), '头部 SHA-256 应匹配文件内容');
});

test('mergeChunks 缺少分片时返回 null', () => {
  const chunkMap = new Map();
  chunkMap.set(0, new Uint8Array([1,2,3]));
  chunkMap.set(2, new Uint8Array([1,2,3]));
  const result = mergeChunks(chunkMap, 3);
  assertEqual(result, null, '缺少分片时应返回 null');
});

test('formatFileSize 格式化正确', () => {
  assertEqual(formatFileSize(500), '500 B', '字节');
  assertEqual(formatFileSize(1024), '1.0 KB', '1KB');
  assertEqual(formatFileSize(1536), '1.5 KB', '1.5KB');
  assertEqual(formatFileSize(1048576), '1.00 MB', '1MB');
  assertEqual(formatFileSize(1572864), '1.50 MB', '1.5MB');
});

test('完整流程：编码 -> 解码 -> 合并', () => {
  const content = 'Hello, this is a test file for QR code transfer!';
  const encoder = new TextEncoder();
  const original = encoder.encode(content);
  const chunks = encodeFile(original.buffer, 'message.txt', 20);
  assertTrue(chunks.length > 0, '应生成分片');

  const received = new Map();
  let totalChunks = 0;
  for (const chunk of chunks) {
    const packet = decodePacket(chunk);
    assertTrue(packet !== null && !packet.error, '分片应能解析');
    received.set(packet.index, packet.payload);
    totalChunks = packet.totalChunks;
  }

  assertEqual(received.size, totalChunks, '应收到所有分片');
  const merged = mergeChunks(received, totalChunks);
  assertTrue(merged !== null, '应能合并');
  const decoder = new TextDecoder();
  const decoded = decoder.decode(merged);
  assertEqual(decoded, content, '内容应完全一致');
});

test('乱序接收分片也能正确合并', () => {
  const content = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const encoder = new TextEncoder();
  const original = encoder.encode(content);
  const chunks = encodeFile(original.buffer, 'alphabet.txt', 10);
  const shuffled = [...chunks].sort(() => Math.random() - 0.5);
  const received = new Map();
  let totalChunks = 0;
  for (const chunk of shuffled) {
    const packet = decodePacket(chunk);
    received.set(packet.index, packet.payload);
    totalChunks = packet.totalChunks;
  }
  const merged = mergeChunks(received, totalChunks);
  const decoder = new TextDecoder();
  const decoded = decoder.decode(merged);
  assertEqual(decoded, content, '乱序接收后内容应正确');
});

// ========== 结果 ==========
console.log('\n' + '='.repeat(40));
console.log(`测试完成: ${passed} 通过, ${failed} 失败`);
process.exit(failed > 0 ? 1 : 0);
