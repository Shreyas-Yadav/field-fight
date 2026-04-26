export const CANVAS_W = 620;
export const CANVAS_H = 620;

export const ARENA_RADIUS    = 250;   // px — ring radius
export const ARENA_SEGMENTS  = 36;    // number of static wall segments

export const MAGNET_RADIUS   = 20;    // px — collision radius

// Physics body properties for that "snappy" clumping feel
export const MAGNET_FRICTION_AIR = 0.08;  // higher → bodies shed velocity quickly after impact
export const MAGNET_RESTITUTION  = 0.05;  // near-zero → no bounce, energy absorbed on contact
export const MAGNET_FRICTION     = 0.5;   // higher surface drag keeps clumped magnets locked together
export const MAGNET_DENSITY      = 0.005;

// Force math: clamp denominator to prevent singularity
export const FORCE_DISTANCE_CLAMP = 45;

// Default slider values
export const DEFAULT_STRENGTH     = 50;
export const DEFAULT_FIELD_RADIUS = 150;

// Game
export const HAND_SIZE = 10;
export const PLAYER_COLORS: [string, string] = ['#ff4455', '#00d4ff'];
export const PLAYER_UIDS: [string, string] = ['P-01', 'P-02'];

// Sleep detection — turn ends when all bodies are slow for this many consecutive frames
export const SLEEP_SPEED_THRESHOLD     = 0.5;  // px / frame
export const SLEEP_CONSECUTIVE_FRAMES  = 40;   // ~0.67 s at 60 fps

export const MAGNET_COLORS = PLAYER_COLORS;
