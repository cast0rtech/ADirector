// desktop-app/electron/main.ts
import { app, BrowserWindow, ipcMain } from "electron";
import path2 from "path";
import fs3 from "fs";
import { fileURLToPath } from "url";

// desktop-app/electron/ffmpegManager.ts
import { spawn } from "child_process";
import os from "os";
import path from "path";
import fs from "fs";
var FFmpegManager = class {
  ffmpegProcess = null;
  isRecording = false;
  isStreaming = false;
  recordStartTime = 0;
  streamStartTime = 0;
  currentRecordPath = null;
  onStatsUpdate;
  onError;
  /**
   * Detecta el codificador H.264 por hardware disponible según el sistema operativo
   */
  getBestVideoEncoder() {
    const platform = os.platform();
    if (platform === "darwin") {
      return {
        encoder: "h264_videotoolbox",
        extraFlags: ["-realtime", "true", "-p", "baseline"]
      };
    }
    if (platform === "win32") {
      return {
        encoder: "h264_nvenc",
        extraFlags: ["-preset", "p4", "-tune", "ll"]
        // Low latency
      };
    }
    return {
      encoder: "libx264",
      extraFlags: ["-preset", "veryfast", "-tune", "zerolatency"]
    };
  }
  /**
   * Inicia el proceso FFmpeg con entrada stdin y múltiples salidas (Tee muxer o salidas paralelas)
   */
  start(config) {
    if (this.ffmpegProcess) {
      this.stop();
    }
    const { encoder, extraFlags } = this.getBestVideoEncoder();
    const vBitrate = config.videoBitrateKbps || 4500;
    const aBitrate = config.audioBitrateKbps || 192;
    const args = [
      "-hide_banner",
      "-loglevel",
      "warning",
      "-f",
      "webm",
      "-i",
      "pipe:0"
      // Entrada estándar STDIN
    ];
    args.push(
      "-c:v",
      encoder,
      ...extraFlags,
      "-b:v",
      `${vBitrate}k`,
      "-maxrate",
      `${vBitrate}k`,
      "-bufsize",
      `${vBitrate * 2}k`,
      "-pix_fmt",
      "yuv420p",
      "-g",
      "60",
      // GOP de 2 segundos a 30fps / 1 segundo a 60fps (Requisito RTMP)
      "-r",
      "60"
    );
    args.push(
      "-c:a",
      "aac",
      "-b:a",
      `${aBitrate}k`,
      "-ar",
      "48000",
      "-ac",
      "2"
    );
    if (config.recordEnabled) {
      const outputDir = config.recordPath || path.join(os.homedir(), "Videos", "ADirector");
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }
      const timestamp = (/* @__PURE__ */ new Date()).toISOString().replace(/[:.]/g, "-");
      this.currentRecordPath = path.join(outputDir, `ADirector_Recording_${timestamp}.mp4`);
      args.push(
        "-movflags",
        "+faststart",
        "-f",
        "mp4",
        this.currentRecordPath
      );
      this.isRecording = true;
      this.recordStartTime = Date.now();
    }
    if (config.rtmpEnabled && config.rtmpUrl) {
      const fullRtmp = config.rtmpKey ? `${config.rtmpUrl.replace(/\/$/, "")}/${config.rtmpKey}` : config.rtmpUrl;
      args.push(
        "-f",
        "flv",
        fullRtmp
      );
      this.isStreaming = true;
      this.streamStartTime = Date.now();
    }
    console.log(`[FFmpeg] Ejecutando: ffmpeg ${args.join(" ")}`);
    try {
      this.ffmpegProcess = spawn("ffmpeg", args);
    } catch (err) {
      console.error("[FFmpeg] Error al iniciar proceso:", err);
      this.onError?.(`No se pudo iniciar FFmpeg: ${err.message}. Aseg\xFArate de tener FFmpeg instalado en el sistema.`);
      return;
    }
    this.ffmpegProcess.stderr.on("data", (data) => {
      const log = data.toString();
      const bitrateMatch = log.match(/bitrate=\s*([0-9.]+\s*kbits\/s)/);
      const bitrate = bitrateMatch ? bitrateMatch[1] : `${vBitrate} kbps`;
      this.notifyStats(bitrate);
    });
    this.ffmpegProcess.on("close", (code) => {
      console.log(`[FFmpeg] Proceso finalizado con c\xF3digo: ${code}`);
      this.isRecording = false;
      this.isStreaming = false;
      this.ffmpegProcess = null;
      this.notifyStats("0 kbps");
    });
    this.ffmpegProcess.on("error", (err) => {
      console.error("[FFmpeg] Error de ejecuci\xF3n:", err);
      this.onError?.(err.message);
    });
  }
  /**
   * Escribe fragmentos binarios (chunks de MediaRecorder) directamente en el pipe stdin de FFmpeg
   */
  writeChunk(chunk) {
    if (this.ffmpegProcess && this.ffmpegProcess.stdin.writable) {
      this.ffmpegProcess.stdin.write(chunk);
    }
  }
  stop() {
    if (this.ffmpegProcess) {
      console.log("[FFmpeg] Deteniendo proceso ordenadamente...");
      try {
        this.ffmpegProcess.stdin.end();
      } catch (e) {
      }
      setTimeout(() => {
        if (this.ffmpegProcess) {
          this.ffmpegProcess.kill("SIGKILL");
          this.ffmpegProcess = null;
        }
      }, 1500);
    }
    this.isRecording = false;
    this.isStreaming = false;
    this.notifyStats("0 kbps");
  }
  notifyStats(currentBitrate) {
    const now = Date.now();
    this.onStatsUpdate?.({
      isRecording: this.isRecording,
      isStreaming: this.isStreaming,
      recordDurationSeconds: this.isRecording ? Math.floor((now - this.recordStartTime) / 1e3) : 0,
      streamDurationSeconds: this.isStreaming ? Math.floor((now - this.streamStartTime) / 1e3) : 0,
      currentBitrate,
      recordFilePath: this.currentRecordPath || void 0
    });
  }
  getStats() {
    const now = Date.now();
    return {
      isRecording: this.isRecording,
      isStreaming: this.isStreaming,
      recordDurationSeconds: this.isRecording ? Math.floor((now - this.recordStartTime) / 1e3) : 0,
      streamDurationSeconds: this.isStreaming ? Math.floor((now - this.streamStartTime) / 1e3) : 0,
      currentBitrate: this.isStreaming || this.isRecording ? "Activo" : "0 kbps",
      recordFilePath: this.currentRecordPath || void 0
    };
  }
};

