import { inngest } from '../client'
import { requireDb } from '@/lib/db/supabase'
import { inferNiche, inferFormat, isMusicContent } from '@/lib/media-utils'

const APIFY_TOKEN = process.env.APIFY_TOKEN
const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY

// Fetch a creator's latest posts from their TikTok profile page
async function scrapeCreatorTikTok(handle: string): Promise<any[]> {
  if (!APIFY_TOKEN) return []
  try {
    const url = `https://www.tiktok.com/@${handle.replace('@', '')}`
    const res = await fetch(
      `https://api.apify.com/v2/acts/clockworks~tiktok-scraper/run-sync-get-dataset-items?token=${APIFY_TOKEN}&timeout=90&maxItems=10`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ startUrls: [{ url }], maxItems: 10 }),
        cache: 'no-store',
      }
    )
    return res.ok ? res.json() : []
  } catch { return [] }
}

// Fetch a creator's latest posts from their Instagram profile page
async function scrapeCreatorInstagram(handle: string): Promise<any[]> {
  if (!APIFY_TOKEN) return []
  try {
    const username = handle.replace('@', '')
    const res = await fetch(
      `https://api.apify.com/v2/acts/apify~instagram-scraper/run-sync-get-dataset-items?token=${APIFY_TOKEN}&timeout=90&maxItems=10`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          directUrls: [`https://www.instagram.com/${username}/`],
          resultsType: 'posts',
          resultsLimit: 10,
          addParentData: false,
        }),
        cache: 'no-store',
      }
    )
    return res.ok ? res.json() : []
  } catch { return [] }
}

// Fetch a YouTube channel's latest videos
async function scrapeCreatorYouTube(channelId: string): Promise<any[]> {
  if (!YOUTUBE_API_KEY) return []
  try {
    const url = new URL('https://www.googleapis.com/youtube/v3/search')
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString()
    url.searchParams.set('part', 'snippet')
    url.searchParams.set('channelId', channelId)
    url.searchParams.set('type', 'video')
    url.searchParams.set('order', 'date')
    url.searchParams.set('maxResults', '10')
    url.searchParams.set('publishedAfter', sevenDaysAgo)
    url.searchParams.set('key', YOUTUBE_API_KEY)
    const res = await fetch(url.toString(), { cache: 'no-store' })
    if (!res.ok) return []
    const data: { items?: Array<{ id: { videoId: string } }> } = await res.json()
    return data.items ?? []
  } catch { return [] }
}

interface WatchlistCreator {
  id: string
  creator_id: string
  platform: string
  platform_id: string
  handle: string | null
}

