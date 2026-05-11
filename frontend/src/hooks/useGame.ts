import React, { useCallback, useEffect, useRef, useState } from 'react';
import Matter from 'matter-js';
import { GamePhase } from '../types';
import {
  HAND_SIZE,
  SLEEP_SPEED_THRESHOLD,
  SLEEP_CONSECUTIVE_FRAMES,
} from '../constants';

export interface GameControls {
  phase:                 GamePhase;
  phaseRef:              React.MutableRefObject<GamePhase>;
  activePlayer:          0 | 1;
  hands:                 [number, number];
  winner:                0 | 1 | null;
  placeForActivePlayer:  (x: number, y: number) => void;
  resetGame:             () => void;
  forceWin:              (w: 0 | 1) => void;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/** BFS: returns all bodies in the same collision-connected cluster as `seed`. */
function getConnectedCluster(
  seed:      Matter.Body,
  allBodies: Matter.Body[],
  pairs:     Set<string>,
): Matter.Body[] {
  const byId = new Map(allBodies.map(b => [b.id, b]));
  const adj  = new Map<number, Set<number>>(allBodies.map(b => [b.id, new Set()]));

  for (const key of pairs) {
    const [a, b] = key.split(':').map(Number);
    if (adj.has(a) && adj.has(b)) {
      adj.get(a)!.add(b);
      adj.get(b)!.add(a);
    }
  }

  const visited = new Set<number>([seed.id]);
  const queue   = [seed.id];
  while (queue.length) {
    const cur = queue.shift()!;
    for (const nb of adj.get(cur) ?? []) {
      if (!visited.has(nb)) {
        visited.add(nb);
        queue.push(nb);
      }
    }
  }

  return [...visited].map(id => byId.get(id)).filter(Boolean) as Matter.Body[];
}

// ── Hook ─────────────────────────────────────────────────────────────────────

export function useGame(
  engineRef:        React.RefObject<Matter.Engine | null>,
  activeMagnetsRef: React.MutableRefObject<Matter.Body[]>,
  spawnMagnet:      (x: number, y: number, owner: 0 | 1) => Matter.Body | null,
  removeBodies:     (bodies: Matter.Body[]) => void,
  onRemove?:        (bodies: Matter.Body[]) => void,
): GameControls {

  // ── Phase ─────────────────────────────────────────────────────────────────
  // Kept in both a ref (for event-handler reads) and state (for re-renders).
  const phaseRef = useRef<GamePhase>(GamePhase.WAITING);
  const [phase, setPhaseState] = useState<GamePhase>(GamePhase.WAITING);
  const setPhase = useCallback((p: GamePhase) => {
    phaseRef.current = p;
    setPhaseState(p);
  }, []);

  // ── Player state ──────────────────────────────────────────────────────────
  const activePlayerRef = useRef<0 | 1>(0);
  const [activePlayer, setActivePlayer] = useState<0 | 1>(0);

  // Hands: ref = synchronous source of truth, state = drives UI
  const handsRef = useRef<[number, number]>([HAND_SIZE, HAND_SIZE]);
  const [hands, setHandsState] = useState<[number, number]>([HAND_SIZE, HAND_SIZE]);
  const setHands = useCallback((next: [number, number]) => {
    handsRef.current = next;
    setHandsState(next);
  }, []);

  const [winner, setWinner] = useState<0 | 1 | null>(null);

  // ── Per-turn refs ─────────────────────────────────────────────────────────
  const lastPlacedRef     = useRef<Matter.Body | null>(null);
  const collisionPairsRef = useRef<Set<string>>(new Set());
  const sleepCountRef     = useRef(0);

  // ── onSettled: called once all bodies come to rest ────────────────────────
  const onSettled = useCallback(() => {
    if (phaseRef.current !== GamePhase.SIMULATING) return;
    setPhase(GamePhase.CHECKING);

    const player     = activePlayerRef.current;
    const lastPlaced = lastPlacedRef.current;
    let   penalty    = 0;

    if (lastPlaced) {
      const cluster = getConnectedCluster(
        lastPlaced,
        activeMagnetsRef.current,
        collisionPairsRef.current,
      );
      if (cluster.length > 1) {
        removeBodies(cluster);
        onRemove?.(cluster);
        penalty = cluster.length;
      }
    }

    // currentHand was already decremented by 1 when the magnet was placed
    const newHand = handsRef.current[player] + penalty;
    const nextHands: [number, number] = [...handsRef.current];
    nextHands[player] = newHand;
    setHands(nextHands);

    // Win: placed last magnet with no collision penalty
    if (newHand <= 0) {
      setWinner(player);
      setPhase(GamePhase.WIN);
      return;
    }

    const nextPlayer: 0 | 1 = player === 0 ? 1 : 0;
    activePlayerRef.current  = nextPlayer;
    setActivePlayer(nextPlayer);
    lastPlacedRef.current = null;
    setPhase(GamePhase.WAITING);
  }, [activeMagnetsRef, removeBodies, setPhase, setHands]);

  // ── Sleep detection: afterUpdate ──────────────────────────────────────────
  useEffect(() => {
    const engine = engineRef.current;
    if (!engine) return;

    const handler = () => {
      if (phaseRef.current !== GamePhase.SIMULATING) return;

      // Edge-case: all arena magnets were removed (e.g. entire board cleared by penalty)
      if (activeMagnetsRef.current.length === 0) {
        sleepCountRef.current = 0;
        onSettled();
        return;
      }

      const allSlow = activeMagnetsRef.current.every(b => b.speed < SLEEP_SPEED_THRESHOLD);
      if (allSlow) {
        sleepCountRef.current++;
        if (sleepCountRef.current >= SLEEP_CONSECUTIVE_FRAMES) {
          sleepCountRef.current = 0;
          onSettled();
        }
      } else {
        sleepCountRef.current = 0;
      }
    };

    Matter.Events.on(engine, 'afterUpdate', handler);
    return () => Matter.Events.off(engine, 'afterUpdate', handler);
  }, [engineRef, activeMagnetsRef, onSettled]);

  // ── Collision tracking: accumulate pairs during SIMULATING ────────────────
  useEffect(() => {
    const engine = engineRef.current;
    if (!engine) return;

    const handler = (event: Matter.IEventCollision<Matter.Engine>) => {
      if (phaseRef.current !== GamePhase.SIMULATING) return;
      for (const pair of event.pairs) {
        const idA = pair.bodyA.parent.id;
        const idB = pair.bodyB.parent.id;
        // Normalise key so order doesn't matter
        const key = idA < idB ? `${idA}:${idB}` : `${idB}:${idA}`;
        collisionPairsRef.current.add(key);
      }
    };

    Matter.Events.on(engine, 'collisionStart', handler);
    Matter.Events.on(engine, 'collisionActive', handler);
    return () => {
      Matter.Events.off(engine, 'collisionStart', handler);
      Matter.Events.off(engine, 'collisionActive', handler);
    };
  }, [engineRef]);

  // ── Public: place a magnet for the active player ──────────────────────────
  const placeForActivePlayer = useCallback((x: number, y: number) => {
    if (phaseRef.current !== GamePhase.WAITING) return;

    const player = activePlayerRef.current;
    const body   = spawnMagnet(x, y, player);
    if (!body) return;

    lastPlacedRef.current = body;
    collisionPairsRef.current.clear();
    sleepCountRef.current = 0;

    // Decrement hand immediately
    const nextHands: [number, number] = [...handsRef.current];
    nextHands[player] = nextHands[player] - 1;
    setHands(nextHands);

    setPhase(GamePhase.SIMULATING);
  }, [spawnMagnet, setPhase, setHands]);

  // ── Public: reset everything back to game start ───────────────────────────
  const resetGame = useCallback(() => {
    phaseRef.current      = GamePhase.WAITING;
    activePlayerRef.current = 0;
    sleepCountRef.current   = 0;
    lastPlacedRef.current   = null;
    collisionPairsRef.current.clear();

    setPhaseState(GamePhase.WAITING);
    setActivePlayer(0);
    const initial: [number, number] = [HAND_SIZE, HAND_SIZE];
    handsRef.current = initial;
    setHandsState(initial);
    setWinner(null);
  }, []);

  const forceWin = useCallback((w: 0 | 1) => {
    if (phaseRef.current === GamePhase.WIN) return;
    setWinner(w);
    setPhase(GamePhase.WIN);
  }, [phaseRef, setPhase]);

  return { phase, phaseRef, activePlayer, hands, winner, placeForActivePlayer, resetGame, forceWin };
}
