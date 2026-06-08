import { Post } from './types'
import { GRADIENTS, hash, buildGrowthHistory, inferNiche, inferFormat } from './media-utils'

const API_KEY = process.env.YOUTUBE_API_KEY

const BASE = 'https://www.googleapis.com/youtube/v3'


interface YTSearchItem {
  id: { videoId: string }
  snippet: {
    publishedAt: string
    channelId: string
    title: string
    description: string
    channelTitle: string
  }
}

interface YTVideo {
  id: string
  snippet: {
    publishedAt: string
    channelId: string
    title: string
    description: string
    channelTitle: string
    tags?: string[]
    thumbnails: {
      maxres?: { url: string }
      high?: { url: string }
      medium?: { url: string }
      default?: { url: string }
    }
  }
  statistics: {
    viewCount?: string
    likeCount?: string
    commentCount?: string
  }
}

interface YTChannel {
  id: string
  snippet: { customUrl?: string }
  statistics: { subscriberCount?: string }
}


function computeExplosionScore(
  views: number,
  likes: number,
  comments: number,
  subscribers: number,
  hoursOld: number
): number {
  const velocity = views / Math.max(hoursOld, 1)
  const engagement = (likes + comments) / Math.max(views, 1)
  // Key metric: views-to-subscribers ratio — a small creator with 10k subs getting 500k views is a huge signal
  const disparity = views / Math.max(subscribers, 500)

  const velocityNorm = Math.min(1, velocity / 100_000)      // 100k/hr = max
  const engagementNorm = Math.min(1, engagement / 0.10)     // 10% eng = max
  const disparityNorm = Math.min(1, disparity / 50)         // 50x subscriber ratio = max

  const raw = (velocityNorm * 0.30 + engagementNorm * 0.30 + disparityNorm * 0.40) * 100
  return Math.round(Math.max(50, Math.min(99, 50 + raw * 0.49)))
}

async function yt<T>(endpoint: string, params: Record<string, string>): Promise<T> {
  const url = new URL(`${BASE}/${endpoint}`)
  Object.entries({ ...params, key: API_KEY! }).forEach(([k, v]) => url.searchParams.set(k, v))
  const res = await fetch(url.toString(), { cache: 'no-store' })
  if (!res.ok) throw new Error(`YouTube API ${endpoint} → ${res.status}`)
  return res.json()
}

const CACHE_TTL = 2 * 60 * 60 * 1000
const CACHE_VERSION = 'v5-small-creator'
const cache = new Map<string, { posts: Post[]; ts: number }>()

async function searchVideos(params: Record<string, string>): Promise<YTSearchItem[]> {
  try {
    const data = await yt<{ items?: YTSearchItem[] }>('search', {
      part: 'snippet',
      type: 'video',
      regionCode: 'US',
      maxResults: '25',
      ...params,
    })
    return data.items ?? []
  } catch {
    return []
  }
}

export interface FetchOptions {
  maxSubscribers?: number  // filter out channels above this threshold
}

