import { createClient } from '@supabase/supabase-js'

const url  = process.env.SUPABASE_URL
const key  = process.env.SUPABASE_SERVICE_KEY  // service role key — server only, never expose to client

export const db = url && key
  ? createClient(url, key, { auth: { persistSession: false } })
  : null

export function requireDb() {
  if (!db) throw new Error('SUPABASE_URL / SUPABASE_SERVICE_KEY not set')
  return db
}

// ── Typed row shapes ───────────────────────────────────────────────────────────

export interface DbCreator {
  id: string
  platform: string
  platform_id: string
  handle: string | null
  display_name: string | null
  follower_count: number
  follower_count_updated_at: string
  niche: string[]
  created_at: string
}

export interface DbPost {
  id: string
  platform_post_id: string
  platform: string
  creator_id: string | null
  title: string | null
  caption: string | null
  audio_name: string | null
  audio_platform_id: string | null
  hashtags: string[]
  format_cluster: string | null
  thumbnail_url: string | null
  post_url: string | null
  posted_at: string | null
  first_seen_at: string
}

export interface DbPostSnapshot {
  id: string
  post_id: string
  captured_at: string
  views: number
  likes: number
  comments: number
  shares: number
  saves: number
  creator_followers_at_capture: number
}

export interface DbBreakoutSignal {
  id: string
  post_id: string
  detected_at: string
  signal_type: string
  confidence: number
  views_at_detection: number | null
  velocity_at_detection: number | null
  predicted_peak_views: number | null
  features: Record<string, unknown> | null
}

export interface DbAudioTrend {
  id: string
  platform: string
  audio_platform_id: string | null
  audio_name: string
  first_seen_at: string
  last_seen_at: string
  post_count: number
  total_views: number
  velocity: number
}
