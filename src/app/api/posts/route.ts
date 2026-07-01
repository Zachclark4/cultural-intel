import { NextResponse } from 'next/server'
import { fetchYouTubePosts } from '@/lib/youtube'
import { fetchTikTokPosts } from '@/lib/tiktok'
import { fetchSpotifyPosts } from '@/lib/spotify'
import { db } from '@/lib/db/supabase'
import { Post } from '@/lib/types'
import { inferNiche, inferFormat, buildGrowthHistory, hash, GRADIENTS } from '@/lib/media-utils'

export const dynamic = 'force-dynamic'

// ── Supabase read ──────────────────────────────────────────────────────────────
// When the DB is connected and has recent data, serve from there.
// Falls back to direct API calls if Supabase is not configured or has no data.

async function fetchFromSupabase(): Promise<Post[] | null> {
  if (!db) return null

  const cutoff = new Date(Date.now() - 60 * 24 * 3600 * 1000).toISOString()

  const BASE_SELECT = `
    id, platform_post_id, platform, title, caption, audio_name,
    hashtags, format_cluster, thumbnail_url, post_url, posted_at,
    creators (
      platform_id, handle, display_name, follower_count, niche
    ),
    post_snapshots (
      views, likes, comments, shares, saves, captured_at, creator_followers_at_capture
    )
  `

  // Try full query including V2 columns (format intel). If schema-v2.sql hasn't been
  // run yet those columns don't exist and Supabase returns an error — fall back to
  // the base query so the feed keeps working before the migration is applied.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let result: { data: any[] | null; error: unknown } = await db
    .from('posts')
    .select(`${BASE_SELECT}, format_summary, artist_adaptation, discovery_source`)
    .gte('posted_at', cutoff)
    .limit(10000)

  if (result.error) {
    result = await db
      .from('posts')
      .select(BASE_SELECT)
      .gte('posted_at', cutoff)
      .limit(10000)
  }

  const { data, error } = result
  if (error || !data || data.length === 0) return null

  const now = Date.now()

  const posts: Post[] = data.flatMap(row => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = row as any

    // Use the most recent snapshot (post_snapshots is a table; sorted descending)
    const snapshots: Array<{ views: number; likes: number; comments: number; shares: number; saves: number; captured_at: string; creator_followers_at_capture: number }> =
      (r.post_snapshots ?? []).sort((a: { captured_at: string }, b: { captured_at: string }) =>
        new Date(b.captured_at).getTime() - new Date(a.captured_at).getTime()
      )
    const snap = snapshots[0]
    if (!snap || snap.views === 0) return []

    const creator = r.creators
    const followers = snap.creator_followers_at_capture || creator?.follower_count || 0
    const postedMs = r.posted_at ? new Date(r.posted_at).getTime() : now
    const hoursOld = Math.max((now - postedMs) / 3_600_000, 1)
    const views    = snap.views    ?? 0
    const likes    = snap.likes    ?? 0
    const comments = snap.comments ?? 0
    const shares   = snap.shares   ?? 0
    const saves    = snap.saves    ?? 0

    // Real velocity: delta between last two snapshots when available
    let velocityViewsPerHour = Math.round(views / hoursOld)
    if (snapshots.length >= 2) {
      const prev = snapshots[1]
      const deltaHours = Math.max(
        (new Date(snap.captured_at).getTime() - new Date(prev.captured_at).getTime()) / 3_600_000, 0.1
      )
      const delta = snap.views - prev.views
      if (delta > 0) velocityViewsPerHour = Math.round(delta / deltaHours)
    }

    const v = Math.max(views, 1)
    const likeRate      = likes    / v
    const commentRate   = comments / v
    const shareRate     = shares   / v
    const saveRate      = saves    / v
    const engagementRate = likeRate + commentRate + shareRate + saveRate
    const reachMultiplier = views / Math.max(followers, 1)

    const explosionScore = (() => {
      const vel  = Math.min(1, (velocityViewsPerHour / 100_000))
      const eng  = Math.min(1, engagementRate / 0.10)
      const disp = Math.min(1, reachMultiplier / 50)
      const raw  = (vel * 0.30 + eng * 0.30 + disp * 0.40) * 100
      return Math.round(Math.max(50, Math.min(99, 50 + raw * 0.49)))
    })()

    const h = hash(r.platform_post_id)
    const handle = creator?.handle ?? '@unknown'
    const niche  = creator?.niche?.length ? creator.niche
      : inferNiche([...(r.hashtags ?? []), r.caption ?? ''].join(' '))

    return [{
      id: r.platform_post_id,
      platform: r.platform,
      creatorId: creator?.platform_id ?? r.platform_post_id,
      creatorName: creator?.display_name ?? handle,
      creatorHandle: handle.startsWith('@') ? handle : `@${handle}`,
      followerCount: followers,
      creatorGradient: GRADIENTS[h % GRADIENTS.length],
      views, likes, comments, shares, saves,
      engagementRate, likeRate, commentRate, shareRate, saveRate, reachMultiplier,
      saveShareRatio: saves / Math.max(saves + shares, 1),
      velocityViewsPerHour,
      growthDelta: Math.min(velocityViewsPerHour / Math.max(views, 1), 1),
      explosionScore,
      audioName: r.audio_name ?? undefined,
      thumbnailUrl: r.thumbnail_url ?? undefined,
      hashtags: r.hashtags ?? [],
      niche,
      caption: r.caption ?? '',
      emoji: '',
      gradient: GRADIENTS[h % GRADIENTS.length],
      formatCluster: r.format_cluster ?? inferFormat([...(r.hashtags ?? []), r.caption ?? ''].join(' ')),
      createdAt: r.posted_at ?? new Date().toISOString(),
      growthHistory: buildGrowthHistory(views, r.platform_post_id),
      postUrl: r.post_url ?? '',
      formatSummary: r.format_summary ?? undefined,
      artistAdaptation: r.artist_adaptation ?? undefined,
      discoverySource: r.discovery_source ?? undefined,
    }] as Post[]
  })

  return posts.length > 0 ? posts : null
}

