import { Post } from './types'
import { GRADIENTS, hash, buildGrowthHistory, inferNiche, inferFormat } from './media-utils'

const APIFY_TOKEN = process.env.APIFY_TOKEN
const ACTOR = 'clockworks~tiktok-scraper'
const CACHE_TTL = 4 * 60 * 60 * 1000 // 4 hours — TikTok scrapes cost Apify credits

const cache = new Map<string, { posts: Post[]; ts: number }>()

interface TikTokItem {
  id?: string
  text?: string
  createTime?: number
  authorMeta?: {
    name?: string
    nickName?: string
    fans?: number
    heart?: number
  }
  musicMeta?: {
    musicName?: string
    musicAuthor?: string
    musicOriginal?: boolean
  }
  // Stats appear at top level in most actor versions
  diggCount?: number
  shareCount?: number
  commentCount?: number
  playCount?: number
  // Some versions nest them
  stats?: {
    diggCount?: number
    shareCount?: number
    commentCount?: number
    playCount?: number
  }
  webVideoUrl?: string
  hashtags?: Array<{ name?: string; title?: string }>
  covers?: { default?: string; dynamic?: string }
  cover?: string
}


function computeExplosionScore(
  views: number,
  likes: number,
  comments: number,
  shares: number,
  followers: number,
  hoursOld: number
): number {
  const velocity = views / Math.max(hoursOld, 1)
  const engagement = (likes + comments + shares * 2) / Math.max(views, 1)

  const velocityNorm = Math.min(1, velocity / 200_000)
  const engagementNorm = Math.min(1, engagement / 0.15)

  // If follower count is unknown, weight velocity + engagement only
  if (followers <= 0) {
    const raw = (velocityNorm * 0.50 + engagementNorm * 0.50) * 100
    return Math.round(Math.max(50, Math.min(99, 50 + raw * 0.49)))
  }

  const disparityNorm = Math.min(1, (views / followers) / 100)
  const raw = (velocityNorm * 0.30 + engagementNorm * 0.30 + disparityNorm * 0.40) * 100
  return Math.round(Math.max(50, Math.min(99, 50 + raw * 0.49)))
}

function mapItem(item: TikTokItem): Post | null {
  const id = item.id
  if (!id) return null

  const likes = item.diggCount ?? item.stats?.diggCount ?? 0
  const shares = item.shareCount ?? item.stats?.shareCount ?? 0
  const comments = item.commentCount ?? item.stats?.commentCount ?? 0
  const views = item.playCount ?? item.stats?.playCount ?? 0
  const followers = item.authorMeta?.fans ?? 0

  if (views === 0) return null

  const createdAt = item.createTime
    ? new Date(item.createTime * 1000).toISOString()
    : new Date().toISOString()

  const hoursOld = Math.max((Date.now() - new Date(createdAt).getTime()) / 3_600_000, 1)
  const velocityViewsPerHour = Math.round(views / hoursOld)
  const saves = Math.round(views * 0.03)
  const vv = Math.max(views, 1)
  const likeRate = likes / vv
  const commentRate = comments / vv
  const shareRate = shares / vv
  const saveRate = saves / vv
  const engagementRate = likeRate + commentRate + shareRate + saveRate
  const reachMultiplier = views / Math.max(followers, 1)
  const explosionScore = computeExplosionScore(views, likes, comments, shares, followers, hoursOld)
  const growthDelta = Math.min(velocityViewsPerHour / Math.max(views, 1), 1)

  const handle = item.authorMeta?.name ? `@${item.authorMeta.name}` : '@unknown'
  const creatorName = item.authorMeta?.nickName ?? item.authorMeta?.name ?? 'Unknown'
  const hashtags = (item.hashtags ?? []).map(h => h.name ?? h.title ?? '').filter(Boolean).slice(0, 6)
  const caption = item.text ?? ''
  const h = hash(id)

  const growthHistory = buildGrowthHistory(views, id)

  const thumbnailUrl = item.covers?.default ?? item.cover

  // Audio: prefer original track name, skip generic "original sound - handle" labels
  const rawAudio = item.musicMeta?.musicName
  const audioName = rawAudio && !rawAudio.toLowerCase().startsWith('original sound')
    ? rawAudio
    : undefined

  return {
    id: `tt-${id}`,
    platform: 'tiktok',
    creatorId: item.authorMeta?.name ?? id,
    creatorName,
    creatorHandle: handle,
    followerCount: followers,
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
    audioName,
    thumbnailUrl,
    hashtags,
    niche: inferNiche([...hashtags, caption].join(' ')),
    caption: caption.slice(0, 300),
    emoji: '',
    gradient: GRADIENTS[h % GRADIENTS.length],
    formatCluster: inferFormat([...hashtags, caption].join(' ')),
    createdAt,
    growthHistory,
    postUrl: item.webVideoUrl ?? `https://www.tiktok.com/@${item.authorMeta?.name}/video/${id}`,
  }
}

export async function fetchTikTokPosts(): Promise<Post[]> {
  if (!APIFY_TOKEN) throw new Error('APIFY_TOKEN not set')

  const cacheKey = 'tiktok-v10-split-calls'
  const hit = cache.get(cacheKey)
  if (hit && Date.now() - hit.ts < CACHE_TTL) return hit.posts

  // Two parallel calls — 4 hashtags each stays within the 120s sync timeout.
  // scrapeType omitted: when set to 'videos' the actor scrapes specific URLs instead of hashtags.
  // resultsPerPage: 30 means ~120 raw candidates per call before dedup.
  const apifyCall = (hashtags: string[]) =>
    fetch(
      `https://api.apify.com/v2/acts/${ACTOR}/run-sync-get-dataset-items?token=${APIFY_TOKEN}&timeout=60&maxItems=50`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hashtags, resultsPerPage: 20, maxItems: 50 }),
        cache: 'no-store',
      }
    ).then(r => r.ok ? r.json() as Promise<TikTokItem[]> : Promise.resolve([] as TikTokItem[]))
     .catch(() => [] as TikTokItem[])

  const [batchA, batchB] = await Promise.all([
    apifyCall(['musictok', 'originalmusic', 'singersongwriter', 'newartist']),
    apifyCall(['acousticcover', 'coverfyp', 'indiemusic', 'singingchallenge']),
  ])

  // Deduplicate by id across both batches
  const seen = new Set<string>()
  const allItems: TikTokItem[] = []
  for (const item of [...batchA, ...batchB]) {
    if (item.id && !seen.has(item.id)) {
      seen.add(item.id)
      allItems.push(item)
    }
  }

  const MAX_FOLLOWERS = 500_000
  const posts = allItems
    .map(mapItem)
    .filter((p): p is Post => p !== null && p.followerCount <= MAX_FOLLOWERS)
    .sort((a, b) => b.explosionScore - a.explosionScore)

  cache.set(cacheKey, { posts, ts: Date.now() })
  return posts
}
