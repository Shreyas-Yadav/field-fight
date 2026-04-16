import React from 'react';
import { GamePhase } from '../types';
import { PLAYER_COLORS } from '../constants';

interface Props {
  player:      0 | 1;
  handCount:   number;
  phase:       GamePhase;
  activePlayer: 0 | 1;
}

export function PlayerPanel({ player, handCount, phase, activePlayer }: Props) {
  const color    = PLAYER_COLORS[player];
  const isActive = activePlayer === player && phase !== GamePhase.WIN;
  const label    = player === 0 ? 'Player 1' : 'Player 2';

  return (
    <div style={{ ...styles.panel, borderColor: isActive ? color : '#30363d' }}>
      {/* Header */}
      <div style={styles.header}>
        <span style={{ ...styles.dot, background: color }} />
        <span style={{ ...styles.name, color: isActive ? color : '#8b949e' }}>{label}</span>
      </div>

      {/* Turn badge */}
      <div style={{
        ...styles.turnBadge,
        opacity:     isActive ? 1 : 0,
        background:  color + '22',
        color,
        borderColor: color + '55',
      }}>
        {phase === GamePhase.SIMULATING ? 'Placed…' : 'Your turn'}
      </div>

      {/* Hand count */}
      <div style={styles.countRow}>
        <span style={{ ...styles.countNum, color: isActive ? '#e6edf3' : '#8b949e' }}>
          {handCount}
        </span>
        <span style={styles.countLabel}>in hand</span>
      </div>

      {/* Visual magnet dots */}
      <div style={styles.dotsWrap}>
        {Array.from({ length: handCount }, (_, i) => (
          <div
            key={i}
            style={{ ...styles.magnetDot, background: color, opacity: isActive ? 1 : 0.5 }}
          />
        ))}
      </div>
    </div>
  );
}

const styles = {
  panel: {
    display:       'flex',
    flexDirection: 'column' as const,
    alignItems:    'center',
    gap:           '10px',
    width:         '100px',
    padding:       '14px 10px',
    background:    '#161b22',
    border:        '1px solid',
    borderRadius:  '10px',
    transition:    'border-color 0.2s',
    flexShrink:    0,
  },
  header: {
    display:    'flex',
    alignItems: 'center',
    gap:        '6px',
  },
  dot: {
    width:        '10px',
    height:       '10px',
    borderRadius: '50%',
    flexShrink:   0,
  },
  name: {
    fontFamily:    `'SF Mono', 'Fira Code', monospace`,
    fontSize:      '11px',
    fontWeight:    600,
    letterSpacing: '0.02em',
    whiteSpace:    'nowrap' as const,
  },
  turnBadge: {
    fontFamily:    `'SF Mono', 'Fira Code', monospace`,
    fontSize:      '10px',
    fontWeight:    600,
    padding:       '3px 8px',
    borderRadius:  '4px',
    border:        '1px solid',
    letterSpacing: '0.03em',
    transition:    'opacity 0.2s',
    whiteSpace:    'nowrap' as const,
  },
  countRow: {
    display:    'flex',
    alignItems: 'baseline',
    gap:        '4px',
  },
  countNum: {
    fontFamily: `'SF Mono', 'Fira Code', monospace`,
    fontSize:   '28px',
    fontWeight: 700,
    lineHeight: 1,
    transition: 'color 0.2s',
  },
  countLabel: {
    fontFamily: `'SF Mono', 'Fira Code', monospace`,
    fontSize:   '10px',
    color:      '#8b949e',
  },
  dotsWrap: {
    display:        'flex',
    flexWrap:       'wrap' as const,
    justifyContent: 'center',
    gap:            '5px',
    marginTop:      '4px',
  },
  magnetDot: {
    width:        '14px',
    height:       '14px',
    borderRadius: '50%',
    flexShrink:   0,
  },
} satisfies Record<string, React.CSSProperties>;
