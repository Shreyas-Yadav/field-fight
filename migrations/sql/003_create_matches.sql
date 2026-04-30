CREATE TABLE matches (
  id BIGSERIAL PRIMARY KEY,
  p0_id TEXT,
  p0_name TEXT NOT NULL DEFAULT 'ALPHA',
  p1_id TEXT,
  p1_name TEXT NOT NULL DEFAULT 'BRAVO',
  winner INTEGER NOT NULL,
  game_mode TEXT NOT NULL,
  p0_moves INTEGER NOT NULL DEFAULT 0,
  p1_moves INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_matches_created_at ON matches (created_at DESC, id DESC);
CREATE INDEX idx_matches_p0_id ON matches (p0_id);
CREATE INDEX idx_matches_p1_id ON matches (p1_id);
