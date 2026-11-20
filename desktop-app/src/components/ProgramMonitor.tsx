import React, { useRef, useEffect } from 'react';
import { ProgramSwitcherEngine } from '../video/ProgramSwitcherEngine.js';

interface ProgramMonitorProps {
  engine: ProgramSwitcherEngine;
  activeCameraName: string;
  fps: number;
}

export const ProgramMonitor: React.FC<ProgramMonitorProps> = ({ engine, activeCameraName, fps }) => {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const canvas = engine.getCanvas();
    if (containerRef.current) {
      containerRef.current.innerHTML = '';
      canvas.style.width = '100%';
      canvas.style.height = '100%';
      canvas.style.objectFit = 'contain';
      canvas.style.borderRadius = '8px';
      containerRef.current.appendChild(canvas);
    }
  }, [engine]);

  return (
    <div
      style={{
        background: '#090d16',
        borderRadius: '12px',
        border: '2px solid #dc2626',
        boxShadow: '0 0 24px rgba(220, 38, 38, 0.25)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      {/* Barra de estado Program */}
      <div
        style={{
          background: '#dc2626',
          color: '#fff',
          padding: '6px 14px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          fontWeight: 700,
          fontSize: '12px',
          letterSpacing: '0.8px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span
            style={{
              width: '8px',
              height: '8px',
              borderRadius: '50%',
              background: '#fff',
            }}
          />
          PROGRAM OUTPUT (SALIDA CONTINUA 1080p)
        </div>
        <div style={{ fontFamily: 'monospace', fontSize: '12px' }}>
          {activeCameraName || 'STANDBY'} | {fps} FPS | 1920x1080
        </div>
      </div>

      {/* Lienzo del Canvas Switcher */}
      <div
        ref={containerRef}
        style={{
          width: '100%',
          aspectRatio: '16/9',
          background: '#000',
          position: 'relative',
        }}
      />
    </div>
  );
};
