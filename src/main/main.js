const { app, BrowserWindow, ipcMain, dialog, globalShortcut, desktopCapturer } = require('electron');
const path = require('path');
const crypto = require('crypto');
const fs = require('fs');

// 保持对窗口对象的全局引用，避免JavaScript对象被垃圾回收时窗口关闭
let mainWindow;
let floatingWindow;
let isRecording = false;
let recordingStartTime = 0;
let recordingFilePath = '';
let recordingInterval;
let writeStreams = new Map(); // 存储文件写入流

function createWindow() {
  // 创建浏览器窗口
  mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      enableRemoteModule: true
    }
  });

  // 加载应用的index.html
  mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));

  // 打开开发者工具
  // mainWindow.webContents.openDevTools();

  // 当窗口关闭时触发
  mainWindow.on('closed', function () {
    // 取消引用窗口对象
    mainWindow = null;
    if (floatingWindow) {
      floatingWindow.close();
      floatingWindow = null;
    }
  });
}

// 创建悬浮窗口，显示录制时长和文件大小
function createFloatingWindow() {
  floatingWindow = new BrowserWindow({
    width: 200,
    height: 100,
    frame: false,
    alwaysOnTop: true,
    transparent: true,
    resizable: false,
    skipTaskbar: true,  // 不在任务栏显示
    titleBarStyle: 'hidden',  // 隐藏标题栏
    titleBarOverlay: false,  // 禁用标题栏覆盖
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  floatingWindow.loadFile(path.join(__dirname, '../renderer/floating.html'));
  
  // 允许用户拖动悬浮窗
  floatingWindow.setMovable(true);
  
  // 确保窗口始终保持在最顶层
  floatingWindow.setAlwaysOnTop(true, 'status');
  floatingWindow.setVisibleOnAllWorkspaces(true);
  
  // 移除窗口标题
  floatingWindow.setTitle('');

  // 监听悬浮窗准备就绪事件
  ipcMain.on('floating-window-ready', () => {
    console.log('Floating window is ready');
    // 立即发送一次更新
    updateRecordingInfo();
  });
  
  floatingWindow.on('closed', () => {
    floatingWindow = null;
    clearInterval(recordingInterval);
  });
}

// 更新悬浮窗中的录制信息
async function updateRecordingInfo() {
  if (!floatingWindow || !isRecording) return;
  
  const currentTime = Date.now();
  const duration = Math.floor((currentTime - recordingStartTime) / 1000); // 秒
  
  let fileSize = 0;
  try {
    if (recordingFilePath) {
      // 使用fs.promises来异步获取文件大小
      const stats = await fs.promises.stat(recordingFilePath);
      fileSize = stats.size;
      console.log('File size updated:', fileSize); // 添加调试日志
    }
  } catch (error) {
    // 如果文件不存在或正在写入，忽略错误
    if (error.code !== 'ENOENT') {
      console.error('获取文件大小失败:', error);
    }
  }
  
  // 转换为可读格式
  const formattedDuration = formatDuration(duration);
  const formattedSize = formatFileSize(fileSize);
  
  // 确保悬浮窗存在且未关闭
  if (floatingWindow && !floatingWindow.isDestroyed()) {
    floatingWindow.webContents.send('update-recording-info', {
      duration: formattedDuration,
      fileSize: formattedSize
    });
  }
}

// 格式化时长为 HH:MM:SS
function formatDuration(seconds) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  
  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

// 格式化文件大小
function formatFileSize(bytes) {
  if (bytes === 0) return '0 B';
  
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  
  // 对于小于1KB的文件，显示为B
  if (i === 0) {
    return `${bytes} B`;
  }
  
  // 对于其他大小，保留两位小数
  return `${(bytes / Math.pow(1024, i)).toFixed(2)} ${units[i]}`;
}

// 计算文件哈希
function calculateFileHash(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath);
    
    stream.on('error', err => reject(err));
    stream.on('data', chunk => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
  });
}

// 生成带时间戳的文件名
function generateTimestampedFilename() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');
  const timestamp = `${year}${month}${day}_${hours}${minutes}${seconds}`;
  return `screen-recording_${timestamp}.mp4`;
}

