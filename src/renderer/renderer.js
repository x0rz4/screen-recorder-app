const { ipcRenderer } = require('electron');

// DOM元素
const videoElement = document.getElementById('preview');
const sourceSelectBtn = document.getElementById('sourceSelectBtn');
const sourceList = document.getElementById('sourceList');
const frameRateSelect = document.getElementById('frameRate');
const savePathInput = document.getElementById('savePath');
const savePathBtn = document.getElementById('savePathBtn');
const audioToggle = document.getElementById('audioToggle');
const hotkeySelect = document.getElementById('hotkey');
const startBtn = document.getElementById('startBtn');
const stopBtn = document.getElementById('stopBtn');
const hashSection = document.getElementById('hashSection');
const hashResult = document.getElementById('hashResult');

// 全局变量
let mediaRecorder;
let recordedChunks = [];
let selectedSource = null;
let stream = null;

// 初始化
document.addEventListener('DOMContentLoaded', () => {
  // 禁用停止按钮
  stopBtn.disabled = true;
});

// 选择屏幕源
sourceSelectBtn.addEventListener('click', async () => {
  try {
    const sources = await ipcRenderer.invoke('get-sources');
    displaySourceList(sources);
  } catch (error) {
    console.error('获取屏幕源失败:', error);
    alert('获取屏幕源失败: ' + error.message);
  }
});

// 显示屏幕源列表
function displaySourceList(sources) {
  sourceList.innerHTML = '';
  
  sources.forEach(source => {
    const sourceItem = document.createElement('div');
    sourceItem.className = 'source-item';
    sourceItem.dataset.id = source.id;
    
    const thumbnail = document.createElement('img');
    thumbnail.className = 'source-thumbnail';
    thumbnail.src = source.thumbnail.toDataURL();
    
    const name = document.createElement('div');
    name.className = 'source-name';
    name.textContent = source.name;
    
    sourceItem.appendChild(thumbnail);
    sourceItem.appendChild(name);
    
    sourceItem.addEventListener('click', () => {
      // 移除之前的选择
      document.querySelectorAll('.source-item').forEach(item => {
        item.classList.remove('selected');
      });
      
      // 添加新的选择
      sourceItem.classList.add('selected');
      selectedSource = source;
      
      // 预览选中的屏幕源
      startSourcePreview(source);
    });
    
    sourceList.appendChild(sourceItem);
  });
}

// 预览选中的屏幕源
async function startSourcePreview(source) {
  try {
    // 停止之前的预览
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
    }
    
    // 获取新的媒体流
    stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        mandatory: {
          chromeMediaSource: 'desktop',
          chromeMediaSourceId: source.id
        }
      }
    });
    
    // 显示预览
    videoElement.srcObject = stream;
    videoElement.play();
  } catch (error) {
    console.error('预览失败:', error);
    alert('预览失败: ' + error.message);
  }
}

// 选择保存路径
savePathBtn.addEventListener('click', async () => {
  try {
    const path = await ipcRenderer.invoke('select-save-path');
    if (path) {
      savePathInput.value = path;
    }
  } catch (error) {
    console.error('选择保存路径失败:', error);
    alert('选择保存路径失败: ' + error.message);
  }
});

