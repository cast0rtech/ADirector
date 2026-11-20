import { contextBridge, ipcRenderer } from 'electron';
import { StreamConfig, StreamStats } from './ffmpegManager.js';
import { SystemCapabilities } from './systemCaps.js';

contextBridge.exposeInMainWorld('electronAPI', {
  // Envío de chunk multimedia único que alimenta todas las salidas activas
  sendMediaChunk: (chunk: ArrayBuffer) => {
    ipcRenderer.send('stream:chunk', Buffer.from(chunk));
  },

  // Consulta de capacidades del sistema (detección de ChromeOS, V4L2, NDI)
  getSystemCapabilities: (): Promise<SystemCapabilities> => {
    return ipcRenderer.invoke('system:capabilities');
  },

  // Salida FFmpeg (Grabación MP4 y RTMP)
  startOutput: (config: StreamConfig) => ipcRenderer.invoke('ffmpeg:start', config),
  stopOutput: () => ipcRenderer.invoke('ffmpeg:stop'),
  onStreamStats: (callback: (stats: StreamStats) => void) => {
    const handler = (_event: any, stats: StreamStats) => callback(stats);
    ipcRenderer.on('ffmpeg:stats', handler);
    return () => ipcRenderer.removeListener('ffmpeg:stats', handler);
  },

  // Salida NDI
  startNdi: (sourceName?: string) => ipcRenderer.invoke('ndi:start', sourceName),
  stopNdi: () => ipcRenderer.invoke('ndi:stop'),
  onNdiStatus: (callback: (data: { isPublishing: boolean; sourceName: string }) => void) => {
    const handler = (_event: any, data: any) => callback(data);
    ipcRenderer.on('ndi:status', handler);
    return () => ipcRenderer.removeListener('ndi:status', handler);
  },

  // Salida Cámara Virtual
  startVirtualCam: () => ipcRenderer.invoke('vcam:start'),
  stopVirtualCam: () => ipcRenderer.invoke('vcam:stop'),
  onVirtualCamStatus: (callback: (data: { isActive: boolean; deviceName: string }) => void) => {
    const handler = (_event: any, data: any) => callback(data);
    ipcRenderer.on('vcam:status', handler);
    return () => ipcRenderer.removeListener('vcam:status', handler);
  },

  // Manejo de errores
  onStreamError: (callback: (errorMsg: string) => void) => {
    const handler = (_event: any, msg: string) => callback(msg);
    ipcRenderer.on('stream:error', handler);
    return () => ipcRenderer.removeListener('stream:error', handler);
  },
});
