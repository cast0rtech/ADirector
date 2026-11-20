import { spawn, ChildProcessWithoutNullStreams } from 'child_process';
import os from 'os';

export interface NdiConfig {
  sourceName?: string; // Nombre detectable en OBS/vMix, ej: "ADIRECTOR (Program)"
  clockVideo?: boolean;
  clockAudio?: boolean;
}

/**
 * Motor de Salida NDI para ADirector
 * Permite publicar la señal de audio/video maestra en la red local (LAN)
 * mediante el protocolo NDI de NewTek / Vizrt para ser detectada al instante
 * en OBS Studio, vMix, Wirecast o Tricaster.
 *
 * Arquitectura:
 * 1. Opción Nativa directa (grandiose): Envía fotogramas UYVY / RGBA descomprimidos
 *    y búferes PCM Float32 / Int16 mediante la librería dinámica Processing.NDI.Lib.
 * 2. Opción Pipeline FFmpeg (libndi_newtek): Transmite el flujo continuo desde STDIN
 *    empaquetándolo directamente con el muxer de NDI sin sobrecargar la CPU.
 */
export class NdiOutputEngine {
  private ffmpegNdiProcess: ChildProcessWithoutNullStreams | null = null;
  private isPublishing = false;
  private sourceName = 'ADIRECTOR (Program)';
  private grandioseSender: any = null;

  public onStatusChange?: (isPublishing: boolean, sourceName: string) => void;
  public onError?: (error: string) => void;

  constructor(name: string = 'ADIRECTOR (Program)') {
    this.sourceName = name;
  }

  /**
   * Intenta iniciar NDI nativo con grandiose (si el SDK está instalado)
   * o utiliza el pipeline de transmisión NDI de FFmpeg.
   */
  public async start(config?: NdiConfig) {
    if (this.isPublishing) return;

    if (config?.sourceName) {
      this.sourceName = config.sourceName;
    }

    console.log(`[NDI] Iniciando emisor NDI: "${this.sourceName}"...`);

    // Intentar inicialización con grandiose (NDI SDK Nativo)
    const grandioseSuccess = await this.tryInitGrandiose();
    if (grandioseSuccess) {
      this.isPublishing = true;
      this.onStatusChange?.(true, this.sourceName);
      return;
    }

    // Fallback: Pipeline FFmpeg con muxer libndi_newtek
    this.startFfmpegNdiPipeline();
  }

  private async tryInitGrandiose(): Promise<boolean> {
    try {
      const grandiose = await import('grandiose' as any).catch(() => null);
      if (grandiose && grandiose.send) {
        this.grandioseSender = await grandiose.send({
          name: this.sourceName,
          clock_video: true,
          clock_audio: true,
        });
        console.log(`[NDI] Emisor nativo grandiose inicializado con éxito`);
        return true;
      }
    } catch (e) {
      console.warn('[NDI] grandiose no disponible, usando pipeline FFmpeg:', e);
    }
    return false;
  }

  private startFfmpegNdiPipeline() {
    // Parámetros broadcast NDI estándar: Video UYVY 4:2:2 y Audio PCM 48kHz
    const args = [
      '-hide_banner',
      '-loglevel', 'error',
      '-f', 'webm',
      '-i', 'pipe:0',
      '-pix_fmt', 'uyvy422',
      '-c:v', 'rawvideo',
      '-c:a', 'pcm_s16le',
      '-ar', '48000',
      '-f', 'libndi_newtek',
      this.sourceName,
    ];

    try {
      this.ffmpegNdiProcess = spawn('ffmpeg', args);
      this.isPublishing = true;
      this.onStatusChange?.(true, this.sourceName);

      this.ffmpegNdiProcess.stderr.on('data', (d) => {
        console.warn(`[NDI FFmpeg]: ${d.toString()}`);
      });

      this.ffmpegNdiProcess.on('close', (code) => {
        console.log(`[NDI] Proceso finalizado (código ${code})`);
        this.isPublishing = false;
        this.ffmpegNdiProcess = null;
        this.onStatusChange?.(false, this.sourceName);
      });

      this.ffmpegNdiProcess.on('error', (err) => {
        console.error('[NDI] Error de proceso:', err);
        this.onError?.(`Error NDI: ${err.message}. Requiere FFmpeg compilado con --enable-libndi_newtek o NewTek NDI SDK.`);
      });
    } catch (err: any) {
      this.onError?.(`Fallo al iniciar NDI: ${err.message}`);
    }
  }

  /**
   * Recibe el búfer de video y audio desde MediaRecorder o un ImageData crudo
   */
  public writeChunk(chunk: Buffer) {
    if (this.ffmpegNdiProcess && this.ffmpegNdiProcess.stdin.writable) {
      this.ffmpegNdiProcess.stdin.write(chunk);
    }
  }

  /**
   * Para alimentación directa en crudo vía grandiose (fotogramas RGBA descomprimidos)
   */
  public sendRawVideoFrame(rgbaBuffer: Buffer, width: number = 1920, height: number = 1080) {
    if (this.grandioseSender) {
      this.grandioseSender.video({
        xres: width,
        yres: height,
        frame_format_type: 1, // Progressive
        timecode: BigInt(Date.now() * 10000),
        data: rgbaBuffer,
        FourCC: 4, // FourCC_type_RGBA
      });
    }
  }

  public stop() {
    if (this.ffmpegNdiProcess) {
      try {
        this.ffmpegNdiProcess.stdin.end();
      } catch (e) {}
      this.ffmpegNdiProcess.kill('SIGTERM');
      this.ffmpegNdiProcess = null;
    }

    if (this.grandioseSender) {
      try {
        this.grandioseSender.destroy();
      } catch (e) {}
      this.grandioseSender = null;
    }

    this.isPublishing = false;
    this.onStatusChange?.(false, this.sourceName);
    console.log('[NDI] Emisión NDI detenida.');
  }

  public isActive(): boolean {
    return this.isPublishing;
  }
}
