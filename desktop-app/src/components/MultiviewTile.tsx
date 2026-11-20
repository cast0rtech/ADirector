import React, { useRef, useEffect } from 'react';
import { DeviceInfo, RemoteCommand } from '../../../types/signaling.js';
import { VuMeter } from './VuMeter.js';

interface MultiviewTileProps {
  peerId: string;
  device: DeviceInfo;
  stream: MediaStream;
  isProgram: boolean;
  audioLevel: number;
  peakDb: number;
  onCutToProgram: (peerId: string, videoEl: HTMLVideoElement) => void;
  onSendCommand: (peerId: string, command: RemoteCommand) => void;
}

export const MultiviewTile: React.FC<MultiviewTileProps> = ({
  peerId,
  device,
  stream,
  isProgram,
  audioLevel,
  peakDb,
  onCutToProgram,
  onSendCommand,
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  const handleTileClick = () => {
    if (videoRef.current) {
      onCutToProgram(peerId, videoRef.current);
    }
  };

  const handleSwitchCamera = (e: React.MouseEvent) => {
    e.stopPropagation();
    onSendCommand(peerId, { action: 'switch-camera' });
  };

  const handleToggleTorch = (e: React.MouseEvent) => {
    e.stopPropagation();
    onSendCommand(peerId, {
      action: 'toggle-torch',
      enabled: !device.torchActive,
    });
  };

  return (
    <div
      onClick={handleTileClick}
      className={`multiview-tile ${isProgram ? 'is-program' : ''}`}
      style={{
        position: 'relative',
        background: '#0f172a',
        borderRadius: '10px',
        overflow: 'hidden',
        cursor: 'pointer',
        border: isProgram ? '3px solid #dc2626' : '1px solid rgba(255,255,255,0.12)',
        boxShadow: isProgram ? '0 0 16px rgba(220, 38, 38, 0.4)' : 'none',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Video Preview */}
      <div style={{ position: 'relative', width: '100%', height: '100%', minHeight: '170px', background: '#000' }}>
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
        />

        {/* Tally Badge Superior */}
        <div
          style={{
            position: 'absolute',
            top: '8px',
            left: '8px',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            padding: '4px 10px',
            borderRadius: '9999px',
            fontSize: '11px',
            fontWeight: 700,
            background: isProgram ? '#dc2626' : 'rgba(15, 23, 42, 0.85)',
            color: '#fff',
            backdropFilter: 'blur(6px)',
          }}
        >
          <span
            style={{
              width: '6px',
              height: '6px',
              borderRadius: '50%',
              background: isProgram ? '#fff' : '#10b981',
            }}
          />
          {isProgram ? 'PROGRAM (AL AIRE)' : device.name || `Cámara ${peerId.slice(0, 4)}`}
        </div>

        {/* Controles Remotos de Cámara (Lente y Linterna) */}
        <div
          style={{
            position: 'absolute',
            top: '8px',
            right: '8px',
            display: 'flex',
            gap: '6px',
          }}
        >
          <button
            onClick={handleSwitchCamera}
            title="Cambiar Lente / Cámara en el móvil"
            style={{
              background: 'rgba(15, 23, 42, 0.85)',
              border: '1px solid rgba(255,255,255,0.2)',
              color: '#fff',
              borderRadius: '6px',
              padding: '4px 8px',
              fontSize: '11px',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            🔄 Lente
          </button>

          <button
            onClick={handleToggleTorch}
            title="Encender/Apagar Linterna remota"
            style={{
              background: device.torchActive ? '#f59e0b' : 'rgba(15, 23, 42, 0.85)',
              color: device.torchActive ? '#000' : '#fff',
              border: '1px solid rgba(255,255,255,0.2)',
              borderRadius: '6px',
              padding: '4px 8px',
              fontSize: '11px',
              cursor: 'pointer',
            }}
          >
            ⚡ Flash
          </button>
        </div>

        {/* Vúmetro overlay a la derecha del tile */}
        <div style={{ position: 'absolute', bottom: '8px', right: '8px' }}>
          <VuMeter level={audioLevel} peakDb={peakDb} height={100} width={8} />
        </div>
      </div>
    </div>
  );
};
