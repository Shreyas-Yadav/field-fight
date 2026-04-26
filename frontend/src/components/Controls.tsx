import type { ReactNode } from 'react';
import { useState } from 'react';
import { GameMode } from '../types';

interface Props {
  strength:            number;
  fieldRadius:         number;
  onStrengthChange:    (v: number) => void;
  onFieldRadiusChange: (v: number) => void;
  onReset:             () => void;
  gameMode:            GameMode;
  onLeaveGame?:        () => void;
}

export function Controls({
  strength, fieldRadius, onStrengthChange, onFieldRadiusChange, onReset, gameMode, onLeaveGame,
}: Props) {
  const [leaveConfirm, setLeaveConfirm] = useState(false);
  const isRemote = gameMode === 'remote';

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 18, padding: '9px 22px',
      background: 'rgba(7,9,13,0.92)', border: '1px solid rgba(200,169,110,.16)',
      borderRadius: 3, whiteSpace: 'nowrap', flexShrink: 0,
      flexWrap: 'wrap', justifyContent: 'center', width: '100%', maxWidth: 820,
    }}>
      {!isRemote && (
        <TBtn onClick={onReset}>↺ NEW MISSION</TBtn>
      )}
      {isRemote && !leaveConfirm && (
        <TBtn danger onClick={() => setLeaveConfirm(true)}>⎋ ABORT</TBtn>
      )}
      {isRemote && leaveConfirm && (
        <>
          <span style={{
            fontFamily: 'var(--font-mono)', fontSize: 12,
            color: 'var(--text-muted)', letterSpacing: '.15em',
          }}>
            ABANDON?
          </span>
          <TBtn danger onClick={() => { setLeaveConfirm(false); onLeaveGame?.(); }}>YES</TBtn>
          <TBtn onClick={() => setLeaveConfirm(false)}>NO</TBtn>
        </>
      )}

      <Divider />

      {[
        { label: 'FORCE',  min: 1,  max: 200, step: 1,  val: strength,    fn: onStrengthChange },
        { label: 'RADIUS', min: 50, max: 300, step: 10, val: fieldRadius,  fn: onFieldRadiusChange },
      ].map(s => (
        <div key={s.label} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{
            fontFamily: 'var(--font-mono)', fontSize: 11,
            letterSpacing: '.16em', color: 'var(--text-dim)',
          }}>
            {s.label}
          </span>
          <input
            type="range" min={s.min} max={s.max} step={s.step} value={s.val}
            onChange={e => s.fn(Number(e.target.value))}
            style={{ width: 88 }}
          />
          <span style={{
            fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--gold)',
            minWidth: 28, textAlign: 'right',
          }}>
            {s.val}
          </span>
        </div>
      ))}

      <Divider />

      {/* Status dots */}
      <div style={{ display: 'flex', gap: 5 }}>
        {[0.2, 0.45, 0.75].map((o, i) => (
          <div key={i} style={{
            width: 5, height: 5, borderRadius: '50%',
            background: `rgba(200,169,110,${o})`,
          }} />
        ))}
      </div>
    </div>
  );
}

function TBtn({ children, onClick, danger }: { children: ReactNode; onClick: () => void; danger?: boolean }) {
  return (
    <button
      onClick={onClick}
      style={{
        fontFamily: 'var(--font-mono)', fontSize: 12, letterSpacing: '.16em',
        textTransform: 'uppercase', padding: '7px 16px', borderRadius: 2,
        cursor: 'pointer', transition: 'all .2s',
        background: danger ? 'rgba(255,68,85,.12)' : 'rgba(200,169,110,.10)',
        border: `1px solid ${danger ? 'rgba(255,68,85,.4)' : 'rgba(200,169,110,.3)'}`,
        color: danger ? 'var(--player-0)' : 'var(--gold)',
      }}
      onMouseEnter={e  => { (e.currentTarget as HTMLButtonElement).style.filter = 'brightness(1.35)'; }}
      onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.filter = ''; }}
    >
      {children}
    </button>
  );
}

function Divider() {
  return (
    <div style={{ width: 1, height: 22, background: 'rgba(200,169,110,.15)', flexShrink: 0 }} />
  );
}
