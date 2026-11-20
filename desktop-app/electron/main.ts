import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
import { FFmpegManager, StreamConfig } from './ffmpegManager.js';
import { NdiOutputEngine } from './ndiOutput.js';
import { VirtualCamEngine } from './virtualCamOutput.js';
import { detectSystemCapabilities } from './systemCaps.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let mainWindow: BrowserWindow | null = null;
const ffmpegManager = new FFmpegManager();
const ndiOutput = new NdiOutputEngine('ADIRECTOR (Program)');
const virtualCam = new VirtualCamEngine();

function createWindow() {
  const iconPath = path.join(__dirname, '../assets/icon.png');

  mainWindow = new BrowserWindow({
    width: 1480,
    height: 920,
    minWidth: 1024,
    minHeight: 720,
    icon: iconPath,
    backgroundColor: '#040711',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      backgroundThrottling: false,
    },
    title: 'ADirector Studio - NDI & Virtual Cam Broadcast',
  });

  // Notificar estadísticas y estados al renderer
  ffmpegManager.onStatsUpdate = (stats) => {
    mainWindow?.webContents.send('ffmpeg:stats', stats);
  };

  ffmpegManager.onError = (err) => {
    mainWindow?.webContents.send('stream:error', `[FFmpeg] ${err}`);
  };

  ndiOutput.onStatusChange = (isPublishing, sourceName) => {
    mainWindow?.webContents.send('ndi:status', { isPublishing, sourceName });
  };

  ndiOutput.onError = (err) => {
    mainWindow?.webContents.send('stream:error', `[NDI] ${err}`);
  };

  virtualCam.onStatusChange = (isActive, deviceName) => {
    mainWindow?.webContents.send('vcam:status', { isActive, deviceName });
  };

  virtualCam.onError = (err) => {
    mainWindow?.webContents.send('stream:error', `[VirtualCam] ${err}`);
  };

  const isDev = process.env.NODE_ENV !== 'production';
  if (isDev) {
    mainWindow.loadURL('https://localhost:8443');
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  mainWindow.webContents.on('certificate-error', (event, url, error, certificate, callback) => {
    if (url.includes('127.0.0.1') || url.includes('localhost') || url.includes('192.168.')) {
      event.preventDefault();
      callback(true);
    } else {
      callback(false);
    }
  });

  mainWindow.on('closed', () => {
    stopAllOutputs();
    mainWindow = null;
  });
}

function stopAllOutputs() {
  ffmpegManager.stop();
  ndiOutput.stop();
  virtualCam.stop();
}

app.whenReady().then(() => {
  createWindow();

  // 1. Detección del sistema (identifica ChromeOS / V4L2 / NDI)
  ipcMain.handle('system:capabilities', () => {
    return detectSystemCapabilities();
  });

  // 2. Control de FFmpeg (MP4 y RTMP)
  ipcMain.handle('ffmpeg:start', async (_event, config: StreamConfig) => {
    ffmpegManager.start(config);
    return { success: true };
  });

  ipcMain.handle('ffmpeg:stop', async () => {
    ffmpegManager.stop();
    return { success: true };
  });

  // 3. Control de Salida NDI
  ipcMain.handle('ndi:start', async (_event, sourceName?: string) => {
    await ndiOutput.start({ sourceName });
    return { success: true };
  });

  ipcMain.handle('ndi:stop', async () => {
    ndiOutput.stop();
    return { success: true };
  });

  // 4. Control de Cámara Virtual
  ipcMain.handle('vcam:start', async () => {
    virtualCam.start();
    return { success: true };
  });

  ipcMain.handle('vcam:stop', async () => {
    virtualCam.stop();
    return { success: true };
  });

  // 5. Distribución de Chunks binarios hacia todas las salidas activas
  ipcMain.on('stream:chunk', (_event, buffer: Buffer) => {
    // Si FFmpeg está grabando o transmitiendo a RTMP
    ffmpegManager.writeChunk(buffer);

    // Si NDI está transmitiendo en red local
    if (ndiOutput.isActive()) {
      ndiOutput.writeChunk(buffer);
    }

    // Si la Cámara Virtual está alimentando a Zoom/Meet
    if (virtualCam.isActive()) {
      virtualCam.writeChunk(buffer);
    }
  });
});

app.on('window-all-closed', () => {
  stopAllOutputs();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
