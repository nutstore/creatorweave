-- Add explicit conversation title mode so auto/manual behavior does not rely on title text matching.
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS title_mode TEXT NOT NULL DEFAULT 'manual';

PRAGMA user_version = 3;
