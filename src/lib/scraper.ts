import { Platform, Post } from './types'
import { GRADIENTS, hash, inferNiche, inferFormat, buildGrowthHistory } from './media-utils'

const CREATOR_GRADIENTS = [
  'linear-gradient(135deg, #d97706, #ea580c)',
  'linear-gradient(135deg, #7c3aed, #4f46e5)',
  'linear-gradient(135deg, #0e7490, #0891b2)',
  'linear-gradient(135deg, #dc2626, #b91c1c)',
  'linear-gradient(135deg, #065f46, #047857)',
  'linear-gradient(135deg, #be185d, #9d174d)',
  'linear-gradient(135deg, #9a3412, #c2410c)',
  'linear-gradient(135deg, #4c1d95, #5b21b6)',
]

const EMOJIS = ['🎸', '🎛️', '🌊', '🎤', '🎵', '🔥', '🌿', '💿', '🌙', '✨', '🎶', '🎹']

function computeExplosionScore(
  views: number, likes: number, comments: number,
  saves: number, shares: number, followers: number, hoursOld: number
): number {
  const velocity = views / Math.max(hoursOld, 1)
  const engagement = (likes + comments) / Math.max(views, 1)
  const disparity = views / Math.max(followers, 1_000)
  const saveRate = saves / Math.max(saves + shares, 1)
  const raw = (
    Math.min(1, velocity / 200_000) * 0.35 +
    Math.min(1, disparity / 20) * 0.25 +
    Math.min(1, saveRate / 0.4) * 0.20 +
    Math.min(1, engagement / 0.1) * 0.20
  ) * 100
  return Math.round(Math.max(50, Math.min(99, 50 + raw * 0.49)))
}


function decodeHTML(str: string): string {
  return str
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&apos;/g, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
}

function extractMeta(html: string, prop: string): string {
  for (const re of [
    new RegExp(`<meta[^>]+property=["']${prop}["'][^>]+content=["']([^"']+)["']`, 'i'),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+property=["']${prop}["']`, 'i'),
    new RegExp(`<meta[^>]+name=["']${prop}["'][^>]+content=["']([^"']+)["']`, 'i'),
  ]) {
    const m = html.match(re)
    if (m?.[1]) return decodeHTML(m[1])
  }
  return ''
}

// Extract the handle from a TikTok profile URL like https://www.tiktok.com/@handle
function parseTikTokHandle(profileUrl: string): string {
  try {
    const u = new URL(profileUrl)
    // pathname is "/@handle" — strip leading "/@"
    return u.pathname.replace(/^\/@?/, '').split('/')[0] || 'unknown'
  } catch {
    return profileUrl.split('@').pop()?.split('?')[0] ?? 'unknown'
  }
}

async function fetchHtml(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
      'Sec-Fetch-Dest': 'document',
      'Sec-Fetch-Mode': 'navigate',
      'Sec-Fetch-Site': 'none',
      'Cache-Control': 'no-cache',
    },
    redirect: 'follow',
    cache: 'no-store',
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.text()
}

// ── TikTok ────────────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapTikTokItem(item: any, url: string): Post {
  const id = String(item.id ?? item.aweme_id ?? Date.now())
  const h = hash(id)

  const stats = item.stats ?? item.statistics ?? {}
  const author = item.author ?? {}
  // followerCount can live in author or authorStats depending on TikTok version
  const authorStats = item.authorStats ?? item.author_stats ?? {}
  const music = item.music ?? {}
  const textExtra: { hashtagName?: string }[] = item.textExtra ?? item.text_extra ?? []

  const views    = parseInt(stats.playCount    ?? stats.play_count    ?? '0') || 0
  const likes    = parseInt(stats.diggCount    ?? stats.digg_count    ?? '0') || 0
  const comments = parseInt(stats.commentCount ?? stats.comment_count ?? '0') || 0
  const shares   = parseInt(stats.shareCount   ?? stats.share_count   ?? '0') || 0
  const saves    = parseInt(stats.collectCount ?? stats.collect_count ?? '0') || 0
  const followers = parseInt(
    authorStats.followerCount ?? authorStats.follower_count ??
    author.followerCount ?? author.stats?.followerCount ?? '10000'
  ) || 10_000

  const createdAt = item.createTime
    ? new Date(Number(item.createTime) * 1000).toISOString()
    : new Date().toISOString()
  const hoursOld = (Date.now() - new Date(createdAt).getTime()) / 3_600_000

  const handle = author.uniqueId ?? author.unique_id ?? 'unknown'
  const caption = decodeHTML(item.desc ?? '')
  const hashtags = textExtra.filter(t => t.hashtagName).map(t => t.hashtagName as string)
  const velocityViewsPerHour = Math.round(views / Math.max(hoursOld, 1))

  return {
    id: `tiktok-${id}`,
    platform: 'tiktok',
    creatorId: String(author.id ?? handle),
    creatorName: decodeHTML(author.nickname ?? handle),
    creatorHandle: handle.startsWith('@') ? handle : `@${handle}`,
    followerCount: followers,
    creatorGradient: CREATOR_GRADIENTS[h % CREATOR_GRADIENTS.length],
    views, likes, comments, shares, saves,
    likeRate: likes / Math.max(views, 1),
    commentRate: comments / Math.max(views, 1),
    shareRate: shares / Math.max(views, 1),
    saveRate: saves / Math.max(views, 1),
    engagementRate: (likes + comments + shares + saves) / Math.max(views, 1),
    reachMultiplier: views / Math.max(followers, 1),
    saveShareRatio: saves / Math.max(saves + shares, 1),
    velocityViewsPerHour,
    growthDelta: Math.min(velocityViewsPerHour / Math.max(views, 1), 1),
    explosionScore: computeExplosionScore(views, likes, comments, saves, shares, followers, hoursOld),
    audioName: music.title ? `${music.title}${music.authorName ? ` — ${music.authorName}` : ''}` : undefined,
    hashtags,
    niche: inferNiche([caption, ...hashtags].join(' ')),
    caption,
    emoji: EMOJIS[h % EMOJIS.length],
    gradient: GRADIENTS[h % GRADIENTS.length],
    formatCluster: inferFormat([caption, ...hashtags].join(' ')),
    createdAt,
    growthHistory: buildGrowthHistory(views, id),
    postUrl: url,
  }
}

