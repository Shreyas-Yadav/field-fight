import { useEffect, useRef } from 'react';
import Matter from 'matter-js';
import { CANVAS_W, CANVAS_H, ARENA_RADIUS, FORCE_DISTANCE_CLAMP, PLAYER_COLORS } from '../constants';

const CX = CANVAS_W / 2;
const CY = CANVAS_H / 2;
const SEGMENT_HALF = 6;
const MAX_ALPHA = 0.28;

// Pre-compute grid points inside the arena once
function buildGrid(): Array<{ x: number; y: number }> {
  const points: Array<{ x: number; y: number }> = [];
  const step = 22;
  const limit = ARENA_RADIUS - 14;
  for (let x = CX - ARENA_RADIUS; x <= CX + ARENA_RADIUS; x += step) {
    for (let y = CY - ARENA_RADIUS; y <= CY + ARENA_RADIUS; y += step) {
      const dx = x - CX;
      const dy = y - CY;
      if (dx * dx + dy * dy < limit * limit) {
        points.push({ x, y });
      }
    }
  }
  return points;
}

const GRID = buildGrid();

// Parse hex color to [r, g, b]
function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

const RGB0 = hexToRgb(PLAYER_COLORS[0]);
const RGB1 = hexToRgb(PLAYER_COLORS[1]);

export function useFieldViz(
  renderRef:        React.RefObject<Matter.Render | null>,
  activeMagnetsRef: React.MutableRefObject<Matter.Body[]>,
  strengthRef:      React.RefObject<number>,
) {
  // Store last-drawn grid alpha to smooth fade-in when magnets appear
  const lastAlphasRef = useRef<Float32Array>(new Float32Array(GRID.length));

  useEffect(() => {
    const matterRender = renderRef.current;
    if (!matterRender) return;

    const draw = () => {
      const bodies = activeMagnetsRef.current;
      if (bodies.length === 0) {
        lastAlphasRef.current.fill(0);
        return;
      }

      const ctx = matterRender.context;
      ctx.save();
      ctx.lineWidth = 1.2;

      const strength = strengthRef.current ?? 50;

      for (let gi = 0; gi < GRID.length; gi++) {
        const { x: px, y: py } = GRID[gi];

        let fx = 0, fy = 0;
        let w0 = 0, w1 = 0;

        for (const body of bodies) {
          const dx   = body.position.x - px;
          const dy   = body.position.y - py;
          const dist = Math.max(Math.sqrt(dx * dx + dy * dy), FORCE_DISTANCE_CLAMP);
          const f    = strength / (dist * dist);
          fx += (dx / dist) * f;
          fy += (dy / dist) * f;

          const owner = body.label.charCodeAt(body.label.length - 1) - 48;
          if (owner === 0) w0 += f; else w1 += f;
        }

        const mag = Math.sqrt(fx * fx + fy * fy);
        if (mag < 0.0001) continue;

        const targetAlpha = Math.min(mag / 600, MAX_ALPHA);
        // Smooth fade
        const prev = lastAlphasRef.current[gi];
        const alpha = prev + (targetAlpha - prev) * 0.15;
        lastAlphasRef.current[gi] = alpha;

        if (alpha < 0.005) continue;

        const nx = fx / mag;
        const ny = fy / mag;

        // Blend color between P0 and P1
        const total = w0 + w1 || 1;
        const t = w1 / total;
        const r = Math.round(RGB0[0] + (RGB1[0] - RGB0[0]) * t);
        const g = Math.round(RGB0[1] + (RGB1[1] - RGB0[1]) * t);
        const b = Math.round(RGB0[2] + (RGB1[2] - RGB0[2]) * t);

        ctx.globalAlpha  = alpha;
        ctx.strokeStyle  = `rgb(${r},${g},${b})`;
        ctx.beginPath();
        ctx.moveTo(px - nx * SEGMENT_HALF, py - ny * SEGMENT_HALF);
        ctx.lineTo(px + nx * SEGMENT_HALF, py + ny * SEGMENT_HALF);
        ctx.stroke();
      }

      ctx.restore();
    };

    Matter.Events.on(matterRender, 'afterRender', draw);
    return () => Matter.Events.off(matterRender, 'afterRender', draw);
  }, [renderRef, activeMagnetsRef, strengthRef]);
}
