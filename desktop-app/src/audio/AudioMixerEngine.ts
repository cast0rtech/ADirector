/**
 * ADirector Audio Mixer Engine (Web Audio API)
 * - Canal independiente por cada teléfono conectado.
 * - Pista de audio -> MediaStreamAudioSourceNode -> GainNode -> AnalyserNode -> MasterGainNode -> MediaStreamAudioDestinationNode.
 * - Soporte para control de ganancia (volumen), Mute, Solo y cálculo de vúmetro en tiempo real (dB / RMS).
 * - Salida maestra continua e ininterrumpida.
 */

export interface AudioChannelState {
  peerId: string;
  name: string;
  volume: number; // 0.0 a 1.5 (1.0 = 0dB)
  isMuted: boolean;
  isSolo: boolean;
  level: number; // 0.0 a 1.0 (nivel instantáneo para el vúmetro)
  peakDb: number; // -60dB a 0dB
}

export class AudioMixerEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private masterDestination: MediaStreamAudioDestinationNode | null = null;
  private masterAnalyser: AnalyserNode | null = null;

  // Canales por Peer ID
  private channels = new Map<
    string,
    {
      sourceNode: MediaStreamAudioSourceNode;
      gainNode: GainNode;
      analyserNode: AnalyserNode;
      state: AudioChannelState;
      dataArray: Uint8Array;
    }
  >();

  private isRunning = false;
  private animationFrameId: number | null = null;
  public onLevelsUpdate?: (levels: Map<string, { level: number; peakDb: number }>, masterLevel: number) => void;

  constructor() {}

  public ensureContext(): AudioContext {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AudioCtx({ latencyHint: 'interactive' });

      // Nodo maestro
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.setValueAtTime(1.0, this.ctx.currentTime);

      this.masterAnalyser = this.ctx.createAnalyser();
      this.masterAnalyser.fftSize = 256;
      this.masterAnalyser.smoothingTimeConstant = 0.8;

      this.masterDestination = this.ctx.createMediaStreamDestination();

      // Enrutamiento maestro: MasterGain -> MasterAnalyser -> MasterDestination
      this.masterGain.connect(this.masterAnalyser);
      this.masterGain.connect(this.masterDestination);
    }

    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }

    return this.ctx;
  }

  /**
   * Conecta el audio entrante de un nuevo teléfono al mezclador
   */
  public addChannel(peerId: string, name: string, audioTrack: MediaStreamTrack) {
    const ctx = this.ensureContext();

    // Si el canal ya existe, removerlo antes de reconectar
    if (this.channels.has(peerId)) {
      this.removeChannel(peerId);
    }

    const stream = new MediaStream([audioTrack]);
    const sourceNode = ctx.createMediaStreamSource(stream);

    const gainNode = ctx.createGain();
    gainNode.gain.setValueAtTime(1.0, ctx.currentTime);

    const analyserNode = ctx.createAnalyser();
    analyserNode.fftSize = 256;
    analyserNode.smoothingTimeConstant = 0.7;

    // Enrutar: Source -> Gain -> Analyser -> MasterGain
    sourceNode.connect(gainNode);
    gainNode.connect(analyserNode);
    gainNode.connect(this.masterGain!);

    const state: AudioChannelState = {
      peerId,
      name,
      volume: 1.0,
      isMuted: false,
      isSolo: false,
      level: 0,
      peakDb: -60,
    };

    const dataArray = new Uint8Array(analyserNode.frequencyBinCount);

    this.channels.set(peerId, {
      sourceNode,
      gainNode,
      analyserNode,
      state,
      dataArray,
    });

    this.recalculateGains();

    if (!this.isRunning) {
      this.startMeteringLoop();
    }
  }

  public removeChannel(peerId: string) {
    const channel = this.channels.get(peerId);
    if (!channel) return;

    try {
      channel.gainNode.disconnect();
      channel.analyserNode.disconnect();
      channel.sourceNode.disconnect();
    } catch (e) {}

    this.channels.delete(peerId);
    this.recalculateGains();
  }

  public setChannelVolume(peerId: string, volume: number) {
    const ch = this.channels.get(peerId);
    if (!ch || !this.ctx) return;
    ch.state.volume = Math.max(0, Math.min(volume, 2.0));
    this.recalculateGains();
  }

  public toggleMute(peerId: string) {
    const ch = this.channels.get(peerId);
    if (!ch) return;
    ch.state.isMuted = !ch.state.isMuted;
    this.recalculateGains();
  }

  public toggleSolo(peerId: string) {
    const ch = this.channels.get(peerId);
    if (!ch) return;
    ch.state.isSolo = !ch.state.isSolo;
    this.recalculateGains();
  }

  public setMasterVolume(volume: number) {
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setValueAtTime(Math.max(0, volume), this.ctx.currentTime);
    }
  }

  /**
   * Recalcula la ganancia efectiva respetando la lógica Solo / Mute
   */
  private recalculateGains() {
    if (!this.ctx) return;
    const anySolo = Array.from(this.channels.values()).some((ch) => ch.state.isSolo);

    for (const ch of this.channels.values()) {
      let effectiveGain = 0;

      if (!ch.state.isMuted) {
        if (anySolo) {
          effectiveGain = ch.state.isSolo ? ch.state.volume : 0;
        } else {
          effectiveGain = ch.state.volume;
        }
      }

      ch.gainNode.gain.setTargetAtTime(effectiveGain, this.ctx.currentTime, 0.02);
    }
  }

  /**
   * Bucle de análisis a 60fps para los vúmetros en pantalla
   */
  private startMeteringLoop() {
    this.isRunning = true;

    const tick = () => {
      const levelsMap = new Map<string, { level: number; peakDb: number }>();

      for (const [peerId, ch] of this.channels.entries()) {
        ch.analyserNode.getByteTimeDomainData(ch.dataArray);

        // Calcular RMS (Root Mean Square) del buffer
        let sumSquares = 0;
        for (let i = 0; i < ch.dataArray.length; i++) {
          const norm = (ch.dataArray[i] - 128) / 128;
          sumSquares += norm * norm;
        }
        const rms = Math.sqrt(sumSquares / ch.dataArray.length);
        const level = Math.min(1.0, rms * 3.5); // Normalizado
        const peakDb = rms > 0.0001 ? Math.max(-60, 20 * Math.log10(rms)) : -60;

        ch.state.level = level;
        ch.state.peakDb = peakDb;
        levelsMap.set(peerId, { level, peakDb });
      }

      // Master meter
      let masterLevel = 0;
      if (this.masterAnalyser) {
        const masterData = new Uint8Array(this.masterAnalyser.frequencyBinCount);
        this.masterAnalyser.getByteTimeDomainData(masterData);
        let sum = 0;
        for (let i = 0; i < masterData.length; i++) {
          const norm = (masterData[i] - 128) / 128;
          sum += norm * norm;
        }
        masterLevel = Math.min(1.0, Math.sqrt(sum / masterData.length) * 3.5);
      }

      this.onLevelsUpdate?.(levelsMap, masterLevel);
      this.animationFrameId = requestAnimationFrame(tick);
    };

    tick();
  }

  /**
   * Devuelve el stream continuo de audio maestro para grabar o transmitir
   */
  public getMasterAudioStream(): MediaStream | null {
    return this.masterDestination?.stream || null;
  }

  public getChannelState(peerId: string): AudioChannelState | undefined {
    return this.channels.get(peerId)?.state;
  }

  public getAllChannels(): AudioChannelState[] {
    return Array.from(this.channels.values()).map((ch) => ch.state);
  }

  public dispose() {
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
    }
    this.isRunning = false;
    this.channels.clear();
    if (this.ctx) {
      this.ctx.close();
      this.ctx = null;
    }
  }
}
