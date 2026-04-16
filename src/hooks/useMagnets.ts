import { useCallback, useRef, useState } from 'react';
import Matter from 'matter-js';
import {
  CANVAS_W, CANVAS_H,
  ARENA_RADIUS, MAGNET_RADIUS,
  MAGNET_DENSITY, MAGNET_FRICTION, MAGNET_FRICTION_AIR, MAGNET_RESTITUTION,
  MAGNET_COLORS,
} from '../constants';

export interface MagnetControls {
  activeMagnetsRef: React.MutableRefObject<Matter.Body[]>;
  magnetCount:      number;
  /** Spawn a magnet at (x, y) owned by player 0 or 1. Returns the created body. */
  spawnMagnet:   (x: number, y: number, owner: 0 | 1) => Matter.Body | null;
  removeBodies:  (bodies: Matter.Body[]) => void;
  resetMagnets:  () => void;
}

export function useMagnets(
  engineRef: React.RefObject<Matter.Engine | null>,
): MagnetControls {
  const activeMagnetsRef = useRef<Matter.Body[]>([]);
  const [magnetCount, setMagnetCount] = useState(0);

  const spawnMagnet = useCallback((x: number, y: number, owner: 0 | 1): Matter.Body | null => {
    const engine = engineRef.current;
    if (!engine) return null;

    const body = Matter.Bodies.circle(x, y, MAGNET_RADIUS, {
      density:     MAGNET_DENSITY,
      frictionAir: MAGNET_FRICTION_AIR,
      restitution: MAGNET_RESTITUTION,
      friction:    MAGNET_FRICTION,
      label:       `magnet-${owner}`,
      render: {
        fillStyle:   MAGNET_COLORS[owner],
        strokeStyle: 'rgba(255,255,255,0.15)',
        lineWidth:   1.5,
      },
    });

    // Prevent spinning on off-center collisions
    Matter.Body.setInertia(body, Infinity);
    // Tag owner for any future rendering needs
    (body as Matter.Body & { ownerPlayer: number }).ownerPlayer = owner;

    Matter.Composite.add(engine.world, body);
    activeMagnetsRef.current.push(body);
    setMagnetCount(c => c + 1);
    return body;
  }, [engineRef]);

  const removeBodies = useCallback((bodies: Matter.Body[]) => {
    const engine = engineRef.current;
    if (!engine) return;

    const toRemove = new Set(bodies.map(b => b.id));
    for (const b of bodies) Matter.Composite.remove(engine.world, b);
    activeMagnetsRef.current = activeMagnetsRef.current.filter(b => !toRemove.has(b.id));
    setMagnetCount(activeMagnetsRef.current.length);
  }, [engineRef]);

  const resetMagnets = useCallback(() => {
    const engine = engineRef.current;
    if (!engine) return;
    for (const b of activeMagnetsRef.current) Matter.Composite.remove(engine.world, b);
    activeMagnetsRef.current = [];
    setMagnetCount(0);
  }, [engineRef]);

  return { activeMagnetsRef, magnetCount, spawnMagnet, removeBodies, resetMagnets };
}

// Safe spawn point inside the top half of the arena (used by App for testing)
export function safeSpawnPoint(): { x: number; y: number } {
  const cx   = CANVAS_W / 2;
  const cy   = CANVAS_H / 2;
  const maxR = ARENA_RADIUS - MAGNET_RADIUS - 10;
  const angle  = Math.random() * Math.PI;
  const radius = Math.random() * (maxR - 20) + 20;
  return { x: cx + radius * Math.cos(angle), y: cy - radius * Math.sin(angle) };
}
