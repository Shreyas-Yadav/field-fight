import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import {
  CANVAS_W, CANVAS_H, DEFAULT_STRENGTH, DEFAULT_FIELD_RADIUS,
  PLAYER_COLORS, PLAYER_UIDS, HAND_SIZE,
} from './constants';
import { GamePhase, GameMode, ScoreRow } from './types';
import { useEngine }        from './hooks/useEngine';
import { useMagnets }       from './hooks/useMagnets';
import { useGame }          from './hooks/useGame';
import { useMagnetForce }   from './hooks/useMagnetForce';
import { useFieldRenderer } from './hooks/useFieldRenderer';
import { useAI }            from './hooks/useAI';
import { useParticles }     from './hooks/useParticles';
import { useFieldViz }      from './hooks/useFieldViz';
import { useAuth }          from './hooks/useAuth';
import { Controls }         from './components/Controls';
import { SimCanvas }        from './components/SimCanvas';
import { PlayerPanel }      from './components/PlayerPanel';
import { LoginScreen }      from './components/LoginScreen';
import { MatchHistory }     from './components/MatchHistory';

type RemoteStep = 'menu' | 'creating' | 'joining' | null;

export default function App() {
  // ── Auth ──────────────────────────────────────────────────────────────────
  const { user, loading: authLoading, logout, error: authError, clearError: clearAuthError } = useAuth();
  const isAuthenticated = !!user;

  // ── Mode & game ───────────────────────────────────────────────────────────
  const [gameMode,     setGameMode]     = useState<GameMode>('human-vs-human');
  const [gameStarted,  setGameStarted]  = useState(false);
  const [winSize,      setWinSize]      = useState({ w: window.innerWidth, h: window.innerHeight });
  const gameStartedRef  = useRef(false);
  const gameStartTimeRef = useRef<number | null>(null);
  const myTurnPending   = useRef(false);

  // ── Remote state ──────────────────────────────────────────────────────────
  const [socket,           setSocket]           = useState<Socket | null>(null);
  const [playerIndex,      setPlayerIndex]      = useState<0 | 1 | null>(null);
  const [roomId,           setRoomId]           = useState('');
  const [joinInput,        setJoinInput]        = useState('');
  const [remoteStep,       setRemoteStep]       = useState<RemoteStep>(null);
  const [remoteError,      setRemoteError]      = useState('');
  const [disconnectNotice, setDisconnectNotice] = useState(false);

  // ── Leaderboard ───────────────────────────────────────────────────────────
  const [scores, setScores] = useState<ScoreRow[]>([]);

  // ── Match history overlay ─────────────────────────────────────────────────
  const [showHistory, setShowHistory] = useState(false);

  // ── Sliders ───────────────────────────────────────────────────────────────
  const [strength,    setStrength]    = useState(DEFAULT_STRENGTH);
  const [fieldRadius, setFieldRadius] = useState(DEFAULT_FIELD_RADIUS);
  const strengthRef    = useRef<number>(DEFAULT_STRENGTH);
  const fieldRadiusRef = useRef<number>(DEFAULT_FIELD_RADIUS);

  const handleStrengthChange    = useCallback((v: number) => { strengthRef.current = v;    setStrength(v);    }, []);
  const handleFieldRadiusChange = useCallback((v: number) => { fieldRadiusRef.current = v; setFieldRadius(v); }, []);

  // ── Canvas / physics ──────────────────────────────────────────────────────
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const { engineRef, renderRef }                                = useEngine(canvasRef);
  const { activeMagnetsRef, spawnMagnet, removeBodies, resetMagnets, snapPositions } = useMagnets(engineRef);
  const { spawnExplosion }                                       = useParticles(renderRef);
  const { phase, phaseRef, activePlayer, hands, winner, placeForActivePlayer, resetGame } =
    useGame(engineRef, activeMagnetsRef, spawnMagnet, removeBodies, spawnExplosion);

  useMagnetForce(engineRef, activeMagnetsRef, strengthRef, fieldRadiusRef);
  useFieldViz(renderRef, activeMagnetsRef, strengthRef);
  useFieldRenderer(renderRef, activeMagnetsRef, fieldRadiusRef);

  const { getAIMove } = useAI(activeMagnetsRef);

  // ── Track window size (arenaSize is derived below via useMemo) ───────────
  useEffect(() => {
    const onResize = () => setWinSize({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // Derived synchronously each render so it's always consistent with gameStarted
  const arenaSize = useMemo(() => {
    const avail = gameStarted
      ? winSize.w - 200 * 2 - 20 * 4 - 40
      : winSize.w - 40;
    const maxH = winSize.h - 130;
    return Math.max(300, Math.min(avail, maxH));
  }, [gameStarted, winSize]);

  // ── AI trigger ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (
      gameMode !== 'human-vs-bot' ||
      !gameStartedRef.current ||
      phase !== GamePhase.WAITING ||
      activePlayer !== 1
    ) return;
    const timer = setTimeout(() => {
      if (!gameStartedRef.current) return;
      const { x, y } = getAIMove();
      placeForActivePlayer(x, y);
    }, 600);
    return () => clearTimeout(timer);
  }, [phase, activePlayer, gameMode, getAIMove, placeForActivePlayer]);

  // ── Leaderboard + match history: submit on win ───────────────────────────
  useEffect(() => {
    if (phase !== GamePhase.WIN || winner === null) return;

    const p0Moves = HAND_SIZE - hands[0];
    const p1Moves = HAND_SIZE - hands[1];

    fetch('/api/scores', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ winner, gameMode, p0Moves, p1Moves }),
    }).catch(() => {});

    // Determine player names based on auth + game mode
    const localPlayerIdx = gameMode === 'remote' ? playerIndex : 0;
    const localName = user?.name?.toUpperCase() ?? 'COMMANDER';
    const opponentName =
      gameMode === 'human-vs-bot'    ? 'AI UNIT'
      : gameMode === 'remote'        ? 'NET OPPONENT'
      : 'BRAVO';

    const p0Name = localPlayerIdx === 0 ? localName  : opponentName;
    const p1Name = localPlayerIdx === 1 ? localName  : opponentName;
    const p0Id   = localPlayerIdx === 0 ? (user?.id ?? null) : null;
    const p1Id   = localPlayerIdx === 1 ? (user?.id ?? null) : null;

    const durationSeconds = gameStartTimeRef.current
      ? Math.round((Date.now() - gameStartTimeRef.current) / 1000)
      : 0;

    fetch('/matches', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ p0Id, p0Name, p1Id, p1Name, winner, gameMode, p0Moves, p1Moves, durationSeconds }),
    }).catch(() => {});
  }, [phase, winner]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Leaderboard: fetch on win ──────────────────────────────────────────────
  useEffect(() => {
    if (phase !== GamePhase.WIN) return;
    fetch('/api/scores?limit=5')
      .then(r => r.json())
      .then(setScores)
      .catch(() => {});
  }, [phase]);

  // ── State sync: emit after my turn settles ────────────────────────────────
  useEffect(() => {
    if (!myTurnPending.current) return;
    if (phase !== GamePhase.WAITING || gameMode !== 'remote' || !socket) return;
    myTurnPending.current = false;
    const positions = activeMagnetsRef.current.map(b => ({
      id: b.id, x: b.position.x, y: b.position.y,
    }));
    socket.emit('sync_state', { positions });
  }, [phase, gameMode, socket, activeMagnetsRef]);

  // ── State sync: receive opponent positions ────────────────────────────────
  useEffect(() => {
    if (!socket || gameMode !== 'remote') return;
    const onStateSync = ({ positions }: { positions: { id: number; x: number; y: number }[] }) => {
      snapPositions(positions);
    };
    socket.on('state_sync', onStateSync);
    return () => { socket.off('state_sync', onStateSync); };
  }, [socket, gameMode, snapPositions]);

  // ── Socket: persistent listeners ─────────────────────────────────────────
  useEffect(() => {
    if (!socket) return;
    const onGameStart = ({ playerIndex: pi }: { playerIndex: 0 | 1 }) => {
      setPlayerIndex(pi);
      gameStartedRef.current = true;
      gameStartTimeRef.current = Date.now();
      setGameStarted(true);
      setRemoteStep(null);
      setRemoteError('');
    };
    const onOpponentDisconnected = () => setDisconnectNotice(true);
    socket.on('game_start', onGameStart);
    socket.on('opponent_disconnected', onOpponentDisconnected);
    return () => {
      socket.off('game_start', onGameStart);
      socket.off('opponent_disconnected', onOpponentDisconnected);
    };
  }, [socket]);

  // ── Socket: relay opponent moves ──────────────────────────────────────────
  useEffect(() => {
    if (!socket || gameMode !== 'remote') return;
    const onOpponentPlaced = ({ x, y }: { x: number; y: number }) => {
      if (phaseRef.current !== GamePhase.WAITING) return;
      placeForActivePlayer(x, y);
    };
    socket.on('opponent_placed', onOpponentPlaced);
    return () => { socket.off('opponent_placed', onOpponentPlaced); };
  }, [socket, gameMode, phaseRef, placeForActivePlayer]);

  // ── Remote lobby handlers ─────────────────────────────────────────────────
  const handleCreateRoom = useCallback(() => {
    const s = io();
    setSocket(s);
    s.once('room_created', ({ roomId: rid }: { roomId: string }) => {
      setRoomId(rid);
      setRemoteStep('creating');
    });
    s.emit('create_room');
  }, []);

  const handleJoinRoom = useCallback(() => {
    const rid = joinInput.trim().toUpperCase();
    if (!rid) return;
    const s = io();
    setSocket(s);
    s.once('join_error', ({ message }: { message: string }) => {
      setRemoteError(message);
      s.disconnect();
      setSocket(null);
    });
    s.emit('join_room', { roomId: rid });
  }, [joinInput]);

  const handleCancelRemote = useCallback(() => {
    socket?.disconnect();
    setSocket(null);
    setRemoteStep('menu');
    setRoomId('');
    setRemoteError('');
    setJoinInput('');
  }, [socket]);

  const handleReturnToLobby = useCallback(() => {
    resetMagnets(); resetGame();
    socket?.disconnect();
    setSocket(null); setPlayerIndex(null); setRoomId('');
    setRemoteStep('menu'); setDisconnectNotice(false); setRemoteError(''); setJoinInput('');
    gameStartedRef.current = false; setGameStarted(false); setScores([]);
  }, [resetMagnets, resetGame, socket]);

  const handleLeaveGame = useCallback(() => {
    resetMagnets(); resetGame();
    socket?.disconnect();
    setSocket(null); setPlayerIndex(null); setRoomId('');
    setRemoteStep('menu'); setDisconnectNotice(false); setRemoteError(''); setJoinInput('');
    gameStartedRef.current = false; setGameStarted(false); setScores([]);
  }, [resetMagnets, resetGame, socket]);

  const handleReset = useCallback(() => {
    resetMagnets(); resetGame(); setScores([]);
    if (gameMode === 'remote') {
      socket?.disconnect();
      setSocket(null); setPlayerIndex(null); setRoomId('');
      setRemoteStep(null); setRemoteError(''); setJoinInput('');
      setDisconnectNotice(false);
    }
    gameStartedRef.current = false; setGameStarted(false);
  }, [resetMagnets, resetGame, gameMode, socket]);

  // ── Canvas placement handler ──────────────────────────────────────────────
  const handleCanvasPlace = useCallback((clientX: number, clientY: number, target: HTMLCanvasElement) => {
    if (phase !== GamePhase.WAITING) return;
    if (gameMode === 'human-vs-bot' && activePlayer === 1) return;
    if (gameMode === 'remote' && activePlayer !== playerIndex) return;

    const rect = target.getBoundingClientRect();
    const x = (clientX - rect.left) * (CANVAS_W / rect.width);
    const y = (clientY - rect.top)  * (CANVAS_H / rect.height);

    if (gameMode === 'remote' && socket) {
      socket.emit('place_magnet', { x, y });
      myTurnPending.current = true;
    }
    placeForActivePlayer(x, y);
  }, [phase, gameMode, activePlayer, playerIndex, socket, placeForActivePlayer]);

  // ── Derived state ─────────────────────────────────────────────────────────
  const isMyRemoteTurn = gameMode === 'remote' && activePlayer === playerIndex;
  const isBotTurn      = gameMode === 'human-vs-bot' && activePlayer === 1;

  const statusText =
    phase === GamePhase.WIN && winner !== null
      ? `UNIT ${PLAYER_UIDS[winner]} — MISSION COMPLETE`
    : phase === GamePhase.SIMULATING
      ? 'MAGNETIC FIELD ACTIVE — TRACKING ASSETS'
    : phase === GamePhase.CHECKING
      ? 'SCANNING COLLISION MATRIX…'
    : isBotTurn
      ? 'AI COMPUTING OPTIMAL TRAJECTORY…'
    : gameMode === 'remote' && !isMyRemoteTurn
      ? 'AWAITING REMOTE UNIT…'
    : `UNIT ${PLAYER_UIDS[activePlayer]} — DEPLOY MAGNETIC ASSET`;

  const statusColor = phase === GamePhase.WIN
    ? 'var(--gold)'
    : PLAYER_COLORS[activePlayer];

  const canvasBoxShadow = phase === GamePhase.WIN
    ? `0 0 0 2px var(--gold), 0 0 50px 8px rgba(200,169,110,.3), 0 0 100px 20px rgba(200,169,110,.1)`
    : activePlayer === 0
      ? `0 0 0 2px var(--player-0), 0 0 50px 8px var(--player-0-glow), 0 0 100px 20px rgba(255,68,85,.06)`
      : `0 0 0 2px var(--player-1), 0 0 50px 8px var(--player-1-glow), 0 0 100px 20px rgba(0,212,255,.06)`;

  const modeTag = gameMode === 'human-vs-bot' ? 'VS AI' : gameMode === 'remote' ? 'REMOTE OPS' : 'LOCAL DUEL';

  // ── Derived player display names ──────────────────────────────────────────
  const localName = user?.name?.toUpperCase() ?? 'COMMANDER';
  const p0DisplayName =
    gameMode === 'remote'
      ? (playerIndex === 0 ? localName : undefined)
      : localName;
  const p1DisplayName =
    gameMode === 'human-vs-bot'   ? 'AI UNIT'
    : gameMode === 'remote' && playerIndex === 1 ? localName
    : undefined;

  // ── Render ────────────────────────────────────────────────────────────────
  if (!authLoading && !isAuthenticated) {
    return <LoginScreen error={authError} onClearError={clearAuthError} />;
  }

  return (
    <>
      {/* ── Full-viewport game layout ──────────────────────────────────── */}
      <div style={{
        width: '100vw', height: '100vh', position: 'relative', zIndex: 1,
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        justifyContent: 'space-between', padding: '12px 20px 10px',
      }}>

        {/* ── Top row: logo · status · mode tag ─────────────────────── */}
        <div style={{
          width: '100%', display: 'flex', alignItems: 'center',
          justifyContent: 'space-between', gap: 16, flexShrink: 0,
        }}>
          {/* Logo */}
          <div>
            <div style={{
              fontFamily: 'var(--font-display)', fontSize: 28, letterSpacing: '.26em', lineHeight: 1,
              color: 'var(--gold)', textShadow: '0 0 20px rgba(200,169,110,.45)',
            }}>
              MAGNET ARENA
            </div>
            <div style={{
              fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '.38em',
              color: 'var(--text-dim)', marginTop: 1,
            }}>
              TACTICAL MAGNETIC COMBAT
            </div>
          </div>

          {/* Status bar */}
          {gameStarted && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 10, padding: '7px 18px',
              background: 'rgba(7,9,13,0.92)', border: `1px solid ${statusColor}33`,
              borderRadius: 3, whiteSpace: 'nowrap', flexShrink: 0,
            }}>
              <div style={{ width: 7, height: 7, borderRadius: 2, background: statusColor, boxShadow: `0 0 10px ${statusColor}`, flexShrink: 0 }} />
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, letterSpacing: '.18em', color: statusColor }}>
                {statusText}
              </span>
              <div style={{ width: 7, height: 7, borderRadius: 2, background: statusColor, boxShadow: `0 0 10px ${statusColor}`, flexShrink: 0 }} />
            </div>
          )}

          {/* Mode tag + user info */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
            {gameStarted && (
              <div style={{
                fontFamily: 'var(--font-mono)', fontSize: 12, letterSpacing: '.2em',
                color: 'var(--gold)', background: 'rgba(200,169,110,.1)',
                border: '1px solid rgba(200,169,110,.28)', padding: '5px 14px',
                borderRadius: 2,
              }}>
                {modeTag}
              </div>
            )}
            {user && (
              <button
                onClick={logout}
                title={`Signed in as ${user.name}`}
                style={{
                  fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '.12em',
                  padding: '5px 10px', borderRadius: 2, cursor: 'pointer',
                  background: 'transparent', border: '1px solid rgba(200,169,110,.18)',
                  color: 'var(--text-dim)', transition: 'all .2s',
                }}
                onMouseEnter={e => {
                  const b = e.currentTarget as HTMLButtonElement;
                  b.style.color = 'var(--player-0)';
                  b.style.borderColor = 'rgba(255,68,85,.35)';
                }}
                onMouseLeave={e => {
                  const b = e.currentTarget as HTMLButtonElement;
                  b.style.color = 'var(--text-dim)';
                  b.style.borderColor = 'rgba(200,169,110,.18)';
                }}
              >
                {user.name.split(' ')[0].toUpperCase()} ⏻
              </button>
            )}
          </div>
        </div>

        {/* ── Middle row: HUD · Arena · HUD ─────────────────────────── */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          gap: 20, flex: 1, width: '100%', overflow: 'hidden', padding: '8px 0',
        }}>
          {gameStarted && (
            <PlayerPanel player={0} handCount={hands[0]} phase={phase}
              activePlayer={activePlayer} isBot={false}
              isRemoteOpponent={gameMode === 'remote' && playerIndex !== 0}
              playerName={p0DisplayName} />
          )}

          {/* Arena wrapper */}
          <div style={{ position: 'relative', flexShrink: 0 }}>
            <div style={{
              width: arenaSize, height: arenaSize,
              borderRadius: 4, overflow: 'hidden',
              boxShadow: canvasBoxShadow, transition: 'box-shadow .5s',
            }}>
              <SimCanvas canvasRef={canvasRef} onPlace={handleCanvasPlace} />
            </div>

            {/* Win overlay */}
            {phase === GamePhase.WIN && winner !== null && !disconnectNotice && (
              <WinOverlay
                winner={winner} gameMode={gameMode} playerIndex={playerIndex}
                scores={scores} onPlayAgain={handleReset}
                onViewHistory={() => setShowHistory(true)}
              />
            )}

            {/* Disconnect notice */}
            {disconnectNotice && (
              <div style={{
                position: 'absolute', inset: 0, display: 'flex', alignItems: 'center',
                justifyContent: 'center', background: 'rgba(4,6,10,0.92)', zIndex: 30,
              }}>
                <div className="animate-enter" style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16,
                  padding: '32px 40px', background: 'rgba(10,14,22,0.99)',
                  border: '1px solid rgba(200,169,110,.3)', borderRadius: 3, position: 'relative',
                }}>
                  <div style={{ fontFamily: 'var(--font-display)', fontSize: 48, color: 'var(--gold)', lineHeight: 1, letterSpacing: '.2em' }}>!</div>
                  <div style={{ fontFamily: 'var(--font-body)', fontSize: 20, fontWeight: 600, letterSpacing: '.25em', color: 'var(--gold)' }}>
                    LINK SEVERED
                  </div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-muted)', letterSpacing: '.1em', textAlign: 'center' }}>
                    Remote unit disconnected
                  </div>
                  <TactBtn onClick={handleReturnToLobby}>↺ RETURN TO LOBBY</TactBtn>
                </div>
              </div>
            )}
          </div>

          {gameStarted && (
            <PlayerPanel player={1} handCount={hands[1]} phase={phase}
              activePlayer={activePlayer} isBot={gameMode === 'human-vs-bot'}
              isRemoteOpponent={gameMode === 'remote' && playerIndex !== 1}
              playerName={p1DisplayName} />
          )}
        </div>

        {/* ── Controls dock ─────────────────────────────────────────── */}
        {gameStarted && (
          <Controls
            strength={strength} fieldRadius={fieldRadius}
            onStrengthChange={handleStrengthChange}
            onFieldRadiusChange={handleFieldRadiusChange}
            onReset={handleReset} gameMode={gameMode} onLeaveGame={handleLeaveGame}
          />
        )}
      </div>

      {/* ── Match history overlay ─────────────────────────────────────── */}
      {showHistory && (
        <MatchHistory userId={user?.id} onClose={() => setShowHistory(false)} />
      )}

      {/* ── Lobby full-screen overlay ──────────────────────────────────── */}
      {!gameStarted && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 50,
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          justifyContent: 'center', gap: 24, background: 'rgba(5,7,12,0.94)',
        }}>
          {/* Decorative rings */}
          <div style={{ position: 'absolute', width: 400, height: 400, borderRadius: '50%',
            border: '1px solid rgba(200,169,110,0.1)', pointerEvents: 'none',
            boxShadow: '0 0 80px 10px rgba(200,169,110,0.05)' }} />
          <div style={{ position: 'absolute', width: 560, height: 560, borderRadius: '50%',
            border: '1px dashed rgba(200,169,110,0.06)', pointerEvents: 'none' }} />

          {/* Profile chip — top-right corner */}
          <div style={{
            position: 'absolute', top: 16, right: 20, zIndex: 10,
            display: 'flex', alignItems: 'center', gap: 8,
          }}>
            {/* Environment badge */}
            <EnvBadge />
            {user && (
              <>
                {user.avatar && (
                  <img src={user.avatar} alt="" referrerPolicy="no-referrer" style={{
                    width: 28, height: 28, borderRadius: '50%',
                    border: '1px solid rgba(200,169,110,.35)', objectFit: 'cover',
                  }} />
                )}
                <span style={{
                  fontFamily: 'var(--font-mono)', fontSize: 12, letterSpacing: '.14em',
                  color: 'var(--gold)',
                }}>
                  {user.name.toUpperCase()}
                </span>
                <button
                  onClick={() => setShowHistory(true)}
                  style={{
                    fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '.12em',
                    padding: '4px 10px', borderRadius: 2, cursor: 'pointer',
                    background: 'transparent', border: '1px solid rgba(200,169,110,.2)',
                    color: 'var(--text-dim)', transition: 'all .2s',
                  }}
                  onMouseEnter={e => { const b = e.currentTarget as HTMLButtonElement; b.style.color = 'var(--gold)'; b.style.borderColor = 'rgba(200,169,110,.5)'; }}
                  onMouseLeave={e => { const b = e.currentTarget as HTMLButtonElement; b.style.color = 'var(--text-dim)'; b.style.borderColor = 'rgba(200,169,110,.2)'; }}
                >
                  INTEL
                </button>
                <button
                  onClick={logout}
                  style={{
                    fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '.12em',
                    padding: '4px 10px', borderRadius: 2, cursor: 'pointer',
                    background: 'transparent', border: '1px solid rgba(200,169,110,.2)',
                    color: 'var(--text-dim)', transition: 'all .2s',
                  }}
                  onMouseEnter={e => {
                    const b = e.currentTarget as HTMLButtonElement;
                    b.style.color = 'var(--player-0)';
                    b.style.borderColor = 'rgba(255,68,85,.4)';
                  }}
                  onMouseLeave={e => {
                    const b = e.currentTarget as HTMLButtonElement;
                    b.style.color = 'var(--text-dim)';
                    b.style.borderColor = 'rgba(200,169,110,.2)';
                  }}
                >
                  LOGOUT
                </button>
              </>
            )}
          </div>

          {/* Title block */}
          <div style={{ textAlign: 'center', zIndex: 1 }}>
            <div style={{
              fontFamily: 'var(--font-display)', fontSize: 52, letterSpacing: '.32em', lineHeight: 1,
              color: 'var(--gold)', textShadow: '0 0 30px rgba(200,169,110,.5)',
            }}>
              MAGNET ARENA
            </div>
            <div style={{
              fontFamily: 'var(--font-mono)', fontSize: 13, letterSpacing: '.48em',
              color: 'var(--text-dim)', marginTop: 8,
            }}>
              TACTICAL MAGNETIC COMBAT
            </div>
          </div>

          {/* Separator */}
          <div style={{
            width: 320, height: 1, zIndex: 1,
            background: 'linear-gradient(90deg,transparent,rgba(200,169,110,.45),transparent)',
          }} />

          {/* Mission select label */}
          {remoteStep === null && (
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 13, letterSpacing: '.44em', color: 'var(--text-dim)', zIndex: 1 }}>
              SELECT MISSION
            </div>
          )}

          {/* ── Mode cards ──────────────────────────────────────────── */}
          <div style={{ zIndex: 1, width: '100%', maxWidth: 440, padding: '0 20px' }}>

            {remoteStep === null && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <LobbyCard
                  title="LOCAL DUEL" desc="TWO UNITS · ONE ARENA · SAME TERMINAL"
                  color="var(--player-0)" delay={0}
                  onClick={() => { setGameMode('human-vs-human'); gameStartedRef.current = true; gameStartTimeRef.current = Date.now(); setGameStarted(true); }}
                />
                <LobbyCard
                  title="VS AI UNIT" desc="ENGAGE NEURAL ADVERSARY SYSTEM"
                  color="var(--player-1)" delay={0.07}
                  onClick={() => { setGameMode('human-vs-bot'); gameStartedRef.current = true; gameStartTimeRef.current = Date.now(); setGameStarted(true); }}
                />
                <LobbyCard
                  title="REMOTE OPS" desc="LINK WITH REMOTE COMMANDER VIA CHANNEL"
                  color="var(--gold)" delay={0.14}
                  onClick={() => { setGameMode('remote'); setRemoteStep('menu'); }}
                />
              </div>
            )}

            {/* Remote: menu */}
            {remoteStep === 'menu' && (
              <div className="animate-enter" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}>
                <div style={{ fontFamily: 'var(--font-body)', fontSize: 24, fontWeight: 600, letterSpacing: '.25em', color: 'var(--gold)' }}>
                  REMOTE OPERATIONS
                </div>
                {remoteError && (
                  <div style={{
                    fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--player-0)',
                    background: 'rgba(255,68,85,.1)', border: '1px solid rgba(255,68,85,.3)',
                    padding: '6px 14px', borderRadius: 2, letterSpacing: '.1em',
                  }}>
                    {remoteError}
                  </div>
                )}
                <TactBtn onClick={handleCreateRoom}>ESTABLISH LINK</TactBtn>
                <TactBtn onClick={() => { setRemoteStep('joining'); setRemoteError(''); }}>JOIN CHANNEL</TactBtn>
                <TactBtn ghost onClick={() => { setGameMode('human-vs-human'); setRemoteStep(null); setRemoteError(''); }}>← BACK</TactBtn>
              </div>
            )}

            {/* Remote: creating / waiting for opponent */}
            {remoteStep === 'creating' && (
              <div className="animate-enter" style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 18,
                padding: '32px 40px', background: 'rgba(10,14,22,0.99)',
                border: '1px solid rgba(200,169,110,.25)', borderRadius: 3, position: 'relative',
              }}>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, letterSpacing: '.4em', color: 'var(--text-dim)' }}>
                  AWAITING REMOTE UNIT
                </div>
                {/* Spinner */}
                <div style={{
                  width: 42, height: 42, borderRadius: '50%',
                  border: '2px solid rgba(200,169,110,.35)', borderTopColor: 'var(--gold)',
                  animation: 'spin 1.2s linear infinite',
                }} />
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, letterSpacing: '.3em', color: 'var(--text-dim)' }}>
                  CHANNEL CODE
                </div>
                <div style={{
                  fontFamily: 'var(--font-display)', fontSize: 60, letterSpacing: '.24em',
                  color: 'var(--gold)', textShadow: '0 0 22px rgba(200,169,110,.6)',
                }}>
                  {roomId}
                </div>
                <TactBtn ghost onClick={handleCancelRemote}>ABORT</TactBtn>
              </div>
            )}

            {/* Remote: join room */}
            {remoteStep === 'joining' && (
              <div className="animate-enter" style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14,
                padding: '32px 40px', background: 'rgba(10,14,22,0.99)',
                border: '1px solid rgba(200,169,110,.25)', borderRadius: 3,
              }}>
                <div style={{ fontFamily: 'var(--font-body)', fontSize: 24, fontWeight: 600, letterSpacing: '.2em', color: 'var(--gold)' }}>
                  JOIN CHANNEL
                </div>
                <input
                  value={joinInput} maxLength={6}
                  onChange={e => { setJoinInput(e.target.value.toUpperCase()); setRemoteError(''); }}
                  onKeyDown={e => e.key === 'Enter' && handleJoinRoom()}
                  placeholder="XXXXXX"
                  style={{
                    fontFamily: 'var(--font-display)', fontSize: 46, letterSpacing: '.22em',
                    textAlign: 'center', width: 230, padding: '11px 16px', borderRadius: 2,
                    outline: 'none', background: 'rgba(12,16,24,0.99)',
                    border: '1px solid rgba(200,169,110,.35)', color: 'var(--gold)',
                  }}
                  onFocus={e => { e.target.style.borderColor = 'var(--gold)'; e.target.style.boxShadow = '0 0 18px rgba(200,169,110,.35)'; }}
                  onBlur={e  => { e.target.style.borderColor = 'rgba(200,169,110,.35)'; e.target.style.boxShadow = 'none'; }}
                />
                {remoteError && (
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--player-0)', letterSpacing: '.1em' }}>
                    {remoteError}
                  </div>
                )}
                <TactBtn onClick={handleJoinRoom}>CONNECT</TactBtn>
                <TactBtn ghost onClick={() => { setRemoteStep('menu'); setRemoteError(''); setJoinInput(''); }}>← BACK</TactBtn>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}

