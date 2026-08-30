export const DATABASE_SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  phone TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE users ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'player' CHECK (role IN ('player', 'club_admin', 'moderator', 'platform_admin'));
ALTER TABLE users ADD COLUMN IF NOT EXISTS nickname TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS city TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS bio TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS favorite_game_ids TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE users ADD COLUMN IF NOT EXISTS visibility JSONB NOT NULL DEFAULT '{"city":true,"steam":true,"analytics":true}'::jsonb;
ALTER TABLE users ADD COLUMN IF NOT EXISTS deletion_scheduled_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
CREATE UNIQUE INDEX IF NOT EXISTS users_nickname_unique_idx ON users (LOWER(nickname)) WHERE deleted_at IS NULL AND nickname IS NOT NULL;

CREATE TABLE IF NOT EXISTS games (id TEXT PRIMARY KEY, slug TEXT UNIQUE NOT NULL, name TEXT NOT NULL, steam_app_id INTEGER, team_size INTEGER NOT NULL CHECK (team_size BETWEEN 1 AND 10), active BOOLEAN NOT NULL DEFAULT TRUE);
INSERT INTO games (id, slug, name, steam_app_id, team_size) VALUES ('cs2','cs2','Counter-Strike 2',730,5), ('dota2','dota-2','Dota 2',570,5), ('valorant','valorant','VALORANT',NULL,5) ON CONFLICT (id) DO NOTHING;
CREATE TABLE IF NOT EXISTS steam_connections (user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE, steam_id TEXT UNIQUE NOT NULL, persona_name TEXT, avatar_url TEXT, profile_url TEXT, is_public BOOLEAN NOT NULL DEFAULT FALSE, playtime_minutes INTEGER, raw_public_data JSONB, synced_at TIMESTAMPTZ, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
CREATE TABLE IF NOT EXISTS club_memberships (club_id TEXT NOT NULL, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, role TEXT NOT NULL CHECK (role IN ('admin','moderator')), created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), PRIMARY KEY (club_id, user_id));

CREATE TABLE IF NOT EXISTS chat_channels (id TEXT PRIMARY KEY, game_id TEXT NOT NULL REFERENCES games(id), scope TEXT NOT NULL CHECK (scope IN ('country','city')), city TEXT, name TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), CHECK ((scope = 'country' AND city IS NULL) OR (scope = 'city' AND city IS NOT NULL)));
CREATE UNIQUE INDEX IF NOT EXISTS chat_channels_scope_idx ON chat_channels (game_id, scope, COALESCE(city, ''));
INSERT INTO chat_channels (id, game_id, scope, city, name) SELECT id || '-kz', id, 'country', NULL, name || ' · Казахстан' FROM games ON CONFLICT DO NOTHING;
INSERT INTO chat_channels (id, game_id, scope, city, name) SELECT id || '-almaty', id, 'city', 'Алматы', name || ' · Алматы' FROM games ON CONFLICT DO NOTHING;
CREATE TABLE IF NOT EXISTS chat_messages (id TEXT PRIMARY KEY, channel_id TEXT NOT NULL REFERENCES chat_channels(id) ON DELETE CASCADE, author_id TEXT REFERENCES users(id) ON DELETE SET NULL, text TEXT NOT NULL CHECK (char_length(text) BETWEEN 1 AND 2000), reply_to_id TEXT REFERENCES chat_messages(id) ON DELETE SET NULL, image_url TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), deleted_at TIMESTAMPTZ);
CREATE INDEX IF NOT EXISTS chat_messages_cursor_idx ON chat_messages (channel_id, created_at DESC, id DESC);
CREATE TABLE IF NOT EXISTS user_blocks (blocker_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, blocked_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), PRIMARY KEY (blocker_id, blocked_id), CHECK (blocker_id <> blocked_id));
CREATE TABLE IF NOT EXISTS chat_reports (id TEXT PRIMARY KEY, message_id TEXT NOT NULL REFERENCES chat_messages(id), reporter_id TEXT REFERENCES users(id) ON DELETE SET NULL, category TEXT NOT NULL, comment TEXT, message_snapshot TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'open', created_at TIMESTAMPTZ NOT NULL DEFAULT NOW());

