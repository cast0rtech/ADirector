/**
 * ADirector Program Switcher Engine
 * - Soporte para resoluciones hasta 2.7K (2720x1530 / 2560x1440 / 1920x1080) a 60fps continuo.
 * - Motor de Composición Multicámara en tiempo real:
 *   * 'single': 1 cámara a pantalla completa
 *   * 'pip': Picture-in-Picture (Cámara principal + recuadro flotante en esquina)
 *   * 'split': 2 cámaras lado a lado (Side-by-side)
 *   * 'triview': 3 cámaras (1 principal + 2 secundarias apiladas)
 *   * 'quad': 4 cámaras en cuadrícula (2x2)
 * - Admite cámaras móviles y la Pantalla del PC (Screen Share) en cualquier slot.
 * - Genera un MediaStream continuo unificado mediante canvas.captureStream(60)
 *   junto con la pista de audio maestra del AudioMixerEngine.
 */

export type LayoutMode = 'single' | 'pip' | 'split' | 'triview' | 'quad';

export interface ResolutionConfig {
  id: '1080p' | '1440p' | '2.7k';
  label: string;
  width: number;
  height: number;
}

export const RESOLUTIONS: Record<string, ResolutionConfig> = {
  '1080p': { id: '1080p', label: '1080p Full HD (1920x1080)', width: 1920, height: 1080 },
  '1440p': { id: '1440p', label: '1440p 2K QHD (2560x1440)', width: 2560, height: 1440 },
  '2.7k': { id: '2.7k', label: '2.7K Ultra HD (2720x1530)', width: 2720, height: 1530 },
};

export interface CompositionSlot {
  peerId: string | null;
  videoElement: HTMLVideoElement | null;
  label: string;
}

export class ProgramSwitcherEngine {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private animationFrameId: number | null = null;
  private programStream: MediaStream | null = null;

  public width = 1920;
  public height = 1080;
  public currentResolutionId: '1080p' | '1440p' | '2.7k' = '1080p';

  // Modo de composición activo
  public currentLayout: LayoutMode = 'single';

  // 4 Slots de composición simultánea
  private slots: CompositionSlot[] = [
    { peerId: null, videoElement: null, label: 'Slot 1 (Principal)' },
    { peerId: null, videoElement: null, label: 'Slot 2' },
    { peerId: null, videoElement: null, label: 'Slot 3' },
    { peerId: null, videoElement: null, label: 'Slot 4' },
  ];

  public onFpsUpdate?: (fps: number) => void;
  public onLayoutChange?: (layout: LayoutMode) => void;

  private frameCount = 0;
  private lastFpsCalcTime = performance.now();

  constructor() {
    this.canvas = document.createElement('canvas');
    this.canvas.width = this.width;
    this.canvas.height = this.height;

    const context = this.canvas.getContext('2d', {
      alpha: false,
      desynchronized: true, // Máxima aceleración por hardware
    });

    if (!context) {
      throw new Error('No se pudo inicializar el contexto 2D para el Program Canvas');
    }
    this.ctx = context;

    this.initDefaultSlate();
    this.startRenderLoop();
  }

  /**
   * Cambia la resolución de salida dinámica hasta 2.7K (2720x1530)
   */
  public setResolution(resId: '1080p' | '1440p' | '2.7k') {
    const config = RESOLUTIONS[resId];
    if (!config) return;

    this.currentResolutionId = resId;
    this.width = config.width;
    this.height = config.height;
    this.canvas.width = this.width;
    this.canvas.height = this.height;

    console.log(`[Switcher] Resolución cambiada a: ${config.label}`);
  }

  /**
   * Cambia el diseño de distribución de cámaras (1, 2, 3 o 4 cámaras)
   */
  public setLayout(layout: LayoutMode) {
    this.currentLayout = layout;
    this.onLayoutChange?.(layout);
    console.log(`[Switcher] Layout cambiado a: ${layout}`);
  }

  /**
   * Asigna una fuente de video (cámara móvil o pantalla de PC) a un slot específico (0 a 3)
   */
  public setSlot(slotIndex: number, peerId: string | null, videoElement: HTMLVideoElement | null, label: string = '') {
    if (slotIndex < 0 || slotIndex >= 4) return;
    this.slots[slotIndex] = {
      peerId,
      videoElement,
      label: label || `Cámara ${slotIndex + 1}`,
    };
  }

  /**
   * Conmuta rápidamente la cámara principal (Slot 0)
   */
  public cutTo(peerId: string | null, videoElement: HTMLVideoElement | null, label: string = '') {
    this.setSlot(0, peerId, videoElement, label);
  }

  public getSlot(slotIndex: number): CompositionSlot {
    return this.slots[slotIndex] || { peerId: null, videoElement: null, label: '' };
  }

