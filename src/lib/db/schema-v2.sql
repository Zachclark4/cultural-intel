-- Cultural Intel Schema V2 — Additive Migration
-- Run this in Supabase SQL Editor AFTER the initial schema.sql migration.
-- All statements are safe to re-run (IF NOT EXISTS / DO blocks).

-- ── Posts: new metadata columns ───────────────────────────────────────────────

ALTER TABLE posts ADD COLUMN IF NOT EXISTS discovery_source TEXT DEFAULT 'hashtag';
-- Tracks how content was found: 'hashtag' | 'keyword' | 'watchlist' | 'trending-audio' | 'competitor'

ALTER TABLE posts ADD COLUMN IF NOT EXISTS format_summary TEXT;
-- AI-generated one-sentence description of what literally happens in the video.
-- Example: "Creator films acoustic guitar performance from bedroom, single take."

ALTER TABLE posts ADD COLUMN IF NOT EXISTS artist_adaptation TEXT;
-- AI-generated one-sentence suggestion for how a music artist could recreate this format.
-- Example: "Artist could film a stripped-back acoustic version of their latest single in a similar setting."

ALTER TABLE posts ADD COLUMN IF NOT EXISTS format_processed_at TIMESTAMPTZ;
-- Timestamp of last format intel generation. NULL = not yet processed.

-- ── Creator Watchlist ─────────────────────────────────────────────────────────
-- Creators worth monitoring continuously. Populated by populate-watchlist job.
-- Monitor job re-checks these creators every 12 hours for new content.

CREATE TABLE IF NOT EXISTS creator_watchlist (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id      UUID NOT NULL REFERENCES creators(id) ON DELETE CASCADE,
  platform        TEXT NOT NULL,
  platform_id     TEXT NOT NULL,
  handle          TEXT,
  added_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_checked_at TIMESTAMPTZ,           -- NULL = never checked by monitor job
  reason          TEXT,                  -- 'sweet-spot' | 'viral-post' | 'manual'
  UNIQUE (platform, platform_id)
);

-- ── Indexes ───────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS watchlist_last_checked_idx
  ON creator_watchlist (last_checked_at NULLS FIRST);

CREATE INDEX IF NOT EXISTS watchlist_platform_idx
  ON creator_watchlist (platform);

CREATE INDEX IF NOT EXISTS posts_discovery_source_idx
  ON posts (discovery_source);

CREATE INDEX IF NOT EXISTS posts_format_processed_idx
  ON posts (format_processed_at NULLS FIRST);
