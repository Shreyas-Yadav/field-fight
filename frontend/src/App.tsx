import { useCallback, useEffect, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { CANVAS_W, CANVAS_H, DEFAULT_STRENGTH, DEFAULT_FIELD_RADIUS, PLAYER_COLORS, HAND_SIZE } from './constants';
import { GamePhase, GameMode, ScoreRow } from './types';
import { useEngine }        from './hooks/useEngine';
import { useMagnets }       from './hooks/useMagnets';
import { useGame }          from './hooks/useGame';
import { useMagnetForce }   from './hooks/useMagnetForce';
import { useFieldRenderer } from './hooks/useFieldRenderer';
import { useAI }            from './hooks/useAI';
import { useParticles }     from './hooks/useParticles';
import { useFieldViz }      from './hooks/useFieldViz';
import { Controls }         from './components/Controls';
import { SimCanvas }        from './components/SimCanvas';
import { PlayerPanel }      from './components/PlayerPanel';

type RemoteStep = 'menu' | 'creating' | 'joining' | null;

function modeLabel(mode: string) {
  if (mode === 'human-vs-bot') return 'vs Bot';
  if (mode === 'remote')       return 'Remote';
  return 'Local';
}

export default function App() {
  // ── Mode & game ───────────────────────────────────────────────────────────
  const [gameMode,    setGameMode]    = useState<GameMode>('human-vs-human');
  const [gameStarted, setGameStarted] = useState(false);
  const gameStartedRef  = useRef(false); // E6: sync ref for AI guard
  const myTurnPending   = useRef(false); // true while waiting for MY placement to settle

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

  // ── Sliders ───────────────────────────────────────────────────────────────
  const [strength,    setStrength]    = useState(DEFAULT_STRENGTH);
  const [fieldRadius, setFieldRadius] = useState(DEFAULT_FIELD_RADIUS);
  const strengthRef    = useRef<number>(DEFAULT_STRENGTH);
  const fieldRadiusRef = useRef<number>(DEFAULT_FIELD_RADIUS);

  const handleStrengthChange = useCallback((v: number) => { strengthRef.current = v; setStrength(v); }, []);
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

  // ── AI trigger (E6: use ref to avoid double-fire) ─────────────────────────
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

  // ── Leaderboard: submit on win ─────────────────────────────────────────────
  useEffect(() => {
    if (phase !== GamePhase.WIN || winner === null) return;
    fetch('/api/scores', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        winner,
        gameMode,
        p0Moves: HAND_SIZE - hands[0],
        p1Moves: HAND_SIZE - hands[1],
      }),
    }).catch(() => {});
  }, [phase, winner]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Leaderboard: fetch top 5 when win overlay opens ───────────────────────
  useEffect(() => {
    if (phase !== GamePhase.WIN) return;
    fetch('/api/scores?limit=5')
      .then(r => r.json())
      .then(setScores)
      .catch(() => {});
  }, [phase]);

  // ── State sync: emit authoritative positions after my turn settles ────────
  useEffect(() => {
    if (!myTurnPending.current) return;
    if (phase !== GamePhase.WAITING || gameMode !== 'remote' || !socket) return;

    myTurnPending.current = false;
    const positions = activeMagnetsRef.current.map(b => ({
      id: b.id, x: b.position.x, y: b.position.y,
    }));
    socket.emit('sync_state', { positions });
  }, [phase, gameMode, socket, activeMagnetsRef]);

  // ── State sync: receive and apply opponent's authoritative positions ───────
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
      setGameStarted(true);
      setRemoteStep(null);
      setRemoteError('');
    };

    // E3: show notice instead of silently resetting
    const onOpponentDisconnected = () => {
      setDisconnectNotice(true);
    };

    socket.on('game_start', onGameStart);
    socket.on('opponent_disconnected', onOpponentDisconnected);
    return () => {
      socket.off('game_start', onGameStart);
      socket.off('opponent_disconnected', onOpponentDisconnected);
    };
  }, [socket]);

  // ── Socket: relay opponent moves (E4: guard with phaseRef) ────────────────
  useEffect(() => {
    if (!socket || gameMode !== 'remote') return;

    const onOpponentPlaced = ({ x, y }: { x: number; y: number }) => {
      if (phaseRef.current !== GamePhase.WAITING) return; // E4
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

  // ── Return to lobby after opponent disconnect ─────────────────────────────
  const handleReturnToLobby = useCallback(() => {
    resetMagnets();
    resetGame();
    socket?.disconnect();
    setSocket(null);
    setPlayerIndex(null);
    setRoomId('');
    setRemoteStep('menu');
    setDisconnectNotice(false);
    setRemoteError('');
    setJoinInput('');
    gameStartedRef.current = false;
    setGameStarted(false);
    setScores([]);
  }, [resetMagnets, resetGame, socket]);

  // ── Leave game (remote, mid-game) ─────────────────────────────────────────
  const handleLeaveGame = useCallback(() => {
    resetMagnets();
    resetGame();
    socket?.disconnect();
    setSocket(null);
    setPlayerIndex(null);
    setRoomId('');
    setRemoteStep('menu');
    setDisconnectNotice(false);
    setRemoteError('');
    setJoinInput('');
    gameStartedRef.current = false;
    setGameStarted(false);
    setScores([]);
  }, [resetMagnets, resetGame, socket]);

  // ── Reset (local modes / play again) ─────────────────────────────────────
  const handleReset = useCallback(() => {
    resetMagnets();
    resetGame();
    setScores([]); // E9: clear stale scores
    if (gameMode === 'remote') {
      socket?.disconnect();
      setSocket(null);
      setPlayerIndex(null);
      setRoomId('');
      setRemoteStep(null);
      setRemoteError('');
      setJoinInput('');
      setDisconnectNotice(false);
    }
    gameStartedRef.current = false;
    setGameStarted(false);
  }, [resetMagnets, resetGame, gameMode, socket]);

  // ── Canvas click/touch handler ────────────────────────────────────────────
  const handleCanvasPlace = useCallback((clientX: number, clientY: number, target: HTMLCanvasElement) => {
    if (phase !== GamePhase.WAITING) return;
    if (gameMode === 'human-vs-bot' && activePlayer === 1) return;
    if (gameMode === 'remote' && activePlayer !== playerIndex) return;

    const rect   = target.getBoundingClientRect();
    const x = (clientX - rect.left) * (CANVAS_W / rect.width);
    const y = (clientY - rect.top)  * (CANVAS_H / rect.height);

    if (gameMode === 'remote' && socket) {
      socket.emit('place_magnet', { x, y });
      myTurnPending.current = true; // I placed — I'll emit authoritative positions on settle
    }
    placeForActivePlayer(x, y);
  }, [phase, gameMode, activePlayer, playerIndex, socket, placeForActivePlayer]);

  // ── Banner text ───────────────────────────────────────────────────────────
  const isMyRemoteTurn = gameMode === 'remote' && activePlayer === playerIndex;
  const isBotTurn      = gameMode === 'human-vs-bot' && activePlayer === 1;
  const bannerText: Record<GamePhase, string> = {
    [GamePhase.WAITING]:    isBotTurn ? 'Bot is thinking…'
      : gameMode === 'remote' && !isMyRemoteTurn ? 'Waiting for opponent…'
      : `Player ${activePlayer + 1} — click inside the arena to place`,
    [GamePhase.SIMULATING]: 'Simulating…',
    [GamePhase.CHECKING]:   'Checking collisions…',
    [GamePhase.WIN]:        winner !== null ? `Player ${winner + 1} wins! 🎉` : '',
  };
  const bannerColor = phase === GamePhase.WIN && winner !== null
    ? PLAYER_COLORS[winner]
    : PLAYER_COLORS[activePlayer];

  return (
    <div className="flex flex-col items-center min-h-screen px-4 py-6 gap-4 bg-[#0d1117] font-mono text-[#c9d1d9]">
      <h1 className="text-lg font-semibold text-[#e6edf3] tracking-widest">Magnet Arena</h1>

      {/* Status banner */}
      {gameStarted && (
        <div
          className="text-xs font-semibold px-4 py-1.5 rounded-md border tracking-wide transition-colors duration-200 min-h-[30px] flex items-center"
          style={{ color: bannerColor, borderColor: bannerColor + '44' }}
        >
          {bannerText[phase]}
        </div>
      )}

      {/* Main layout */}
      <div className="flex flex-col md:flex-row items-center md:items-start gap-4 w-full max-w-[860px] justify-center">

        {/* Desktop: player 0 panel (left) */}
        {gameStarted && (
          <div className="hidden md:block">
            <PlayerPanel player={0} handCount={hands[0]} phase={phase} activePlayer={activePlayer}
              isRemoteOpponent={gameMode === 'remote' && playerIndex !== 0} />
          </div>
        )}

        {/* Canvas column */}
        <div className="flex flex-col items-center gap-3 w-full md:w-auto order-1">
          <div className="relative rounded-xl overflow-hidden border border-[#30363d] shadow-2xl w-full max-w-[620px]"
            style={{ boxShadow: '0 8px 32px rgba(0,0,0,0.5)' }}>
            <SimCanvas canvasRef={canvasRef} onPlace={handleCanvasPlace} />

            {/* Mode picker / remote lobby overlay */}
            {!gameStarted && (
              <div className="absolute inset-0 bg-black/75 flex flex-col items-center justify-center gap-5">
                {remoteStep === null && (
                  <>
                    <span className="font-mono text-base font-semibold text-[#c9d1d9] tracking-wide">Choose a game mode</span>
                    <button className={btnCls('primary')} onClick={() => { setGameMode('human-vs-human'); gameStartedRef.current = true; setGameStarted(true); }}>
                      Human vs Human
                    </button>
                    <button className={btnCls('secondary')} onClick={() => { setGameMode('human-vs-bot'); gameStartedRef.current = true; setGameStarted(true); }}>
                      Human vs Bot
                    </button>
                    <button className={btnCls('green')} onClick={() => { setGameMode('remote'); setRemoteStep('menu'); }}>
                      Remote Play
                    </button>
                  </>
                )}

                {remoteStep === 'menu' && (
                  <>
                    <span className="font-mono text-base font-semibold text-[#c9d1d9] tracking-wide">Remote Play</span>
                    {remoteError && <span className="font-mono text-xs text-[#f85149]">{remoteError}</span>}
                    <button className={btnCls('primary')} onClick={handleCreateRoom}>Create Room</button>
                    <button className={btnCls('secondary')} onClick={() => { setRemoteStep('joining'); setRemoteError(''); }}>Join Room</button>
                    <button className={btnCls('ghost')} onClick={() => { setGameMode('human-vs-human'); setRemoteStep(null); setRemoteError(''); }}>← Back</button>
                  </>
                )}

                {remoteStep === 'creating' && (
                  <>
                    <span className="font-mono text-base font-semibold text-[#c9d1d9]">Waiting for opponent</span>
                    <span className="font-mono text-xs text-[#8b949e]">Share this room code:</span>
                    <span className="font-mono text-4xl md:text-5xl font-bold tracking-[0.18em] text-[#58a6ff]">{roomId}</span>
                    <button className={btnCls('ghost')} onClick={handleCancelRemote}>Cancel</button>
                  </>
                )}

                {remoteStep === 'joining' && (
                  <>
                    <span className="font-mono text-base font-semibold text-[#c9d1d9]">Join Room</span>
                    <input
                      className="font-mono text-xl font-bold tracking-[0.12em] uppercase text-center w-40 px-3 py-2 bg-[#161b22] border border-[#30363d] rounded-md text-[#e6edf3] outline-none focus:border-[#58a6ff]"
                      placeholder="Room code"
                      value={joinInput}
                      maxLength={6}
                      onChange={e => { setJoinInput(e.target.value.toUpperCase()); setRemoteError(''); }}
                      onKeyDown={e => e.key === 'Enter' && handleJoinRoom()}
                    />
                    {remoteError && <span className="font-mono text-xs text-[#f85149]">{remoteError}</span>}
                    <button className={btnCls('primary')} onClick={handleJoinRoom}>Join</button>
                    <button className={btnCls('ghost')} onClick={() => { setRemoteStep('menu'); setRemoteError(''); setJoinInput(''); }}>← Back</button>
                  </>
                )}
              </div>
            )}

            {/* Opponent disconnected notice (E3) */}
            {disconnectNotice && (
              <div className="absolute inset-0 bg-black/75 flex flex-col items-center justify-center gap-5">
                <span className="font-mono text-lg font-bold text-[#e3b341]">⚠ Opponent disconnected</span>
                <span className="font-mono text-xs text-[#8b949e]">Your last board state is preserved.</span>
                <button className={btnCls('primary')} onClick={handleReturnToLobby}>Return to lobby</button>
              </div>
            )}

            {/* Win overlay */}
            {phase === GamePhase.WIN && winner !== null && !disconnectNotice && (
              <div className="absolute inset-0 bg-black/75 flex flex-col items-center justify-center gap-5">
                <span className="font-mono text-4xl md:text-5xl font-bold tracking-wide" style={{ color: PLAYER_COLORS[winner] }}>
                  {gameMode === 'remote' && winner === playerIndex ? 'You win! 🎉'
                    : gameMode === 'remote' ? 'Opponent wins'
                    : `Player ${winner + 1} wins!`}
                </span>
                <button className={btnCls('primary')} onClick={handleReset}>Play again</button>

                {scores.length > 0 && (
                  <div className="flex flex-col gap-1.5 w-56 bg-[#0d1117cc] border border-[#21262d] rounded-lg p-3">
                    <span className="font-mono text-[10px] font-bold tracking-[0.08em] text-[#8b949e] uppercase mb-1">Recent Games</span>
                    {scores.map(s => (
                      <div key={s.id} className="flex justify-between items-center gap-2">
                        <span className="font-mono text-[11px] text-[#8b949e] min-w-[46px]">{modeLabel(s.game_mode)}</span>
                        <span className="font-mono text-[11px] text-[#c9d1d9] flex-1 text-center">{s.p0_moves + s.p1_moves} moves</span>
                        <span className="font-mono text-[11px] font-bold min-w-[40px] text-right" style={{ color: PLAYER_COLORS[s.winner] }}>
                          P{s.winner + 1} won
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Mobile: both player panels in a row below the canvas */}
          {gameStarted && (
            <div className="flex md:hidden flex-row gap-3 w-full justify-center">
              <PlayerPanel player={0} handCount={hands[0]} phase={phase} activePlayer={activePlayer}
                isRemoteOpponent={gameMode === 'remote' && playerIndex !== 0} />
              <PlayerPanel player={1} handCount={hands[1]} phase={phase} activePlayer={activePlayer}
                isBot={gameMode === 'human-vs-bot'}
                isRemoteOpponent={gameMode === 'remote' && playerIndex !== 1} />
            </div>
          )}
        </div>

        {/* Desktop: player 1 panel (right) */}
        {gameStarted && (
          <div className="hidden md:block">
            <PlayerPanel player={1} handCount={hands[1]} phase={phase} activePlayer={activePlayer}
              isBot={gameMode === 'human-vs-bot'}
              isRemoteOpponent={gameMode === 'remote' && playerIndex !== 1} />
          </div>
        )}
      </div>

      {/* Controls */}
      {gameStarted && (
        <Controls
          strength={strength}
          fieldRadius={fieldRadius}
          onStrengthChange={handleStrengthChange}
          onFieldRadiusChange={handleFieldRadiusChange}
          onReset={handleReset}
          gameMode={gameMode}
          onLeaveGame={handleLeaveGame}
        />
      )}
    </div>
  );
}

// ── Button style helper ───────────────────────────────────────────────────────
function btnCls(variant: 'primary' | 'secondary' | 'green' | 'ghost') {
  const base = 'font-mono text-sm font-semibold px-6 py-2 rounded-md border cursor-pointer tracking-wide transition-colors duration-150';
  const map = {
    primary:   'bg-[#1f6feb] border-[#388bfd] text-white hover:bg-[#388bfd]',
    secondary: 'bg-[#21262d] border-[#30363d] text-[#c9d1d9] hover:bg-[#30363d]',
    green:     'bg-[#1a2d1a] border-[#3fb950] text-[#3fb950] hover:bg-[#243824]',
    ghost:     'bg-transparent border-[#21262d] text-[#8b949e] hover:border-[#30363d]',
  };
  return `${base} ${map[variant]}`;
}