export async function fetchYouTubePosts(opts: FetchOptions = {}): Promise<Post[]> {
  if (!API_KEY) throw new Error('YOUTUBE_API_KEY not set')

  const cacheKey = `${CACHE_VERSION}:${JSON.stringify(opts)}`
  const hit = cache.get(cacheKey)
  if (hit && Date.now() - hit.ts < CACHE_TTL) return hit.posts

  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString()

  // Six format-specific searches — all scoped to short-form (<4 min) and recent (30 days).
  // order: 'viewCount' intentionally surfaces breakout videos; small creators who went viral
  // will appear here. The maxSubscribers filter in the mapping step cuts established channels.
  const searchResults = await Promise.all([
    // Car singalong / intimate driving performance
    searchVideos({ q: 'singing in the car original song shorts', order: 'viewCount', publishedAfter: thirtyDaysAgo, relevanceLanguage: 'en', videoDuration: 'short' }),
    // Bedroom / lo-fi acoustic original
    searchVideos({ q: 'bedroom acoustic original song', order: 'viewCount', publishedAfter: thirtyDaysAgo, relevanceLanguage: 'en', videoDuration: 'short' }),
    // Cover of a trending song — posted before market saturation
    searchVideos({ q: 'viral cover song shorts fyp', order: 'viewCount', publishedAfter: thirtyDaysAgo, relevanceLanguage: 'en', videoDuration: 'short' }),
    // Raw one-take vocal / voice check format
    searchVideos({ q: 'voice check original song', order: 'viewCount', publishedAfter: thirtyDaysAgo, relevanceLanguage: 'en', videoDuration: 'short' }),
    // Vulnerability / "finally posting" reveal
    searchVideos({ q: 'finally posting my song nervous original', order: 'viewCount', publishedAfter: thirtyDaysAgo, relevanceLanguage: 'en', videoDuration: 'short' }),
    // Harmony stack / layered vocal reveal
    searchVideos({ q: 'vocal harmony layered original song shorts', order: 'viewCount', publishedAfter: thirtyDaysAgo, relevanceLanguage: 'en', videoDuration: 'short' }),
  ])

  // Deduplicate across all six searches
  const seen = new Set<string>()
  const searchItems: YTSearchItem[] = []
  for (const item of searchResults.flat()) {
    if (!seen.has(item.id.videoId)) {
      seen.add(item.id.videoId)
      searchItems.push(item)
    }
  }

  const allIds = searchItems.map(i => i.id.videoId)
  if (allIds.length === 0) return []

  const chunks: string[][] = []
  for (let i = 0; i < allIds.length; i += 50) chunks.push(allIds.slice(i, i + 50))

  const videoChunks = await Promise.all(
    chunks.map(ids =>
      yt<{ items?: YTVideo[] }>('videos', { part: 'snippet,statistics', id: ids.join(',') })
        .then(d => d.items ?? [])
        .catch(() => [] as YTVideo[])
    )
  )

  const videos = videoChunks.flat()

  // Batch-fetch channel subscriber counts — also chunked at 50
  const uniqueChannelIds = [...new Set(videos.map(v => v.snippet.channelId))]
  const channelChunks: string[][] = []
  for (let i = 0; i < uniqueChannelIds.length; i += 50) channelChunks.push(uniqueChannelIds.slice(i, i + 50))

  const channelResults = await Promise.all(
    channelChunks.map(ids =>
      yt<{ items?: YTChannel[] }>('channels', { part: 'statistics,snippet', id: ids.join(',') })
        .then(d => d.items ?? [])
        .catch(() => [] as YTChannel[])
    )
  )
  const channelMap = new Map(channelResults.flat().map(c => [c.id, c]))

  const now = Date.now()

  const posts = videos
    .map((video): Post | null => {
      const channel = channelMap.get(video.snippet.channelId)
      const subscribers = parseInt(channel?.statistics.subscriberCount ?? '0')

      if (opts.maxSubscribers !== undefined && subscribers > opts.maxSubscribers) return null

      const h = hash(video.id)
      const views = parseInt(video.statistics.viewCount ?? '0')
      const likes = parseInt(video.statistics.likeCount ?? '0')
      const comments = parseInt(video.statistics.commentCount ?? '0')

      const postedMs = new Date(video.snippet.publishedAt).getTime()
      const hoursOld = Math.max((now - postedMs) / 3_600_000, 1)
      const velocityViewsPerHour = Math.round(views / hoursOld)

      const saves = Math.round(views * 0.025)
      const shares = Math.round(views * 0.018)
      const vv = Math.max(views, 1)
      const likeRate = likes / vv
      const commentRate = comments / vv
      const shareRate = shares / vv
      const saveRate = saves / vv
      const engagementRate = likeRate + commentRate + shareRate + saveRate
      const reachMultiplier = views / Math.max(subscribers, 1)
      const explosionScore = computeExplosionScore(views, likes, comments, subscribers, hoursOld)
      const growthDelta = Math.min(velocityViewsPerHour / Math.max(views, 1), 1)

      const rawHandle = channel?.snippet.customUrl ?? video.snippet.channelTitle.toLowerCase().replace(/\s+/g, '')
      const handle = rawHandle.startsWith('@') ? rawHandle : `@${rawHandle}`

      const tags = video.snippet.tags ?? []

      const growthHistory = buildGrowthHistory(views, video.id)

      const thumbnailUrl =
        video.snippet.thumbnails.maxres?.url ??
        video.snippet.thumbnails.high?.url ??
        video.snippet.thumbnails.medium?.url

      return {
        id: `yt-${video.id}`,
        platform: 'youtube',
        creatorId: video.snippet.channelId,
        creatorName: video.snippet.channelTitle,
        creatorHandle: handle,
        followerCount: subscribers,
        creatorGradient: GRADIENTS[h % GRADIENTS.length],
        views,
        likes,
        comments,
        shares,
        saves,
        engagementRate, likeRate, commentRate, shareRate, saveRate, reachMultiplier,
        saveShareRatio: saves / Math.max(saves + shares, 1),
        velocityViewsPerHour,
        growthDelta,
        explosionScore,
        audioName: video.snippet.title,
        thumbnailUrl,
        hashtags: tags.slice(0, 6),
        niche: inferNiche([...tags, video.snippet.title, video.snippet.description].join(' ')),
        caption: video.snippet.description.slice(0, 300),
        emoji: '',
        gradient: GRADIENTS[h % GRADIENTS.length],
        formatCluster: inferFormat([...tags, video.snippet.title, video.snippet.description].join(' ')),
        createdAt: video.snippet.publishedAt,
        growthHistory,
        postUrl: `https://www.youtube.com/watch?v=${video.id}`,
      }
    })
    .filter((p): p is Post => p !== null)

  const sorted = posts.sort((a, b) => b.explosionScore - a.explosionScore)
  cache.set(cacheKey, { posts: sorted, ts: Date.now() })
  return sorted
}
