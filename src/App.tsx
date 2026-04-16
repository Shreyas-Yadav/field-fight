import React, { useCallback, useRef, useState } from 'react';
import { CANVAS_W, CANVAS_H, DEFAULT_STRENGTH, DEFAULT_FIELD_RADIUS, PLAYER_COLORS } from './constants';
import { GamePhase } from './types';
import { useEngine }        from './hooks/useEngine';
import { useMagnets }       from './hooks/useMagnets';
import { useGame }          from './hooks/useGame';
import { useMagnetForce }   from './hooks/useMagnetForce';
import { useFieldRenderer } from './hooks/useFieldRenderer';
import { Controls }    from './components/Controls';
import { SimCanvas }   from './components/SimCanvas';
import { PlayerPanel } from './components/PlayerPanel';

export default function App() {
  // ── Slider state + refs ───────────────────────────────────────────────────
  const [strength,    setStrength]    = useState(DEFAULT_STRENGTH);
  const [fieldRadius, setFieldRadius] = useState(DEFAULT_FIELD_RADIUS);
  const strengthRef    = useRef<number>(DEFAULT_STRENGTH);
  const fieldRadiusRef = useRef<number>(DEFAULT_FIELD_RADIUS);

  const handleStrengthChange = useCallback((v: number) => {
    strengthRef.current = v;
    setStrength(v);
  }, []);
  const handleFieldRadiusChange = useCallback((v: number) => {
    fieldRadiusRef.current = v;
    setFieldRadius(v);
  }, []);

  // ── Canvas ────────────────────────────────────────────────────────────────
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // ── Physics + game hooks (order: engine first, then dependents) ───────────
  const { engineRef, renderRef } = useEngine(canvasRef);

  const { activeMagnetsRef, spawnMagnet, removeBodies, resetMagnets } =
    useMagnets(engineRef);

  const { phase, activePlayer, hands, winner, placeForActivePlayer, resetGame } =
    useGame(engineRef, activeMagnetsRef, spawnMagnet, removeBodies);

  useMagnetForce(engineRef, activeMagnetsRef, strengthRef, fieldRadiusRef);
  useFieldRenderer(renderRef, activeMagnetsRef, fieldRadiusRef);

  // ── Handlers ──────────────────────────────────────────────────────────────
  const handleCanvasMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (phase !== GamePhase.WAITING) return;
    const rect   = e.currentTarget.getBoundingClientRect();
    const scaleX = CANVAS_W / rect.width;
    const scaleY = CANVAS_H / rect.height;
    placeForActivePlayer(
      (e.clientX - rect.left) * scaleX,
      (e.clientY - rect.top)  * scaleY,
    );
  }, [phase, placeForActivePlayer]);

  const handleReset = useCallback(() => {
    resetMagnets();
    resetGame();
  }, [resetMagnets, resetGame]);

  // ── Status banner text ────────────────────────────────────────────────────
  const bannerText: Record<GamePhase, string> = {
    [GamePhase.WAITING]:    `Player ${activePlayer + 1} — click inside the arena to place`,
    [GamePhase.SIMULATING]: 'Simulating…',
    [GamePhase.CHECKING]:   'Checking collisions…',
    [GamePhase.WIN]:        winner !== null ? `Player ${winner + 1} wins! 🎉` : '',
  };
  const bannerColor = phase === GamePhase.WIN && winner !== null
    ? PLAYER_COLORS[winner]
    : PLAYER_COLORS[activePlayer];

  return (
    <div style={styles.page}>
      <h1 style={styles.heading}>Magnet Arena</h1>

      {/* Status banner */}
      <div style={{ ...styles.banner, color: bannerColor, borderColor: bannerColor + '44' }}>
        {bannerText[phase]}
      </div>

      {/* Main row: player panel | canvas | player panel */}
      <div style={styles.gameRow}>
        <PlayerPanel player={0} handCount={hands[0]} phase={phase} activePlayer={activePlayer} />

        <div style={styles.canvasWrap}>
          <SimCanvas
            canvasRef={canvasRef}
            onMouseDown={handleCanvasMouseDown}
          />
          {/* Win overlay */}
          {phase === GamePhase.WIN && winner !== null && (
            <div style={styles.winOverlay}>
              <span style={{ ...styles.winText, color: PLAYER_COLORS[winner] }}>
                Player {winner + 1} wins!
              </span>
              <button
                style={{ ...styles.btn, ...styles.btnPrimary }}
                onClick={handleReset}
              >
                Play again
              </button>
            </div>
          )}
        </div>

        <PlayerPanel player={1} handCount={hands[1]} phase={phase} activePlayer={activePlayer} />
      </div>

      {/* Settings */}
      <Controls
        strength={strength}
        fieldRadius={fieldRadius}
        onStrengthChange={handleStrengthChange}
        onFieldRadiusChange={handleFieldRadiusChange}
        onReset={handleReset}
      />
    </div>
  );
}

const styles = {
  page: {
    display:       'flex',
    flexDirection: 'column' as const,
    alignItems:    'center',
    minHeight:     '100vh',
    padding:       '24px 16px',
    gap:           '16px',
    background:    '#0d1117',
    fontFamily:    `'SF Mono', 'Fira Code', monospace`,
    color:         '#c9d1d9',
  },
  heading: {
    fontSize:      '18px',
    fontWeight:    600,
    color:         '#e6edf3',
    letterSpacing: '0.04em',
  },
  banner: {
    fontSize:     '13px',
    fontWeight:   600,
    padding:      '6px 18px',
    borderRadius: '6px',
    border:       '1px solid',
    letterSpacing: '0.02em',
    transition:   'color 0.2s, border-color 0.2s',
    minHeight:    '30px',
    display:      'flex',
    alignItems:   'center',
  },
  gameRow: {
    display:    'flex',
    alignItems: 'flex-start',
    gap:        '16px',
  },
  canvasWrap: {
    position: 'relative' as const,
    border:       '1px solid #30363d',
    borderRadius: '10px',
    overflow:     'hidden',
    lineHeight:   0,
    boxShadow:    '0 8px 32px rgba(0,0,0,0.5)',
  },
  winOverlay: {
    position:       'absolute' as const,
    inset:          0,
    background:     'rgba(0,0,0,0.72)',
    display:        'flex',
    flexDirection:  'column' as const,
    alignItems:     'center',
    justifyContent: 'center',
    gap:            '24px',
  },
  winText: {
    fontSize:      '48px',
    fontWeight:    700,
    letterSpacing: '0.02em',
  },
  btn: {
    fontFamily:    `'SF Mono', 'Fira Code', monospace`,
    fontSize:      '14px',
    fontWeight:    600,
    padding:       '8px 24px',
    borderRadius:  '6px',
    border:        '1px solid',
    cursor:        'pointer',
    letterSpacing: '0.02em',
  },
  btnPrimary: {
    background:  '#1f6feb',
    borderColor: '#388bfd',
    color:       '#fff',
  },
} satisfies Record<string, React.CSSProperties>;
