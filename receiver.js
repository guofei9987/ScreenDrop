
let video = null;
let canvas = null;
let ctx = null;
let scanning = false;
let scanIntervalId = null;

// 接收状态
let fileName = null;
let totalChunks = 0;
let receivedChunks = new Map(); // index -> data
let expectedSha256 = null; // 头部携带的 SHA-256
let expectedSha256Hex = '';
let receivedSha256Hex = '';

// ========== 初始化 ==========
async function init() {
  video = document.getElementById('video');
  canvas = document.getElementById('scanCanvas');
  ctx = canvas.getContext('2d', { willReadFrequently: true });

  document.getElementById('downloadBtn').onclick = downloadFile;
  document.getElementById('resetBtn').onclick = resetReceiver;
  document.getElementById('clearBtn').onclick = resetReceiver;
  document.getElementById('copyShaBtn').onclick = (e) => copyText(expectedSha256Hex || receivedSha256Hex, e.currentTarget);

  // 检查 jsQR 是否加载
  if (typeof jsQR === 'undefined') {
    showError('二维码识别库加载失败，请刷新页面重试');
    return;
  }

  try {
    await startCamera();
    startScanning();
  } catch (err) {
    showError('无法访问摄像头：' + err.message);
  }
}

// ========== 摄像头 ==========
async function startCamera() {
  // 使用较低分辨率，提高处理速度
  const stream = await navigator.mediaDevices.getUserMedia({
    video: {
      facingMode: 'environment',
      width: { ideal: 640 },
      height: { ideal: 480 }
    }
  });

  video.srcObject = stream;

  // 等待视频准备好
  await new Promise((resolve, reject) => {
    video.onloadedmetadata = () => {
      video.play().then(resolve).catch(reject);
    };
    video.onerror = reject;
  });

  // 再等一下确保尺寸确定
  await new Promise(r => setTimeout(r, 500));

  // 设置 canvas 尺寸
  canvas.width = video.videoWidth || 640;
  canvas.height = video.videoHeight || 480;
  console.log('摄像头尺寸:', canvas.width, 'x', canvas.height);
}

function stopCamera() {
  if (!video || !video.srcObject) return;
  video.srcObject.getTracks().forEach(track => track.stop());
  video.srcObject = null;
}

// ========== 扫描循环 ==========
function startScanning() {
  stopScanning();
  scanning = true;
  showStatus('正在扫描，请对准电脑屏幕上的二维码...', 'scanning');

  // 每 80ms 扫描一次（约 12fps），平衡速度和性能
  scanIntervalId = setInterval(scanFrame, 80);
}

function stopScanning() {
  scanning = false;
  if (scanIntervalId) {
    clearInterval(scanIntervalId);
    scanIntervalId = null;
  }
}

function scanFrame() {
  if (!scanning) return;
  if (video.readyState !== video.HAVE_ENOUGH_DATA) return;

  try {
    // 绘制视频帧到 canvas
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

    // 识别二维码 - 尝试多种模式
    let code = jsQR(imageData.data, imageData.width, imageData.height, {
      inversionAttempts: 'dontInvert'
    });

    // 如果失败，尝试反色模式
    // if (!code) {
    //   code = jsQR(imageData.data, imageData.width, imageData.height, {
    //     inversionAttempts: 'onlyInvert'
    //   });
    // }

    if (code && code.data) {
      handleQRCode(code.data);
    }

  } catch (e) {
    console.error('扫描错误:', e);
  }
}

// ========== 处理二维码数据 ==========
function handleQRCode(data) {
  const packet = decodePacket(data);

  if (!packet) return;
  if (packet.error === 'checksum_mismatch') {
    console.log('校验失败，忽略');
    return;
  }
  if (!packet.totalChunks || packet.index >= packet.totalChunks) return;

  if (!totalChunks) totalChunks = packet.totalChunks;
  if (packet.totalChunks !== totalChunks) return;

  // 第一次看到 0 号分片时，初始化文件名、大小和头部 SHA-256。
  if (packet.index === 0 && (!fileName || !expectedSha256)) {
    const meta = parseFirstPayloadMetadata(packet.payload);
    if (meta) {
      setFileMetadata(meta);
      console.log('开始接收:', fileName, '总分片:', totalChunks);
    }
  }

  // 记录分片（去重），payload 为 Uint8Array
  if (!receivedChunks.has(packet.index)) {
    receivedChunks.set(packet.index, packet.payload);

    console.log('收到分片:', packet.index + 1, '/', packet.totalChunks);

    updateProgress();
    updateMissingChunks();

    if (receivedChunks.size === totalChunks) {
      completeTransfer();
    }
  }
}

