import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { WebRtcHostReceiver, StreamEvent } from './WebRtcHostReceiver.js';
import { AudioMixerEngine, AudioChannelState } from './audio/AudioMixerEngine.js';
import { ProgramSwitcherEngine, LayoutMode, CompositionSlot } from './video/ProgramSwitcherEngine.js';
import { MultiviewTile } from './components/MultiviewTile.js';
import { ProgramMonitor } from './components/ProgramMonitor.js';
import { LayoutController } from './components/LayoutController.js';
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
  const [fps, setFps] = useState(60);

  // Estado de Composición y Layouts
  const [currentLayout, setCurrentLayout] = useState<LayoutMode>('single');
  const [currentResolution, setCurrentResolution] = useState<'1080p' | '1440p' | '2.7k'>('1080p');
  const [slots, setSlots] = useState<CompositionSlot[]>(() => programSwitcher.getAllSlots());

  // Estado de Compartir Pantalla del PC
  const [screenStream, setScreenStream] = useState<MediaStream | null>(null);
  const [isScreenSharing, setIsScreenSharing] = useState(false);

  // Cache de elementos <video> para alimentar los slots de composición
  const videoElementsRef = useRef<Map<string, HTMLVideoElement>>(new Map());

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
  // GESTIÓN DE COMPARTIR PANTALLA DEL PC (SCREEN SHARE)
  // =========================================================================

  const handleToggleScreenShare = async () => {
    if (isScreenSharing && screenStream) {
      // Detener captura de pantalla
      screenStream.getTracks().forEach((t) => t.stop());
      setScreenStream(null);
      setIsScreenSharing(false);

      // Si la pantalla estaba en algún slot, limpiarlo
      slots.forEach((s, idx) => {
        if (s.peerId === 'screen-share') {
          programSwitcher.setSlot(idx, null, null, `Slot ${idx + 1}`);
        }
      });
      setSlots(programSwitcher.getAllSlots());
      audioMixer.removeChannel('screen-share');
      setAudioChannels(audioMixer.getAllChannels());
    } else {
      try {
        const stream = await navigator.mediaDevices.getDisplayMedia({
          video: { frameRate: 60 },
          audio: true, // Capturar también el audio del PC si el usuario lo comparte
        });

        setScreenStream(stream);
        setIsScreenSharing(true);

        // Cuando el usuario pulsa "Dejar de compartir" en el aviso del sistema operativo
        stream.getVideoTracks()[0].onended = () => {
          setIsScreenSharing(false);
          setScreenStream(null);
        };

        // Si tiene audio de sistema, agregarlo al mezclador de audio
        const audioTracks = stream.getAudioTracks();
        if (audioTracks.length > 0) {
          audioMixer.addChannel('screen-share', 'Audio PC (Screen)', audioTracks[0]);
          setAudioChannels(audioMixer.getAllChannels());
        }

        // Si no hay nada en el slot 0 o si estamos en PiP, colocarlo automáticamente
        const currentSlot0 = programSwitcher.getSlot(0);
        if (!currentSlot0.peerId) {
          // Asignar al slot 0
          setTimeout(() => {
            const vEl = videoElementsRef.current.get('screen-share');
            if (vEl) {
              programSwitcher.setSlot(0, 'screen-share', vEl, 'Pantalla PC');
              setSlots(programSwitcher.getAllSlots());
            }
          }, 100);
        }
      } catch (err) {
        console.warn('[ScreenShare] El usuario canceló la captura de pantalla:', err);
      }
    }
  };

  // =========================================================================
  // CONTROL DE COMPOSICIÓN, SLOTS Y RESOLUCIÓN HASTA 2.7K
  // =========================================================================

  const handleLayoutChange = (layout: LayoutMode) => {
    setCurrentLayout(layout);
    programSwitcher.setLayout(layout);
  };

  const handleResolutionChange = (resId: '1080p' | '1440p' | '2.7k') => {
    setCurrentResolution(resId);
    programSwitcher.setResolution(resId);
  };

  const handleAssignSlot = (slotIndex: number, peerId: string, videoEl?: HTMLVideoElement) => {
    const vEl = videoEl || videoElementsRef.current.get(peerId) || null;
    let label = 'Vacío';

    if (peerId === 'screen-share') {
      label = 'Pantalla PC';
    } else if (peerId) {
      const dev = streams.get(peerId);
      label = dev?.device.name || `Cámara ${peerId.slice(0, 4)}`;
    }

    programSwitcher.setSlot(slotIndex, peerId || null, vEl, label);
    setSlots(programSwitcher.getAllSlots());
  };

  const handleCutToProgram = (peerId: string, videoEl: HTMLVideoElement) => {
    videoElementsRef.current.set(peerId, videoEl);
    let label = 'Cámara';
    if (peerId === 'screen-share') {
      label = 'Pantalla PC';
    } else {
      label = streams.get(peerId)?.device.name || 'Cámara 1';
    }

    // El clic primario asigna al Slot 1 (Principal)
    programSwitcher.cutTo(peerId, videoEl, label);
    setSlots(programSwitcher.getAllSlots());
  };

  // =========================================================================
  // GESTIÓN DE SALIDA DE MEDIOS (MEDIARECORDER -> IPC -> FFMPEG)
  // =========================================================================

  const startMediaRecorderPipeline = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      return;
    }

    const masterAudio = audioMixer.getMasterAudioStream();
    const combinedStream = programSwitcher.getMasterProgramStream(masterAudio);

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
        videoBitsPerSecond: 12000000, // Alto bitrate para 2.7K
      });

      recorder.ondataavailable = async (event) => {
        if (event.data && event.data.size > 0 && window.electronAPI) {
          const buffer = await event.data.arrayBuffer();
          window.electronAPI.sendMediaChunk(buffer);
        }
      };

      recorder.start(250);
      mediaRecorderRef.current = recorder;
    } catch (err) {
      console.error('[MediaRecorder] Error al iniciar captura:', err);
    }
  }, [audioMixer, programSwitcher]);

  const stopMediaRecorderPipeline = useCallback(() => {
    if (mediaRecorderRef.current) {
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current = null;
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
  // CICLO DE VIDA DE SEÑALIZACIÓN Y DISPOSITIVOS
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

      videoElementsRef.current.delete(peerId);
      audioMixer.removeChannel(peerId);
      setAudioChannels(audioMixer.getAllChannels());

      // Si la cámara eliminada estaba en algún slot, limpiarlo
      slots.forEach((s, idx) => {
        if (s.peerId === peerId) {
          programSwitcher.setSlot(idx, null, null, `Slot ${idx + 1}`);
        }
      });
      setSlots(programSwitcher.getAllSlots());
    };

    audioMixer.onLevelsUpdate = (levels, masterLevel) => {
      setAudioLevels(new Map(levels));
      setMasterAudioLevel(masterLevel);
    };

    programSwitcher.onFpsUpdate = (currentFps) => {
      setFps(currentFps);
    };

    let unsubscribeStats: (() => void) | undefined;
    let unsubscribeErrors: (() => void) | undefined;

    if (window.electronAPI) {
      unsubscribeStats = window.electronAPI.onStreamStats((stats) => setStreamStats(stats));
      unsubscribeErrors = window.electronAPI.onStreamError((err) => alert(`Error: ${err}`));
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

  // Lista de fuentes disponibles para asignar a slots
  const availableSources = useMemo(() => {
    const list: Array<{ id: string; name: string; isScreen?: boolean }> = [];

    if (isScreenSharing && screenStream) {
      list.push({ id: 'screen-share', name: 'Pantalla PC (Screen)', isScreen: true });
    }

    for (const [id, item] of streams.entries()) {
      list.push({ id, name: item.device.name || `Cámara ${id.slice(0, 4)}` });
    }

    return list;
  }, [streams, isScreenSharing, screenStream]);

  // Nombre de la cámara activa en Slot 0
  const activeCameraName = slots[0]?.label || 'STANDBY';

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

        {/* Controles de Grabación, RTMP, NDI y VCam */}
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
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden', padding: '14px', gap: '14px' }}>
        {/* Monitor de Salida Maestra (Program) y Controlador de Layouts */}
        <div style={{ flex: '0 0 46%', display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>
          <ProgramMonitor engine={programSwitcher} activeCameraName={activeCameraName} fps={fps} />

          {/* Controlador de Composición Multicámara (1, 2, 3 o 4 fuentes) y Pantalla PC */}
          <LayoutController
            engine={programSwitcher}
            currentLayout={currentLayout}
            onLayoutChange={handleLayoutChange}
            currentResolution={currentResolution}
            onResolutionChange={handleResolutionChange}
            availableSources={availableSources}
            slots={slots}
            onAssignSlot={(idx, peerId) => handleAssignSlot(idx, peerId)}
            isScreenSharing={isScreenSharing}
            onToggleScreenShare={handleToggleScreenShare}
          />
        </div>

        {/* Cuadrícula Multivista (Cámaras Móviles + Pantalla PC) */}
        <div
          style={{
            flex: 1,
            background: '#090d16',
            borderRadius: '12px',
            border: '1px solid rgba(255,255,255,0.08)',
            padding: '14px',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px' }}>
            <h3 style={{ margin: 0, fontSize: '13px', fontWeight: 700, color: '#94a3b8' }}>
              FUENTES DISPONIBLES ({availableSources.length} ENLACES ACTIVOS)
            </h3>
            <span style={{ fontSize: '11px', color: '#64748b' }}>
              Clic para Slot 1 (Principal) o usa '+ Slot' para asignar a recuadros PiP / Split / Quad
            </span>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))',
              gap: '12px',
              overflowY: 'auto',
              flex: 1,
            }}
          >
            {/* Fuente especial: Compartir Pantalla PC */}
            {isScreenSharing && screenStream && (
              <MultiviewTile
                key="screen-share"
                peerId="screen-share"
                device={{ id: 'screen-share', name: '🖥️ Pantalla PC', role: 'camera' }}
                stream={screenStream}
                isProgram={slots[0]?.peerId === 'screen-share'}
                assignedSlotIndex={slots.findIndex((s) => s.peerId === 'screen-share')}
                audioLevel={audioLevels.get('screen-share')?.level || 0}
                peakDb={audioLevels.get('screen-share')?.peakDb || -60}
                onCutToProgram={handleCutToProgram}
                onAssignToSlot={(slotIdx, pId, vEl) => handleAssignSlot(slotIdx, pId, vEl)}
                isScreen={true}
              />
            )}

            {/* Cámaras móviles conectadas */}
            {Array.from(streams.entries()).map(([peerId, { stream, device }]) => {
              const levelData = audioLevels.get(peerId) || { level: 0, peakDb: -60 };
              const assignedIndex = slots.findIndex((s) => s.peerId === peerId);

              return (
                <MultiviewTile
                  key={peerId}
                  peerId={peerId}
                  device={device}
                  stream={stream}
                  isProgram={slots[0]?.peerId === peerId}
                  assignedSlotIndex={assignedIndex !== -1 ? assignedIndex : undefined}
                  audioLevel={levelData.level}
                  peakDb={levelData.peakDb}
                  onCutToProgram={handleCutToProgram}
                  onAssignToSlot={(slotIdx, pId, vEl) => handleAssignSlot(slotIdx, pId, vEl)}
                  onSendCommand={handleSendCommand}
                />
              );
            })}

            {availableSources.length === 0 && (
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
                <p style={{ margin: '0 0 10px 0', fontSize: '14px' }}>
                  No hay cámaras móviles conectadas ni pantalla compartida.
                </p>
                <div style={{ display: 'flex', gap: '10px' }}>
                  <button
                    onClick={() => setShowQrModal(true)}
                    style={{
                      padding: '8px 14px',
                      background: '#1e293b',
                      color: '#fff',
                      border: '1px solid rgba(255,255,255,0.1)',
                      borderRadius: '6px',
                      cursor: 'pointer',
                    }}
                  >
                    Vincular Móvil (QR)
                  </button>
                  <button
                    onClick={handleToggleScreenShare}
                    style={{
                      padding: '8px 14px',
                      background: '#2563eb',
                      color: '#fff',
                      border: 'none',
                      borderRadius: '6px',
                      cursor: 'pointer',
                    }}
                  >
                    Compartir Pantalla PC
                  </button>
                </div>
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
