import { useCallback, useEffect, useRef } from 'react';
import Matter from 'matter-js';
import { PLAYER_COLORS } from '../constants';

interface Particle {
  x: number; y: number;
  vx: number; vy: number;
  life: number; maxLife: number;
  color: string; r: number;
}

export function useParticles(
  renderRef: React.RefObject<Matter.Render | null>,
) {
  const particlesRef = useRef<Particle[]>([]);

  const spawnExplosion = useCallback((bodies: Matter.Body[]) => {
    for (const body of bodies) {
      const owner = parseInt(body.label.split('-')[1] ?? '0', 10) as 0 | 1;
      const color = PLAYER_COLORS[owner] ?? PLAYER_COLORS[0];

      for (let i = 0; i < 22; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = 3 + Math.random() * 5;
        const life  = 35 + Math.floor(Math.random() * 15);
        particlesRef.current.push({
          x: body.position.x,
          y: body.position.y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          life,
          maxLife: life,
          color,
          r: 3 + Math.random() * 3,
        });
      }
    }
  }, []);

  useEffect(() => {
    const matterRender = renderRef.current;
    if (!matterRender) return;

    const draw = () => {
      const ps = particlesRef.current;
      if (ps.length === 0) return;

      const ctx = matterRender.context;
      ctx.save();

      const alive: Particle[] = [];
      for (const p of ps) {
        p.vx *= 0.92;
        p.vy *= 0.92;
        p.x  += p.vx;
        p.y  += p.vy;
        p.life--;

        if (p.life <= 0) continue;
        alive.push(p);

        const t = p.life / p.maxLife;
        ctx.globalAlpha = t;
        ctx.fillStyle   = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r * t, 0, Math.PI * 2);
        ctx.fill();
      }

      particlesRef.current = alive;
      ctx.restore();
    };

    Matter.Events.on(matterRender, 'afterRender', draw);
    return () => Matter.Events.off(matterRender, 'afterRender', draw);
  }, [renderRef]);

  return { spawnExplosion };
}
