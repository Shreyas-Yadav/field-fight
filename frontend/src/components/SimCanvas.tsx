import React from 'react';
import { CANVAS_W, CANVAS_H } from '../constants';

interface Props {
  canvasRef: React.RefObject<HTMLCanvasElement | null> | React.MutableRefObject<HTMLCanvasElement | null>;
  onPlace:   (clientX: number, clientY: number, target: HTMLCanvasElement) => void;
}

export function SimCanvas({ canvasRef, onPlace }: Props) {
  return (
    <canvas
      ref={canvasRef as React.RefObject<HTMLCanvasElement>}
      width={CANVAS_W}
      height={CANVAS_H}
      className="block w-full h-auto cursor-crosshair"
      style={{ touchAction: 'none' }}
      onMouseDown={e => onPlace(e.clientX, e.clientY, e.currentTarget)}
      onTouchStart={e => {
        e.preventDefault();
        const t = e.touches[0];
        if (t) onPlace(t.clientX, t.clientY, e.currentTarget);
      }}
      onContextMenu={e => e.preventDefault()}
    />
  );
}