CREATE TABLE IF NOT EXISTS teams (id TEXT PRIMARY KEY, game_id TEXT NOT NULL REFERENCES games(id), name TEXT NOT NULL, logo_url TEXT, captain_id TEXT NOT NULL REFERENCES users(id), created_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
CREATE TABLE IF NOT EXISTS team_members (team_id TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, status TEXT NOT NULL CHECK (status IN ('invited','active','declined')), invited_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), expires_at TIMESTAMPTZ, PRIMARY KEY (team_id, user_id));
CREATE TABLE IF NOT EXISTS tournaments (id TEXT PRIMARY KEY, club_id TEXT NOT NULL, game_id TEXT NOT NULL REFERENCES games(id), creator_id TEXT REFERENCES users(id), name TEXT NOT NULL, description TEXT NOT NULL DEFAULT '', rules TEXT NOT NULL DEFAULT '', kind TEXT NOT NULL CHECK (kind IN ('solo','team')), capacity INTEGER NOT NULL CHECK (capacity IN (4,8,16,32)), status TEXT NOT NULL DEFAULT 'draft', registration_starts_at TIMESTAMPTZ NOT NULL, registration_ends_at TIMESTAMPTZ NOT NULL, starts_at TIMESTAMPTZ NOT NULL, entry_fee_text TEXT, prize_text TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), CHECK (registration_starts_at < registration_ends_at AND registration_ends_at <= starts_at));
CREATE INDEX IF NOT EXISTS tournaments_discovery_idx ON tournaments (status, starts_at, game_id);
CREATE TABLE IF NOT EXISTS tournament_registrations (id TEXT PRIMARY KEY, tournament_id TEXT NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE, user_id TEXT REFERENCES users(id), team_id TEXT REFERENCES teams(id), status TEXT NOT NULL DEFAULT 'pending', created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), CHECK ((user_id IS NULL) <> (team_id IS NULL)));
CREATE UNIQUE INDEX IF NOT EXISTS tournament_user_registration_idx ON tournament_registrations (tournament_id, user_id) WHERE user_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS tournament_team_registration_idx ON tournament_registrations (tournament_id, team_id) WHERE team_id IS NOT NULL;
CREATE TABLE IF NOT EXISTS tournament_matches (id TEXT PRIMARY KEY, tournament_id TEXT NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE, round INTEGER NOT NULL, position INTEGER NOT NULL, participant_a_id TEXT, participant_b_id TEXT, score_a INTEGER, score_b INTEGER, winner_id TEXT, reporter_id TEXT REFERENCES users(id), status TEXT NOT NULL DEFAULT 'pending', created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), UNIQUE (tournament_id, round, position));
CREATE TABLE IF NOT EXISTS notifications (id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, type TEXT NOT NULL, title TEXT NOT NULL, body TEXT NOT NULL, href TEXT, read_at TIMESTAMPTZ, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
CREATE INDEX IF NOT EXISTS notifications_user_idx ON notifications (user_id, created_at DESC);
CREATE TABLE IF NOT EXISTS push_devices (token TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, platform TEXT NOT NULL, enabled BOOLEAN NOT NULL DEFAULT TRUE, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
CREATE INDEX IF NOT EXISTS push_devices_user_idx ON push_devices (user_id) WHERE enabled;

CREATE TABLE IF NOT EXISTS clubs (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  address TEXT NOT NULL,
  city TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'available' CHECK (status IN ('available', 'busy', 'offline')),
  tags TEXT[] NOT NULL DEFAULT '{}',
  equipment TEXT NOT NULL DEFAULT '',
  accent TEXT NOT NULL DEFAULT '#b8ff45',
  phone TEXT,
  opening_hours TEXT,
  rating NUMERIC(2,1) NOT NULL DEFAULT 0 CHECK (rating BETWEEN 0 AND 5),
  review_count INTEGER NOT NULL DEFAULT 0 CHECK (review_count >= 0),
  distance_km NUMERIC(4,1) NOT NULL DEFAULT 0 CHECK (distance_km >= 0),
  published BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS club_zones (
  club_id TEXT NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  id TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  price_per_hour INTEGER NOT NULL CHECK (price_per_hour >= 0),
  seat_count INTEGER NOT NULL CHECK (seat_count BETWEEN 1 AND 200),
  sort_order INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (club_id, id)
);

CREATE INDEX IF NOT EXISTS club_memberships_user_idx ON club_memberships (user_id);

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

CREATE TABLE IF NOT EXISTS club_menu_items (
  id TEXT PRIMARY KEY,
  club_id TEXT NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  category TEXT NOT NULL CHECK (category IN ('drinks', 'food', 'snacks', 'other')),
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  price INTEGER NOT NULL CHECK (price >= 0),
  available BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS club_menu_items_club_idx ON club_menu_items (club_id, sort_order);

CREATE TABLE IF NOT EXISTS club_orders (
  id TEXT PRIMARY KEY,
  club_id TEXT NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id),
  seat_label TEXT NOT NULL,
  lines JSONB NOT NULL,
  total INTEGER NOT NULL CHECK (total >= 0),
  status TEXT NOT NULL CHECK (status IN ('new', 'accepted', 'delivered', 'cancelled')),
  comment TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS club_orders_club_idx ON club_orders (club_id, created_at DESC);
CREATE INDEX IF NOT EXISTS club_orders_user_idx ON club_orders (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS club_accounts (
  club_id TEXT NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  nickname TEXT NOT NULL,
  balance INTEGER NOT NULL DEFAULT 0,
  bonus_points INTEGER NOT NULL DEFAULT 0,
  hours_played INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (club_id, user_id)
);
`;
