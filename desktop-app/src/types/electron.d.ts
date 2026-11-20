import { StreamConfig, StreamStats } from '../electron/ffmpegManager.js';
import { SystemCapabilities } from '../electron/systemCaps.js';

export interface IElectronAPI {
  sendMediaChunk: (chunk: ArrayBuffer) => void;
  getSystemCapabilities: () => Promise<SystemCapabilities>;

  // FFmpeg MP4 / RTMP
  startOutput: (config: StreamConfig) => Promise<{ success: boolean }>;
  stopOutput: () => Promise<{ success: boolean }>;
  onStreamStats: (callback: (stats: StreamStats) => void) => () => void;

  // NDI
  startNdi: (sourceName?: string) => Promise<{ success: boolean }>;
  stopNdi: () => Promise<{ success: boolean }>;
  onNdiStatus: (callback: (data: { isPublishing: boolean; sourceName: string }) => void) => () => void;

  // Cámara Virtual
  startVirtualCam: () => Promise<{ success: boolean }>;
  stopVirtualCam: () => Promise<{ success: boolean }>;
  onVirtualCamStatus: (callback: (data: { isActive: boolean; deviceName: string }) => void) => () => void;

  // Errores
  onStreamError: (callback: (errorMsg: string) => void) => () => void;
}

declare global {
  interface Window {
    electronAPI?: IElectronAPI;
  }
}
