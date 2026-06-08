import { inngest } from '../client'
import { requireDb } from '@/lib/db/supabase'
import { inferNiche, inferFormat, isMusicContent } from '@/lib/media-utils'

const APIFY_TOKEN = process.env.APIFY_TOKEN
const ACTOR = 'apify/instagram-scraper'
const MAX_FOLLOWERS = 500_000

interface InstaItem {
  id?: string
  shortCode?: string
  type?: string        // 'Video' | 'Image' | 'Sidecar'
  caption?: string
  timestamp?: string
  likesCount?: number
  commentsCount?: number
  videoPlayCount?: number
  videoViewCount?: number
  displayUrl?: string
  thumbnailSrc?: string
  ownerUsername?: string
  ownerFullName?: string
  ownerId?: string
  ownerFollowersCount?: number
  hashtags?: string[]
  musicInfo?: { song_name?: string; artist_name?: string }
}

async function apifyCall(hashtags: string[]): Promise<InstaItem[]> {
  try {
    const res = await fetch(
      `https://api.apify.com/v2/acts/${ACTOR}/run-sync-get-dataset-items?token=${APIFY_TOKEN}&timeout=120&maxItems=150`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          directUrls: hashtags.map(h => `https://www.instagram.com/explore/tags/${h}/`),
          resultsType: 'posts',
          resultsLimit: 150,
          addParentData: false,
          enhanceUserSearchWithFacebookPage: false,
          isUserTaggedFeedURL: false,
        }),
        cache: 'no-store',
      }
    )
    return res.ok ? res.json() : []
  } catch { return [] }
}

const HASHTAG_BATCHES: string[][] = [
  ['originalmusic', 'singersongwriter', 'newartist', 'indieartist'],
  ['acousticguitar', 'acousticcover', 'acousticperformance', 'acousticsession'],
  ['indiepop', 'indiemusic', 'bedroommusic', 'lofimusic'],
  ['rnbmusic', 'soulmusic', 'rnbsinger', 'neosoul'],
  ['countrymusic', 'countryoriginal', 'folkmusic', 'americanamusic'],
  ['unsigned', 'independentartist', 'musicdiscovery', 'undiscoveredartist'],
  ['indiepop', 'alternativemusic', 'alternativeartist', 'bedroompop'],
  ['hiphopmusic', 'rapmusic', 'undergroundhiphop', 'newrap'],
  ['singersongwriter', 'originallyric', 'mysong', 'newmusic'],
  ['latinmusic', 'afrobeats', 'reggaeton', 'worldmusic'],
]

export const ingestInstagram = inngest.createFunction(
  {
    id: 'ingest-instagram',
    triggers: [
      { cron: '0 */6 * * *' },
      { event: 'cultural-intel/ingest.instagram' as string },
    ],
  },
  async ({ step, logger }) => {
    if (!APIFY_TOKEN) { logger.warn('APIFY_TOKEN not set — skipping'); return }
    const db = requireDb()

    // Scrape hashtag batches serially — Apify concurrent run limit is 3-5,
    // parallel calls queue up and timeout before the actor starts
    const rawItems: InstaItem[] = []
    for (let i = 0; i < HASHTAG_BATCHES.length; i++) {
      const results = await step.run(`scrape-hashtags-${i}`, () => apifyCall(HASHTAG_BATCHES[i]))
      rawItems.push(...results)
    }

    const seen = new Set<string>()
    const items = rawItems.filter(item => {
      const key = item.shortCode ?? item.id
      if (!key || item.type !== 'Video' || seen.has(key)) return false
      seen.add(key)
      return true
    })

    const inserted = await step.run('upsert-to-db', async () => {
      let count = 0
      for (const item of items) {
        const shortCode = item.shortCode ?? item.id
        if (!shortCode) continue

        const views    = item.videoPlayCount ?? item.videoViewCount ?? 0
        const likes    = item.likesCount ?? 0
        const comments = item.commentsCount ?? 0
        const followers = item.ownerFollowersCount ?? 0
        if (views === 0 || followers > MAX_FOLLOWERS) continue

        const contentText = [item.caption ?? '', ...(item.hashtags ?? [])].join(' ')
        if (!isMusicContent(contentText)) continue

        const handle   = item.ownerUsername ? `@${item.ownerUsername}` : '@unknown'
        const hashtags = (item.hashtags ?? []).slice(0, 6)
        const caption  = item.caption ?? ''
        const createdAt = item.timestamp ?? new Date().toISOString()
        const thumbnail = item.displayUrl ?? item.thumbnailSrc

        const { data: creator } = await db.from('creators').upsert({
          platform: 'instagram', platform_id: item.ownerId ?? item.ownerUsername ?? shortCode,
          handle, display_name: item.ownerFullName ?? item.ownerUsername ?? 'Unknown',
          follower_count: followers, follower_count_updated_at: new Date().toISOString(),
          niche: inferNiche([...hashtags, caption].join(' ')),
        }, { onConflict: 'platform,platform_id' }).select('id').single()

        if (!creator) continue

        const songName = item.musicInfo?.song_name
        const artistName = item.musicInfo?.artist_name
        const audioName = songName && artistName ? `${songName} — ${artistName}` : songName ?? null

        const { data: post } = await db.from('posts').upsert({
          platform_post_id: `ig-${shortCode}`, platform: 'instagram',
          creator_id: creator.id, caption: caption.slice(0, 300),
          audio_name: audioName, hashtags,
          format_cluster: inferFormat([...hashtags, caption].join(' ')),
          thumbnail_url: thumbnail,
          post_url: `https://www.instagram.com/p/${shortCode}/`,
          posted_at: createdAt,
        }, { onConflict: 'platform_post_id' }).select('id').single()

        if (!post) continue

        await db.from('post_snapshots').insert({
          post_id: post.id, views, likes, comments, shares: 0, saves: 0,
          creator_followers_at_capture: followers,
        })
        count++
      }
      return count
    })

    logger.info(`Instagram ingest — ${inserted} posts from ${items.length} scraped`)
    return { inserted }
  }
)
