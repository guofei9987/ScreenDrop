let selectedFile = null;
let chunks = [];
let currentIndex = 0;
let isPlaying = false;
let playInterval = null;
let loopCount = 1;
let playSpeed = 300; // 默认 300ms 播放间隔
let currentFileSha256 = '';

function init() {
  const uploadArea = document.getElementById('uploadArea');
  const fileInput = document.getElementById('fileInput');
  
  // 阻止整个页面的拖拽默认行为（防止浏览器打开文件）
  document.addEventListener('dragover', (e) => e.preventDefault());
  document.addEventListener('drop', (e) => e.preventDefault());
  
  // 点击上传
  uploadArea.addEventListener('click', () => fileInput.click());
  
  // 拖拽上传
  uploadArea.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.stopPropagation();
    uploadArea.classList.add('dragover');
  });
  uploadArea.addEventListener('dragleave', (e) => {
    e.preventDefault();
    e.stopPropagation();
    uploadArea.classList.remove('dragover');
  });
  uploadArea.addEventListener('drop', (e) => {
    e.preventDefault();
    e.stopPropagation();
    uploadArea.classList.remove('dragover');
    console.log('拖拽文件:', e.dataTransfer.files);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFile(e.dataTransfer.files[0]);
    }
  });
  
  // 文件选择
  fileInput.addEventListener('change', (e) => {
    if (e.target.files.length > 0) {
      handleFile(e.target.files[0]);
    }
  });
  
  // 分片大小档位选择
  const capacitySlots = [
    // 以下值为示例档位，代表每个二维码可承载的有效 payload 字节数（已留出头部开销），
    // 可根据具体 QR 版本与 ECC L 的容量表调整为精确值。
    128,
    256,
    400,
    600,
    900,
    1240
  ];

  const slotSelect = document.getElementById('chunkSize');
  slotSelect.innerHTML = '';
  capacitySlots.forEach((v, i) => {
    const opt = document.createElement('option');
    opt.value = v;
    opt.textContent = `${v} 字节（档位 ${i + 1}）`;
    slotSelect.appendChild(opt);
  });
  // 选择默认档位（中间）
  slotSelect.value = '400';

  slotSelect.addEventListener('change', (e) => {
    if (selectedFile) updateFileInfo();
  });
  
  // 开始按钮
  document.getElementById('startBtn').addEventListener('click', startTransfer);
  
  // 播放速度滑块
  document.getElementById('speedSlider').addEventListener('input', (e) => {
    playSpeed = parseInt(e.target.value);
    document.getElementById('speedVal').textContent = playSpeed + 'ms';
    if (isPlaying) startPlayback();
    updateStats();
  });
  
  // 控制按钮
  document.getElementById('pauseBtn').addEventListener('click', togglePause);
  document.getElementById('nextBtn').addEventListener('click', skipToNext);
  document.getElementById('jumpBtn').addEventListener('click', jumpToChunk);
  document.getElementById('newFileBtn').addEventListener('click', selectNewFile);
  document.getElementById('copyTxShaBtn').addEventListener('click', (e) => copyText(currentFileSha256, e.currentTarget));
  
  // 跳转输入框回车键
  document.getElementById('jumpChunkNum').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') jumpToChunk();
  });
  
  // 示例文件按钮
  document.getElementById('demoBtn').addEventListener('click', loadDemoFile);

  // 文本发送功能
  document.getElementById('textBtn').addEventListener('click', toggleTextPanel);
  document.getElementById('textInput').addEventListener('input', updateCharCount);
  document.getElementById('sendTextBtn').addEventListener('click', sendText);
  document.getElementById('cancelTextBtn').addEventListener('click', cancelText);

  // 生成接收端二维码
  generateReceiverQR();
}

// ========== 文本发送功能 ==========
function toggleTextPanel() {
  const textPanel = document.getElementById('textPanel');
  const uploadArea = document.getElementById('uploadArea');
  const actionButtons = document.getElementById('actionButtons');
  const isVisible = textPanel.style.display !== 'none';

  if (isVisible) {
    // 隐藏文本区域，显示文件上传区域和操作按钮
    textPanel.style.display = 'none';
    uploadArea.style.display = '';
    actionButtons.style.display = '';
  } else {
    // 显示文本区域，隐藏文件上传区域和操作按钮
    textPanel.style.display = 'block';
    uploadArea.style.display = 'none';
    actionButtons.style.display = 'none';
    document.getElementById('textInput').focus();
  }
}

