import React from 'react';
import { CANVAS_W, CANVAS_H } from '../constants';

interface Props {
  canvasRef:    React.RefObject<HTMLCanvasElement | null> | React.MutableRefObject<HTMLCanvasElement | null>;
  onMouseDown:  (e: React.MouseEvent<HTMLCanvasElement>) => void;
}

/**
 * Thin wrapper that renders the <canvas> element Matter.js draws into.
 * All physics and rendering is managed externally via the ref; this component
 * owns nothing stateful.
 */
export function SimCanvas({ canvasRef, onMouseDown }: Props) {
  return (
    <div style={styles.wrap}>
      <canvas
        ref={canvasRef as React.RefObject<HTMLCanvasElement>}
        width={CANVAS_W}
        height={CANVAS_H}
        onMouseDown={onMouseDown}
        style={styles.canvas}
      />
    </div>
  );
}

const styles = {
  wrap: {
    border:       '1px solid #30363d',
    borderRadius: '10px',
    overflow:     'hidden',
    lineHeight:   0,
    boxShadow:    '0 8px 32px rgba(0,0,0,0.5)',
  },
  canvas: {
    display: 'block',
    cursor:  'crosshair',
  },
} satisfies Record<string, React.CSSProperties>;
