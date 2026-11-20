import React from 'react';
import { AudioChannelState } from '../audio/AudioMixerEngine.js';
import { VuMeter } from './VuMeter.js';

interface AudioMixerDockProps {
  channels: AudioChannelState[];
  masterLevel: number;
  onVolumeChange: (peerId: string, volume: number) => void;
  onToggleMute: (peerId: string) => void;
  onToggleSolo: (peerId: string) => void;
  onMasterVolumeChange: (volume: number) => void;
}

export const AudioMixerDock: React.FC<AudioMixerDockProps> = ({
  channels,
  masterLevel,
  onVolumeChange,
  onToggleMute,
  onToggleSolo,
  onMasterVolumeChange,
}) => {
  return (
    <div
      style={{
        background: '#090d16',
        borderTop: '1px solid rgba(255, 255, 255, 0.1)',
        padding: '16px 20px',
        display: 'flex',
        gap: '24px',
        alignItems: 'stretch',
        overflowX: 'auto',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', minWidth: '130px' }}>
        <div>
          <h4 style={{ margin: 0, fontSize: '14px', color: '#f8fafc', fontWeight: 700 }}>
            MEZCLADOR DE AUDIO
          </h4>
          <span style={{ fontSize: '11px', color: '#64748b' }}>Web Audio API Bus</span>
        </div>
      </div>

      {/* Canales individuales por teléfono */}
      <div style={{ display: 'flex', gap: '16px', flex: 1, overflowX: 'auto' }}>
        {channels.map((ch) => (
          <div
            key={ch.peerId}
            style={{
              background: '#131b2e',
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: '8px',
              padding: '12px 14px',
              minWidth: '110px',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '10px',
            }}
          >
            <span
              style={{
                fontSize: '11px',
                fontWeight: 600,
                color: '#cbd5e1',
                maxWidth: '90px',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
              title={ch.name}
            >
              {ch.name}
            </span>

            {/* Vúmetro y Fader Vertical */}
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <VuMeter level={ch.level} peakDb={ch.peakDb} height={90} width={10} />
              <input
                type="range"
                min="0"
                max="1.5"
                step="0.02"
                value={ch.volume}
                onChange={(e) => onVolumeChange(ch.peerId, parseFloat(e.target.value))}
                style={{
                  writingMode: 'vertical-lr',
                  direction: 'rtl',
                  height: '90px',
                  width: '20px',
                  cursor: 'pointer',
                  accentColor: '#3b82f6',
                }}
              />
            </div>

            {/* Botones MUTE / SOLO */}
            <div style={{ display: 'flex', gap: '6px', width: '100%' }}>
              <button
                onClick={() => onToggleMute(ch.peerId)}
                style={{
                  flex: 1,
                  padding: '4px',
                  borderRadius: '4px',
                  border: 'none',
                  fontSize: '10px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  background: ch.isMuted ? '#dc2626' : '#334155',
                  color: '#fff',
                }}
              >
                M
              </button>
              <button
                onClick={() => onToggleSolo(ch.peerId)}
                style={{
                  flex: 1,
                  padding: '4px',
                  borderRadius: '4px',
                  border: 'none',
                  fontSize: '10px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  background: ch.isSolo ? '#f59e0b' : '#334155',
                  color: ch.isSolo ? '#000' : '#fff',
                }}
              >
                S
              </button>
            </div>
          </div>
        ))}

        {channels.length === 0 && (
          <div style={{ color: '#475569', fontSize: '12px', display: 'flex', alignItems: 'center' }}>
            No hay micrófonos móviles conectados.
          </div>
        )}
      </div>

      {/* Master Bus Channel */}
      <div
        style={{
          background: '#1e293b',
          border: '1px solid rgba(255,255,255,0.15)',
          borderRadius: '8px',
          padding: '12px 16px',
          minWidth: '120px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '10px',
        }}
      >
        <span style={{ fontSize: '12px', fontWeight: 700, color: '#f8fafc' }}>MASTER</span>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <VuMeter level={masterLevel} height={90} width={12} />
          <input
            type="range"
            min="0"
            max="1.5"
            step="0.02"
            defaultValue="1.0"
            onChange={(e) => onMasterVolumeChange(parseFloat(e.target.value))}
            style={{
              writingMode: 'vertical-lr',
              direction: 'rtl',
              height: '90px',
              width: '20px',
              cursor: 'pointer',
              accentColor: '#10b981',
            }}
          />
        </div>
        <span style={{ fontSize: '10px', color: '#94a3b8' }}>Salida Directa</span>
      </div>
    </div>
  );
};