// ── WinOverlay ────────────────────────────────────────────────────────────────
function WinOverlay({
  winner, gameMode, playerIndex, scores, onPlayAgain, onViewHistory,
}: {
  winner: 0 | 1; gameMode: GameMode; playerIndex: 0 | 1 | null;
  scores: ScoreRow[]; onPlayAgain: () => void; onViewHistory: () => void;
}) {
  const c   = PLAYER_COLORS[winner];
  const uid = PLAYER_UIDS[winner];
  const isVic = gameMode !== 'remote' || winner === playerIndex;

  return (
    <div style={{
      position: 'absolute', inset: 0, display: 'flex', alignItems: 'center',
      justifyContent: 'center', background: 'rgba(4,6,10,0.90)', zIndex: 30,
    }}>
      {/* Starburst */}
      <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: .22 }}>
        {Array.from({ length: 16 }, (_, i) => {
          const a = (i / 16) * Math.PI * 2;
          return (
            <line key={i} x1="50%" y1="50%"
              x2={`calc(50% + ${(Math.cos(a) * 55).toFixed(1)}%)`}
              y2={`calc(50% + ${(Math.sin(a) * 55).toFixed(1)}%)`}
              stroke={c} strokeWidth="1" strokeOpacity=".7" />
          );
        })}
      </svg>

      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14,
        animation: 'winReveal .5s cubic-bezier(0.16,1,0.3,1) both', zIndex: 1,
        padding: '0 24px', maxHeight: '90%', overflowY: 'auto',
      }}>
        <div style={{
          fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '.5em',
          color: 'rgba(200,169,110,.6)', border: '1px solid rgba(200,169,110,.25)',
          padding: '5px 18px', borderRadius: 2,
        }}>
          — MISSION COMPLETE —
        </div>

        <div style={{ textAlign: 'center' }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 13, letterSpacing: '.4em', color: 'var(--text-dim)', marginBottom: 4 }}>
            UNIT
          </div>
          <div style={{
            fontFamily: 'var(--font-display)', fontSize: 80, lineHeight: 1,
            letterSpacing: '.06em', color: c,
            textShadow: `0 0 30px ${c}, 0 0 80px ${c}55`,
          }}>
            {uid}
          </div>
          <div style={{
            fontFamily: 'var(--font-body)', fontSize: 24, fontWeight: 600,
            letterSpacing: '.5em', color: 'var(--gold)', marginTop: 4,
          }}>
            {isVic ? 'VICTORIOUS' : 'DEFEATED'}
          </div>
        </div>

        <div style={{ width: 200, height: 1, background: `linear-gradient(90deg,transparent,${c}99,transparent)` }} />

        {/* Scores */}
        {scores.length > 0 && (
          <div style={{ width: 260, display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '.3em', color: 'rgba(200,169,110,.5)', textAlign: 'center' }}>
              RECENT ENGAGEMENTS
            </div>
            <div style={{
              display: 'flex', flexDirection: 'column', gap: 3,
              background: 'rgba(12,16,24,0.85)', border: '1px solid rgba(200,169,110,.15)',
              borderRadius: 2, padding: '8px 12px',
            }}>
              {scores.map(s => (
                <div key={s.id} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, alignItems: 'center' }}>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-muted)' }}>
                    {s.game_mode === 'human-vs-bot' ? 'VS AI' : s.game_mode === 'remote' ? 'REMOTE' : 'LOCAL'}
                  </span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-primary)', textAlign: 'center' }}>
                    {s.p0_moves + s.p1_moves}
                  </span>
                  <span style={{
                    fontFamily: 'var(--font-display)', fontSize: 13, textAlign: 'right',
                    color: PLAYER_COLORS[s.winner],
                    textShadow: `0 0 6px ${PLAYER_COLORS[s.winner]}88`,
                  }}>
                    {PLAYER_UIDS[s.winner]}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div style={{ display: 'flex', gap: 10, width: '100%', justifyContent: 'center' }}>
          <button
            onClick={onPlayAgain}
            style={{
              fontFamily: 'var(--font-mono)', fontSize: 13, letterSpacing: '.3em',
              padding: '13px 32px', borderRadius: 2, cursor: 'pointer', transition: 'all .3s',
              background: 'rgba(200,169,110,.1)', border: '1px solid rgba(200,169,110,.5)',
              color: 'var(--gold)', boxShadow: '0 0 24px rgba(200,169,110,.18)',
            }}
            onMouseEnter={e => { const b = e.currentTarget as HTMLButtonElement; b.style.background = 'rgba(200,169,110,.18)'; b.style.boxShadow = '0 0 36px rgba(200,169,110,.35)'; }}
            onMouseLeave={e => { const b = e.currentTarget as HTMLButtonElement; b.style.background = 'rgba(200,169,110,.1)'; b.style.boxShadow = '0 0 24px rgba(200,169,110,.18)'; }}
          >
            ↺ NEW MISSION
          </button>
          <button
            onClick={onViewHistory}
            style={{
              fontFamily: 'var(--font-mono)', fontSize: 13, letterSpacing: '.3em',
              padding: '13px 32px', borderRadius: 2, cursor: 'pointer', transition: 'all .3s',
              background: 'transparent', border: '1px solid rgba(200,169,110,.25)',
              color: 'var(--text-dim)',
            }}
            onMouseEnter={e => { const b = e.currentTarget as HTMLButtonElement; b.style.color = 'var(--gold)'; b.style.borderColor = 'rgba(200,169,110,.5)'; }}
            onMouseLeave={e => { const b = e.currentTarget as HTMLButtonElement; b.style.color = 'var(--text-dim)'; b.style.borderColor = 'rgba(200,169,110,.25)'; }}
          >
            ◈ VIEW INTEL
          </button>
        </div>
      </div>
    </div>
  );
}

