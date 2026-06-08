import { Post } from './types'
import { GRADIENTS, hash, inferNiche, buildGrowthHistory } from './media-utils'

const CLIENT_ID = process.env.SPOTIFY_CLIENT_ID
const CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET
const BASE = 'https://api.spotify.com/v1'
// Spotify Viral 50 - USA playlist ID (public, stable)
const VIRAL_50_US = '37i9dQZEVXbLp5XoPON0wI'

const CACHE_TTL = 6 * 60 * 60 * 1000
const cache = new Map<string, { posts: Post[]; ts: number }>()
let tokenCache: { token: string; expires: number } | null = null

async function getToken(): Promise<string> {
  if (tokenCache && Date.now() < tokenCache.expires) return tokenCache.token
  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64')}`,
    },
    body: 'grant_type=client_credentials',
    cache: 'no-store',
  })
  if (!res.ok) throw new Error(`Spotify auth → ${res.status}`)
  const data = await res.json()
  tokenCache = { token: data.access_token, expires: Date.now() + (data.expires_in - 60) * 1000 }
  return tokenCache.token
}

async function sp<T>(endpoint: string, token: string): Promise<T> {
  const res = await fetch(`${BASE}/${endpoint}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  })
  if (!res.ok) throw new Error(`Spotify ${endpoint} → ${res.status}`)
  return res.json()
}

interface SpotifyTrackItem {
  added_at: string
  track: {
    id: string
    name: string
    popularity: number
    artists: Array<{ id: string; name: string }>
    album: {
      images: Array<{ url: string }>
      release_date: string
    }
    external_urls: { spotify: string }
  } | null
}

interface SpotifyArtist {
  id: string
  name: string
  followers: { total: number }
  genres: string[]
}


export async function fetchSpotifyPosts(): Promise<Post[]> {
  if (!CLIENT_ID || !CLIENT_SECRET) throw new Error('SPOTIFY_CLIENT_ID / SPOTIFY_CLIENT_SECRET not set')

  const cacheKey = 'spotify-viral50-us-v1'
  const hit = cache.get(cacheKey)
  if (hit && Date.now() - hit.ts < CACHE_TTL) return hit.posts

  const token = await getToken()

  const playlist = await sp<{ items: SpotifyTrackItem[] }>(
    `playlists/${VIRAL_50_US}/tracks?limit=50&fields=items(added_at,track(id,name,popularity,artists,album,external_urls))`,
    token
  )

  const items = playlist.items.filter(i => i.track?.id)

  // Batch-fetch artist data (Spotify allows up to 50 IDs per request)
  const uniqueArtistIds = [...new Set(items.flatMap(i => i.track!.artists.map(a => a.id)))]
  const artistChunks: string[][] = []
  for (let i = 0; i < uniqueArtistIds.length; i += 50) artistChunks.push(uniqueArtistIds.slice(i, i + 50))

  const artistResults = await Promise.all(
    artistChunks.map(ids =>
      sp<{ artists: SpotifyArtist[] }>(`artists?ids=${ids.join(',')}`, token)
        .then(d => d.artists)
        .catch(() => [] as SpotifyArtist[])
    )
  )
  const artistMap = new Map(artistResults.flat().filter(Boolean).map(a => [a.id, a]))

  const posts = items
    .map((item, position): Post | null => {
      const track = item.track!
      const primaryArtistId = track.artists[0]?.id
      const artist = primaryArtistId ? artistMap.get(primaryArtistId) : undefined
      const followers = artist?.followers.total ?? 0

      const h = hash(track.id)

      // Position 1 → highest score; small artists get a bonus for punching above their weight
      const positionScore = (50 - position) / 49
      const followerPenalty = Math.min(1, followers / 5_000_000)
      const explosionScore = Math.round(62 + positionScore * 28 + (1 - followerPenalty) * 10)

      // Spotify doesn't expose stream counts — popularity (0–100) is a normalized proxy
      const views = track.popularity * 80_000
      const velocityViewsPerHour = Math.round(views / 72)

      const handle = `@${(artist?.name ?? track.artists[0]?.name ?? 'unknown')
        .toLowerCase().replace(/[^a-z0-9]/g, '')}`

      return {
        id: `sp-${track.id}`,
        platform: 'spotify',
        creatorId: primaryArtistId ?? track.id,
        creatorName: artist?.name ?? track.artists.map(a => a.name).join(', '),
        creatorHandle: handle,
        followerCount: followers,
        creatorGradient: GRADIENTS[h % GRADIENTS.length],
        views,
        likes: Math.round(views * 0.08),
        comments: Math.round(views * 0.01),
        shares: Math.round(views * 0.04),
        saves: Math.round(views * 0.12),
        likeRate: 0.08,
        commentRate: 0.01,
        shareRate: 0.04,
        saveRate: 0.12,
        engagementRate: 0.25,
        reachMultiplier: views / Math.max(followers, 1),
        saveShareRatio: 0.75,
        velocityViewsPerHour,
        growthDelta: positionScore,
        explosionScore,
        audioName: track.name,
        thumbnailUrl: track.album.images[0]?.url,
        hashtags: artist?.genres?.slice(0, 4) ?? [],
        niche: inferNiche((artist?.genres ?? []).join(' ')),
        caption: `#${position + 1} on Spotify Viral 50 US`,
        emoji: '📊',
        gradient: GRADIENTS[h % GRADIENTS.length],
        formatCluster: 'music-video',
        // Use added_at so time filters reflect when the track entered the chart
        createdAt: item.added_at ?? new Date().toISOString(),
        growthHistory: buildGrowthHistory(views, track.id),
        postUrl: track.external_urls.spotify,
      }
    })
    .filter((p): p is Post => p !== null)

  cache.set(cacheKey, { posts, ts: Date.now() })
  return posts
}
