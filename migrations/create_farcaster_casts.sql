-- Farcaster Cast Tracking & Engagement Metrics
-- Run this in Supabase SQL Editor

CREATE TABLE IF NOT EXISTS farcaster_casts (
  id SERIAL PRIMARY KEY,
  cast_hash TEXT UNIQUE NOT NULL,
  account TEXT NOT NULL DEFAULT 'commissariat',
  fid INTEGER NOT NULL,
  cast_type TEXT NOT NULL DEFAULT 'brand',  -- 'brand', 'dev_update', 'weekly_recap', 'manual', 'reply'
  category TEXT,  -- 'announcement', 'manifesto', 'mechanics', 'observation', 'engagement', 'sardonic'
  text TEXT NOT NULL,
  posted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- Engagement metrics (updated by follow-up checks)
  likes INTEGER DEFAULT 0,
  recasts INTEGER DEFAULT 0,
  replies INTEGER DEFAULT 0,
  quotes INTEGER DEFAULT 0,
  
  -- Engagement deltas (growth since last check)
  likes_delta INTEGER DEFAULT 0,
  recasts_delta INTEGER DEFAULT 0,
  replies_delta INTEGER DEFAULT 0,
  
  -- Metadata
  metrics_checked_at TIMESTAMPTZ,
  metrics_check_count INTEGER DEFAULT 0,
  template_id TEXT,  -- e.g. 'cast_14' from the launch deck
  parent_hash TEXT,  -- if this is a reply
  notes TEXT,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_fc_casts_account ON farcaster_casts(account);
CREATE INDEX IF NOT EXISTS idx_fc_casts_posted_at ON farcaster_casts(posted_at DESC);
CREATE INDEX IF NOT EXISTS idx_fc_casts_cast_type ON farcaster_casts(cast_type);
CREATE INDEX IF NOT EXISTS idx_fc_casts_hash ON farcaster_casts(cast_hash);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_farcaster_casts_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_farcaster_casts_updated ON farcaster_casts;
CREATE TRIGGER trg_farcaster_casts_updated
  BEFORE UPDATE ON farcaster_casts
  FOR EACH ROW
  EXECUTE FUNCTION update_farcaster_casts_updated_at();

-- Disable RLS (backend-only table)
ALTER TABLE farcaster_casts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all" ON farcaster_casts
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
