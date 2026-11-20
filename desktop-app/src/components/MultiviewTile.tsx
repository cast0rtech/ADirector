import React, { useRef, useEffect } from 'react';
import { DeviceInfo, RemoteCommand } from '../../../types/signaling.js';
import { VuMeter } from './VuMeter.js';

interface MultiviewTileProps {
  peerId: string;
  device: DeviceInfo;
  stream: MediaStream;
  isProgram: boolean;
  assignedSlotIndex?: number; // 0, 1, 2, 3 o undefined
  audioLevel: number;
  peakDb: number;
  onCutToProgram: (peerId: string, videoEl: HTMLVideoElement) => void;
  onAssignToSlot?: (slotIndex: number, peerId: string, videoEl: HTMLVideoElement) => void;
  onSendCommand?: (peerId: string, command: RemoteCommand) => void;
  isScreen?: boolean;
}

export const MultiviewTile: React.FC<MultiviewTileProps> = ({
  peerId,
  device,
  stream,
  isProgram,
  assignedSlotIndex,
  audioLevel,
  peakDb,
  onCutToProgram,
  onAssignToSlot,
  onSendCommand,
  isScreen = false,
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
    onSendCommand?.(peerId, { action: 'switch-camera' });
  };

  const handleToggleTorch = (e: React.MouseEvent) => {
    e.stopPropagation();
    onSendCommand?.(peerId, {
      action: 'toggle-torch',
      enabled: !device.torchActive,
    });
  };

  const handleSlotSelect = (e: React.ChangeEvent<HTMLSelectElement>) => {
    e.stopPropagation();
    const slotIdx = parseInt(e.target.value, 10);
    if (!isNaN(slotIdx) && videoRef.current) {
      onAssignToSlot?.(slotIdx, peerId, videoRef.current);
    }
  };

  const isAssigned = assignedSlotIndex !== undefined;

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
        border: isProgram
          ? '3px solid #dc2626'
          : isAssigned
          ? '2px solid #2563eb'
          : '1px solid rgba(255,255,255,0.12)',
        boxShadow: isProgram
          ? '0 0 16px rgba(220, 38, 38, 0.4)'
          : isAssigned
          ? '0 0 12px rgba(37, 99, 235, 0.3)'
          : 'none',
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
            background: isProgram ? '#dc2626' : isAssigned ? '#1d4ed8' : 'rgba(15, 23, 42, 0.85)',
            color: '#fff',
            backdropFilter: 'blur(6px)',
          }}
        >
          <span
            style={{
              width: '6px',
              height: '6px',
              borderRadius: '50%',
              background: isProgram ? '#fff' : isAssigned ? '#60a5fa' : '#10b981',
            }}
          />
          {isProgram
            ? 'PROGRAM (AL AIRE)'
            : isAssigned
            ? `SLOT ${assignedSlotIndex + 1} (${device.name || 'Cámara'})`
            : device.name || `Cámara ${peerId.slice(0, 4)}`}
        </div>

        {/* Controles Remotos / Acciones Rápidas */}
        <div
          style={{
            position: 'absolute',
            top: '8px',
            right: '8px',
            display: 'flex',
            gap: '6px',
          }}
        >
          {/* Selector Rápido de Slot de Composición */}
          {onAssignToSlot && (
            <select
              value={assignedSlotIndex !== undefined ? assignedSlotIndex : ''}
              onClick={(e) => e.stopPropagation()}
              onChange={handleSlotSelect}
              title="Asignar esta cámara a un recuadro de la salida"
              style={{
                background: 'rgba(15, 23, 42, 0.85)',
                border: '1px solid rgba(255,255,255,0.25)',
                color: '#38bdf8',
                borderRadius: '6px',
                padding: '3px 6px',
                fontSize: '10px',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              <option value="">+ Slot...</option>
              <option value="0">Slot 1 (Principal)</option>
              <option value="1">Slot 2</option>
              <option value="2">Slot 3</option>
              <option value="3">Slot 4</option>
            </select>
          )}

          {!isScreen && onSendCommand && (
            <>
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
                🔄
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
                ⚡
              </button>
            </>
          )}
        </div>

        {/* Vúmetro overlay a la derecha del tile */}
        <div style={{ position: 'absolute', bottom: '8px', right: '8px' }}>
          <VuMeter level={audioLevel} peakDb={peakDb} height={100} width={8} />
        </div>
      </div>
    </div>
  );
};
