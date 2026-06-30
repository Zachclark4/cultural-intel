import { inngest } from '../client'
import { requireDb } from '@/lib/db/supabase'

const YT_API_KEY      = process.env.YOUTUBE_API_KEY
const RAPIDAPI_KEY    = process.env.RAPIDAPI_KEY
const TIKTOK_HOST     = 'tiktok-scraper7.p.rapidapi.com'
const BASE_YT         = 'https://www.googleapis.com/youtube/v3'

// Snapshot 75 TikTok posts per run (every 6h = 300/day across the most recent posts)
const TIKTOK_BATCH = 75

async function fetchYTStats(ids: string[]): Promise<Map<string, { views: number; likes: number; comments: number }>> {
  const url = new URL(`${BASE_YT}/videos`)
  url.searchParams.set('part', 'statistics')
  url.searchParams.set('id', ids.join(','))
  url.searchParams.set('key', YT_API_KEY!)
  const res = await fetch(url.toString(), { cache: 'no-store' })
  if (!res.ok) return new Map()
  const data: { items?: Array<{ id: string; statistics: { viewCount?: string; likeCount?: string; commentCount?: string } }> } = await res.json()
  return new Map(
    (data.items ?? []).map(v => [v.id, {
      views:    parseInt(v.statistics.viewCount    ?? '0'),
      likes:    parseInt(v.statistics.likeCount    ?? '0'),
      comments: parseInt(v.statistics.commentCount ?? '0'),
    }])
  )
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function fetchTikTokStats(videoId: string): Promise<Record<string, any> | null> {
  if (!RAPIDAPI_KEY) return null
  try {
    const url = new URL(`https://${TIKTOK_HOST}/video/info`)
    url.searchParams.set('video_id', videoId)
    const res = await fetch(url.toString(), {
      headers: { 'x-rapidapi-key': RAPIDAPI_KEY, 'x-rapidapi-host': TIKTOK_HOST },
      cache: 'no-store',
    })
    if (!res.ok) return null
    const json = await res.json()
    // Response is either flat or nested under data
    return json?.data ?? (json?.code === 0 ? null : json) ?? null
  } catch { return null }
}

export const snapshotPosts = inngest.createFunction(
  {
    id: 'snapshot-posts',
    triggers: [{ cron: '0 */6 * * *' }],
  },
  async ({ step, logger }) => {
    const db = requireDb()

    const posts = await step.run('load-active-posts', async () => {
      const cutoff = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString()
      const { data } = await db
        .from('posts')
        .select('id, platform, platform_post_id, creator_id, creators(follower_count)')
        .gte('posted_at', cutoff)
        .order('posted_at', { ascending: false })
        .limit(500)
      return (data ?? []) as unknown as Array<{
        id: string; platform: string; platform_post_id: string
        creator_id: string | null; creators: { follower_count: number } | null
      }>
    })

    // ── YouTube ───────────────────────────────────────────────────────────────
    const ytPosts = posts.filter(p => p.platform === 'youtube')

    const ytSnapshotted = await step.run('snapshot-youtube', async () => {
      if (!YT_API_KEY || ytPosts.length === 0) return 0
      let count = 0
      const rawIds = ytPosts.map(p => p.platform_post_id.replace('yt-', ''))
      const chunks: string[][] = []
      for (let i = 0; i < rawIds.length; i += 50) chunks.push(rawIds.slice(i, i + 50))

      for (const chunk of chunks) {
        const statsMap = await fetchYTStats(chunk)
        for (const post of ytPosts.filter(p => chunk.includes(p.platform_post_id.replace('yt-', '')))) {
          const rawId = post.platform_post_id.replace('yt-', '')
          const stats = statsMap.get(rawId)
          if (!stats || stats.views === 0) continue
          const followers = post.creators?.follower_count ?? 0
          await db.from('post_snapshots').insert({
            post_id: post.id, views: stats.views, likes: stats.likes,
            comments: stats.comments, creator_followers_at_capture: followers,
          })
          count++
        }
      }
      return count
    })

    // ── TikTok ────────────────────────────────────────────────────────────────
    // Re-fetch live stats for the most recent TikTok posts so velocity is real
    // (delta between this snapshot and the one written at ingest time).
    const tiktokPosts = posts.filter(p => p.platform === 'tiktok').slice(0, TIKTOK_BATCH)

    const tiktokSnapshotted = await step.run('snapshot-tiktok', async () => {
      if (!RAPIDAPI_KEY || tiktokPosts.length === 0) return 0

      const results = await Promise.all(
        tiktokPosts.map(async post => {
          const videoId = post.platform_post_id.replace('tt-', '')
          const v = await fetchTikTokStats(videoId)
          if (!v) return null
          const views    = v.play_count    ?? v.statistics?.play_count    ?? 0
          const likes    = v.digg_count    ?? v.statistics?.digg_count    ?? 0
          const comments = v.comment_count ?? v.statistics?.comment_count ?? 0
          const shares   = v.share_count   ?? v.statistics?.share_count   ?? 0
          const saves    = v.collect_count ?? v.statistics?.collect_count ?? 0
          if (views === 0) return null
          return {
            post_id: post.id, views, likes, comments, shares, saves,
            creator_followers_at_capture: post.creators?.follower_count ?? 0,
          }
        })
      )

      const valid = results.filter(Boolean) as NonNullable<typeof results[number]>[]
      if (valid.length === 0) return 0

      await db.from('post_snapshots').insert(valid)
      return valid.length
    })

    logger.info(`Snapshot — YT: ${ytSnapshotted}, TikTok: ${tiktokSnapshotted}`)
    return { youtube: ytSnapshotted, tiktok: tiktokSnapshotted }
  }
)
