import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { WebRtcHostReceiver, StreamEvent } from './WebRtcHostReceiver.js';
import { AudioMixerEngine, AudioChannelState } from './audio/AudioMixerEngine.js';
import { ProgramSwitcherEngine } from './video/ProgramSwitcherEngine.js';
import { MultiviewTile } from './components/MultiviewTile.js';
import { ProgramMonitor } from './components/ProgramMonitor.js';
import { AudioMixerDock } from './components/AudioMixerDock.js';
import { BroadcastControls } from './components/BroadcastControls.js';
import { DeviceInfo, RemoteCommand } from '../../types/signaling.js';
import { StreamConfig, StreamStats } from '../electron/ffmpegManager.js';

export const App: React.FC = () => {
  // Motores de Audio y Video
  const audioMixer = useMemo(() => new AudioMixerEngine(), []);
  const programSwitcher = useMemo(() => new ProgramSwitcherEngine(), []);

  // Estado de Cámaras y Streams
  const [streams, setStreams] = useState<Map<string, { stream: MediaStream; device: DeviceInfo }>>(new Map());
  const [programPeerId, setProgramPeerId] = useState<string | null>(null);
  const [fps, setFps] = useState(60);

  // Estado del Mezclador de Audio
  const [audioChannels, setAudioChannels] = useState<AudioChannelState[]>([]);
  const [audioLevels, setAudioLevels] = useState<Map<string, { level: number; peakDb: number }>>(new Map());
  const [masterAudioLevel, setMasterAudioLevel] = useState(0);

  // Estado de Grabación y Streaming RTMP
  const [isRecordingActive, setIsRecordingActive] = useState(false);
  const [isStreamingActive, setIsStreamingActive] = useState(false);
  const [streamStats, setStreamStats] = useState<StreamStats | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);

  // Estado de Servidor y QR
  const [serverInfo, setServerInfo] = useState<{ httpsUrl: string; qrCodeDataUrl: string } | null>(null);
  const [showQrModal, setShowQrModal] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<'connecting' | 'connected' | 'disconnected'>('connecting');

  const receiverRef = useRef<WebRtcHostReceiver | null>(null);

  // =========================================================================
  // GESTIÓN DE SALIDA DE MEDIOS (MEDIARECORDER -> IPC -> FFMPEG)
  // =========================================================================

  const startMediaRecorderPipeline = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      return;
    }

    const masterAudio = audioMixer.getMasterAudioStream();
    const combinedStream = programSwitcher.getMasterProgramStream(masterAudio);

    // Priorizar codecs con aceleración por hardware compatibles
    let mimeType = 'video/webm;codecs=h264,opus';
    if (!MediaRecorder.isTypeSupported(mimeType)) {
      mimeType = 'video/webm;codecs=vp8,opus';
      if (!MediaRecorder.isTypeSupported(mimeType)) {
        mimeType = 'video/webm';
      }
    }

    try {
      const recorder = new MediaRecorder(combinedStream, {
        mimeType,
        videoBitsPerSecond: 8000000,
      });

      recorder.ondataavailable = async (event) => {
        if (event.data && event.data.size > 0 && window.electronAPI) {
          const buffer = await event.data.arrayBuffer();
          window.electronAPI.sendMediaChunk(buffer);
        }
      };

      // Fragmentos de 250ms para mantener latencia ultra-baja en el pipeline stdin de FFmpeg
      recorder.start(250);
      mediaRecorderRef.current = recorder;
      console.log(`[MediaRecorder] Pipeline iniciado (${mimeType})`);
    } catch (err) {
      console.error('[MediaRecorder] Error al iniciar captura:', err);
    }
  }, [audioMixer, programSwitcher]);

  const stopMediaRecorderPipeline = useCallback(() => {
    if (mediaRecorderRef.current) {
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current = null;
      console.log('[MediaRecorder] Pipeline detenido');
    }
  }, []);

  const handleStartOutput = async (config: StreamConfig) => {
    if (window.electronAPI) {
      await window.electronAPI.startOutput(config);
      startMediaRecorderPipeline();
      setIsRecordingActive(config.recordEnabled);
      setIsStreamingActive(config.rtmpEnabled);
    }
  };

  const handleStopOutput = async () => {
    if (window.electronAPI) {
      await window.electronAPI.stopOutput();
      stopMediaRecorderPipeline();
      setIsRecordingActive(false);
      setIsStreamingActive(false);
    }
  };

  // =========================================================================
  // CICLO DE VIDA DEL SERVICIO WEBRTC Y RECEPCIÓN DE DISPOSITIVOS
  // =========================================================================

  useEffect(() => {
    fetch('/api/server-info')
      .then((res) => res.json())
      .then((data) => setServerInfo(data))
      .catch((e) => console.warn('API local offline:', e));

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws`;
    const receiver = new WebRtcHostReceiver(wsUrl);
    receiverRef.current = receiver;

    receiver.onStatusChange = (status) => setConnectionStatus(status);

    receiver.onStreamAdded = ({ peerId, device, stream }: StreamEvent) => {
      setStreams((prev) => {
        const next = new Map(prev);
        next.set(peerId, { stream, device });
        return next;
      });

      const audioTracks = stream.getAudioTracks();
      if (audioTracks.length > 0) {
        audioMixer.addChannel(peerId, device.name, audioTracks[0]);
        setAudioChannels(audioMixer.getAllChannels());
      }
    };

    receiver.onStreamRemoved = (peerId: string) => {
      setStreams((prev) => {
        const next = new Map(prev);
        next.delete(peerId);
        return next;
      });

      audioMixer.removeChannel(peerId);
      setAudioChannels(audioMixer.getAllChannels());

      if (programSwitcher.getActivePeerId() === peerId) {
        programSwitcher.cutTo(null, null);
        setProgramPeerId(null);
      }
    };

    audioMixer.onLevelsUpdate = (levels, masterLevel) => {
      setAudioLevels(new Map(levels));
      setMasterAudioLevel(masterLevel);
    };

    programSwitcher.onFpsUpdate = (currentFps) => {
      setFps(currentFps);
    };

    // Escuchar estadísticas y errores desde el proceso principal de Electron
    let unsubscribeStats: (() => void) | undefined;
    let unsubscribeErrors: (() => void) | undefined;

    if (window.electronAPI) {
      unsubscribeStats = window.electronAPI.onStreamStats((stats) => {
        setStreamStats(stats);
      });

      unsubscribeErrors = window.electronAPI.onStreamError((err) => {
        alert(`Error en salida de transmisión: ${err}`);
      });
    }

    receiver.connect();

    return () => {
      receiver.disconnect();
      audioMixer.dispose();
      programSwitcher.dispose();
      stopMediaRecorderPipeline();
      unsubscribeStats?.();
      unsubscribeErrors?.();
    };
  }, [audioMixer, programSwitcher, stopMediaRecorderPipeline]);

  const handleCutToProgram = (peerId: string, videoEl: HTMLVideoElement) => {
    programSwitcher.cutTo(peerId, videoEl);
    setProgramPeerId(peerId);
  };

  const handleSendCommand = (peerId: string, command: RemoteCommand) => {
    receiverRef.current?.sendRemoteCommand(peerId, command);
  };

  const handleVolumeChange = (peerId: string, vol: number) => {
    audioMixer.setChannelVolume(peerId, vol);
    setAudioChannels(audioMixer.getAllChannels());
  };

  const handleToggleMute = (peerId: string) => {
    audioMixer.toggleMute(peerId);
    setAudioChannels(audioMixer.getAllChannels());
  };

  const handleToggleSolo = (peerId: string) => {
    audioMixer.toggleSolo(peerId);
    setAudioChannels(audioMixer.getAllChannels());
  };

  const activeCameraName = programPeerId ? streams.get(programPeerId)?.device.name || 'Cámara 1' : '';

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        width: '100vw',
        height: '100vh',
        background: '#040711',
        color: '#f8fafc',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        overflow: 'hidden',
      }}
    >
      {/* Barra de cabecera Studio */}
      <header
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '10px 24px',
          background: '#090d16',
          borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          {/* Logo Oficial de ADirector */}
          <img
            src="/assets/logo.png"
            alt="ADirector Mascot"
            style={{
              width: '38px',
              height: '38px',
              borderRadius: '8px',
              boxShadow: '0 0 12px rgba(37, 99, 235, 0.4)',
              border: '1px solid rgba(255,255,255,0.15)',
              objectFit: 'cover',
            }}
          />
          <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 800, letterSpacing: '0.5px' }}>
            ADIRECTOR STUDIO
          </h2>
          <span
            style={{
              padding: '4px 10px',
              borderRadius: '9999px',
              fontSize: '11px',
              fontWeight: 600,
              background: connectionStatus === 'connected' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
              color: connectionStatus === 'connected' ? '#10b981' : '#ef4444',
              border: `1px solid ${connectionStatus === 'connected' ? '#10b981' : '#ef4444'}`,
            }}
          >
            {connectionStatus === 'connected' ? '● SERVIDOR EN VIVO' : '○ RECONECTANDO'}
          </span>
        </div>

        {/* Controles de Grabación FFmpeg y Transmisión RTMP */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <BroadcastControls
            onStartOutput={handleStartOutput}
            onStopOutput={handleStopOutput}
            isRecordingActive={isRecordingActive}
            isStreamingActive={isStreamingActive}
            stats={streamStats}
          />

          <button
            onClick={() => setShowQrModal(true)}
            style={{
              padding: '8px 16px',
              background: '#2563eb',
              color: '#fff',
              border: 'none',
              borderRadius: '8px',
              fontSize: '13px',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            📱 Conectar Móvil (QR)
          </button>
        </div>
      </header>

      {/* Espacio de trabajo principal */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden', padding: '16px', gap: '16px' }}>
        {/* Monitor de Salida Maestra (Program) */}
        <div style={{ flex: '0 0 45%', display: 'flex', flexDirection: 'column' }}>
          <ProgramMonitor engine={programSwitcher} activeCameraName={activeCameraName} fps={fps} />

          <div style={{ marginTop: '14px', background: '#090d16', padding: '14px', borderRadius: '8px', fontSize: '12px' }}>
            <strong>Motor de Salida FFmpeg:</strong>
            <p style={{ margin: '4px 0 0', color: '#94a3b8' }}>
              La señal combinada de <code>canvas.captureStream(60)</code> y el <code>AudioContext Master Destination</code> se transmite directamente al pipe STDIN de FFmpeg para grabación local en H.264 / MP4 y retransmisión RTMP en vivo.
            </p>
          </div>
        </div>

        {/* Cuadrícula Multivista */}
        <div
          style={{
            flex: 1,
            background: '#090d16',
            borderRadius: '12px',
            border: '1px solid rgba(255,255,255,0.08)',
            padding: '16px',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }}>
            <h3 style={{ margin: 0, fontSize: '14px', fontWeight: 700, color: '#94a3b8' }}>
              MULTIVISTA ({streams.size} CÁMARAS CONECTADAS)
            </h3>
            <span style={{ fontSize: '11px', color: '#64748b' }}>Haz clic en una cámara para pasarla a Program</span>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
              gap: '14px',
              overflowY: 'auto',
              flex: 1,
            }}
          >
            {Array.from(streams.entries()).map(([peerId, { stream, device }]) => {
              const levelData = audioLevels.get(peerId) || { level: 0, peakDb: -60 };
              return (
                <MultiviewTile
                  key={peerId}
                  peerId={peerId}
                  device={device}
                  stream={stream}
                  isProgram={programPeerId === peerId}
                  audioLevel={levelData.level}
                  peakDb={levelData.peakDb}
                  onCutToProgram={handleCutToProgram}
                  onSendCommand={handleSendCommand}
                />
              );
            })}

            {streams.size === 0 && (
              <div
                style={{
                  gridColumn: '1 / -1',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#64748b',
                  height: '240px',
                  border: '2px dashed rgba(255,255,255,0.1)',
                  borderRadius: '12px',
                }}
              >
                <p style={{ margin: '0 0 10px 0', fontSize: '15px' }}>Esperando cámaras móviles en la red local...</p>
                <button
                  onClick={() => setShowQrModal(true)}
                  style={{
                    padding: '8px 16px',
                    background: '#1e293b',
                    color: '#fff',
                    border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: '6px',
                    cursor: 'pointer',
                  }}
                >
                  Ver Código QR
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Dock Inferior: Mezclador de Audio */}
      <AudioMixerDock
        channels={audioChannels}
        masterLevel={masterAudioLevel}
        onVolumeChange={handleVolumeChange}
        onToggleMute={handleToggleMute}
        onToggleSolo={handleToggleSolo}
        onMasterVolumeChange={(v) => audioMixer.setMasterVolume(v)}
      />

      {/* Modal Código QR */}
      {showQrModal && serverInfo && (
        <div
          onClick={() => setShowQrModal(false)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.8)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: '#1e293b',
              padding: '28px',
              borderRadius: '16px',
              textAlign: 'center',
              maxWidth: '380px',
              border: '1px solid rgba(255,255,255,0.15)',
            }}
          >
            <h3 style={{ margin: '0 0 12px 0' }}>Conectar Cámara Móvil</h3>
            <p style={{ fontSize: '13px', color: '#94a3b8', margin: '0 0 16px 0' }}>
              Escanea este código con la cámara de tu iPhone o Android en la misma red Wi-Fi:
            </p>

            <img
              src={serverInfo.qrCodeDataUrl}
              alt="Código QR de Conexión"
              style={{ width: '220px', height: '220px', borderRadius: '10px', background: '#fff', padding: '8px' }}
            />

            <p style={{ fontSize: '12px', fontFamily: 'monospace', color: '#38bdf8', marginTop: '12px' }}>
              {serverInfo.httpsUrl}
            </p>

            <button
              onClick={() => setShowQrModal(false)}
              style={{
                marginTop: '16px',
                padding: '8px 20px',
                background: '#334155',
                color: '#fff',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer',
              }}
            >
              Cerrar
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
