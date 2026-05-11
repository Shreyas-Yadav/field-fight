import { useEffect, useState } from 'react';

interface Match {
  id: number;
  p0Id: string | null;
  p0Name: string;
  p1Id: string | null;
  p1Name: string;
  winner: 0 | 1;
  gameMode: string;
  p0Moves: number;
  p1Moves: number;
  durationSeconds: number;
  createdAt: string;
}

const PLAYER_COLORS = ['#ff4455', '#00d4ff'] as const;
const PLAYER_UIDS   = ['ALPHA', 'BRAVO'] as const;

function modeLabel(mode: string) {
  if (mode === 'human-vs-bot') return 'VS AI';
  if (mode === 'remote')       return 'REMOTE';
  return 'LOCAL';
}

function formatDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    + ' ' + d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
}

function formatDuration(s: number) {
  if (!s) return '—';
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}m ${s % 60}s`;
}

export function MatchHistory({
  userId,
  onClose,
}: {
  userId?: string;
  onClose: () => void;
}) {
  const [matches, setMatches]   = useState<Match[]>([]);
  const [myOnly,  setMyOnly]    = useState(false);
  const [loading, setLoading]   = useState(true);
  const [error,   setError]     = useState('');

  useEffect(() => {
    setLoading(true);
    setError('');
    const url = myOnly && userId
      ? `/matches/player/${encodeURIComponent(userId)}?limit=30`
      : '/matches?limit=30';
    fetch(url)
      .then(r => { if (!r.ok) throw new Error('fetch failed'); return r.json(); })
      .then(setMatches)
      .catch(() => setError('FAILED TO RETRIEVE INTEL'))
      .finally(() => setLoading(false));
  }, [myOnly, userId]);

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 60,
      background: 'rgba(4,6,10,0.96)',
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      padding: '24px 20px', gap: 20, overflowY: 'auto',
    }}>
      {/* Header */}
      <div style={{ width: '100%', maxWidth: 860, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 32, letterSpacing: '.28em', color: 'var(--gold)', textShadow: '0 0 20px rgba(200,169,110,.4)' }}>
            MISSION INTEL
          </div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '.38em', color: 'var(--text-dim)', marginTop: 2 }}>
            COMBAT HISTORY ARCHIVE
          </div>
        </div>
        <button
          onClick={onClose}
          style={{
            fontFamily: 'var(--font-mono)', fontSize: 12, letterSpacing: '.2em',
            padding: '8px 18px', borderRadius: 2, cursor: 'pointer',
            background: 'transparent', border: '1px solid rgba(200,169,110,.25)',
            color: 'var(--text-dim)', transition: 'all .2s',
          }}
          onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--gold)'; (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(200,169,110,.55)'; }}
          onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-dim)'; (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(200,169,110,.25)'; }}
        >
          ✕ CLOSE
        </button>
      </div>

      {/* Divider */}
      <div style={{ width: '100%', maxWidth: 860, height: 1, background: 'linear-gradient(90deg,transparent,rgba(200,169,110,.4),transparent)' }} />

      {/* Filter toggle */}
      {userId && (
        <div style={{ width: '100%', maxWidth: 860, display: 'flex', gap: 10 }}>
          {(['all', 'mine'] as const).map(tab => {
            const active = tab === 'mine' ? myOnly : !myOnly;
            return (
              <button
                key={tab}
                onClick={() => setMyOnly(tab === 'mine')}
                style={{
                  fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '.22em',
                  padding: '6px 18px', borderRadius: 2, cursor: 'pointer',
                  background: active ? 'rgba(200,169,110,.15)' : 'transparent',
                  border: `1px solid ${active ? 'rgba(200,169,110,.5)' : 'rgba(200,169,110,.18)'}`,
                  color: active ? 'var(--gold)' : 'var(--text-dim)',
                  transition: 'all .2s',
                }}
              >
                {tab === 'all' ? 'ALL ENGAGEMENTS' : 'MY ENGAGEMENTS'}
              </button>
            );
          })}
        </div>
      )}

      {/* Content */}
      <div style={{ width: '100%', maxWidth: 860 }}>
        {loading && (
          <div style={{ textAlign: 'center', padding: '40px 0', fontFamily: 'var(--font-mono)', fontSize: 12, letterSpacing: '.3em', color: 'var(--text-dim)' }}>
            RETRIEVING INTEL…
          </div>
        )}

        {error && (
          <div style={{ textAlign: 'center', padding: '40px 0', fontFamily: 'var(--font-mono)', fontSize: 12, letterSpacing: '.2em', color: 'var(--player-0)' }}>
            {error}
          </div>
        )}

        {!loading && !error && matches.length === 0 && (
          <div style={{ textAlign: 'center', padding: '40px 0', fontFamily: 'var(--font-mono)', fontSize: 12, letterSpacing: '.3em', color: 'var(--text-dim)' }}>
            NO ENGAGEMENTS ON RECORD
          </div>
        )}

        {!loading && !error && matches.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {/* Table header */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: '140px 1fr 1fr 80px 60px 70px 60px',
              gap: 12, padding: '8px 14px',
              fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '.28em',
              color: 'rgba(200,169,110,.45)',
              borderBottom: '1px solid rgba(200,169,110,.12)',
            }}>
              <span>DATE</span>
              <span>UNIT ALPHA</span>
              <span>UNIT BRAVO</span>
              <span>MODE</span>
              <span>WINNER</span>
              <span>DURATION</span>
              <span>MOVES</span>
            </div>

            {/* Rows */}
            {matches.map((m, i) => {
              const winnerColor = PLAYER_COLORS[m.winner];
              return (
                <div
                  key={m.id}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '140px 1fr 1fr 80px 60px 70px 60px',
                    gap: 12, padding: '10px 14px',
                    background: i % 2 === 0 ? 'rgba(12,16,24,0.6)' : 'transparent',
                    borderRadius: 2,
                    borderLeft: `2px solid ${winnerColor}44`,
                    transition: 'background .15s',
                  }}
                  onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.background = 'rgba(200,169,110,0.04)'; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.background = i % 2 === 0 ? 'rgba(12,16,24,0.6)' : 'transparent'; }}
                >
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-muted)' }}>
                    {formatDate(m.createdAt)}
                  </span>
                  <span style={{ fontFamily: 'var(--font-body)', fontSize: 13, fontWeight: 600, letterSpacing: '.08em', color: m.winner === 0 ? PLAYER_COLORS[0] : 'var(--text-primary)' }}>
                    {m.p0Name}
                  </span>
                  <span style={{ fontFamily: 'var(--font-body)', fontSize: 13, fontWeight: 600, letterSpacing: '.08em', color: m.winner === 1 ? PLAYER_COLORS[1] : 'var(--text-primary)' }}>
                    {m.p1Name}
                  </span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-dim)', letterSpacing: '.1em' }}>
                    {modeLabel(m.gameMode)}
                  </span>
                  <span style={{ fontFamily: 'var(--font-display)', fontSize: 13, color: winnerColor, textShadow: `0 0 8px ${winnerColor}88`, letterSpacing: '.1em' }}>
                    {PLAYER_UIDS[m.winner]}
                  </span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-muted)' }}>
                    {formatDuration(m.durationSeconds)}
                  </span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-muted)' }}>
                    {m.p0Moves + m.p1Moves}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