// desktop-app/electron/ndiOutput.ts
import { spawn as spawn2 } from "child_process";
var NdiOutputEngine = class {
  ffmpegNdiProcess = null;
  isPublishing = false;
  sourceName = "ADIRECTOR (Program)";
  grandioseSender = null;
  onStatusChange;
  onError;
  constructor(name = "ADIRECTOR (Program)") {
    this.sourceName = name;
  }
  /**
   * Intenta iniciar NDI nativo con grandiose (si el SDK está instalado)
   * o utiliza el pipeline de transmisión NDI de FFmpeg.
   */
  async start(config) {
    if (this.isPublishing) return;
    if (config?.sourceName) {
      this.sourceName = config.sourceName;
    }
    console.log(`[NDI] Iniciando emisor NDI: "${this.sourceName}"...`);
    const grandioseSuccess = await this.tryInitGrandiose();
    if (grandioseSuccess) {
      this.isPublishing = true;
      this.onStatusChange?.(true, this.sourceName);
      return;
    }
    this.startFfmpegNdiPipeline();
  }
  async tryInitGrandiose() {
    try {
      const grandiose = await import("grandiose").catch(() => null);
      if (grandiose && grandiose.send) {
        this.grandioseSender = await grandiose.send({
          name: this.sourceName,
          clock_video: true,
          clock_audio: true
        });
        console.log(`[NDI] Emisor nativo grandiose inicializado con \xE9xito`);
        return true;
      }
    } catch (e) {
      console.warn("[NDI] grandiose no disponible, usando pipeline FFmpeg:", e);
    }
    return false;
  }
  startFfmpegNdiPipeline() {
    const args = [
      "-hide_banner",
      "-loglevel",
      "error",
      "-f",
      "webm",
      "-i",
      "pipe:0",
      "-pix_fmt",
      "uyvy422",
      "-c:v",
      "rawvideo",
      "-c:a",
      "pcm_s16le",
      "-ar",
      "48000",
      "-f",
      "libndi_newtek",
      this.sourceName
    ];
    try {
      this.ffmpegNdiProcess = spawn2("ffmpeg", args);
      this.isPublishing = true;
      this.onStatusChange?.(true, this.sourceName);
      this.ffmpegNdiProcess.stderr.on("data", (d) => {
        console.warn(`[NDI FFmpeg]: ${d.toString()}`);
      });
      this.ffmpegNdiProcess.on("close", (code) => {
        console.log(`[NDI] Proceso finalizado (c\xF3digo ${code})`);
        this.isPublishing = false;
        this.ffmpegNdiProcess = null;
        this.onStatusChange?.(false, this.sourceName);
      });
      this.ffmpegNdiProcess.on("error", (err) => {
        console.error("[NDI] Error de proceso:", err);
        this.onError?.(`Error NDI: ${err.message}. Requiere FFmpeg compilado con --enable-libndi_newtek o NewTek NDI SDK.`);
      });
    } catch (err) {
      this.onError?.(`Fallo al iniciar NDI: ${err.message}`);
    }
  }
  /**
   * Recibe el búfer de video y audio desde MediaRecorder o un ImageData crudo
   */
  writeChunk(chunk) {
    if (this.ffmpegNdiProcess && this.ffmpegNdiProcess.stdin.writable) {
      this.ffmpegNdiProcess.stdin.write(chunk);
    }
  }
  /**
   * Para alimentación directa en crudo vía grandiose (fotogramas RGBA descomprimidos)
   */
  sendRawVideoFrame(rgbaBuffer, width = 1920, height = 1080) {
    if (this.grandioseSender) {
      this.grandioseSender.video({
        xres: width,
        yres: height,
        frame_format_type: 1,
        // Progressive
        timecode: BigInt(Date.now() * 1e4),
        data: rgbaBuffer,
        FourCC: 4
        // FourCC_type_RGBA
      });
    }
  }
  stop() {
    if (this.ffmpegNdiProcess) {
      try {
        this.ffmpegNdiProcess.stdin.end();
      } catch (e) {
      }
      this.ffmpegNdiProcess.kill("SIGTERM");
      this.ffmpegNdiProcess = null;
    }
    if (this.grandioseSender) {
      try {
        this.grandioseSender.destroy();
      } catch (e) {
      }
      this.grandioseSender = null;
    }
    this.isPublishing = false;
    this.onStatusChange?.(false, this.sourceName);
    console.log("[NDI] Emisi\xF3n NDI detenida.");
  }
  isActive() {
    return this.isPublishing;
  }
};

