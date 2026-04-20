import { GamePhase } from '../types';
import { PLAYER_COLORS } from '../constants';

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
  const label    = player === 0 ? 'Player 1' : 'Player 2';

  const turnBadgeText = isBot && isActive && phase === GamePhase.WAITING
    ? 'Thinking…'
    : isRemoteOpponent && isActive && phase === GamePhase.WAITING
      ? 'Waiting…'
      : phase === GamePhase.SIMULATING
        ? 'Placed…'
        : 'Your turn';

  return (
    <div
      className="flex flex-row md:flex-col items-center gap-3 md:gap-2.5 px-3 py-2 md:px-2.5 md:py-3.5 bg-[#161b22] border rounded-xl md:w-[100px] transition-colors duration-200 shrink-0"
      style={{ borderColor: isActive ? color : '#30363d' }}
    >
      {/* Name */}
      <div className="flex items-center gap-1.5 shrink-0">
        <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: color }} />
        <span
          className="font-mono text-[11px] font-semibold tracking-wide whitespace-nowrap transition-colors duration-200"
          style={{ color: isActive ? color : '#8b949e' }}
        >
          {label}
        </span>
      </div>

      {isBot && (
        <div className="font-mono text-[9px] font-bold tracking-widest px-1.5 py-0.5 rounded bg-[#388bfd22] text-[#58a6ff] border border-[#388bfd55] shrink-0">
          BOT
        </div>
      )}

      {/* Turn badge */}
      <div
        className="font-mono text-[10px] font-semibold px-2 py-0.5 rounded border tracking-wide whitespace-nowrap transition-opacity duration-200 shrink-0"
        style={{
          opacity:     isActive ? 1 : 0,
          background:  color + '22',
          color,
          borderColor: color + '55',
        }}
      >
        {turnBadgeText}
      </div>

      {/* Hand count */}
      <div className="flex items-baseline gap-1 shrink-0">
        <span
          className="font-mono text-[28px] font-bold leading-none transition-colors duration-200"
          style={{ color: isActive ? '#e6edf3' : '#8b949e' }}
        >
          {handCount}
        </span>
        <span className="font-mono text-[10px] text-[#8b949e]">in hand</span>
      </div>

      {/* Magnet dots — desktop only */}
      <div className="hidden md:flex flex-wrap justify-center gap-[5px] mt-1">
        {Array.from({ length: handCount }, (_, i) => (
          <div
            key={i}
            className="w-3.5 h-3.5 rounded-full shrink-0"
            style={{ background: color, opacity: isActive ? 1 : 0.5 }}
          />
        ))}
      </div>
    </div>
  );
}
