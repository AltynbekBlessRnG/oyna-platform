export const DATABASE_SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  phone TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS bookings (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  player_phone TEXT NOT NULL,
  player_name TEXT NOT NULL,
  club_id TEXT NOT NULL,
  zone_id TEXT NOT NULL,
  zone_name TEXT NOT NULL,
  seat_ids TEXT[] NOT NULL,
  seat_labels TEXT[] NOT NULL,
  start_at TIMESTAMPTZ NOT NULL,
  duration_hours INTEGER NOT NULL CHECK (duration_hours BETWEEN 1 AND 12),
  total_amount INTEGER NOT NULL CHECK (total_amount >= 0),
  status TEXT NOT NULL CHECK (status IN ('pending', 'confirmed', 'cancelled', 'completed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS bookings_club_schedule_idx ON bookings (club_id, zone_id, start_at);
CREATE INDEX IF NOT EXISTS bookings_user_idx ON bookings (user_id, created_at DESC);
`;