// Try to extract a large JSON blob assigned to a variable name in a script tag.
// Non-greedy regex fails on large objects; we count braces instead.
function extractAssignedJSON(html: string, varName: string): unknown | null {
  const start = html.indexOf(`"${varName}"`) !== -1
    ? html.indexOf(`"${varName}"`)
    : html.indexOf(varName)
  if (start === -1) return null

  const braceStart = html.indexOf('{', start)
  if (braceStart === -1) return null

  let depth = 0
  let i = braceStart
  while (i < html.length) {
    if (html[i] === '{') depth++
    else if (html[i] === '}') { depth--; if (depth === 0) break }
    i++
  }

  try {
    return JSON.parse(html.slice(braceStart, i + 1))
  } catch {
    return null
  }
}

async function scrapeTikTok(url: string): Promise<Post> {
  // Validate: must be a video URL, not a profile URL
  const isVideoUrl = /tiktok\.com\/@[^/]+\/video\/\d+/.test(url)
    || /vm\.tiktok\.com\//.test(url)
    || /vt\.tiktok\.com\//.test(url)

  if (!isVideoUrl) {
    throw new Error('Paste a TikTok video URL (e.g. tiktok.com/@user/video/123…), not a profile page.')
  }

  // ── Strategy 1: oEmbed (official endpoint, always works, gives author info) ──
  // We run this first to get reliable author data, then try page scrape for stats.
  let oembed: { author_name?: string; author_url?: string; title?: string } | null = null
  try {
    const oeRes = await fetch(`https://www.tiktok.com/oembed?url=${encodeURIComponent(url)}`)
    if (oeRes.ok) oembed = await oeRes.json()
  } catch { /* non-fatal */ }

  // ── Strategy 2: page HTML for full stats ──
  let pagePost: Post | null = null
  try {
    const html = await fetchHtml(url)

    // Path A: __NEXT_DATA__ (older TikTok)
    const nextMatch = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/)
    if (nextMatch) {
      try {
        const data = JSON.parse(nextMatch[1])
        // Try multiple known paths
        const item =
          data?.props?.pageProps?.itemInfo?.itemStruct ??
          data?.props?.pageProps?.videoData?.itemInfo?.itemStruct ??
          data?.props?.pageProps?.item
        if (item?.stats) return mapTikTokItem(item, url)
      } catch { /* continue */ }
    }

    // Path B: SIGI_STATE (newer TikTok — brace-counting extraction)
    const sigiData = extractAssignedJSON(html, 'SIGI_STATE')
    if (sigiData && typeof sigiData === 'object') {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const sd = sigiData as any
      const itemModule = sd?.ItemModule ?? sd?.itemModule ?? {}
      const item = Object.values(itemModule)[0]
      if (item) {
        try { return mapTikTokItem(item, url) } catch { /* continue */ }
      }
    }

    // Path C: __UNIVERSAL_DATA__ (even newer TikTok)
    const uniData = extractAssignedJSON(html, '__UNIVERSAL_DATA__')
    if (uniData && typeof uniData === 'object') {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const ud = uniData as any
      const item = ud?.['@webapp/video-detail']?.videoInfoRes?.itemList?.[0]
      if (item) {
        try { return mapTikTokItem(item, url) } catch { /* continue */ }
      }
    }
  } catch { /* page blocked or failed — fall through to oEmbed-only post */ }

  // ── Strategy 3: Build from oEmbed alone ──
  if (oembed) {
    const rawHandle = oembed.author_url ? parseTikTokHandle(oembed.author_url) : 'unknown'
    const handle = rawHandle.startsWith('@') ? rawHandle : `@${rawHandle}`
    const name = oembed.author_name ?? rawHandle
    // oEmbed title is the video description for TikTok
    const caption = oembed.title ?? ''
    const h = hash(url)

    return buildEstimatedPost({ id: `tiktok-oe-${h}`, platform: 'tiktok', handle, name, caption, url, h })
  }

  throw new Error("Could not load this TikTok. Try copying the link directly from TikTok's share button.")
}

