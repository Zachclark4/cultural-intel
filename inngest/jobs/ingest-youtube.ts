import { inngest } from '../client'
import { requireDb } from '@/lib/db/supabase'

const API_KEY = process.env.YOUTUBE_API_KEY
const BASE = 'https://www.googleapis.com/youtube/v3'

async function yt<T>(endpoint: string, params: Record<string, string>): Promise<T> {
  const url = new URL(`${BASE}/${endpoint}`)
  Object.entries({ ...params, key: API_KEY! }).forEach(([k, v]) => url.searchParams.set(k, v))
  const res = await fetch(url.toString(), { cache: 'no-store' })
  if (!res.ok) throw new Error(`YouTube ${endpoint} → ${res.status}`)
  return res.json()
}

interface YTSearchItem { id: { videoId: string } }
interface YTVideo {
  id: string
  snippet: {
    channelId: string; channelTitle: string; title: string
    description: string; publishedAt: string; tags?: string[]
    thumbnails: { maxres?: { url: string }; high?: { url: string }; medium?: { url: string } }
  }
  statistics: { viewCount?: string; likeCount?: string; commentCount?: string }
}
interface YTChannel {
  id: string
  snippet: { customUrl?: string }
  statistics: { subscriberCount?: string }
}

export const ingestYouTube = inngest.createFunction(
  {
    id: 'ingest-youtube',
    triggers: [
      { cron: '0 */12 * * *' },
      { event: 'cultural-intel/ingest.youtube' as string },
    ],
  },
  async ({ step, logger }) => {
    if (!API_KEY) { logger.warn('YOUTUBE_API_KEY not set — skipping'); return }
    const db = requireDb()
    const sixtyDaysAgo = new Date(Date.now() - 60 * 24 * 3600 * 1000).toISOString()

    const searchIds = await step.run('search-youtube', async () => {
      const queries = [
        // Originals — core
        'singing in the car original song shorts',
        'bedroom acoustic original song',
        'voice check original song',
        'finally posting my song nervous original',
        'vocal harmony layered original song shorts',
        'first original song ever posted',
        'original song i wrote shorts',
        'wrote this song in 10 minutes shorts',
        // Discovery framing
        'indie artist original song shorts viral',
        'unsigned singer songwriter shorts',
        'underground artist original song debut',
        'viral music discovery shorts original',
        'small artist original song shorts',
        'new artist first song shorts',
        // Genre — pop / indie
        'pop original song first time posting',
        'alt pop new artist original song',
        'indie pop original shorts',
        'bedroom pop original song',
        'lo fi bedroom pop original',
        // Genre — RnB / soul
        'rnb original song bedroom recording',
        'soul singer original song shorts',
        'rnb vocal performance shorts original',
        'neo soul original song shorts',
        // Genre — country / folk
        'country original song viral shorts',
        'folk acoustic original music shorts',
        'acoustic folk original song shorts',
        'country singer songwriter original shorts',
        // Genre — rap / hip-hop
        'original rap song shorts viral',
        'freestyle rap original shorts',
        'underground rap original song shorts',
        'hip hop original beat shorts',
        // Genre — rock / alternative
        'indie rock original song shorts',
        'alternative original song shorts',
        'soft rock original song shorts',
        // Covers — high-replication format
        'viral cover song shorts fyp',
        'acoustic cover original artist shorts',
        'piano cover viral shorts',
        'guitar cover original song shorts',
        // Context / setting variety
        'bathroom acoustics singing original',
        'car singing original viral shorts',
        'street performance original song',
        // Latin / global
        'latin original song shorts viral',
        'afrobeats original song shorts',
      ]
      const results = await Promise.all(
        queries.map(q =>
          yt<{ items?: YTSearchItem[] }>('search', {
            part: 'snippet', type: 'video', regionCode: 'US', maxResults: '50',
            order: 'viewCount', publishedAfter: sixtyDaysAgo,
            relevanceLanguage: 'en', q,
          }).then(d => d.items ?? []).catch(() => [] as YTSearchItem[])
        )
      )
      const seen = new Set<string>()
      const ids: string[] = []
      for (const item of results.flat()) {
        if (!seen.has(item.id.videoId)) { seen.add(item.id.videoId); ids.push(item.id.videoId) }
      }
      return ids
    })

    if (searchIds.length === 0) return { inserted: 0 }

    const videos = await step.run('fetch-video-details', async () => {
      const chunks: string[][] = []
      for (let i = 0; i < searchIds.length; i += 50) chunks.push(searchIds.slice(i, i + 50))
      const results = await Promise.all(
        chunks.map(ids =>
          yt<{ items?: YTVideo[] }>('videos', { part: 'snippet,statistics', id: ids.join(',') })
            .then(d => d.items ?? []).catch(() => [] as YTVideo[])
        )
      )
      return results.flat()
    })

    const channelMap = await step.run('fetch-channels', async () => {
      const channelIds = [...new Set(videos.map(v => v.snippet.channelId))]
      const chunks: string[][] = []
      for (let i = 0; i < channelIds.length; i += 50) chunks.push(channelIds.slice(i, i + 50))
      const results = await Promise.all(
        chunks.map(ids =>
          yt<{ items?: YTChannel[] }>('channels', { part: 'statistics,snippet', id: ids.join(',') })
            .then(d => d.items ?? []).catch(() => [] as YTChannel[])
        )
      )
      return Object.fromEntries(results.flat().map(c => [c.id, c]))
    })

    const inserted = await step.run('upsert-to-db', async () => {
      let count = 0
      const MAX_SUBSCRIBERS = 250_000

      for (const video of videos) {
        const { snippet, statistics } = video
        const channel = channelMap[snippet.channelId] as YTChannel | undefined
        const subscribers = parseInt(channel?.statistics?.subscriberCount ?? '0')
        if (subscribers > MAX_SUBSCRIBERS) continue

        const views    = parseInt(statistics.viewCount    ?? '0')
        const likes    = parseInt(statistics.likeCount    ?? '0')
        const comments = parseInt(statistics.commentCount ?? '0')

        const rawHandle = channel?.snippet?.customUrl ?? snippet.channelTitle.toLowerCase().replace(/\s+/g, '')
        const handle = rawHandle.startsWith('@') ? rawHandle : `@${rawHandle}`

        const { data: creator } = await db
          .from('creators')
          .upsert({
            platform: 'youtube', platform_id: snippet.channelId,
            handle, display_name: snippet.channelTitle,
            follower_count: subscribers,
            follower_count_updated_at: new Date().toISOString(),
          }, { onConflict: 'platform,platform_id' })
          .select('id').single()

        if (!creator) continue

        const thumbnailUrl = snippet.thumbnails.maxres?.url ?? snippet.thumbnails.high?.url ?? snippet.thumbnails.medium?.url

        const { data: post } = await db
          .from('posts')
          .upsert({
            platform_post_id: `yt-${video.id}`, platform: 'youtube',
            creator_id: creator.id, title: snippet.title,
            caption: snippet.description.slice(0, 300),
            hashtags: snippet.tags?.slice(0, 6) ?? [],
            thumbnail_url: thumbnailUrl,
            post_url: `https://www.youtube.com/watch?v=${video.id}`,
            posted_at: snippet.publishedAt,
          }, { onConflict: 'platform_post_id' })
          .select('id').single()

        if (!post) continue

        await db.from('post_snapshots').insert({
          post_id: post.id, views, likes, comments,
          creator_followers_at_capture: subscribers,
        })
        count++
      }
      return count
    })

    logger.info(`YouTube ingest — ${inserted} posts`)
    return { inserted }
  }
)