// ── LobbyCard ─────────────────────────────────────────────────────────────────
function LobbyCard({
  title, desc, color, delay, onClick,
}: {
  title: string; desc: string; color: string; delay: number; onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 18, padding: '18px 22px',
        background: 'rgba(14,20,32,0.98)', border: `1px solid ${color}44`,
        borderRadius: 3, cursor: 'pointer', textAlign: 'left', width: '100%',
        transition: 'all .25s', position: 'relative', overflow: 'hidden',
        animation: `fadeUp .4s ${delay}s ease-out both`,
      }}
      onMouseEnter={e => {
        const b = e.currentTarget as HTMLButtonElement;
        b.style.borderColor = color + 'aa';
        b.style.background  = 'rgba(18,26,42,0.99)';
        b.style.boxShadow   = `0 0 30px ${color}28, inset 0 0 30px ${color}0a`;
        b.style.transform   = 'translateX(4px)';
      }}
      onMouseLeave={e => {
        const b = e.currentTarget as HTMLButtonElement;
        b.style.borderColor = color + '44';
        b.style.background  = 'rgba(14,20,32,0.98)';
        b.style.boxShadow   = 'none';
        b.style.transform   = '';
      }}
    >
      {/* Left accent bar */}
      <div style={{
        width: 3, height: 'calc(100% + 2px)', position: 'absolute', left: -1, top: -1,
        background: `linear-gradient(to bottom, transparent, ${color}, transparent)`,
        borderRadius: 3,
      }} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <span style={{ fontFamily: 'var(--font-body)', fontSize: 20, fontWeight: 700, letterSpacing: '.16em', color: 'var(--text-primary)' }}>
          {title}
        </span>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-dim)', letterSpacing: '.1em' }}>
          {desc}
        </span>
      </div>
      <span style={{ marginLeft: 'auto', color: color + '77', fontSize: 18 }}>›</span>
    </button>
  );
}

