import { useEffect } from 'react';
import Matter from 'matter-js';

/**
 * Draws a dashed field-radius ring around each active magnet after every
 * Matter.js render frame. Reads the current field radius from a ref so the
 * visualisation updates instantly as the slider moves.
 *
 * Cleans up the event listener on unmount.
 */
export function useFieldRenderer(
  renderRef:        React.RefObject<Matter.Render | null>,
  activeMagnetsRef: React.MutableRefObject<Matter.Body[]>,
  fieldRadiusRef:   React.MutableRefObject<number>,
): void {
  useEffect(() => {
    const matterRender = renderRef.current;
    if (!matterRender) return;

    function drawFieldRings() {
      const ctx         = matterRender!.context;
      const fieldRadius = fieldRadiusRef.current;

      ctx.save();
      ctx.setLineDash([5, 5]);
      ctx.lineWidth   = 1;
      ctx.strokeStyle = '#888';

      for (const body of activeMagnetsRef.current) {
        ctx.beginPath();
        ctx.arc(body.position.x, body.position.y, fieldRadius, 0, 2 * Math.PI);
        ctx.stroke();
      }

      ctx.restore();
    }

    Matter.Events.on(matterRender, 'afterRender', drawFieldRings);
    return () => Matter.Events.off(matterRender, 'afterRender', drawFieldRings);
  }, [renderRef, activeMagnetsRef, fieldRadiusRef]);
}