  public getAllSlots(): CompositionSlot[] {
    return [...this.slots];
  }

  private initDefaultSlate() {
    this.ctx.fillStyle = '#0a0d14';
    this.ctx.fillRect(0, 0, this.width, this.height);
  }

  /**
   * Bucle continuo de renderizado a 60fps con composición multipantalla
   */
  private startRenderLoop() {
    const render = () => {
      // Fondo negro de base
      this.ctx.fillStyle = '#050811';
      this.ctx.fillRect(0, 0, this.width, this.height);

      switch (this.currentLayout) {
        case 'single':
          this.renderSingle();
          break;
        case 'pip':
          this.renderPiP();
          break;
        case 'split':
          this.renderSplit();
          break;
        case 'triview':
          this.renderTriView();
          break;
        case 'quad':
          this.renderQuad();
          break;
      }

      this.calculateFps();
      this.animationFrameId = requestAnimationFrame(render);
    };

    this.animationFrameId = requestAnimationFrame(render);
  }

  // =========================================================================
  // MODOS DE COMPOSICIÓN GRÁFICA
  // =========================================================================

  /**
   * 1 Cámara: Pantalla Completa
   */
  private renderSingle() {
    const slot0 = this.slots[0];
    if (this.isVideoReady(slot0.videoElement)) {
      this.drawVideoBox(slot0.videoElement!, 0, 0, this.width, this.height, false);
    } else {
      this.drawPlaceholder(0, 0, this.width, this.height, 'SELECCIONA CÁMARA PRINCIPAL');
    }
  }

  /**
   * 2 Cámaras: Picture-in-Picture (Principal de fondo + Recuadro en esquina inferior derecha)
   */
  private renderPiP() {
    // Fondo: Slot 0
    this.renderSingle();

    // Recuadro PiP: Slot 1
    const slot1 = this.slots[1];
    const pipW = this.width * 0.28;
    const pipH = (pipW * 9) / 16;
    const padding = this.width * 0.025;
    const pipX = this.width - pipW - padding;
    const pipY = this.height - pipH - padding;

    // Sombra y borde
    this.ctx.save();
    this.ctx.shadowColor = 'rgba(0, 0, 0, 0.7)';
    this.ctx.shadowBlur = 18;
    this.ctx.fillStyle = '#000';
    this.ctx.fillRect(pipX - 3, pipY - 3, pipW + 6, pipH + 6);
    this.ctx.restore();

    if (this.isVideoReady(slot1.videoElement)) {
      this.drawVideoBox(slot1.videoElement!, pipX, pipY, pipW, pipH, true, slot1.label);
    } else {
      this.drawPlaceholder(pipX, pipY, pipW, pipH, 'SLOT 2 (PiP)');
    }

    // Borde blanco sutil
    this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
    this.ctx.lineWidth = 2;
    this.ctx.strokeRect(pipX, pipY, pipW, pipH);
  }

  /**
   * 2 Cámaras: Side-by-Side (Lado a lado 50% / 50%)
   */
  private renderSplit() {
    const halfW = this.width / 2;
    const gap = 3;

    // Slot 0 (Izquierda)
    if (this.isVideoReady(this.slots[0].videoElement)) {
      this.drawVideoBox(this.slots[0].videoElement!, 0, 0, halfW - gap, this.height, true, this.slots[0].label);
    } else {
      this.drawPlaceholder(0, 0, halfW - gap, this.height, 'SLOT 1 (IZQ)');
    }

    // Slot 1 (Derecha)
    if (this.isVideoReady(this.slots[1].videoElement)) {
      this.drawVideoBox(this.slots[1].videoElement!, halfW + gap, 0, halfW - gap, this.height, true, this.slots[1].label);
    } else {
      this.drawPlaceholder(halfW + gap, 0, halfW - gap, this.height, 'SLOT 2 (DER)');
    }

    // Línea divisoria central
    this.ctx.fillStyle = '#090d16';
    this.ctx.fillRect(halfW - gap, 0, gap * 2, this.height);
  }

  /**
   * 3 Cámaras: 1 Principal a la izquierda (50%) + 2 Secundarias a la derecha (apiladas)
   */
  private renderTriView() {
    const leftW = this.width * 0.55;
    const rightW = this.width - leftW;
    const halfH = this.height / 2;
    const gap = 3;

    // Slot 0 (Izquierda Principal)
    if (this.isVideoReady(this.slots[0].videoElement)) {
      this.drawVideoBox(this.slots[0].videoElement!, 0, 0, leftW - gap, this.height, true, this.slots[0].label);
    } else {
      this.drawPlaceholder(0, 0, leftW - gap, this.height, 'SLOT 1 (PRINCIPAL)');
    }

    // Slot 1 (Derecha Arriba)
    if (this.isVideoReady(this.slots[1].videoElement)) {
      this.drawVideoBox(this.slots[1].videoElement!, leftW + gap, 0, rightW - gap, halfH - gap, true, this.slots[1].label);
    } else {
      this.drawPlaceholder(leftW + gap, 0, rightW - gap, halfH - gap, 'SLOT 2');
    }

    // Slot 2 (Derecha Abajo)
    if (this.isVideoReady(this.slots[2].videoElement)) {
      this.drawVideoBox(this.slots[2].videoElement!, leftW + gap, halfH + gap, rightW - gap, halfH - gap, true, this.slots[2].label);
    } else {
      this.drawPlaceholder(leftW + gap, halfH + gap, rightW - gap, halfH - gap, 'SLOT 3');
    }
  }

