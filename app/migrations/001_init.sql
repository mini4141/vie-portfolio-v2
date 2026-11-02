CREATE TABLE users (
  id            INTEGER PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at    INTEGER NOT NULL
);

CREATE TABLE sessions (
  id         TEXT PRIMARY KEY,
  role       TEXT NOT NULL CHECK (role IN ('owner', 'guest')),
  user_id    INTEGER REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX sessions_expires ON sessions(expires_at);

CREATE TABLE login_attempts (
  key          TEXT PRIMARY KEY,
  fails        INTEGER NOT NULL DEFAULT 0,
  locked_until INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE media (
  id            INTEGER PRIMARY KEY,
  filename      TEXT NOT NULL UNIQUE,
  original_name TEXT NOT NULL,
  mime          TEXT NOT NULL,
  bytes         INTEGER NOT NULL,
  width         INTEGER,
  height        INTEGER,
  alt           TEXT NOT NULL DEFAULT '',
  created_at    INTEGER NOT NULL
);

CREATE TABLE projects (
  id             INTEGER PRIMARY KEY,
  slug           TEXT NOT NULL UNIQUE,
  title          TEXT NOT NULL,
  summary        TEXT NOT NULL DEFAULT '',
  story_html     TEXT NOT NULL DEFAULT '',
  cover_media_id INTEGER REFERENCES media(id) ON DELETE SET NULL,
  kind           TEXT NOT NULL DEFAULT '',
  role           TEXT NOT NULL DEFAULT '',
  stack          TEXT NOT NULL DEFAULT '',
  tags           TEXT NOT NULL DEFAULT '[]',
  live_url       TEXT NOT NULL DEFAULT '',
  src_url        TEXT NOT NULL DEFAULT '',
  started        TEXT NOT NULL DEFAULT '',
  finished       TEXT NOT NULL DEFAULT '',
  featured       INTEGER NOT NULL DEFAULT 0,
  status         TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
  is_sample      INTEGER NOT NULL DEFAULT 0,
  position       INTEGER NOT NULL DEFAULT 0,
  created_at     INTEGER NOT NULL,
  updated_at     INTEGER NOT NULL,
  published_at   INTEGER
);
CREATE INDEX projects_status ON projects(status, position);

CREATE TABLE profile (
  id             INTEGER PRIMARY KEY CHECK (id = 1),
  name           TEXT NOT NULL DEFAULT '',
  headline       TEXT NOT NULL DEFAULT '',
  status_line    TEXT NOT NULL DEFAULT '',
  photo_media_id INTEGER REFERENCES media(id) ON DELETE SET NULL,
  about          TEXT NOT NULL DEFAULT '',
  location       TEXT NOT NULL DEFAULT '',
  email          TEXT NOT NULL DEFAULT '',
  skills         TEXT NOT NULL DEFAULT '[]',
  experience     TEXT NOT NULL DEFAULT '[]',
  links          TEXT NOT NULL DEFAULT '[]',
  cv_media_id    INTEGER REFERENCES media(id) ON DELETE SET NULL,
  sections       TEXT NOT NULL DEFAULT '[]'
);

CREATE TABLE settings (
  id             INTEGER PRIMARY KEY CHECK (id = 1),
  site_title     TEXT NOT NULL DEFAULT '',
  description    TEXT NOT NULL DEFAULT '',
  share_media_id INTEGER REFERENCES media(id) ON DELETE SET NULL,
  accent         TEXT NOT NULL DEFAULT '#12805C',
  default_theme  TEXT NOT NULL DEFAULT 'system' CHECK (default_theme IN ('system', 'light', 'dark')),
  guest_enabled  INTEGER NOT NULL DEFAULT 1
);