function setFileMetadata(meta) {
  fileName = meta.fileName || fileName || '未命名文件';
  expectedSha256 = meta.sha256;
  expectedSha256Hex = bytesToHex(meta.sha256);

  document.getElementById('fileName').textContent = fileName;
  document.getElementById('fileMeta').textContent = `${formatFileSize(meta.fileSize)} · 共 ${totalChunks} 个分片`;
  document.getElementById('shaShort').textContent = expectedSha256Hex.slice(0, 16);
  // document.getElementById('hashRow').style.display = 'flex';
  // document.getElementById('fileInfo').style.display = '';
  document.getElementById('transferInfoSection').classList.remove('hidden');


}

function updateProgress() {
  if (totalChunks <= 0) return;

  const received = receivedChunks.size;
  const progress = (received / totalChunks * 100).toFixed(1);

  document.getElementById('progressFill').style.width = progress + '%';
  showStatus(`已接收 ${received}/${totalChunks} (${progress}%)`, 'scanning');
}

function updateMissingChunks() {
  if (totalChunks <= 0) return;

  const received = receivedChunks.size;
  const progress = received / totalChunks * 100;
  const missing = totalChunks - received;

  // 当进度>=30% 或剩余分片<30个时，显示缺失分片
  const shouldShow = progress >= 30 || missing < 30;
  const missingArea = document.getElementById('missingChunksArea');

  if (shouldShow && missing > 0) {
    missingArea.style.display = 'block';
    const missingIndices = [];
    for (let i = 0; i < totalChunks; i++) {
      if (!receivedChunks.has(i)) {
        missingIndices.push(i + 1); // 显示时+1（从1开始）
      }
    }
    document.getElementById('missingChunksText').textContent = missingIndices.join(', ');
  } else {
    missingArea.style.display = 'none';
  }
}

function showStatus(msg, type) {
  const el = document.getElementById('statusMsg');
  el.textContent = msg;
  el.className = 'status-msg ' + type;
}

// ========== 传输完成 ==========
async function completeTransfer() {
  stopScanning();
  stopCamera();

  // 合并数据
  const parsed = mergeChunksWithMetadata(receivedChunks, totalChunks);
  if (!parsed) {
    showError('文件合并失败，请重试');
    return;
  }

  if (!fileName || !expectedSha256) {
    setFileMetadata(parsed);
  }

  const fileData = parsed.fileData;
  const finalFileName = parsed.fileName || fileName || 'download.bin';
  window.receivedFileData = fileData;
  window.receivedFileName = finalFileName;
  const fileSize = fileData.length;

  // 验证 SHA-256
  const receivedSha256 = await sha256Bytes(fileData);
  receivedSha256Hex = bytesToHex(receivedSha256);
  const headerSha256 = expectedSha256 || parsed.sha256;
  const matched = sameBytes(headerSha256, receivedSha256);

  document.getElementById('scanSection').style.display = 'none';
  document.getElementById('completeSection').style.display = '';

  showStatus(matched ? 'SHA-256 校验通过，文件完整' : 'SHA-256验证不一致，文件可能损坏，建议重传', matched ? 'success' : 'error');
}

// ========== 下载文件 ==========
function downloadFile() {
  if (!window.receivedFileData || !window.receivedFileName) return;

  const blob = new Blob([window.receivedFileData]);
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = window.receivedFileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ========== 重置 ==========
function resetReceiver() {
  stopScanning();
  stopCamera();

  fileName = null;
  totalChunks = 0;
  receivedChunks.clear();
  expectedSha256 = null;
  expectedSha256Hex = '';
  receivedSha256Hex = '';

  window.receivedFileData = null;
  window.receivedFileName = null;

  document.getElementById('errorSection').style.display = 'none';
  document.getElementById('completeSection').style.display = 'none';
  document.getElementById('scanSection').style.display = '';
  document.getElementById('progressFill').style.width = '0%';
  document.getElementById('missingChunksArea').style.display = 'none';
  document.getElementById('missingChunksText').textContent = '';

  // document.getElementById('fileInfo').style.display = 'none';
  // document.getElementById('hashRow').style.display = 'none';
  
  document.getElementById('transferInfoSection').classList.add('hidden');

  showStatus('', '');

  init();
}

// ========== 错误处理 ==========
function showError(msg) {
  stopScanning();
  stopCamera();
  document.getElementById('scanSection').style.display = 'none';
  document.getElementById('completeSection').style.display = 'none';
  document.getElementById('errorSection').style.display = '';
  document.getElementById('errorMsg').textContent = msg;
}

// 启动
init();
