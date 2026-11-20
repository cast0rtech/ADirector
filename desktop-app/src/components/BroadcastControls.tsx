import React, { useState, useEffect } from 'react';
import { StreamConfig, StreamStats } from '../../electron/ffmpegManager.js';
import { SystemCapabilities } from '../../electron/systemCaps.js';

interface BroadcastControlsProps {
  onStartOutput: (config: StreamConfig) => void;
  onStopOutput: () => void;
  isRecordingActive: boolean;
  isStreamingActive: boolean;
  stats: StreamStats | null;
}

export const BroadcastControls: React.FC<BroadcastControlsProps> = ({
  onStartOutput,
  onStopOutput,
  isRecordingActive,
  isStreamingActive,
  stats,
}) => {
  const [showRtmpModal, setShowRtmpModal] = useState(false);
  const [rtmpUrl, setRtmpUrl] = useState('rtmp://a.rtmp.youtube.com/live2');
  const [rtmpKey, setRtmpKey] = useState('');
  const [videoBitrate, setVideoBitrate] = useState(4500);

  // Estados NDI y Cámara Virtual
  const [isNdiActive, setIsNdiActive] = useState(false);
  const [isVcamActive, setIsVcamActive] = useState(false);
  const [systemCaps, setSystemCaps] = useState<SystemCapabilities | null>(null);

  useEffect(() => {
    if (window.electronAPI) {
      window.electronAPI.getSystemCapabilities().then((caps) => {
        setSystemCaps(caps);
      });

      const unsubNdi = window.electronAPI.onNdiStatus((data) => {
        setIsNdiActive(data.isPublishing);
      });

      const unsubVcam = window.electronAPI.onVirtualCamStatus((data) => {
        setIsVcamActive(data.isActive);
      });

      return () => {
        unsubNdi();
        unsubVcam();
      };
    }
  }, []);

  const formatTime = (totalSeconds: number) => {
    const hrs = Math.floor(totalSeconds / 3600);
    const mins = Math.floor((totalSeconds % 3600) / 60);
    const secs = totalSeconds % 60;
    return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const handleToggleRecord = () => {
    if (isRecordingActive) {
      if (isStreamingActive) {
        onStartOutput({
          recordEnabled: false,
          rtmpEnabled: true,
          rtmpUrl,
          rtmpKey,
          videoBitrateKbps: videoBitrate,
        });
      } else {
        onStopOutput();
      }
    } else {
      onStartOutput({
        recordEnabled: true,
        rtmpEnabled: isStreamingActive,
        rtmpUrl,
        rtmpKey,
        videoBitrateKbps: videoBitrate,
      });
    }
  };

  const handleToggleStream = () => {
    if (isStreamingActive) {
      if (isRecordingActive) {
        onStartOutput({
          recordEnabled: true,
          rtmpEnabled: false,
        });
      } else {
        onStopOutput();
      }
    } else {
      if (!rtmpUrl) {
        setShowRtmpModal(true);
        return;
      }
      onStartOutput({
        recordEnabled: isRecordingActive,
        rtmpEnabled: true,
        rtmpUrl,
        rtmpKey,
        videoBitrateKbps: videoBitrate,
      });
    }
  };

  const handleToggleNdi = async () => {
    if (!window.electronAPI) return;
    if (isNdiActive) {
      await window.electronAPI.stopNdi();
    } else {
      await window.electronAPI.startNdi('ADIRECTOR (Program)');
    }
  };

  const handleToggleVcam = async () => {
    if (!window.electronAPI) return;
    if (isVcamActive) {
      await window.electronAPI.stopVirtualCam();
    } else {
      await window.electronAPI.startVirtualCam();
    }
  };

  const canUseNdi = systemCaps ? systemCaps.supportedOutputs.ndi : true;
  const canUseVcam = systemCaps ? systemCaps.supportedOutputs.virtualCam : true;

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
      {/* Alerta si se detecta ChromeOS con fallbacks activos */}
      {systemCaps?.isChromeOS && (
        <div
          style={{
            fontSize: '11px',
            background: 'rgba(245, 158, 11, 0.15)',
            border: '1px solid #f59e0b',
            color: '#f59e0b',
            padding: '4px 10px',
            borderRadius: '6px',
            fontWeight: 600,
          }}
          title="Modo ChromeOS activo: Grabación MP4 y RTMP habilitadas. NDI y V4L2 desactivadas por restricciones de kernel."
        >
          ⚡ CHROMEOS CROSTINI MODE
        </div>
      )}

      {/* Bitrate monitor */}
      {(isRecordingActive || isStreamingActive) && (
        <div
          style={{
            fontFamily: 'monospace',
            fontSize: '12px',
            background: 'rgba(15, 23, 42, 0.8)',
            padding: '6px 12px',
            borderRadius: '6px',
            border: '1px solid rgba(255,255,255,0.1)',
            color: '#38bdf8',
          }}
        >
          {stats?.currentBitrate || 'Calculando...'}
        </div>
      )}

      {/* Botón SALIDA NDI */}
      <button
        onClick={handleToggleNdi}
        disabled={!canUseNdi}
        title={!canUseNdi ? systemCaps?.reasons.ndi || 'NDI no soportado en este entorno' : 'Transmitir por NDI en LAN (OBS/vMix)'}
        style={{
          padding: '8px 14px',
          borderRadius: '8px',
          border: 'none',
          background: isNdiActive ? '#0284c7' : '#1e293b',
          color: canUseNdi ? '#fff' : '#64748b',
          fontWeight: 700,
          fontSize: '12px',
          cursor: canUseNdi ? 'pointer' : 'not-allowed',
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          boxShadow: isNdiActive ? '0 0 12px rgba(2, 132, 199, 0.6)' : 'none',
          opacity: canUseNdi ? 1 : 0.45,
          transition: 'all 0.2s',
        }}
      >
        <span
          style={{
            width: '8px',
            height: '8px',
            borderRadius: '50%',
            background: isNdiActive ? '#38bdf8' : '#64748b',
          }}
        />
        {isNdiActive ? 'NDI EN VIVO' : 'SALIDA NDI'}
      </button>

      {/* Botón CÁMARA VIRTUAL */}
      <button
        onClick={handleToggleVcam}
        disabled={!canUseVcam}
        title={!canUseVcam ? systemCaps?.reasons.virtualCam || 'Cámara virtual no disponible' : 'Activar como cámara web para Zoom/Meet'}
        style={{
          padding: '8px 14px',
          borderRadius: '8px',
          border: 'none',
          background: isVcamActive ? '#8b5cf6' : '#1e293b',
          color: canUseVcam ? '#fff' : '#64748b',
          fontWeight: 700,
          fontSize: '12px',
          cursor: canUseVcam ? 'pointer' : 'not-allowed',
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          boxShadow: isVcamActive ? '0 0 12px rgba(139, 92, 246, 0.6)' : 'none',
          opacity: canUseVcam ? 1 : 0.45,
          transition: 'all 0.2s',
        }}
      >
        <span
          style={{
            width: '8px',
            height: '8px',
            borderRadius: '50%',
            background: isVcamActive ? '#a78bfa' : '#64748b',
          }}
        />
        {isVcamActive ? 'VCAM ACTIVA' : 'CÁMARA VIRTUAL'}
      </button>

      {/* Botón GRABAR LOCAL */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <button
          onClick={handleToggleRecord}
          style={{
            padding: '8px 14px',
            borderRadius: '8px',
            border: 'none',
            background: isRecordingActive ? '#dc2626' : '#1e293b',
            color: '#fff',
            fontWeight: 700,
            fontSize: '12px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            boxShadow: isRecordingActive ? '0 0 12px rgba(220, 38, 38, 0.5)' : 'none',
          }}
        >
          <span
            style={{
              width: '8px',
              height: '8px',
              borderRadius: '50%',
              background: '#ef4444',
            }}
          />
          {isRecordingActive ? 'GRABANDO' : 'GRABAR'}
        </button>

        {isRecordingActive && (
          <span style={{ fontFamily: 'monospace', fontSize: '12px', color: '#f87171' }}>
            {formatTime(stats?.recordDurationSeconds || 0)}
          </span>
        )}
      </div>

      {/* Botón EMITIR RTMP */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <button
          onClick={handleToggleStream}
          style={{
            padding: '8px 14px',
            borderRadius: '8px',
            border: 'none',
            background: isStreamingActive ? '#16a34a' : '#1e293b',
            color: '#fff',
            fontWeight: 700,
            fontSize: '12px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            boxShadow: isStreamingActive ? '0 0 12px rgba(22, 163, 74, 0.5)' : 'none',
          }}
        >
          <span
            style={{
              width: '8px',
              height: '8px',
              borderRadius: '50%',
              background: '#22c55e',
            }}
          />
          {isStreamingActive ? 'EN VIVO' : 'RTMP'}
        </button>

        {isStreamingActive && (
          <span style={{ fontFamily: 'monospace', fontSize: '12px', color: '#4ade80' }}>
            {formatTime(stats?.streamDurationSeconds || 0)}
          </span>
        )}

        <button
          onClick={() => setShowRtmpModal(true)}
          title="Configuración RTMP"
          style={{
            background: 'transparent',
            border: '1px solid rgba(255,255,255,0.15)',
            color: '#94a3b8',
            borderRadius: '6px',
            padding: '6px 8px',
            cursor: 'pointer',
            fontSize: '12px',
          }}
        >
          ⚙️
        </button>
      </div>

      {/* Modal RTMP */}
      {showRtmpModal && (
        <div
          onClick={() => setShowRtmpModal(false)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.8)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 2000,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: '#0f172a',
              border: '1px solid rgba(255,255,255,0.15)',
              borderRadius: '14px',
              padding: '24px',
              width: '440px',
              display: 'flex',
              flexDirection: 'column',
              gap: '16px',
            }}
          >
            <h3 style={{ margin: 0, fontSize: '16px' }}>Configuración de Salida RTMP / FFmpeg</h3>

            <div>
              <label style={{ fontSize: '12px', color: '#94a3b8', display: 'block', marginBottom: '6px' }}>
                URL del Servidor RTMP:
              </label>
              <input
                type="text"
                value={rtmpUrl}
                onChange={(e) => setRtmpUrl(e.target.value)}
                placeholder="rtmp://a.rtmp.youtube.com/live2"
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  borderRadius: '6px',
                  background: '#1e293b',
                  border: '1px solid rgba(255,255,255,0.1)',
                  color: '#fff',
                  fontSize: '13px',
                }}
              />
            </div>

            <div>
              <label style={{ fontSize: '12px', color: '#94a3b8', display: 'block', marginBottom: '6px' }}>
                Clave de Transmisión (Stream Key):
              </label>
              <input
                type="password"
                value={rtmpKey}
                onChange={(e) => setRtmpKey(e.target.value)}
                placeholder="xxxx-xxxx-xxxx-xxxx"
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  borderRadius: '6px',
                  background: '#1e293b',
                  border: '1px solid rgba(255,255,255,0.1)',
                  color: '#fff',
                  fontSize: '13px',
                }}
              />
            </div>

            <div>
              <label style={{ fontSize: '12px', color: '#94a3b8', display: 'block', marginBottom: '6px' }}>
                Bitrate de Video (H.264):
              </label>
              <select
                value={videoBitrate}
                onChange={(e) => setVideoBitrate(parseInt(e.target.value, 10))}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  borderRadius: '6px',
                  background: '#1e293b',
                  border: '1px solid rgba(255,255,255,0.1)',
                  color: '#fff',
                  fontSize: '13px',
                }}
              >
                <option value={2500}>2500 kbps (720p 30fps estándar)</option>
                <option value={4500}>4500 kbps (1080p 30fps recomendado)</option>
                <option value={6000}>6000 kbps (1080p 60fps alta calidad)</option>
                <option value={8000}>8000 kbps (1080p 60fps máxima fidelidad)</option>
              </select>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px' }}>
              <button
                onClick={() => setShowRtmpModal(false)}
                style={{
                  padding: '8px 16px',
                  borderRadius: '6px',
                  background: '#334155',
                  color: '#fff',
                  border: 'none',
                  cursor: 'pointer',
                }}
              >
                Guardar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
