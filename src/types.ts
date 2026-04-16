export enum GamePhase {
  WAITING    = 'WAITING',    // active player may click to place
  SIMULATING = 'SIMULATING', // physics running, waiting for bodies to settle
  CHECKING   = 'CHECKING',   // BFS collision check in progress
  WIN        = 'WIN',        // a player emptied their hand
}
