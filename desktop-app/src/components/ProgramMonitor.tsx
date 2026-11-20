import React, { useRef, useEffect } from 'react';
import { ProgramSwitcherEngine, RESOLUTIONS } from '../video/ProgramSwitcherEngine.js';

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
  }, [engine, engine.width, engine.height]);

  const resConfig = RESOLUTIONS[engine.currentResolutionId] || { width: 1920, height: 1080 };
  const layoutNames: Record<string, string> = {
    single: '1 CÁMARA (SOLO)',
    pip: '2 CÁMARAS (PiP)',
    split: '2 CÁMARAS (SPLIT)',
    triview: '3 CÁMARAS (TRI-VIEW)',
    quad: '4 CÁMARAS (GRID 2x2)',
  };

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
          SALIDA PROGRAM ({layoutNames[engine.currentLayout] || 'SOLO'})
        </div>
        <div style={{ fontFamily: 'monospace', fontSize: '12px' }}>
          {activeCameraName || 'STANDBY'} | {fps} FPS | {resConfig.width}x{resConfig.height}
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