// ── Instagram ─────────────────────────────────────────────────────────────────

async function scrapeInstagram(url: string): Promise<Post> {
  const isPostUrl = /instagram\.com\/(p|reel|tv)\/[^/]+/.test(url)
  if (!isPostUrl) {
    throw new Error('Paste an Instagram post or Reel URL (e.g. instagram.com/reel/ABC…), not a profile page.')
  }

  try {
    const html = await fetchHtml(url)

    // Extract author from og:title — Instagram formats it as:
    // "Display Name (@handle) • Instagram photos and videos"
    // or "username on Instagram: "caption""
    const ogTitle = extractMeta(html, 'og:title')
    const ogDesc  = extractMeta(html, 'og:description')

    // Parse handle from og:title
    let name = ''
    let handle = 'unknown'
    const handleMatch = ogTitle.match(/\(@([^)]+)\)/)
    if (handleMatch) {
      handle = `@${handleMatch[1]}`
      name = ogTitle.split('(')[0].trim() || handle
    } else {
      // Fallback: "username on Instagram: …"
      const onIgMatch = ogTitle.match(/^([^\s]+)\s+on Instagram/)
      if (onIgMatch) {
        handle = `@${onIgMatch[1]}`
        name = onIgMatch[1]
      }
    }

    // Caption from og:description: usually "N likes, M comments - …"
    let caption = ogDesc
    const descMatch = ogDesc.match(/[-–]\s*(.+)$/)
    if (descMatch) caption = descMatch[1].trim()

    // Try JSON-LD for upload date
    let createdAt: string | undefined
    const ldMatch = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)
    if (ldMatch) {
      try {
        const ld = JSON.parse(ldMatch[1])
        const node = Array.isArray(ld) ? ld[0] : ld
        createdAt = node?.uploadDate ?? node?.datePublished
      } catch { /* ignore */ }
    }

    const h = hash(url)
    return buildEstimatedPost({ id: `ig-${h}`, platform: 'instagram', handle, name, caption, url, h, createdAt })
  } catch (err) {
    // Instagram login-gates most content — give a clear message
    const msg = err instanceof Error ? err.message : ''
    if (msg.startsWith('Paste') || msg.startsWith('Instagram')) throw err
    throw new Error('Instagram requires login to access this post. Stats cannot be retrieved without API access.')
  }
}

// ── Estimated post (oEmbed / OG-only — no real stats available) ───────────────

function buildEstimatedPost({
  id, platform, handle, name, caption, url, h, createdAt,
}: {
  id: string; platform: Platform; handle: string; name: string
  caption: string; url: string; h: number; createdAt?: string
}): Post {
  return {
    id,
    platform,
    creatorId: handle,
    creatorName: name || handle,
    creatorHandle: handle.startsWith('@') ? handle : `@${handle}`,
    followerCount: 0,
    creatorGradient: CREATOR_GRADIENTS[h % CREATOR_GRADIENTS.length],
    views: 0, likes: 0, comments: 0, shares: 0, saves: 0,
    likeRate: 0, commentRate: 0, shareRate: 0, saveRate: 0,
    engagementRate: 0, reachMultiplier: 0,
    saveShareRatio: 0,
    velocityViewsPerHour: 0,
    growthDelta: 0,
    explosionScore: 50,
    hashtags: [],
    niche: inferNiche(caption),
    caption,
    emoji: EMOJIS[h % EMOJIS.length],
    gradient: GRADIENTS[h % GRADIENTS.length],
    formatCluster: inferFormat(caption),
    createdAt: createdAt ?? new Date().toISOString(),
    growthHistory: [0, 0, 0, 0, 0, 0, 0],
    postUrl: url,
  }
}

// ── Public entry point ────────────────────────────────────────────────────────

export async function scrapePost(url: string): Promise<Post> {
  const trimmed = url.trim()
  if (trimmed.includes('tiktok.com')) return scrapeTikTok(trimmed)
  if (trimmed.includes('instagram.com')) return scrapeInstagram(trimmed)
  throw new Error('Paste a TikTok or Instagram URL.')
}
