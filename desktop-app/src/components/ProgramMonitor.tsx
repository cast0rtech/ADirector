import React, { useRef, useEffect, useState } from 'react';
import { ProgramSwitcherEngine, RESOLUTIONS } from '../video/ProgramSwitcherEngine.js';

interface ProgramMonitorProps {
  engine: ProgramSwitcherEngine;
  activeCameraName: string;
  fps: number;
  isHeadphoneAuditActive?: boolean;
  isRecording?: boolean;
  isStreaming?: boolean;
}

export const ProgramMonitor: React.FC<ProgramMonitorProps> = ({
  engine,
  activeCameraName,
  fps,
  isHeadphoneAuditActive = false,
  isRecording = false,
  isStreaming = false,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const monitorWrapperRef = useRef<HTMLDivElement>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

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

  useEffect(() => {
    const handleFsChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFsChange);
    return () => document.removeEventListener('fullscreenchange', handleFsChange);
  }, []);

  const toggleFullscreen = () => {
    if (!monitorWrapperRef.current) return;
    if (!document.fullscreenElement) {
      monitorWrapperRef.current.requestFullscreen().catch((err) => {
        console.warn('Error al solicitar pantalla completa:', err);
      });
    } else {
      document.exitFullscreen().catch((err) => {
        console.warn('Error al salir de pantalla completa:', err);
      });
    }
  };

  const resConfig = RESOLUTIONS[engine.currentResolutionId] || { width: 1920, height: 1080 };
  const layoutNames: Record<string, string> = {
    single: '1 CÁMARA (SOLO)',
    pip: '2 CÁMARAS (PiP)',
    split: '2 CÁMARAS (SPLIT)',
    triview: '3 CÁMARAS (TRI-VIEW)',
    quad: '4 CÁMARAS (QUAD 2x2)',
  };

  // Obtener slots activos para la auditoría técnica
  const activeSlots = engine.getAllSlots().filter((s) => s.peerId);

  return (
    <div
      ref={monitorWrapperRef}
      style={{
        background: '#090d16',
        borderRadius: isFullscreen ? '0' : '12px',
        border: isFullscreen ? 'none' : '2px solid #dc2626',
        boxShadow: '0 0 24px rgba(220, 38, 38, 0.25)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        height: isFullscreen ? '100vh' : 'auto',
      }}
    >
      {/* Barra de estado Program / Auditoría Técnica */}
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
              boxShadow: '0 0 6px #fff',
              animation: 'pulse 1.5s infinite',
            }}
          />
          SALIDA PROGRAM ({layoutNames[engine.currentLayout] || 'SOLO'})
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          {isHeadphoneAuditActive && (
            <span
              style={{
                background: 'rgba(0,0,0,0.3)',
                padding: '2px 8px',
                borderRadius: '4px',
                fontSize: '11px',
                color: '#6ee7b7',
              }}
            >
              🎧 AUDIT AUDIO ON
            </span>
          )}

          {isRecording && (
            <span
              style={{
                background: '#000',
                padding: '2px 6px',
                borderRadius: '4px',
                fontSize: '10px',
                color: '#ef4444',
                fontWeight: 800,
              }}
            >
              ● REC
            </span>
          )}

          {isStreaming && (
            <span
              style={{
                background: '#000',
                padding: '2px 6px',
                borderRadius: '4px',
                fontSize: '10px',
                color: '#10b981',
                fontWeight: 800,
              }}
            >
              ● LIVE
            </span>
          )}

          <span style={{ fontFamily: 'monospace', fontSize: '11px', color: '#fecaca' }}>
            {resConfig.width}x{resConfig.height} @ {fps} FPS
          </span>

          {/* Botón Pantalla Completa para auditoría en monitor dedicado */}
          <button
            onClick={toggleFullscreen}
            style={{
              background: 'rgba(255,255,255,0.2)',
              border: 'none',
              borderRadius: '4px',
              color: '#fff',
              padding: '2px 8px',
              cursor: 'pointer',
              fontSize: '11px',
              fontWeight: 600,
            }}
            title="Auditoría a Pantalla Completa"
          >
            {isFullscreen ? '✕ Salir' : '⛶ Fullscreen'}
          </button>
        </div>
      </div>

      {/* Lienzo del Canvas Switcher */}
      <div
        ref={containerRef}
        style={{
          width: '100%',
          flex: isFullscreen ? 1 : undefined,
          aspectRatio: isFullscreen ? undefined : '16/9',
          background: '#000',
          position: 'relative',
        }}
      />

      {/* Tira inferior de Auditoría de Composición */}
      <div
        style={{
          background: '#0b1120',
          padding: '6px 14px',
          borderTop: '1px solid rgba(255,255,255,0.08)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          fontSize: '11px',
          color: '#94a3b8',
        }}
      >
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <span style={{ color: '#cbd5e1', fontWeight: 600 }}>Fuentes en Salida:</span>
          {activeSlots.length > 0 ? (
            activeSlots.map((s, idx) => (
              <span
                key={idx}
                style={{
                  background: '#1e293b',
                  padding: '2px 6px',
                  borderRadius: '4px',
                  border: '1px solid rgba(255,255,255,0.1)',
                  color: idx === 0 ? '#f87171' : '#60a5fa',
                  fontWeight: 600,
                }}
              >
                Slot {idx + 1}: {s.label}
              </span>
            ))
          ) : (
            <span style={{ color: '#64748b' }}>Sin fuentes activas (STANDBY)</span>
          )}
        </div>

        <span style={{ color: '#64748b', fontSize: '10px' }}>
          Motor WebGL 60fps con corrección de relación de aspecto 16:9
        </span>
      </div>
    </div>
  );
};