export const monitorWatchlist = inngest.createFunction(
  {
    id: 'monitor-watchlist',
    triggers: [
      { cron: '0 */12 * * *' },
      { event: 'cultural-intel/monitor.watchlist' as string },
    ],
  },
  async ({ step, logger }) => {
    const db = requireDb()

    // Load creators due for a check (never checked, or last checked >12h ago)
    const creators = await step.run('load-due-creators', async () => {
      const cutoff = new Date(Date.now() - 12 * 3600 * 1000).toISOString()
      const { data } = await db
        .from('creator_watchlist')
        .select('id, creator_id, platform, platform_id, handle')
        .or(`last_checked_at.is.null,last_checked_at.lt.${cutoff}`)
        .limit(30) // conservative limit to avoid Apify rate limits
      return (data ?? []) as WatchlistCreator[]
    })

    if (creators.length === 0) {
      logger.info('Watchlist monitor — no creators due for check')
      return { checked: 0, inserted: 0 }
    }

    let totalInserted = 0

    for (const creator of creators) {
      // Fetch their latest content — one step per creator (serial, avoids Apify rate limits)
      const rawItems = await step.run(`fetch-${creator.platform}-${creator.platform_id}`, async () => {
        const handle = creator.handle ?? creator.platform_id
        if (creator.platform === 'tiktok') return scrapeCreatorTikTok(handle)
        if (creator.platform === 'instagram') return scrapeCreatorInstagram(handle)
        if (creator.platform === 'youtube') return scrapeCreatorYouTube(creator.platform_id)
        return []
      })

      const inserted = await step.run(`upsert-${creator.platform}-${creator.platform_id}`, async () => {
        let count = 0

        if (creator.platform === 'tiktok') {
          for (const item of rawItems) {
            if (!item.id) continue
            const views = item.playCount ?? item.stats?.playCount ?? 0
            if (views === 0) continue
            const hashtags = (item.hashtags ?? []).map((h: any) => h.name ?? h.title ?? '').filter(Boolean).slice(0, 6)
            const caption = item.text ?? ''
            const rawAudio = item.musicMeta?.musicName
            if (!isMusicContent([caption, ...hashtags, rawAudio ?? ''].join(' '))) continue

            const createdAt = item.createTimeISO ?? (item.createTime ? new Date(item.createTime * 1000).toISOString() : new Date().toISOString())
            const audioName = rawAudio && !rawAudio.toLowerCase().startsWith('original sound') ? rawAudio : null
            const thumbnail = item.covers?.default ?? item.covers?.origin ?? item.videoMeta?.coverUrl ?? item.cover

            const { data: post } = await db.from('posts').upsert({
              platform_post_id: `tt-${item.id}`,
              platform: 'tiktok',
              creator_id: creator.creator_id,
              caption: caption.slice(0, 300),
              audio_name: audioName,
              hashtags,
              format_cluster: inferFormat([...hashtags, caption].join(' ')),
              thumbnail_url: thumbnail,
              post_url: item.webVideoUrl ?? `https://www.tiktok.com/@${item.authorMeta?.name}/video/${item.id}`,
              posted_at: createdAt,
              discovery_source: 'watchlist',
            }, { onConflict: 'platform_post_id' }).select('id').single()

            if (!post) continue
            await db.from('post_snapshots').insert({
              post_id: post.id, views,
              likes: item.diggCount ?? item.stats?.diggCount ?? 0,
              comments: item.commentCount ?? item.stats?.commentCount ?? 0,
              shares: item.shareCount ?? item.stats?.shareCount ?? 0,
              saves: item.collectCount ?? item.stats?.collectCount ?? 0,
              creator_followers_at_capture: item.authorMeta?.fans ?? 0,
            })
            count++
          }
        }

        if (creator.platform === 'instagram') {
          for (const item of rawItems) {
            if (item.type !== 'Video') continue
            const shortCode = item.shortCode ?? item.id
            if (!shortCode) continue
            const views = item.videoPlayCount ?? item.videoViewCount ?? 0
            if (views === 0) continue
            const caption = item.caption ?? ''
            const hashtags = (item.hashtags ?? []).slice(0, 6)
            if (!isMusicContent([caption, ...hashtags].join(' '))) continue

            const { data: post } = await db.from('posts').upsert({
              platform_post_id: `ig-${shortCode}`,
              platform: 'instagram',
              creator_id: creator.creator_id,
              caption: caption.slice(0, 300),
              hashtags,
              format_cluster: inferFormat([...hashtags, caption].join(' ')),
              thumbnail_url: item.displayUrl ?? item.thumbnailSrc,
              post_url: `https://www.instagram.com/p/${shortCode}/`,
              posted_at: item.timestamp ?? new Date().toISOString(),
              discovery_source: 'watchlist',
            }, { onConflict: 'platform_post_id' }).select('id').single()

            if (!post) continue
            await db.from('post_snapshots').insert({
              post_id: post.id, views,
              likes: item.likesCount ?? 0,
              comments: item.commentsCount ?? 0,
              shares: 0, saves: 0,
              creator_followers_at_capture: item.ownerFollowersCount ?? 0,
            })
            count++
          }
        }

        // Mark creator as checked
        await db.from('creator_watchlist')
          .update({ last_checked_at: new Date().toISOString() })
          .eq('id', creator.id)

        return count
      })

      totalInserted += inserted
    }

    logger.info(`Watchlist monitor — checked ${creators.length} creators, inserted ${totalInserted} posts`)
    return { checked: creators.length, inserted: totalInserted }
  }
)
