import { useEffect } from 'react';
import Matter from 'matter-js';
import { FORCE_DISTANCE_CLAMP } from '../constants';

/**
 * Registers the inverse-square attractive force between every unique pair of
 * active magnets. Reads strength and field radius from refs on every tick so
 * slider changes are reflected immediately without re-subscribing.
 *
 * F = strength / clamp(r, FORCE_DISTANCE_CLAMP)²
 *
 * Cleans up the event listener on unmount.
 */
export function useMagnetForce(
  engineRef:        React.RefObject<Matter.Engine | null>,
  activeMagnetsRef: React.MutableRefObject<Matter.Body[]>,
  strengthRef:      React.MutableRefObject<number>,
  fieldRadiusRef:   React.MutableRefObject<number>,
): void {
  useEffect(() => {
    const engine = engineRef.current;
    if (!engine) return;

    function applyForces() {
      const magnets    = activeMagnetsRef.current;
      const strength   = strengthRef.current;
      const fieldRadius = fieldRadiusRef.current;
      const n          = magnets.length;

      for (let i = 0; i < n - 1; i++) {
        for (let j = i + 1; j < n; j++) {
          const a = magnets[i];
          const b = magnets[j];

          const dx       = b.position.x - a.position.x;
          const dy       = b.position.y - a.position.y;
          const distance = Math.sqrt(dx * dx + dy * dy);

          if (distance > fieldRadius) continue;

          const clampedDist = Math.max(distance, FORCE_DISTANCE_CLAMP);
          const forceMag    = strength / (clampedDist * clampedDist);

          // Normalised direction vector a → b
          const ux = dx / distance;
          const uy = dy / distance;

          Matter.Body.applyForce(a, a.position, {  x:  forceMag * ux, y:  forceMag * uy });
          Matter.Body.applyForce(b, b.position, {  x: -forceMag * ux, y: -forceMag * uy });
        }
      }
    }

    Matter.Events.on(engine, 'beforeUpdate', applyForces);
    return () => Matter.Events.off(engine, 'beforeUpdate', applyForces);
  }, [engineRef, activeMagnetsRef, strengthRef, fieldRadiusRef]);
}
