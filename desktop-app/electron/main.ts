import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'path';
import fs from 'fs';
import { FFmpegManager, StreamConfig } from './ffmpegManager.js';
import { NdiOutputEngine } from './ndiOutput.js';
import { VirtualCamEngine } from './virtualCamOutput.js';
import { detectSystemCapabilities } from './systemCaps.js';

// Manejo de directorio en Electron CJS
const currentDir = typeof __dirname !== 'undefined' ? __dirname : process.cwd();

let mainWindow: BrowserWindow | null = null;
const ffmpegManager = new FFmpegManager();
const ndiOutput = new NdiOutputEngine('ADIRECTOR (Program)');
const virtualCam = new VirtualCamEngine();

function createWindow() {
  const iconPath = path.join(currentDir, '../assets/icon.png');

  // Buscar preload.cjs (o preload.js)
  let preloadPath = path.join(currentDir, 'preload.cjs');
  if (!fs.existsSync(preloadPath)) {
    preloadPath = path.join(currentDir, 'preload.js');
  }

  mainWindow = new BrowserWindow({
    width: 1480,
    height: 920,
    minWidth: 1024,
    minHeight: 720,
    icon: fs.existsSync(iconPath) ? iconPath : undefined,
    backgroundColor: '#040711',
    webPreferences: {
      preload: preloadPath,
      nodeIntegration: false,
      contextIsolation: true,
      backgroundThrottling: false,
    },
    title: 'ADirector Studio - Production Switcher',
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

  // Cargar la interfaz de producción de escritorio directamente
  const distHtml = path.join(currentDir, '../dist/index.html');
  if (fs.existsSync(distHtml)) {
    console.log('[Electron] Cargando UI de escritorio desde dist/index.html');
    mainWindow.loadFile(distHtml);
  } else {
    console.log('[Electron] Cargando UI desde servidor local https://localhost:8443');
    mainWindow.loadURL('https://localhost:8443/studio');
  }

  // Ignorar advertencias de certificado autofirmado en Electron para localhost / LAN
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
    ffmpegManager.writeChunk(buffer);

    if (ndiOutput.isActive()) {
      ndiOutput.writeChunk(buffer);
    }

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