// 当Electron完成初始化并准备创建浏览器窗口时调用此方法
app.whenReady().then(() => {
  createWindow();
  
  // 获取可用的屏幕源
  ipcMain.handle('get-sources', async () => {
    const sources = await desktopCapturer.getSources({
      types: ['window', 'screen'],
      thumbnailSize: { width: 150, height: 150 }
    });
    return sources;
  });
  
  // 选择保存路径
  ipcMain.handle('select-save-path', async () => {
    const result = await dialog.showSaveDialog({
      title: '选择视频保存位置',
      defaultPath: path.join(app.getPath('videos'), generateTimestampedFilename()),
      filters: [
        { name: 'MP4 files', extensions: ['mp4'] },
        { name: 'WebM files', extensions: ['webm'] }
      ]
    });
    
    if (!result.canceled) {
      return result.filePath;
    }
    return null;
  });

  // 创建写入流
  ipcMain.handle('create-write-stream', async (event, filePath) => {
    try {
      const writeStream = fs.createWriteStream(filePath);
      writeStreams.set(filePath, writeStream);
      return true;
    } catch (error) {
      console.error('创建写入流失败:', error);
      throw error;
    }
  });

  // 写入录制数据
  ipcMain.handle('write-recording-data', async (event, { data, path }) => {
    try {
      const writeStream = writeStreams.get(path);
      if (writeStream) {
        writeStream.write(Buffer.from(data));
        return true;
      }
      throw new Error('写入流不存在');
    } catch (error) {
      console.error('写入录制数据失败:', error);
      throw error;
    }
  });

  // 关闭写入流
  ipcMain.handle('close-write-stream', async (event, filePath) => {
    try {
      const writeStream = writeStreams.get(filePath);
      if (writeStream) {
        await new Promise((resolve, reject) => {
          writeStream.end(() => {
            writeStreams.delete(filePath);
            resolve();
          });
          writeStream.on('error', reject);
        });
      }
      return true;
    } catch (error) {
      console.error('关闭写入流失败:', error);
      throw error;
    }
  });
  
  // 开始录制
  ipcMain.on('start-recording', (event, options) => {
    isRecording = true;
    recordingStartTime = Date.now();
    recordingFilePath = options.savePath;
    
    // 创建悬浮窗
    createFloatingWindow();
    
    // 注册结束录制的快捷键
    if (options.hotkey) {
      globalShortcut.register(options.hotkey, () => {
        mainWindow.webContents.send('stop-recording-hotkey');
      });
    }
    
    // 定时更新录制信息
    recordingInterval = setInterval(updateRecordingInfo, 1000);
  });
  
  // 停止录制
  ipcMain.on('stop-recording', async () => {
    isRecording = false;
    
    // 注销快捷键
    globalShortcut.unregisterAll();
    
    // 清除定时器
    clearInterval(recordingInterval);
    
    // 关闭悬浮窗
    if (floatingWindow) {
      floatingWindow.close();
      floatingWindow = null;
    }
    
    // 计算文件哈希
    if (recordingFilePath && fs.existsSync(recordingFilePath)) {
      try {
        const hash = await calculateFileHash(recordingFilePath);
        mainWindow.webContents.send('recording-hash', hash);
      } catch (error) {
        console.error('计算哈希失败:', error);
        mainWindow.webContents.send('recording-hash-error', error.message);
      }
    }
  });
  
  app.on('activate', function () {
    // 在macOS上，当点击dock图标并且没有其他窗口打开时，
    // 通常在应用程序中重新创建一个窗口。
    if (mainWindow === null) createWindow();
  });
});

// 当所有窗口关闭时退出应用
app.on('window-all-closed', function () {
  // 在macOS上，除非用户用Cmd + Q确定地退出，
  // 否则绝大部分应用及其菜单栏会保持激活。
  if (process.platform !== 'darwin') app.quit();
});

// 在应用退出前清理资源
app.on('will-quit', () => {
  // 关闭所有写入流
  for (const [path, stream] of writeStreams) {
    stream.end();
  }
  writeStreams.clear();
  
  // 注销所有快捷键
  globalShortcut.unregisterAll();
});
