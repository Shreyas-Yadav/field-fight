import React from 'react';
import { DEFAULT_FIELD_RADIUS, DEFAULT_STRENGTH } from '../constants';

interface Props {
  strength:            number;
  fieldRadius:         number;
  onStrengthChange:    (v: number) => void;
  onFieldRadiusChange: (v: number) => void;
  onReset:             () => void;
}

export function Controls({
  strength,
  fieldRadius,
  onStrengthChange,
  onFieldRadiusChange,
  onReset,
}: Props) {
  return (
    <div style={styles.panel}>
      <button style={{ ...styles.btn, ...styles.btnSecondary }} onClick={onReset}>
        New Game
      </button>

      <SliderControl
        label="Magnetic Strength"
        id="strength"
        min={1}
        max={200}
        step={1}
        value={strength}
        defaultValue={DEFAULT_STRENGTH}
        onChange={onStrengthChange}
      />

      <SliderControl
        label="Field Radius"
        id="field-radius"
        min={50}
        max={300}
        step={10}
        value={fieldRadius}
        defaultValue={DEFAULT_FIELD_RADIUS}
        onChange={onFieldRadiusChange}
      />
    </div>
  );
}

interface SliderProps {
  label:        string;
  id:           string;
  min:          number;
  max:          number;
  step:         number;
  value:        number;
  defaultValue: number;
  onChange:     (v: number) => void;
}

function SliderControl({ label, id, min, max, step, value, onChange }: SliderProps) {
  return (
    <div style={styles.sliderGroup}>
      <label htmlFor={id} style={styles.label}>{label}</label>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={e => onChange(Number(e.target.value))}
        style={styles.slider}
      />
      <span style={styles.badge}>{value}</span>
    </div>
  );
}

const styles = {
  panel: {
    display:     'flex',
    flexWrap:    'wrap' as const,
    alignItems:  'center',
    gap:         '12px 20px',
    background:  '#161b22',
    border:      '1px solid #30363d',
    borderRadius: '10px',
    padding:     '12px 20px',
    width:       '100%',
    maxWidth:    '820px',
  },
  btn: {
    fontFamily:    `'SF Mono', 'Fira Code', monospace`,
    fontSize:      '12px',
    fontWeight:    600,
    padding:       '6px 16px',
    borderRadius:  '6px',
    border:        '1px solid #30363d',
    cursor:        'pointer',
    letterSpacing: '0.02em',
  },
  btnSecondary: {
    background: '#21262d',
    color:      '#c9d1d9',
  },
  sliderGroup: {
    display:    'flex',
    alignItems: 'center',
    gap:        '8px',
  },
  label: {
    fontFamily: `'SF Mono', 'Fira Code', monospace`,
    fontSize:   '12px',
    color:      '#8b949e',
    whiteSpace: 'nowrap' as const,
  },
  slider: {
    width:       '120px',
    cursor:      'pointer',
    accentColor: '#58a6ff',
  },
  badge: {
    fontFamily: `'SF Mono', 'Fira Code', monospace`,
    fontSize:   '11px',
    color:      '#58a6ff',
    minWidth:   '28px',
    textAlign:  'right' as const,
  },
} satisfies Record<string, React.CSSProperties>;
