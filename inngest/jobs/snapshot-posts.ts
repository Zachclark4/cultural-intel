import { inngest } from '../client'
import { requireDb } from '@/lib/db/supabase'

const YT_API_KEY = process.env.YOUTUBE_API_KEY
const BASE_YT = 'https://www.googleapis.com/youtube/v3'

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
          if (!stats) continue
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

    logger.info(`Snapshot — YT: ${ytSnapshotted}, TikTok snapshotted at ingest time`)
    return { youtube: ytSnapshotted }
  }
)