// desktop-app/electron/virtualCamOutput.ts
import { spawn as spawn3 } from "child_process";
import os3 from "os";

// desktop-app/electron/systemCaps.ts
import fs2 from "fs";
import os2 from "os";
import { execSync } from "child_process";
function isChromeOSCrostini() {
  if (os2.platform() !== "linux") return false;
  try {
    if (fs2.existsSync("/dev/.cros_milestone")) return true;
    if (fs2.existsSync("/etc/os-release")) {
      const content = fs2.readFileSync("/etc/os-release", "utf8");
      if (/chromeos|cros/i.test(content)) return true;
    }
    if (os2.hostname().includes("penguin")) return true;
  } catch (e) {
  }
  return false;
}
function findV4L2Device() {
  if (os2.platform() !== "linux") return null;
  try {
    const devices = fs2.readdirSync("/dev").filter((f) => f.startsWith("video"));
    for (const dev of devices) {
      const fullPath = `/dev/${dev}`;
      try {
        const info = execSync(`v4l2-ctl --device=${fullPath} --all 2>/dev/null`, { encoding: "utf8" });
        if (/loopback|dummy|virtual/i.test(info)) {
          return fullPath;
        }
      } catch (e) {
      }
    }
    if (fs2.existsSync("/dev/video10")) return "/dev/video10";
    if (devices.length > 0) return `/dev/${devices[devices.length - 1]}`;
  } catch (e) {
  }
  return null;
}
function detectSystemCapabilities() {
  const platform = os2.platform();
  const isCros = isChromeOSCrostini();
  const v4l2Device = findV4L2Device();
  let hasNdiRuntime = false;
  let hasVirtualCam = false;
  const reasons = {};
  if (isCros) {
    hasNdiRuntime = false;
    reasons.ndi = "NDI deshabilitado: El puente de red de ChromeOS Crostini bloquea paquetes mDNS/Multicast UDP.";
  } else {
    try {
      if (platform === "darwin") {
        hasNdiRuntime = fs2.existsSync("/Library/NDI/lib/libndi.dylib") || fs2.existsSync("/usr/local/lib/libndi.dylib");
      } else if (platform === "win32") {
        const progFiles = process.env["ProgramFiles"] || "C:\\Program Files";
        hasNdiRuntime = fs2.existsSync(`${progFiles}\\NDI\\NDI 5 Runtime\\v5\\Processing.NDI.Lib.x64.dll`) || fs2.existsSync(`${progFiles}\\NDI\\NDI 6 Runtime\\v6\\Processing.NDI.Lib.x64.dll`);
      } else {
        hasNdiRuntime = fs2.existsSync("/usr/lib/libndi.so") || fs2.existsSync("/usr/local/lib/libndi.so");
      }
      if (!hasNdiRuntime) {
        hasNdiRuntime = true;
      }
    } catch (e) {
      hasNdiRuntime = true;
    }
  }
  if (isCros) {
    hasVirtualCam = false;
    reasons.virtualCam = "C\xE1mara Virtual deshabilitada: Los contenedores de ChromeOS proh\xEDben la carga del m\xF3dulo de kernel v4l2loopback.";
  } else if (platform === "linux") {
    hasVirtualCam = !!v4l2Device;
    if (!hasVirtualCam) {
      reasons.virtualCam = "No se encontr\xF3 un nodo v4l2loopback en /dev/video*. Ejecuta: sudo modprobe v4l2loopback";
    }
  } else if (platform === "darwin") {
    hasVirtualCam = fs2.existsSync("/Library/CoreMediaIO/Plug-Ins/DAL/obs-mac-virtualcam.plugin");
    if (!hasVirtualCam) {
      hasVirtualCam = true;
    }
  } else if (platform === "win32") {
    hasVirtualCam = true;
  }
  return {
    platform,
    isChromeOS: isCros,
    hasV4L2Loopback: !!v4l2Device,
    virtualCamDevice: v4l2Device,
    hasNdiRuntime,
    supportedOutputs: {
      recordMp4: true,
      // Siempre soportado
      rtmp: true,
      // Siempre soportado
      virtualCam: hasVirtualCam,
      ndi: hasNdiRuntime
    },
    reasons
  };
}

