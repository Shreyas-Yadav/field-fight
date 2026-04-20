import { useCallback, MutableRefObject } from 'react';
import Matter from 'matter-js';
import { CANVAS_W, CANVAS_H, ARENA_RADIUS, MAGNET_RADIUS } from '../constants';

const ARENA_CENTER = { x: CANVAS_W / 2, y: CANVAS_H / 2 };
const SAFE_RADIUS  = ARENA_RADIUS - MAGNET_RADIUS;
const GRID_STEP    = 15;
const JITTER       = 5;

export function computeAIMove(
  bodies:      Matter.Body[],
  arenaCenter: { x: number; y: number },
  safeRadius:  number,
): { x: number; y: number } {
  const cx = arenaCenter.x;
  const cy = arenaCenter.y;

  // Collect all candidate grid points inside the safe circle
  const candidates: { x: number; y: number }[] = [];
  for (let px = cx - safeRadius; px <= cx + safeRadius; px += GRID_STEP) {
    for (let py = cy - safeRadius; py <= cy + safeRadius; py += GRID_STEP) {
      const dx = px - cx;
      const dy = py - cy;
      if (dx * dx + dy * dy <= safeRadius * safeRadius) {
        candidates.push({ x: px, y: py });
      }
    }
  }

  // No bodies yet — pick a random valid position
  if (bodies.length === 0) {
    const c = candidates[Math.floor(Math.random() * candidates.length)];
    return { x: c.x + jitter(), y: c.y + jitter() };
  }

  // For each candidate, find its minimum distance to any existing body
  let best = candidates[0];
  let bestMinDist = -1;

  for (const c of candidates) {
    let minDist = Infinity;
    for (const body of bodies) {
      const dx = c.x - body.position.x;
      const dy = c.y - body.position.y;
      const d  = Math.sqrt(dx * dx + dy * dy);
      if (d < minDist) minDist = d;
    }
    if (minDist > bestMinDist) {
      bestMinDist = minDist;
      best = c;
    }
  }

  return { x: best.x + jitter(), y: best.y + jitter() };
}

function jitter(): number {
  return (Math.random() * 2 - 1) * JITTER;
}

export function useAI(activeMagnetsRef: MutableRefObject<Matter.Body[]>) {
  const getAIMove = useCallback((): { x: number; y: number } => {
    return computeAIMove(activeMagnetsRef.current, ARENA_CENTER, SAFE_RADIUS);
  }, [activeMagnetsRef]);

  return { getAIMove };
}
