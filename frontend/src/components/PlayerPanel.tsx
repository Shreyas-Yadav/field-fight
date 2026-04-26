import type { CSSProperties } from 'react';
import { GamePhase } from '../types';
import { PLAYER_COLORS, HAND_SIZE, PLAYER_UIDS } from '../constants';

interface Props {
  player:            0 | 1;
  handCount:         number;
  phase:             GamePhase;
  activePlayer:      0 | 1;
  isBot?:            boolean;
  isRemoteOpponent?: boolean;
}

export function PlayerPanel({
  player, handCount, phase, activePlayer, isBot = false, isRemoteOpponent = false,
}: Props) {
  const color    = PLAYER_COLORS[player];
  const isActive = activePlayer === player && phase !== GamePhase.WIN;

  const phaseLabel =
    phase === GamePhase.SIMULATING   ? 'FIELD ACTIVE'
    : phase === GamePhase.CHECKING   ? 'SCANNING'
    : (isBot || isRemoteOpponent) && isActive ? 'COMPUTING'
    : isActive ? 'ENGAGING'
    : 'STANDBY';

  return (
    <div style={{
      width: 200, padding: '20px 16px',
      background: isActive ? 'rgba(12,18,28,0.96)' : 'rgba(10,14,20,0.88)',
      border: `1px solid ${isActive ? color + '66' : 'rgba(200,169,110,0.18)'}`,
      borderRadius: 3, position: 'relative', flexShrink: 0,
      boxShadow: isActive ? `0 0 40px ${color}20, inset 0 0 30px ${color}08` : 'none',
      transition: 'border-color .4s, box-shadow .4s',
    }}>
      <Brackets color={isActive ? color + '88' : 'rgba(200,169,110,0.25)'} />

      {/* Active scanline */}
      {isActive && (
        <div style={{
          position: 'absolute', left: 0, right: 0, height: 2,
          pointerEvents: 'none', zIndex: 5,
          background: `linear-gradient(90deg, transparent, ${color}55, transparent)`,
          animation: 'scanH 2.5s linear infinite', top: 0,
        }} />
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {/* Name + badge row */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{
              width: 8, height: 8, borderRadius: 2, background: color,
              boxShadow: isActive ? `0 0 10px ${color}` : 'none',
              transition: 'box-shadow .3s',
            }} />
            <span style={{
              fontFamily: 'var(--font-body)', fontSize: 22, fontWeight: 700,
              letterSpacing: '.14em',
              color: isActive ? color : 'var(--text-muted)',
              transition: 'color .3s',
            }}>
              {player === 0 ? 'ALPHA' : 'BRAVO'}
            </span>
          </div>
          {(isBot || isRemoteOpponent) && (
            <span style={{
              fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '.14em',
              color: 'var(--player-1)', background: 'var(--player-1-dim)',
              border: '1px solid rgba(0,212,255,.3)', padding: '2px 7px', borderRadius: 2,
            }}>
              {isBot ? 'AI' : 'NET'}
            </span>
          )}
        </div>

        {/* Separator */}
        <div style={{ height: 1, background: `linear-gradient(90deg, ${color}55, transparent)` }} />

        {/* Data rows */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <DataRow label="UNIT ID"    value={PLAYER_UIDS[player]} />
          <DataRow label="STATUS"     value={phaseLabel} color={isActive ? color : undefined} />
          <DataRow label="MUNITIONS"  value={`${handCount} / ${HAND_SIZE}`} />
        </div>

        {/* Big countdown number */}
        <div style={{ textAlign: 'center', padding: '8px 0 4px' }}>
          <span style={{
            fontFamily: 'var(--font-display)', fontSize: 68, lineHeight: 1,
            letterSpacing: '.05em',
            color: isActive ? 'var(--text-primary)' : 'var(--text-muted)',
            textShadow: isActive ? `0 0 24px ${color}` : 'none',
            transition: 'all .3s',
          }}>
            {handCount}
          </span>
          <div style={{
            fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '.3em',
            color: 'var(--text-dim)', marginTop: 2,
          }}>
            REMAINING
          </div>
        </div>

        {/* Ammo bar grid — 5 columns × 2 rows */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 5 }}>
          {Array.from({ length: HAND_SIZE }, (_, i) => (
            <div key={i} style={{
              height: 7, borderRadius: 2,
              background: i < handCount ? color : 'rgba(200,169,110,0.08)',
              boxShadow: i < handCount && isActive ? `0 0 5px ${color}` : 'none',
              opacity: i < handCount ? (isActive ? 1 : 0.4) : 0.15,
              transition: 'all .3s',
            }} />
          ))}
        </div>

        {/* Status badge */}
        <div style={{
          fontFamily: 'var(--font-mono)', fontSize: 12, letterSpacing: '.18em',
          textAlign: 'center', padding: '6px 10px', borderRadius: 2, textTransform: 'uppercase',
          background: isActive ? `${color}14` : 'transparent',
          border: `1px solid ${isActive ? color + '44' : 'rgba(200,169,110,.1)'}`,
          color: isActive ? color : 'var(--text-dim)',
          transition: 'all .3s',
        }}>
          {phaseLabel}
        </div>
      </div>
    </div>
  );
}

function Brackets({ color }: { color: string }) {
  const s: CSSProperties = {
    position: 'absolute', width: 14, height: 14,
    border: 'none', borderStyle: 'solid', borderColor: color, borderWidth: 0,
  };
  return (
    <>
      <div style={{ ...s, top: 0, left: 0, borderTopWidth: 2, borderLeftWidth: 2 }} />
      <div style={{ ...s, top: 0, right: 0, borderTopWidth: 2, borderRightWidth: 2 }} />
      <div style={{ ...s, bottom: 0, left: 0, borderBottomWidth: 2, borderLeftWidth: 2 }} />
      <div style={{ ...s, bottom: 0, right: 0, borderBottomWidth: 2, borderRightWidth: 2 }} />
    </>
  );
}

function DataRow({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
      padding: '4px 0', borderBottom: '1px solid rgba(200,169,110,0.08)',
    }}>
      <span style={{
        fontFamily: 'var(--font-mono)', fontSize: 12,
        color: 'var(--text-dim)', letterSpacing: '.12em',
      }}>
        {label}
      </span>
      <span style={{
        fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 700,
        color: color ?? 'var(--gold)',
        textShadow: color ? `0 0 8px ${color}` : '0 0 8px rgba(200,169,110,.5)',
      }}>
        {value}
      </span>
    </div>
  );
}
