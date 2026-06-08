-- Cultural Intel Database Schema
-- Run this in your Supabase SQL editor: supabase.com → Project → SQL Editor

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ── Creators ──────────────────────────────────────────────────────────────────
-- One row per creator per platform. Follower count is updated on each ingest.
CREATE TABLE IF NOT EXISTS creators (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  platform               TEXT NOT NULL CHECK (platform IN ('youtube', 'tiktok', 'spotify', 'instagram')),
  platform_id            TEXT NOT NULL,
  handle                 TEXT,
  display_name           TEXT,
  follower_count         INTEGER DEFAULT 0,
  follower_count_updated_at TIMESTAMPTZ DEFAULT now(),
  niche                  TEXT[] DEFAULT '{}',
  created_at             TIMESTAMPTZ DEFAULT now(),
  UNIQUE (platform, platform_id)
);

-- ── Posts ─────────────────────────────────────────────────────────────────────
-- Stable anchor — never updated after first insert. Metrics live in post_snapshots.
CREATE TABLE IF NOT EXISTS posts (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  platform_post_id  TEXT UNIQUE NOT NULL,
  platform          TEXT NOT NULL,
  creator_id        UUID REFERENCES creators (id) ON DELETE SET NULL,
  title             TEXT,
  caption           TEXT,
  audio_name        TEXT,
  audio_platform_id TEXT,
  hashtags          TEXT[] DEFAULT '{}',
  format_cluster    TEXT,
  thumbnail_url     TEXT,
  post_url          TEXT,
  posted_at         TIMESTAMPTZ,
  first_seen_at     TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS posts_platform_idx ON posts (platform);
CREATE INDEX IF NOT EXISTS posts_creator_idx  ON posts (creator_id);
CREATE INDEX IF NOT EXISTS posts_posted_at_idx ON posts (posted_at DESC);
CREATE INDEX IF NOT EXISTS posts_audio_idx    ON posts (audio_name);

-- ── Post Snapshots ────────────────────────────────────────────────────────────
-- Append-only time-series. Every ingest job adds a row for each post.
-- This table is the product's competitive moat — do not delete rows.
CREATE TABLE IF NOT EXISTS post_snapshots (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id                     UUID NOT NULL REFERENCES posts (id) ON DELETE CASCADE,
  captured_at                 TIMESTAMPTZ NOT NULL DEFAULT now(),
  views                       BIGINT DEFAULT 0,
  likes                       INTEGER DEFAULT 0,
  comments                    INTEGER DEFAULT 0,
  shares                      INTEGER DEFAULT 0,
  saves                       INTEGER DEFAULT 0,
  creator_followers_at_capture INTEGER DEFAULT 0
);

CREATE INDEX IF NOT EXISTS snapshots_post_time_idx ON post_snapshots (post_id, captured_at DESC);
CREATE INDEX IF NOT EXISTS snapshots_captured_at_idx ON post_snapshots (captured_at DESC);

-- ── Breakout Signals ──────────────────────────────────────────────────────────
-- Written by the detection job when it identifies a velocity spike or disparity jump.
CREATE TABLE IF NOT EXISTS breakout_signals (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id                UUID NOT NULL REFERENCES posts (id) ON DELETE CASCADE,
  detected_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  signal_type            TEXT NOT NULL, -- 'velocity_spike' | 'disparity_jump' | 'format_wave'
  confidence             FLOAT DEFAULT 0,
  views_at_detection     BIGINT,
  velocity_at_detection  FLOAT,         -- real views/hr delta between last two snapshots
  predicted_peak_views   BIGINT,
  features               JSONB          -- raw vector for ML retraining
);

CREATE INDEX IF NOT EXISTS signals_post_idx       ON breakout_signals (post_id);
CREATE INDEX IF NOT EXISTS signals_detected_at_idx ON breakout_signals (detected_at DESC);
CREATE INDEX IF NOT EXISTS signals_type_idx        ON breakout_signals (signal_type);

-- ── Audio Trends ──────────────────────────────────────────────────────────────
-- Aggregated counts per audio track. Updated by the daily aggregate job.
CREATE TABLE IF NOT EXISTS audio_trends (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  platform          TEXT NOT NULL,
  audio_platform_id TEXT,
  audio_name        TEXT NOT NULL,
  first_seen_at     TIMESTAMPTZ DEFAULT now(),
  last_seen_at      TIMESTAMPTZ DEFAULT now(),
  post_count        INTEGER DEFAULT 1,
  total_views       BIGINT DEFAULT 0,
  velocity          FLOAT DEFAULT 0,   -- posts/day using this audio (rolling 7d)
  UNIQUE (platform, audio_name)
);

CREATE INDEX IF NOT EXISTS audio_trends_name_idx     ON audio_trends (audio_name);
CREATE INDEX IF NOT EXISTS audio_trends_velocity_idx ON audio_trends (velocity DESC);

-- ── Helper view: latest snapshot per post ─────────────────────────────────────
CREATE OR REPLACE VIEW post_latest_snapshot AS
SELECT DISTINCT ON (post_id)
  post_id,
  captured_at,
  views,
  likes,
  comments,
  shares,
  saves,
  creator_followers_at_capture
FROM post_snapshots
ORDER BY post_id, captured_at DESC;

-- ── Helper view: real velocity (delta between last two snapshots) ──────────────
-- This replaces the fake lifetime-average velocity used in the current app.
CREATE OR REPLACE VIEW post_real_velocity AS
SELECT
  s1.post_id,
  s1.captured_at AS latest_at,
  s1.views AS latest_views,
  s2.captured_at AS prev_at,
  s2.views AS prev_views,
  EXTRACT(EPOCH FROM (s1.captured_at - s2.captured_at)) / 3600 AS hours_between,
  CASE
    WHEN EXTRACT(EPOCH FROM (s1.captured_at - s2.captured_at)) > 0
    THEN (s1.views - s2.views)::FLOAT /
         (EXTRACT(EPOCH FROM (s1.captured_at - s2.captured_at)) / 3600)
    ELSE 0
  END AS real_velocity_per_hour
FROM (
  SELECT *, ROW_NUMBER() OVER (PARTITION BY post_id ORDER BY captured_at DESC) AS rn
  FROM post_snapshots
) s1
JOIN (
  SELECT *, ROW_NUMBER() OVER (PARTITION BY post_id ORDER BY captured_at DESC) AS rn
  FROM post_snapshots
) s2 ON s1.post_id = s2.post_id AND s1.rn = 1 AND s2.rn = 2;