function updateCharCount() {
  const text = document.getElementById('textInput').value;
  document.getElementById('charCount').textContent = text.length;
}

async function sendText() {
  const text = document.getElementById('textInput').value;

  if (!text.trim()) {
    alert('请输入文本内容');
    return;
  }

  // 创建文件对象
  const file = new File([text], 'message.txt');

  // 处理文件
  handleFile(file);

  // 延迟一下等待 handleFile 完成，然后开始传输
  setTimeout(() => {
    startTransfer();
  }, 50);
}

function cancelText() {
  document.getElementById('textInput').value = '';
  document.getElementById('charCount').textContent = '0';
  document.getElementById('textPanel').style.display = 'none';
  document.getElementById('uploadArea').style.display = '';
  document.getElementById('actionButtons').style.display = '';
}

// ========== 文件处理 ==========
function handleFile(file) {
  console.log('handleFile 被调用:', file.name, file.size);
  selectedFile = file;
  document.getElementById('fileInfo').style.display = '';
  document.getElementById('fileName').textContent = file.name;
  updateFileInfo();
  document.getElementById('startBtn').disabled = false;
}

// ========== 示例文件 ==========
function loadDemoFile() {
  const demoText = `ScreenDrop（二维码传文件）演示文件

恭喜，文件已经成功接收！

ScreenDrop 是一个基于二维码的离线文件传输工具。
无需网络、无需蓝牙、无需安装应用，
只要一块屏幕和一个摄像头，就可以完成文件传输。

工作方式：
1. 将文件切分为多个分片
2. 将每个分片编码为二维码
3. 循环播放二维码序列
4. 接收端自动扫描并重组文件

特点：
• 纯前端实现，数据不经过服务器
• 支持离线使用，适用于隔离网络环境
• 支持任意文件类型
• 手机、平板、电脑均可使用

适用场景：
• 无网络、无蓝牙环境下的小文件分享
• 跨设备快速传递少量数据

感谢体验 ScreenDrop！

个人主页：
https://www.guofei.site/

项目开源地址：
https://github.com/guofei9987/ScreenDrop

`;

  const blob = new Blob([demoText], { type: 'text/plain' });
  const file = new File([blob], '示例文件.txt', { type: 'text/plain' });
  handleFile(file);
}

function updateFileInfo() {
  const chunkSize = parseInt(document.getElementById('chunkSize').value);
  const estimatedChunks = Math.ceil(selectedFile.size / chunkSize);
  const estimatedTime = (estimatedChunks * playSpeed / 1000).toFixed(1);
  
  document.getElementById('fileMeta').textContent = 
    `${formatFileSize(selectedFile.size)} · 约 ${estimatedChunks} 个二维码 · 预计 ${estimatedTime} 秒`;
}

// ========== 开始传输 ==========
async function startTransfer() {
  if (!selectedFile) return;

  let payloadSize = parseInt(document.getElementById('chunkSize').value);
  const startBtn = document.getElementById('startBtn');
  const originalStartHtml = startBtn.innerHTML;
  startBtn.disabled = true;
  startBtn.innerHTML = '<i class="ti ti-loader"></i> 生成中...';

  try {
    // 读取文件并在浏览器中异步计算真实 SHA-256。
    const buffer = await selectedFile.arrayBuffer();
    const fileBytes = new Uint8Array(buffer);
    const sha256 = await sha256Bytes(fileBytes);
    currentFileSha256 = bytesToHex(sha256);
    chunks = encodeFile(fileBytes, selectedFile.name, payloadSize, sha256);

    console.log('分片数:', chunks.length, '第一个分片长度:', chunks[0]?.length);

    startBtn.innerHTML = originalStartHtml;

    // 切换界面
    document.getElementById('selectSection').style.display = 'none';
    document.getElementById('transferSection').style.display = '';

    // 显示文件信息
    document.getElementById('txFileName').textContent = selectedFile.name;
    document.getElementById('txFileMeta').textContent =
      `${formatFileSize(selectedFile.size)} · ${chunks.length} 个分片`;
    document.getElementById('txShaShort').textContent = currentFileSha256.slice(0, 16);
    document.getElementById('txHashRow').style.display = 'flex';
    document.getElementById('totalChunks').textContent = chunks.length;

    // 开始播放
    currentIndex = 0;
    loopCount = 1;
    document.getElementById('statLoop').textContent = 1;
    showCurrentChunk();
    startPlayback();
    updateStats();
  } catch (e) {
    console.error('生成二维码失败:', e);
    alert('生成二维码失败，请重试');
    startBtn.disabled = false;
    startBtn.innerHTML = originalStartHtml;
  }
}

