CREATE TABLE leaderboard_scores (
  id BIGSERIAL PRIMARY KEY,
  winner INTEGER NOT NULL,
  game_mode TEXT NOT NULL,
  p0_moves INTEGER NOT NULL,
  p1_moves INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_leaderboard_scores_created_at ON leaderboard_scores (created_at DESC, id DESC);
