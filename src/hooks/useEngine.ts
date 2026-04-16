import { useEffect, useRef } from 'react';
import Matter from 'matter-js';
import {
  CANVAS_W, CANVAS_H,
  ARENA_RADIUS, ARENA_SEGMENTS,
} from '../constants';

export interface EngineRefs {
  engineRef: React.RefObject<Matter.Engine | null>;
  renderRef: React.RefObject<Matter.Render | null>;
  runnerRef: React.RefObject<Matter.Runner | null>;
}

/**
 * Bootstraps the Matter.js engine, renderer, and runner tied to the provided
 * canvas element. Builds the static arena wall ring. Tears everything down on
 * unmount so React StrictMode double-invoke is safe.
 */
export function useEngine(canvasRef: React.RefObject<HTMLCanvasElement | null>): EngineRefs {
  const engineRef = useRef<Matter.Engine | null>(null);
  const renderRef = useRef<Matter.Render | null>(null);
  const runnerRef = useRef<Matter.Runner | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // ── Engine ──────────────────────────────────────────────────────────────
    const engine = Matter.Engine.create();
    engine.world.gravity.y = 0;
    engineRef.current = engine;

    // ── Renderer ─────────────────────────────────────────────────────────────
    const matterRender = Matter.Render.create({
      canvas,
      engine,
      options: {
        width:      CANVAS_W,
        height:     CANVAS_H,
        background: '#0d1117',
        wireframes: false,
        pixelRatio: window.devicePixelRatio || 1,
      },
    });
    renderRef.current = matterRender;

    // ── Runner ───────────────────────────────────────────────────────────────
    const runner = Matter.Runner.create();
    runnerRef.current = runner;

    Matter.Runner.run(runner, engine);
    Matter.Render.run(matterRender);

    // ── Arena ────────────────────────────────────────────────────────────────
    buildArena(engine.world);

    // ── Cleanup ──────────────────────────────────────────────────────────────
    return () => {
      Matter.Render.stop(matterRender);
      Matter.Runner.stop(runner);
      Matter.Engine.clear(engine);
      Matter.World.clear(engine.world, false);
      engineRef.current = null;
      renderRef.current = null;
      runnerRef.current = null;
    };
  // canvasRef.current is stable after mount; exhaustive-deps would be noise here
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { engineRef, renderRef, runnerRef };
}

// ── Arena construction ──────────────────────────────────────────────────────
function buildArena(world: Matter.World): void {
  const cx = CANVAS_W / 2;
  const cy = CANVAS_H / 2;
  const segAngle = (2 * Math.PI) / ARENA_SEGMENTS;

  for (let i = 0; i < ARENA_SEGMENTS; i++) {
    const mid = i * segAngle + segAngle / 2;
    const wx  = cx + ARENA_RADIUS * Math.cos(mid);
    const wy  = cy + ARENA_RADIUS * Math.sin(mid);
    // chord length between adjacent segment midpoints + 2 px overlap
    const chordLen = 2 * ARENA_RADIUS * Math.sin(segAngle / 2) + 2;

    const seg = Matter.Bodies.rectangle(wx, wy, chordLen, 18, {
      isStatic:    true,
      angle:       mid + Math.PI / 2,
      restitution: 0.3,
      friction:    0.1,
      label:       'wall',
      render: {
        fillStyle:   '#2d333b',
        strokeStyle: '#444c56',
        lineWidth:   1,
      },
    });

    Matter.Composite.add(world, seg);
  }
}