// ========== 二维码显示 ==========
function showCurrentChunk() {
  const canvas = document.getElementById('qrCanvas');
  const data = chunks[currentIndex];
  
  QRCode.toCanvas(canvas, data, {
    width: 320,
    margin: 3,
    errorCorrectionLevel: 'L', // ecc
    color: {
      dark: '#000000',
      light: '#ffffff'
    }
  }, function(err) {
    if (err) {
      console.error('QR生成失败:', err.message || err);
    }
  });
  
  document.getElementById('currentChunk').textContent = currentIndex + 1;
  
  // 更新进度条
  const progress = ((currentIndex + 1) / chunks.length * 100).toFixed(1);
  document.getElementById('progressFill').style.width = progress + '%';
}

function advanceChunk() {
  currentIndex++;
  if (currentIndex >= chunks.length) {
    currentIndex = 0;
    loopCount++;
    document.getElementById('statLoop').textContent = loopCount;
  }
  showCurrentChunk();
}

// ========== 控制 ==========
function togglePause() {
  if (isPlaying) pausePlayback();
  else startPlayback();
}

function startPlayback() {
  clearInterval(playInterval);
  playInterval = setInterval(advanceChunk, playSpeed);
  isPlaying = true;
  updatePauseButton();
}

function pausePlayback() {
  clearInterval(playInterval);
  playInterval = null;
  isPlaying = false;
  updatePauseButton();
}

function updatePauseButton() {
  const btn = document.getElementById('pauseBtn');
  if (isPlaying) {
    btn.innerHTML = '<i class="ti ti-player-pause"></i> 暂停';
  } else {
    btn.innerHTML = '<i class="ti ti-player-play"></i> 继续';
  }
}

function skipToNext() {
  if (chunks.length === 0) return;
  pausePlayback();
  advanceChunk();
}

function jumpToChunk() {
  const inputVal = document.getElementById('jumpChunkNum').value;
  const num = parseInt(inputVal);
  if (isNaN(num) || num < 1 || num > chunks.length) {
    alert(`请输入 1 到 ${chunks.length} 之间的数字`);
    return;
  }
  currentIndex = num - 1; // 转为 0-based 索引
  pausePlayback();
  showCurrentChunk();
  document.getElementById('jumpChunkNum').value = '';
}

function selectNewFile() {
  clearInterval(playInterval);
  playInterval = null;
  isPlaying = false;
  chunks = [];
  selectedFile = null;
  currentFileSha256 = '';
  
  document.getElementById('transferSection').style.display = 'none';
  document.getElementById('selectSection').style.display = '';
  document.getElementById('fileInfo').style.display = 'none';
  document.getElementById('txHashRow').style.display = 'none';
  document.getElementById('startBtn').disabled = true;
  document.getElementById('fileInput').value = '';
}

function updateStats() {
  document.getElementById('statSpeed').textContent = playSpeed + 'ms';
  const eta = (chunks.length * playSpeed / 1000).toFixed(1);
  document.getElementById('statEta').textContent = eta + 's';
}

// ========== 接收端二维码 ==========
function generateReceiverQR() {
  const url = 'https://www.guofei.site/tmp_ScreenDrop/qr-file-transfer/receiver.html';
  const container = document.getElementById('receiverQr');
  
  QRCode.toCanvas(document.createElement('canvas'), url, {
    width: 120,
    margin: 1
  }, (err, canvas) => {
    if (!err) {
      container.appendChild(canvas);
    }
  });
}

function copyReceiverUrl(button) {
  const url = document.getElementById('receiverUrl').textContent;
  const btn = button || (typeof event !== 'undefined' ? event.target.closest('button') : null);
  copyText(url, btn);
}

// 启动
init();