// 开始录制
startBtn.addEventListener('click', async () => {
  if (!selectedSource) {
    alert('请先选择一个屏幕源');
    return;
  }
  
  if (!savePathInput.value) {
    alert('请选择保存路径');
    return;
  }
  
  try {
    // 停止预览流
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
    }
    
    // 获取新的媒体流，包括音频（如果启用）
    stream = await navigator.mediaDevices.getUserMedia({
      audio: audioToggle.checked ? {
        mandatory: {
          chromeMediaSource: 'desktop'
        }
      } : false,
      video: {
        mandatory: {
          chromeMediaSource: 'desktop',
          chromeMediaSourceId: selectedSource.id,
          minWidth: 1280,
          maxWidth: 1920,
          minHeight: 720,
          maxHeight: 1080,
          minFrameRate: parseInt(frameRateSelect.value),
          maxFrameRate: parseInt(frameRateSelect.value)
        }
      }
    });
    
    // 显示预览
    videoElement.srcObject = stream;
    videoElement.play();
    
    // 创建MediaRecorder
    const options = {
      mimeType: 'video/mp4;codecs=h264',
      videoBitsPerSecond: 2500000 // 2.5Mbps
    };
    
    // 检查浏览器是否支持指定的MIME类型
    if (!MediaRecorder.isTypeSupported(options.mimeType)) {
      console.warn('不支持H.264编码，尝试使用其他编码');
      // 尝试其他编码选项
      if (MediaRecorder.isTypeSupported('video/webm;codecs=h264')) {
        options.mimeType = 'video/webm;codecs=h264';
      } else if (MediaRecorder.isTypeSupported('video/webm;codecs=vp9')) {
        options.mimeType = 'video/webm;codecs=vp9';
      } else {
        throw new Error('当前浏览器不支持H.264编码');
      }
    }
    
    mediaRecorder = new MediaRecorder(stream, options);
    
    // 创建文件写入流
    const fileStream = await ipcRenderer.invoke('create-write-stream', savePathInput.value);
    
    // 收集录制的数据并实时写入
    mediaRecorder.ondataavailable = async (e) => {
      if (e.data.size > 0) {
        // 将数据转换为ArrayBuffer
        const arrayBuffer = await e.data.arrayBuffer();
        // 发送数据到主进程进行写入
        await ipcRenderer.invoke('write-recording-data', {
          data: arrayBuffer,
          path: savePathInput.value
        });
      }
    };
    
    // 录制完成时关闭文件
    mediaRecorder.onstop = async () => {
      await ipcRenderer.invoke('close-write-stream', savePathInput.value);
    };
    
    // 开始录制
    mediaRecorder.start(100); // 每100ms触发一次dataavailable事件
    
    // 通知主进程开始录制
    ipcRenderer.send('start-recording', {
      savePath: savePathInput.value,
      hotkey: hotkeySelect.value
    });
    
    // 更新UI状态
    startBtn.disabled = true;
    stopBtn.disabled = false;
    sourceSelectBtn.disabled = true;
    savePathBtn.disabled = true;
    frameRateSelect.disabled = true;
    audioToggle.disabled = true;
    hotkeySelect.disabled = true;
    
    // 隐藏哈希结果
    hashSection.style.display = 'none';
  } catch (error) {
    console.error('开始录制失败:', error);
    alert('开始录制失败: ' + error.message);
  }
});

// 停止录制
stopBtn.addEventListener('click', stopRecording);

// 通过快捷键停止录制
ipcRenderer.on('stop-recording-hotkey', stopRecording);

// 停止录制函数
function stopRecording() {
  if (mediaRecorder && mediaRecorder.state !== 'inactive') {
    mediaRecorder.stop();
    
    // 停止所有轨道
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
    }
    
    // 通知主进程停止录制
    ipcRenderer.send('stop-recording');
    
    // 更新UI状态
    startBtn.disabled = false;
    stopBtn.disabled = true;
    sourceSelectBtn.disabled = false;
    savePathBtn.disabled = false;
    frameRateSelect.disabled = false;
    audioToggle.disabled = false;
    hotkeySelect.disabled = false;
  }
}

// 接收文件哈希值
ipcRenderer.on('recording-hash', (event, hash) => {
  hashSection.style.display = 'block';
  hashResult.textContent = hash;
});

// 接收文件哈希计算错误
ipcRenderer.on('recording-hash-error', (event, errorMessage) => {
  hashSection.style.display = 'block';
  hashResult.textContent = '计算哈希失败: ' + errorMessage;
  hashResult.style.color = 'red';
});
