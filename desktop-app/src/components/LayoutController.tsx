import React from 'react';
import { LayoutMode, ProgramSwitcherEngine, RESOLUTIONS, CompositionSlot } from '../video/ProgramSwitcherEngine.js';

interface SourceOption {
  id: string;
  name: string;
  isScreen?: boolean;
}

interface LayoutControllerProps {
  engine: ProgramSwitcherEngine;
  currentLayout: LayoutMode;
  onLayoutChange: (layout: LayoutMode) => void;
  currentResolution: '1080p' | '1440p' | '2.7k';
  onResolutionChange: (resId: '1080p' | '1440p' | '2.7k') => void;
  availableSources: SourceOption[];
  slots: CompositionSlot[];
  onAssignSlot: (slotIndex: number, peerId: string) => void;
  isScreenSharing: boolean;
  onToggleScreenShare: () => void;
}

export const LayoutController: React.FC<LayoutControllerProps> = ({
  currentLayout,
  onLayoutChange,
  currentResolution,
  onResolutionChange,
  availableSources,
  slots,
  onAssignSlot,
  isScreenSharing,
  onToggleScreenShare,
}) => {
  const layouts: Array<{ id: LayoutMode; label: string; icon: string; minCams: number }> = [
    { id: 'single', label: '1 Cámara (Solo)', icon: '⬛', minCams: 1 },
    { id: 'pip', label: '2 Cámaras (PiP)', icon: '◲', minCams: 2 },
    { id: 'split', label: '2 Cámaras (Split)', icon: '◫', minCams: 2 },
    { id: 'triview', label: '3 Cámaras (Tri-View)', icon: '⬓', minCams: 3 },
    { id: 'quad', label: '4 Cámaras (Grid 2x2)', icon: 'boxplus;', minCams: 4 },
  ];

  // Determinar cuántos slots deben mostrarse según el layout
  const visibleSlotCount =
    currentLayout === 'single' ? 1 :
    currentLayout === 'pip' || currentLayout === 'split' ? 2 :
    currentLayout === 'triview' ? 3 : 4;

  return (
    <div
      style={{
        background: '#090d16',
        borderRadius: '10px',
        padding: '12px 16px',
        border: '1px solid rgba(255, 255, 255, 0.1)',
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
        marginTop: '10px',
      }}
    >
      {/* Fila 1: Selector de Layout y Selector de Resolución (hasta 2.7K) */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
        {/* Botones de Layouts (1, 2, 3 o 4 cámaras) */}
        <div style={{ display: 'flex', gap: '6px' }}>
          {layouts.map((l) => (
            <button
              key={l.id}
              onClick={() => onLayoutChange(l.id)}
              style={{
                padding: '6px 12px',
                borderRadius: '6px',
                border: 'none',
                background: currentLayout === l.id ? '#2563eb' : '#1e293b',
                color: '#fff',
                fontWeight: currentLayout === l.id ? 700 : 500,
                fontSize: '12px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                boxShadow: currentLayout === l.id ? '0 0 10px rgba(37, 99, 235, 0.5)' : 'none',
                transition: 'all 0.15s ease',
              }}
              title={l.label}
            >
              <span style={{ fontSize: '13px' }}>{l.icon}</span>
              {l.label}
            </button>
          ))}
        </div>

        {/* Selector de Resolución hasta 2.7K */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 600 }}>RESOLUCIÓN:</span>
          <select
            value={currentResolution}
            onChange={(e) => onResolutionChange(e.target.value as any)}
            style={{
              padding: '6px 10px',
              borderRadius: '6px',
              background: '#1e293b',
              border: '1px solid rgba(255,255,255,0.15)',
              color: '#38bdf8',
              fontSize: '12px',
              fontWeight: 700,
              cursor: 'pointer',
              outline: 'none',
            }}
          >
            <option value="1080p">1080p Full HD (1920x1080)</option>
            <option value="1440p">1440p 2K QHD (2560x1440)</option>
            <option value="2.7k">2.7K Ultra HD (2720x1530)</option>
          </select>

          {/* Botón Compartir Pantalla del PC */}
          <button
            onClick={onToggleScreenShare}
            style={{
              padding: '6px 12px',
              borderRadius: '6px',
              border: 'none',
              background: isScreenSharing ? '#16a34a' : '#334155',
              color: '#fff',
              fontSize: '12px',
              fontWeight: 700,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              boxShadow: isScreenSharing ? '0 0 10px rgba(22, 163, 74, 0.5)' : 'none',
            }}
            title="Capturar y emitir la pantalla completa o ventana del PC"
          >
            🖥️ {isScreenSharing ? 'PANTALLA PC EN VIVO' : 'COMPARTIR PANTALLA PC'}
          </button>
        </div>
      </div>

      {/* Fila 2: Asignación Lógica de Slots (Permite asociar cámaras a cada recuadro del diseño) */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${visibleSlotCount}, 1fr)`,
          gap: '8px',
          paddingTop: '8px',
          borderTop: '1px solid rgba(255, 255, 255, 0.06)',
        }}
      >
        {slots.slice(0, visibleSlotCount).map((slot, index) => {
          const slotTitles = ['SLOT 1 (PRINCIPAL)', 'SLOT 2', 'SLOT 3', 'SLOT 4'];
          return (
            <div
              key={index}
              style={{
                background: '#131b2e',
                borderRadius: '6px',
                padding: '6px 10px',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                display: 'flex',
                flexDirection: 'column',
                gap: '4px',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '10px', color: '#64748b', fontWeight: 700 }}>
                  {slotTitles[index]}
                </span>
                {slot.peerId && (
                  <span
                    style={{
                      width: '6px',
                      height: '6px',
                      borderRadius: '50%',
                      background: '#10b981',
                    }}
                  />
                )}
              </div>

              <select
                value={slot.peerId || ''}
                onChange={(e) => onAssignSlot(index, e.target.value)}
                style={{
                  padding: '4px 8px',
                  borderRadius: '4px',
                  background: '#1e293b',
                  border: '1px solid rgba(255,255,255,0.1)',
                  color: '#fff',
                  fontSize: '11px',
                  outline: 'none',
                  cursor: 'pointer',
                }}
              >
                <option value="">-- Vacío / Sin Asignar --</option>
                {availableSources.map((src) => (
                  <option key={src.id} value={src.id}>
                    {src.isScreen ? '🖥️ ' : '📱 '}
                    {src.name}
                  </option>
                ))}
              </select>
            </div>
          );
        })}
      </div>
    </div>
  );
};
