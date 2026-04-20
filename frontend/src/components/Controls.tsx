import { useState } from 'react';
import { DEFAULT_FIELD_RADIUS, DEFAULT_STRENGTH } from '../constants';
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
    <div className="flex flex-wrap items-center gap-3 bg-[#161b22] border border-[#30363d] rounded-xl px-5 py-3 w-full max-w-[820px]">

      {/* New Game / Leave Game */}
      {!isRemote && (
        <button
          className="font-mono text-xs font-semibold px-4 py-1.5 rounded-md border border-[#30363d] bg-[#21262d] text-[#c9d1d9] cursor-pointer hover:bg-[#30363d] transition-colors"
          onClick={onReset}
        >
          New Game
        </button>
      )}

      {isRemote && !leaveConfirm && (
        <button
          className="font-mono text-xs font-semibold px-4 py-1.5 rounded-md border border-[#f8514955] bg-[#f8514911] text-[#f85149] cursor-pointer hover:bg-[#f8514922] transition-colors"
          onClick={() => setLeaveConfirm(true)}
        >
          Leave Game
        </button>
      )}

      {isRemote && leaveConfirm && (
        <div className="flex items-center gap-2">
          <span className="font-mono text-xs text-[#8b949e]">Leave?</span>
          <button
            className="font-mono text-xs font-semibold px-3 py-1 rounded-md border border-[#f8514955] bg-[#f8514922] text-[#f85149] cursor-pointer"
            onClick={() => { setLeaveConfirm(false); onLeaveGame?.(); }}
          >
            Yes
          </button>
          <button
            className="font-mono text-xs font-semibold px-3 py-1 rounded-md border border-[#30363d] bg-[#21262d] text-[#c9d1d9] cursor-pointer"
            onClick={() => setLeaveConfirm(false)}
          >
            Cancel
          </button>
        </div>
      )}

      {/* Sliders */}
      <SliderControl
        label="Magnetic Strength"
        id="strength"
        min={1} max={200} step={1}
        value={strength}
        defaultValue={DEFAULT_STRENGTH}
        onChange={onStrengthChange}
      />

      <SliderControl
        label="Field Radius"
        id="field-radius"
        min={50} max={300} step={10}
        value={fieldRadius}
        defaultValue={DEFAULT_FIELD_RADIUS}
        onChange={onFieldRadiusChange}
      />
    </div>
  );
}

interface SliderProps {
  label: string; id: string;
  min: number; max: number; step: number;
  value: number; defaultValue: number;
  onChange: (v: number) => void;
}

function SliderControl({ label, id, min, max, step, value, onChange }: SliderProps) {
  return (
    <div className="flex items-center gap-2">
      <label htmlFor={id} className="font-mono text-xs text-[#8b949e] whitespace-nowrap">
        {label}
      </label>
      <input
        id={id} type="range"
        min={min} max={max} step={step} value={value}
        onChange={e => onChange(Number(e.target.value))}
        className="w-28"
      />
      <span className="font-mono text-[11px] text-[#58a6ff] min-w-[28px] text-right">
        {value}
      </span>
    </div>
  );
}
