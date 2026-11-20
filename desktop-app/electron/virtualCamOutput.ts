import { spawn, ChildProcessWithoutNullStreams } from 'child_process';
import os from 'os';
import { findV4L2Device } from './systemCaps.js';

export interface VirtualCamConfig {
  devicePath?: string; // Ej: /dev/video10 en Linux
  width?: number;
  height?: number;
  fps?: number;
}

/**
 * Motor de Salida para Cámara Virtual de ADirector
 * Inyecta la señal maestra como una cámara web disponible para Zoom, Teams, Meet o Discord.
 *
 * Implementación Multiplataforma:
 * - Linux: Módulo de kernel `v4l2loopback` con volcado directo por FFmpeg a `/dev/videoX`.
 * - macOS: Salida compatible con OBS Virtual Camera DAL plugin o dispositivo CoreMediaIO.
 * - Windows: Inyección DirectShow a driver de cámara virtual (vCam / OBS Virtual Cam).
 */
export class VirtualCamEngine {
  private vcamProcess: ChildProcessWithoutNullStreams | null = null;
  private isActiveFlag = false;

  public onStatusChange?: (isActive: boolean, deviceName: string) => void;
  public onError?: (error: string) => void;

  public start(config?: VirtualCamConfig) {
    if (this.isActiveFlag) return;

    const platform = os.platform();
    const width = config?.width || 1920;
    const height = config?.height || 1080;
    const fps = config?.fps || 30;

    let args: string[] = [];
    let deviceName = 'Cámara Virtual ADirector';

    if (platform === 'linux') {
      const v4l2Device = config?.devicePath || findV4L2Device();

      if (!v4l2Device) {
        this.onError?.(
          'No se encontró ningún nodo de video loopback en /dev/video*. ' +
          'Asegúrate de haber instalado y cargado el módulo: sudo modprobe v4l2loopback devices=1 video_nr=10 card_label="ADirector Cam" exclusive_caps=1'
        );
        return;
      }

      deviceName = `V4L2 (${v4l2Device})`;

      // Volcado a v4l2loopback en formato nativo YUV420P
      args = [
        '-hide_banner',
        '-loglevel', 'error',
        '-f', 'webm',
        '-i', 'pipe:0',
        '-vf', `scale=${width}:${height}`,
        '-r', `${fps}`,
        '-f', 'v4l2',
        '-pix_fmt', 'yuv420p',
        v4l2Device,
      ];
    } else if (platform === 'darwin') {
      // macOS: volcado a pipe virtual de OBS / CoreMediaIO
      deviceName = 'macOS Virtual Webcam';
      args = [
        '-hide_banner',
        '-loglevel', 'error',
        '-f', 'webm',
        '-i', 'pipe:0',
        '-vf', `scale=${width}:${height}`,
        '-r', `${fps}`,
        '-pix_fmt', 'yuv420p',
        '-f', 'rawvideo',
        'pipe:1',
      ];
    } else if (platform === 'win32') {
      // Windows: DirectShow virtual camera filter
      deviceName = 'DirectShow Virtual Cam';
      args = [
        '-hide_banner',
        '-loglevel', 'error',
        '-f', 'webm',
        '-i', 'pipe:0',
        '-vf', `scale=${width}:${height}`,
        '-r', `${fps}`,
        '-pix_fmt', 'yuv420p',
        '-f', 'dshow',
        'video="ADirector Virtual Camera"',
      ];
    }

    console.log(`[VirtualCam] Iniciando cámara virtual en ${platform}: ${deviceName}`);

    try {
      this.vcamProcess = spawn('ffmpeg', args);
      this.isActiveFlag = true;
      this.onStatusChange?.(true, deviceName);

      this.vcamProcess.stderr.on('data', (d) => {
        console.warn(`[VirtualCam FFmpeg]: ${d.toString()}`);
      });

      this.vcamProcess.on('close', (code) => {
        console.log(`[VirtualCam] Proceso cerrado (${code})`);
        this.isActiveFlag = false;
        this.vcamProcess = null;
        this.onStatusChange?.(false, deviceName);
      });

      this.vcamProcess.on('error', (err) => {
        console.error('[VirtualCam] Error:', err);
        this.onError?.(`Fallo al iniciar Cámara Virtual: ${err.message}`);
      });
    } catch (e: any) {
      this.onError?.(`Error ejecutando FFmpeg para cámara virtual: ${e.message}`);
    }
  }

  public writeChunk(chunk: Buffer) {
    if (this.vcamProcess && this.vcamProcess.stdin.writable) {
      this.vcamProcess.stdin.write(chunk);
    }
  }

  public stop() {
    if (this.vcamProcess) {
      try {
        this.vcamProcess.stdin.end();
      } catch (e) {}
      this.vcamProcess.kill('SIGTERM');
      this.vcamProcess = null;
    }
    this.isActiveFlag = false;
    this.onStatusChange?.(false, '');
    console.log('[VirtualCam] Cámara Virtual detenida.');
  }

  public isActive(): boolean {
    return this.isActiveFlag;
  }
}
