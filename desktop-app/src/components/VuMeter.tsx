import React from 'react';

interface VuMeterProps {
  level: number; // 0.0 a 1.0
  peakDb?: number; // -60 a 0 dB
  height?: number;
  width?: number;
  vertical?: boolean;
}

export const VuMeter: React.FC<VuMeterProps> = ({
  level,
  peakDb = -60,
  height = 140,
  width = 14,
  vertical = true,
}) => {
  // Clampeo entre 0 y 100%
  const percent = Math.min(100, Math.max(0, level * 100));

  return (
    <div
      style={{
        width: vertical ? `${width}px` : '100%',
        height: vertical ? `${height}px` : `${width}px`,
        background: '#090d16',
        borderRadius: '4px',
        border: '1px solid rgba(255, 255, 255, 0.1)',
        position: 'relative',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: vertical ? 'column-reverse' : 'row',
      }}
      title={`${peakDb.toFixed(1)} dB`}
    >
      {/* Fondo degradado broadcast: Verde (-60 a -12dB), Amarillo (-12 a -3dB), Rojo (-3 a 0dB) */}
      <div
        style={{
          width: vertical ? '100%' : `${percent}%`,
          height: vertical ? `${percent}%` : '100%',
          background: vertical
            ? 'linear-gradient(to top, #10b981 0%, #10b981 70%, #f59e0b 85%, #ef4444 100%)'
            : 'linear-gradient(to right, #10b981 0%, #10b981 70%, #f59e0b 85%, #ef4444 100%)',
          transition: 'height 0.05s ease-out, width 0.05s ease-out',
        }}
      />

      {/* Marcas de dB de referencia */}
      {vertical && (
        <>
          <div style={{ position: 'absolute', top: '15%', left: 0, right: 0, borderTop: '1px solid rgba(0,0,0,0.5)' }} />
          <div style={{ position: 'absolute', top: '30%', left: 0, right: 0, borderTop: '1px solid rgba(0,0,0,0.5)' }} />
        </>
      )}
    </div>
  );
};
