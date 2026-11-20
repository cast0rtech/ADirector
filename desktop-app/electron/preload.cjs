// desktop-app/electron/preload.ts
var import_electron = require("electron");
import_electron.contextBridge.exposeInMainWorld("electronAPI", {
  // Envío de chunk multimedia único que alimenta todas las salidas activas
  sendMediaChunk: (chunk) => {
    import_electron.ipcRenderer.send("stream:chunk", Buffer.from(chunk));
  },
  // Consulta de capacidades del sistema (detección de ChromeOS, V4L2, NDI)
  getSystemCapabilities: () => {
    return import_electron.ipcRenderer.invoke("system:capabilities");
  },
  // Salida FFmpeg (Grabación MP4 y RTMP)
  startOutput: (config) => import_electron.ipcRenderer.invoke("ffmpeg:start", config),
  stopOutput: () => import_electron.ipcRenderer.invoke("ffmpeg:stop"),
  onStreamStats: (callback) => {
    const handler = (_event, stats) => callback(stats);
    import_electron.ipcRenderer.on("ffmpeg:stats", handler);
    return () => import_electron.ipcRenderer.removeListener("ffmpeg:stats", handler);
  },
  // Salida NDI
  startNdi: (sourceName) => import_electron.ipcRenderer.invoke("ndi:start", sourceName),
  stopNdi: () => import_electron.ipcRenderer.invoke("ndi:stop"),
  onNdiStatus: (callback) => {
    const handler = (_event, data) => callback(data);
    import_electron.ipcRenderer.on("ndi:status", handler);
    return () => import_electron.ipcRenderer.removeListener("ndi:status", handler);
  },
  // Salida Cámara Virtual
  startVirtualCam: () => import_electron.ipcRenderer.invoke("vcam:start"),
  stopVirtualCam: () => import_electron.ipcRenderer.invoke("vcam:stop"),
  onVirtualCamStatus: (callback) => {
    const handler = (_event, data) => callback(data);
    import_electron.ipcRenderer.on("vcam:status", handler);
    return () => import_electron.ipcRenderer.removeListener("vcam:status", handler);
  },
  // Manejo de errores
  onStreamError: (callback) => {
    const handler = (_event, msg) => callback(msg);
    import_electron.ipcRenderer.on("stream:error", handler);
    return () => import_electron.ipcRenderer.removeListener("stream:error", handler);
  }
});
