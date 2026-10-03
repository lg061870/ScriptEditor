import { useState, useRef, useCallback } from 'react';

export interface ResizeHandleProps {
  direction: 'col' | 'row';
  onResize: (delta: number) => void;
  onReset?: () => void;
  'data-testid'?: string;
}

/**
 * Visual Studio-style draggable panel splitter.
 *
 * Provides a 6px hover hit target with col-resize (↔) or row-resize (↕) cursor.
 * While hovering or active, renders a crisp VS-blue (#007acc) highlight.
 * Uses pointer capture to guarantee tracking across iframes and canvas surfaces.
 */
export function ResizeHandle({ direction, onResize, onReset, 'data-testid': testId }: ResizeHandleProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const lastPosRef = useRef<number>(0);

  const isCol = direction === 'col';

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();
      if (typeof e.currentTarget.setPointerCapture === 'function') {
        try {
          e.currentTarget.setPointerCapture(e.pointerId);
        } catch {
          // Pointer capture may fail or be unsupported in test environments
        }
      }
      setIsDragging(true);
      lastPosRef.current = isCol ? e.clientX : e.clientY;

      document.body.style.cursor = isCol ? 'col-resize' : 'row-resize';
      document.body.style.userSelect = 'none';
    },
    [isCol],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!isDragging) return;
      e.preventDefault();
      const currentPos = isCol ? e.clientX : e.clientY;
      const delta = currentPos - lastPosRef.current;
      lastPosRef.current = currentPos;
      onResize(delta);
    },
    [isDragging, isCol, onResize],
  );

  const handlePointerUp = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!isDragging) return;
      e.preventDefault();
      if (typeof e.currentTarget.releasePointerCapture === 'function') {
        try {
          e.currentTarget.releasePointerCapture(e.pointerId);
        } catch {
          // Pointer capture may have already been released
        }
      }
      setIsDragging(false);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    },
    [isDragging],
  );

  const handleDoubleClick = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      onReset?.();
    },
    [onReset],
  );

  return (
    <div
      data-testid={testId ?? (isCol ? 'resize-handle-col' : 'resize-handle-row')}
      role="separator"
      aria-orientation={isCol ? 'vertical' : 'horizontal'}
      title="Drag to resize panel (Double-click to reset)"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onDoubleClick={handleDoubleClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={{
        width: isCol ? 6 : '100%',
        height: isCol ? '100%' : 6,
        cursor: isCol ? 'col-resize' : 'row-resize',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
        position: 'relative',
        zIndex: 15,
        touchAction: 'none',
        userSelect: 'none',
        // In col mode, we occupy 6px centered between panels
        margin: isCol ? '0 -3px' : '-3px 0',
      }}
    >
      {/* Visual line indicator */}
      <div
        style={{
          width: isCol ? (isDragging || isHovered ? 3 : 1) : '100%',
          height: isCol ? '100%' : isDragging || isHovered ? 3 : 1,
          background: isDragging ? '#007acc' : isHovered ? '#007acc' : '#e5e7eb',
          transition: isDragging ? 'none' : 'background 0.15s ease, width 0.15s ease, height 0.15s ease',
          pointerEvents: 'none',
        }}
      />
    </div>
  );
}