// ── Direct API fallback ────────────────────────────────────────────────────────

async function fetchFromAPIs(): Promise<Post[]> {
  const [youtubeResult, tiktokResult, spotifyResult] = await Promise.allSettled([
    fetchYouTubePosts({ maxSubscribers: 250_000 }),
    fetchTikTokPosts(),
    fetchSpotifyPosts(),
  ])

  const youtube = (youtubeResult.status === 'fulfilled' ? youtubeResult.value : []).slice(0, 20)
  const tiktok  = (tiktokResult.status  === 'fulfilled' ? tiktokResult.value  : [])
  const spotify = (spotifyResult.status === 'fulfilled' ? spotifyResult.value : []).slice(0, 25)

  if (youtubeResult.status === 'rejected') console.error('[cultural-intel] YouTube failed —', youtubeResult.reason)
  if (tiktokResult.status  === 'rejected') console.error('[cultural-intel] TikTok failed —',  tiktokResult.reason)
  if (spotifyResult.status === 'rejected') console.error('[cultural-intel] Spotify failed —', spotifyResult.reason)

  return [...youtube, ...tiktok, ...spotify]
}

export async function GET() {
  // Try Supabase first — if it has fresh data from background jobs, use it.
  // This gives us real velocity (delta between snapshots) instead of lifetime averages.
  const dbPosts = await fetchFromSupabase().catch(() => null)

  const posts = dbPosts ?? await fetchFromAPIs()

  if (posts.length === 0) {
    return NextResponse.json({ error: 'No data returned from any source' }, { status: 500 })
  }

  const sorted = posts.sort((a, b) => b.explosionScore - a.explosionScore)

  return NextResponse.json(sorted, {
    headers: { 'Cache-Control': 's-maxage=3600, stale-while-revalidate=1800' },
  })
}