// ── EnvBadge ──────────────────────────────────────────────────────────────────
function EnvBadge() {
  const host = window.location.hostname;
  let env = 'DEV';
  let color = '#00d4ff';
  if (host.includes('-qa.'))   { env = 'QA';   color = '#a78bfa'; }
  if (host.includes('-uat.'))  { env = 'UAT';  color = '#fb923c'; }
  if (host === 'field-fight.shri.software') { env = 'PROD'; color = '#4ade80'; }
  if (host === 'localhost')    { env = 'LOCAL'; color = 'rgba(200,169,110,.6)'; }

  return (
    <div style={{
      fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '.28em',
      padding: '3px 10px', borderRadius: 2,
      border: `1px solid ${color}55`,
      color, background: `${color}12`,
    }}>
      {env}
    </div>
  );
}

// ── TactBtn (reusable tactical button) ───────────────────────────────────────
function TactBtn({
  children, onClick, ghost = false,
}: {
  children: React.ReactNode; onClick: () => void; ghost?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        width: '100%', padding: '13px',
        fontFamily: 'var(--font-mono)', fontSize: 13, letterSpacing: '.2em',
        cursor: 'pointer', borderRadius: 2, textTransform: 'uppercase' as const,
        background: ghost ? 'transparent' : 'rgba(200,169,110,.1)',
        border: ghost ? 'none' : '1px solid rgba(200,169,110,.35)',
        color: ghost ? 'var(--text-dim)' : 'var(--gold)',
        transition: 'all .2s',
      }}
      onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.filter = 'brightness(1.3)'; }}
      onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.filter = ''; }}
    >
      {children}
    </button>
  );
}