// desktop-app/electron/virtualCamOutput.ts
var VirtualCamEngine = class {
  vcamProcess = null;
  isActiveFlag = false;
  onStatusChange;
  onError;
  start(config) {
    if (this.isActiveFlag) return;
    const platform = os3.platform();
    const width = config?.width || 1920;
    const height = config?.height || 1080;
    const fps = config?.fps || 30;
    let args = [];
    let deviceName = "C\xE1mara Virtual ADirector";
    if (platform === "linux") {
      const v4l2Device = config?.devicePath || findV4L2Device();
      if (!v4l2Device) {
        this.onError?.(
          'No se encontr\xF3 ning\xFAn nodo de video loopback en /dev/video*. Aseg\xFArate de haber instalado y cargado el m\xF3dulo: sudo modprobe v4l2loopback devices=1 video_nr=10 card_label="ADirector Cam" exclusive_caps=1'
        );
        return;
      }
      deviceName = `V4L2 (${v4l2Device})`;
      args = [
        "-hide_banner",
        "-loglevel",
        "error",
        "-f",
        "webm",
        "-i",
        "pipe:0",
        "-vf",
        `scale=${width}:${height}`,
        "-r",
        `${fps}`,
        "-f",
        "v4l2",
        "-pix_fmt",
        "yuv420p",
        v4l2Device
      ];
    } else if (platform === "darwin") {
      deviceName = "macOS Virtual Webcam";
      args = [
        "-hide_banner",
        "-loglevel",
        "error",
        "-f",
        "webm",
        "-i",
        "pipe:0",
        "-vf",
        `scale=${width}:${height}`,
        "-r",
        `${fps}`,
        "-pix_fmt",
        "yuv420p",
        "-f",
        "rawvideo",
        "pipe:1"
      ];
    } else if (platform === "win32") {
      deviceName = "DirectShow Virtual Cam";
      args = [
        "-hide_banner",
        "-loglevel",
        "error",
        "-f",
        "webm",
        "-i",
        "pipe:0",
        "-vf",
        `scale=${width}:${height}`,
        "-r",
        `${fps}`,
        "-pix_fmt",
        "yuv420p",
        "-f",
        "dshow",
        'video="ADirector Virtual Camera"'
      ];
    }
    console.log(`[VirtualCam] Iniciando c\xE1mara virtual en ${platform}: ${deviceName}`);
    try {
      this.vcamProcess = spawn3("ffmpeg", args);
      this.isActiveFlag = true;
      this.onStatusChange?.(true, deviceName);
      this.vcamProcess.stderr.on("data", (d) => {
        console.warn(`[VirtualCam FFmpeg]: ${d.toString()}`);
      });
      this.vcamProcess.on("close", (code) => {
        console.log(`[VirtualCam] Proceso cerrado (${code})`);
        this.isActiveFlag = false;
        this.vcamProcess = null;
        this.onStatusChange?.(false, deviceName);
      });
      this.vcamProcess.on("error", (err) => {
        console.error("[VirtualCam] Error:", err);
        this.onError?.(`Fallo al iniciar C\xE1mara Virtual: ${err.message}`);
      });
    } catch (e) {
      this.onError?.(`Error ejecutando FFmpeg para c\xE1mara virtual: ${e.message}`);
    }
  }
  writeChunk(chunk) {
    if (this.vcamProcess && this.vcamProcess.stdin.writable) {
      this.vcamProcess.stdin.write(chunk);
    }
  }
  stop() {
    if (this.vcamProcess) {
      try {
        this.vcamProcess.stdin.end();
      } catch (e) {
      }
      this.vcamProcess.kill("SIGTERM");
      this.vcamProcess = null;
    }
    this.isActiveFlag = false;
    this.onStatusChange?.(false, "");
    console.log("[VirtualCam] C\xE1mara Virtual detenida.");
  }
  isActive() {
    return this.isActiveFlag;
  }
};