  /**
   * 4 Cámaras: Cuadrícula 2x2
   */
  private renderQuad() {
    const halfW = this.width / 2;
    const halfH = this.height / 2;
    const gap = 3;

    const coords = [
      { x: 0, y: 0, w: halfW - gap, h: halfH - gap },
      { x: halfW + gap, y: 0, w: halfW - gap, h: halfH - gap },
      { x: 0, y: halfH + gap, w: halfW - gap, h: halfH - gap },
      { x: halfW + gap, y: halfH + gap, w: halfW - gap, h: halfH - gap },
    ];

    for (let i = 0; i < 4; i++) {
      const slot = this.slots[i];
      const { x, y, w, h } = coords[i];

      if (this.isVideoReady(slot.videoElement)) {
        this.drawVideoBox(slot.videoElement!, x, y, w, h, true, slot.label);
      } else {
        this.drawPlaceholder(x, y, w, h, `SLOT ${i + 1}`);
      }
    }
  }

  // =========================================================================
  // UTILIDADES DE DIBUJO Y ESCALADO
  // =========================================================================

  private isVideoReady(video: HTMLVideoElement | null): boolean {
    return !!video && video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && !video.paused;
  }

  /**
   * Renderiza un video ajustando la relación de aspecto dentro de un área rectangular
   */
  private drawVideoBox(
    video: HTMLVideoElement,
    targetX: number,
    targetY: number,
    targetW: number,
    targetH: number,
    showLabel: boolean = false,
    label: string = ''
  ) {
    const vWidth = video.videoWidth || 1920;
    const vHeight = video.videoHeight || 1080;

    // Escala COVER centrado
    const scale = Math.max(targetW / vWidth, targetH / vHeight);
    const renderW = vWidth * scale;
    const renderH = vHeight * scale;
    const offsetX = targetX + (targetW - renderW) / 2;
    const offsetY = targetY + (targetH - renderH) / 2;

    this.ctx.save();
    // Recorte al rectángulo objetivo
    this.ctx.beginPath();
    this.ctx.rect(targetX, targetY, targetW, targetH);
    this.ctx.clip();

    this.ctx.drawImage(video, offsetX, offsetY, renderW, renderH);

    // Etiqueta de la fuente
    if (showLabel && label) {
      this.ctx.fillStyle = 'rgba(15, 23, 42, 0.75)';
      const fontSize = Math.max(12, Math.round(this.width * 0.009));
      this.ctx.font = `bold ${fontSize}px sans-serif`;
      const textMetrics = this.ctx.measureText(label);
      const badgeW = textMetrics.width + 16;
      const badgeH = fontSize + 10;
      const badgeX = targetX + 10;
      const badgeY = targetY + 10;

      this.ctx.fillRect(badgeX, badgeY, badgeW, badgeH);
      this.ctx.fillStyle = '#ffffff';
      this.ctx.fillText(label, badgeX + 8, badgeY + fontSize);
    }

    this.ctx.restore();
  }

  private drawPlaceholder(x: number, y: number, w: number, h: number, text: string) {
    this.ctx.save();
    this.ctx.fillStyle = '#090d16';
    this.ctx.fillRect(x, y, w, h);

    this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
    this.ctx.lineWidth = 1;
    this.ctx.strokeRect(x + 4, y + 4, w - 8, h - 8);

    const fontSize = Math.max(14, Math.round(this.width * 0.012));
    this.ctx.fillStyle = '#475569';
    this.ctx.font = `600 ${fontSize}px sans-serif`;
    this.ctx.textAlign = 'center';
    this.ctx.textBaseline = 'middle';
    this.ctx.fillText(text, x + w / 2, y + h / 2);
    this.ctx.restore();
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

  public getMasterProgramStream(masterAudioStream?: MediaStream | null): MediaStream {
    if (!this.programStream) {
      this.programStream = this.canvas.captureStream(60);
    }

    if (masterAudioStream && masterAudioStream.getAudioTracks().length > 0) {
      const masterAudioTrack = masterAudioStream.getAudioTracks()[0];
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
    return this.slots[0].peerId;
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
