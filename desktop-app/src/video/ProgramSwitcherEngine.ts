/**
 * ADirector Program Switcher Engine
 * - Canvas 1920x1080 a 60fps continuo (sin cortes ni parpadeos).
 * - Conmutación instantánea de fuentes de video.
 * - Genera un MediaStream continuo mediante canvas.captureStream(60)
 *   combinado con la pista de audio maestra del AudioMixerEngine.
 */

export class ProgramSwitcherEngine {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private currentVideoElement: HTMLVideoElement | null = null;
  private currentPeerId: string | null = null;
  private animationFrameId: number | null = null;
  private programStream: MediaStream | null = null;

  public readonly width = 1920;
  public readonly height = 1080;
  public onFpsUpdate?: (fps: number) => void;

  private frameCount = 0;
  private lastFpsCalcTime = performance.now();

  constructor() {
    this.canvas = document.createElement('canvas');
    this.canvas.width = this.width;
    this.canvas.height = this.height;

    const context = this.canvas.getContext('2d', {
      alpha: false,
      desynchronized: true, // Máximo rendimiento y mínima latencia
    });

    if (!context) {
      throw new Error('No se pudo inicializar el contexto 2D para el Program Canvas');
    }
    this.ctx = context;

    this.initDefaultSlate();
    this.startRenderLoop();
  }

  /**
   * Pizarra de reserva (Black Slate / Color bars) si no hay cámaras al aire
   */
  private initDefaultSlate() {
    this.ctx.fillStyle = '#0a0d14';
    this.ctx.fillRect(0, 0, this.width, this.height);

    this.ctx.fillStyle = '#334155';
    this.ctx.font = 'bold 38px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto';
    this.ctx.textAlign = 'center';
    this.ctx.fillText('ADIRECTOR - PROGRAM OUTPUT (STANDBY)', this.width / 2, this.height / 2);
  }

  /**
   * Conmuta instantáneamente la cámara activa al aire (Program)
   */
  public cutTo(peerId: string | null, videoElement: HTMLVideoElement | null) {
    this.currentPeerId = peerId;
    this.currentVideoElement = videoElement;
    console.log(`[Switcher] Conmutado a cámara: ${peerId || 'BLACK'}`);
  }

  /**
   * Bucle de renderizado continuo a 60fps
   */
  private startRenderLoop() {
    const render = () => {
      if (
        this.currentVideoElement &&
        this.currentVideoElement.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA &&
        !this.currentVideoElement.paused
      ) {
        // Renderizar video ajustando relación de aspecto (Cover / Letterbox centrado)
        this.drawVideoAspectFit(this.currentVideoElement);
      } else if (!this.currentPeerId) {
        this.drawStandbySlate();
      }

      this.calculateFps();
      this.animationFrameId = requestAnimationFrame(render);
    };

    this.animationFrameId = requestAnimationFrame(render);
  }

  /**
   * Ajuste y renderizado optimizado del video en el lienzo 16:9
   */
  private drawVideoAspectFit(video: HTMLVideoElement) {
    const vWidth = video.videoWidth || this.width;
    const vHeight = video.videoHeight || this.height;

    // Escalado Cover sin distorsión
    const scale = Math.max(this.width / vWidth, this.height / vHeight);
    const renderW = vWidth * scale;
    const renderH = vHeight * scale;
    const offsetX = (this.width - renderW) / 2;
    const offsetY = (this.height - renderH) / 2;

    this.ctx.drawImage(video, offsetX, offsetY, renderW, renderH);
  }

  private drawStandbySlate() {
    this.ctx.fillStyle = '#050811';
    this.ctx.fillRect(0, 0, this.width, this.height);

    this.ctx.fillStyle = '#475569';
    this.ctx.font = '600 36px sans-serif';
    this.ctx.textAlign = 'center';
    this.ctx.fillText('PROGRAM SALIDA - SELECCIONA UNA CÁMARA', this.width / 2, this.height / 2);
  }

  private calculateFps() {
    this.frameCount++;
    const now = performance.now();
    if (now - this.lastFpsCalcTime >= 1000) {
      const fps = Math.round((this.frameCount * 1000) / (now - this.lastFpsCalcTime));
      this.onFpsUpdate?.(fps);
      this.frameCount = 0;
      this.lastFpsCalcTime = now;
    }
  }

  /**
   * Genera el MediaStream continuo unificado:
   * Video del Canvas (60fps) + Audio maestro del Mezclador
   */
  public getMasterProgramStream(masterAudioStream?: MediaStream | null): MediaStream {
    if (!this.programStream) {
      this.programStream = this.canvas.captureStream(60);
    }

    // Si se pasa audio maestro, agregarlo a la salida continua
    if (masterAudioStream && masterAudioStream.getAudioTracks().length > 0) {
      const masterAudioTrack = masterAudioStream.getAudioTracks()[0];
      // Reemplazar o añadir track
      const existing = this.programStream.getAudioTracks()[0];
      if (existing) {
        this.programStream.removeTrack(existing);
      }
      this.programStream.addTrack(masterAudioTrack);
    }

    return this.programStream;
  }

  public getCanvas(): HTMLCanvasElement {
    return this.canvas;
  }

  public getActivePeerId(): string | null {
    return this.currentPeerId;
  }

  public dispose() {
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
    }
    if (this.programStream) {
      this.programStream.getTracks().forEach((t) => t.stop());
    }
  }
}