// desktop-app/electron/main.ts
var currentDir = "";
try {
  currentDir = path2.dirname(fileURLToPath(import.meta.url));
} catch (e) {
  currentDir = typeof __dirname !== "undefined" ? __dirname : process.cwd();
}
var mainWindow = null;
var ffmpegManager = new FFmpegManager();
var ndiOutput = new NdiOutputEngine("ADIRECTOR (Program)");
var virtualCam = new VirtualCamEngine();
function createWindow() {
  const iconPath = path2.join(currentDir, "../assets/icon.png");
  let preloadPath = path2.join(currentDir, "preload.js");
  if (!fs3.existsSync(preloadPath)) {
    preloadPath = path2.join(currentDir, "preload.cjs");
  }
  mainWindow = new BrowserWindow({
    width: 1480,
    height: 920,
    minWidth: 1024,
    minHeight: 720,
    icon: fs3.existsSync(iconPath) ? iconPath : void 0,
    backgroundColor: "#040711",
    webPreferences: {
      preload: preloadPath,
      nodeIntegration: false,
      contextIsolation: true,
      backgroundThrottling: false
    },
    title: "ADirector Studio - Production Switcher"
  });
  ffmpegManager.onStatsUpdate = (stats) => {
    mainWindow?.webContents.send("ffmpeg:stats", stats);
  };
  ffmpegManager.onError = (err) => {
    mainWindow?.webContents.send("stream:error", `[FFmpeg] ${err}`);
  };
  ndiOutput.onStatusChange = (isPublishing, sourceName) => {
    mainWindow?.webContents.send("ndi:status", { isPublishing, sourceName });
  };
  ndiOutput.onError = (err) => {
    mainWindow?.webContents.send("stream:error", `[NDI] ${err}`);
  };
  virtualCam.onStatusChange = (isActive, deviceName) => {
    mainWindow?.webContents.send("vcam:status", { isActive, deviceName });
  };
  virtualCam.onError = (err) => {
    mainWindow?.webContents.send("stream:error", `[VirtualCam] ${err}`);
  };
  const distHtml = path2.join(currentDir, "../dist/index.html");
  if (fs3.existsSync(distHtml)) {
    console.log("[Electron] Cargando UI de escritorio desde dist/index.html");
    mainWindow.loadFile(distHtml);
  } else {
    console.log("[Electron] Cargando UI desde servidor local https://localhost:8443/studio");
    mainWindow.loadURL("https://localhost:8443/studio");
  }
  mainWindow.webContents.on("certificate-error", (event, url, error, certificate, callback) => {
    if (url.includes("127.0.0.1") || url.includes("localhost") || url.includes("192.168.")) {
      event.preventDefault();
      callback(true);
    } else {
      callback(false);
    }
  });
  mainWindow.on("closed", () => {
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
  ipcMain.handle("system:capabilities", () => {
    return detectSystemCapabilities();
  });
  ipcMain.handle("ffmpeg:start", async (_event, config) => {
    ffmpegManager.start(config);
    return { success: true };
  });
  ipcMain.handle("ffmpeg:stop", async () => {
    ffmpegManager.stop();
    return { success: true };
  });
  ipcMain.handle("ndi:start", async (_event, sourceName) => {
    await ndiOutput.start({ sourceName });
    return { success: true };
  });
  ipcMain.handle("ndi:stop", async () => {
    ndiOutput.stop();
    return { success: true };
  });
  ipcMain.handle("vcam:start", async () => {
    virtualCam.start();
    return { success: true };
  });
  ipcMain.handle("vcam:stop", async () => {
    virtualCam.stop();
    return { success: true };
  });
  ipcMain.on("stream:chunk", (_event, buffer) => {
    ffmpegManager.writeChunk(buffer);
    if (ndiOutput.isActive()) {
      ndiOutput.writeChunk(buffer);
    }
    if (virtualCam.isActive()) {
      virtualCam.writeChunk(buffer);
    }
  });
});
app.on("window-all-closed", () => {
  stopAllOutputs();
  if (process.platform !== "darwin") {
    app.quit();
  }
});
//# sourceMappingURL=main.js.map
