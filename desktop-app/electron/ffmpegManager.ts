import { spawn, ChildProcessWithoutNullStreams } from 'child_process';
import os from 'os';
import path from 'path';
import fs from 'fs';

export interface StreamConfig {
  recordEnabled: boolean;
  recordPath?: string;
  rtmpEnabled: boolean;
  rtmpUrl?: string;
  rtmpKey?: string;
  videoBitrateKbps?: number;
  audioBitrateKbps?: number;
}

export interface StreamStats {
  isRecording: boolean;
  isStreaming: boolean;
  recordDurationSeconds: number;
  streamDurationSeconds: number;
  currentBitrate: string;
  recordFilePath?: string;
}

export class FFmpegManager {
  private ffmpegProcess: ChildProcessWithoutNullStreams | null = null;
  private isRecording = false;
  private isStreaming = false;
  private recordStartTime = 0;
  private streamStartTime = 0;
  private currentRecordPath: string | null = null;

  public onStatsUpdate?: (stats: StreamStats) => void;
  public onError?: (err: string) => void;

  /**
   * Detecta el codificador H.264 por hardware disponible según el sistema operativo
   */
  private getBestVideoEncoder(): { encoder: string; extraFlags: string[] } {
    const platform = os.platform();

    if (platform === 'darwin') {
      // macOS Apple Silicon & Intel VideoToolbox
      return {
        encoder: 'h264_videotoolbox',
        extraFlags: ['-realtime', 'true', '-p', 'baseline'],
      };
    }

    if (platform === 'win32') {
      // Intenta NVENC en Windows con fallback a software
      return {
        encoder: 'h264_nvenc',
        extraFlags: ['-preset', 'p4', '-tune', 'll'], // Low latency
      };
    }

    // Linux o fallback general en CPU
    return {
      encoder: 'libx264',
      extraFlags: ['-preset', 'veryfast', '-tune', 'zerolatency'],
    };
  }

  /**
   * Inicia el proceso FFmpeg con entrada stdin y múltiples salidas (Tee muxer o salidas paralelas)
   */
  public start(config: StreamConfig) {
    if (this.ffmpegProcess) {
      this.stop();
    }

    const { encoder, extraFlags } = this.getBestVideoEncoder();
    const vBitrate = config.videoBitrateKbps || 4500;
    const aBitrate = config.audioBitrateKbps || 192;

    // Argumentos de entrada: stdin consumiendo el WebM de MediaRecorder
    const args: string[] = [
      '-hide_banner',
      '-loglevel', 'warning',
      '-f', 'webm',
      '-i', 'pipe:0', // Entrada estándar STDIN
    ];

    // Argumentos de codificación de Video
    args.push(
      '-c:v', encoder,
      ...extraFlags,
      '-b:v', `${vBitrate}k`,
      '-maxrate', `${vBitrate}k`,
      '-bufsize', `${vBitrate * 2}k`,
      '-pix_fmt', 'yuv420p',
      '-g', '60', // GOP de 2 segundos a 30fps / 1 segundo a 60fps (Requisito RTMP)
      '-r', '60'
    );

    // Argumentos de codificación de Audio
    args.push(
      '-c:a', 'aac',
      '-b:a', `${aBitrate}k`,
      '-ar', '48000',
      '-ac', '2'
    );

    // Salida 1: Grabación local en disco (.mp4)
    if (config.recordEnabled) {
      const outputDir = config.recordPath || path.join(os.homedir(), 'Videos', 'ADirector');
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      this.currentRecordPath = path.join(outputDir, `ADirector_Recording_${timestamp}.mp4`);

      args.push(
        '-movflags', '+faststart',
        '-f', 'mp4',
        this.currentRecordPath
      );
      this.isRecording = true;
      this.recordStartTime = Date.now();
    }

    // Salida 2: Retransmisión en vivo RTMP (YouTube, Twitch, OBS, etc.)
    if (config.rtmpEnabled && config.rtmpUrl) {
      const fullRtmp = config.rtmpKey
        ? `${config.rtmpUrl.replace(/\/$/, '')}/${config.rtmpKey}`
        : config.rtmpUrl;

      args.push(
        '-f', 'flv',
        fullRtmp
      );
      this.isStreaming = true;
      this.streamStartTime = Date.now();
    }

    console.log(`[FFmpeg] Ejecutando: ffmpeg ${args.join(' ')}`);

    try {
      this.ffmpegProcess = spawn('ffmpeg', args);
    } catch (err: any) {
      console.error('[FFmpeg] Error al iniciar proceso:', err);
      this.onError?.(`No se pudo iniciar FFmpeg: ${err.message}. Asegúrate de tener FFmpeg instalado en el sistema.`);
      return;
    }

    this.ffmpegProcess.stderr.on('data', (data) => {
      const log = data.toString();
      // Parsear bitrate y velocidad para estadísticas
      const bitrateMatch = log.match(/bitrate=\s*([0-9.]+\s*kbits\/s)/);
      const bitrate = bitrateMatch ? bitrateMatch[1] : `${vBitrate} kbps`;

      this.notifyStats(bitrate);
    });

    this.ffmpegProcess.on('close', (code) => {
      console.log(`[FFmpeg] Proceso finalizado con código: ${code}`);
      this.isRecording = false;
      this.isStreaming = false;
      this.ffmpegProcess = null;
      this.notifyStats('0 kbps');
    });

    this.ffmpegProcess.on('error', (err) => {
      console.error('[FFmpeg] Error de ejecución:', err);
      this.onError?.(err.message);
    });
  }

  /**
   * Escribe fragmentos binarios (chunks de MediaRecorder) directamente en el pipe stdin de FFmpeg
   */
  public writeChunk(chunk: Buffer) {
    if (this.ffmpegProcess && this.ffmpegProcess.stdin.writable) {
      this.ffmpegProcess.stdin.write(chunk);
    }
  }

  public stop() {
    if (this.ffmpegProcess) {
      console.log('[FFmpeg] Deteniendo proceso ordenadamente...');
      try {
        this.ffmpegProcess.stdin.end();
      } catch (e) {}

      setTimeout(() => {
        if (this.ffmpegProcess) {
          this.ffmpegProcess.kill('SIGKILL');
          this.ffmpegProcess = null;
        }
      }, 1500);
    }

    this.isRecording = false;
    this.isStreaming = false;
    this.notifyStats('0 kbps');
  }

  private notifyStats(currentBitrate: string) {
    const now = Date.now();
    this.onStatsUpdate?.({
      isRecording: this.isRecording,
      isStreaming: this.isStreaming,
      recordDurationSeconds: this.isRecording ? Math.floor((now - this.recordStartTime) / 1000) : 0,
      streamDurationSeconds: this.isStreaming ? Math.floor((now - this.streamStartTime) / 1000) : 0,
      currentBitrate,
      recordFilePath: this.currentRecordPath || undefined,
    });
  }

  public getStats(): StreamStats {
    const now = Date.now();
    return {
      isRecording: this.isRecording,
      isStreaming: this.isStreaming,
      recordDurationSeconds: this.isRecording ? Math.floor((now - this.recordStartTime) / 1000) : 0,
      streamDurationSeconds: this.isStreaming ? Math.floor((now - this.streamStartTime) / 1000) : 0,
      currentBitrate: this.isStreaming || this.isRecording ? 'Activo' : '0 kbps',
      recordFilePath: this.currentRecordPath || undefined,
    };
  }
}
