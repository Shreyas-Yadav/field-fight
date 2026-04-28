export enum GamePhase {
  WAITING    = 'WAITING',    // active player may click to place
  SIMULATING = 'SIMULATING', // physics running, waiting for bodies to settle
  CHECKING   = 'CHECKING',   // BFS collision check in progress
  WIN        = 'WIN',        // a player emptied their hand
}

export type GameMode = 'human-vs-human' | 'human-vs-bot' | 'remote';

export interface AuthUser {
  id: string;
  name: string;
  avatar?: string;
  provider: string;
}

export interface ScoreRow {
  id: number;
  winner: 0 | 1;
  game_mode: string;
  p0_moves: number;
  p1_moves: number;
  created_at: string;
}
