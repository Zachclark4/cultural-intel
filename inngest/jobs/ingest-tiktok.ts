import { inngest } from '../client'
import { requireDb } from '@/lib/db/supabase'
import { inferNiche, inferFormat, isDefinitelyNotMusic } from '@/lib/media-utils'

const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY
const HOST = 'tiktok-scraper7.p.rapidapi.com'
const MAX_FOLLOWERS = 500_000

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type V = Record<string, any>

async function tikwmGet(path: string, params: Record<string, string>): Promise<V[]> {
  if (!RAPIDAPI_KEY) return []
  try {
    const url = new URL(`https://${HOST}${path}`)
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v))
    const res = await fetch(url.toString(), {
      headers: { 'x-rapidapi-key': RAPIDAPI_KEY, 'x-rapidapi-host': HOST },
      cache: 'no-store',
    })
    if (!res.ok) return []
    const json = await res.json()
    const data = json?.data
    if (Array.isArray(data)) return data
    if (Array.isArray(data?.videos)) return data.videos
    if (Array.isArray(data?.aweme_list)) return data.aweme_list
    if (Array.isArray(json)) return json
    return []
  } catch { return [] }
}

const searchKeyword = (q: string) =>
  tikwmGet('/feed/search', { keywords: q, count: '20', cursor: '0', region: 'US', priority_region: 'US', duration: '0' })

// Use search endpoint for hashtags too — more reliable than challenge ID lookup
const searchHashtag = (tag: string) =>
  tikwmGet('/feed/search', { keywords: `#${tag}`, count: '50', cursor: '0', region: 'US', priority_region: 'US', duration: '0' })

const getVideoId = (v: V): string | undefined =>
  v.video_id ?? v.id ?? v.aweme_id ?? undefined

const getUsername = (v: V): string =>
  v.author?.unique_id ?? v.author?.username ?? v.author?.name ?? 'unknown'

const getThumbnail = (v: V): string | undefined =>
  v.cover ?? v.origin_cover ?? v.dynamic_cover ?? v.ai_dynamic_cover ?? undefined

function dedup(items: V[]): V[] {
  const seen = new Set<string>()
  return items.filter(v => {
    const id = getVideoId(v)
    if (!id || seen.has(id)) return false
    seen.add(id)
    return true
  })
}

const KEYWORD_QUERIES = [
  // Core authenticity signals
  'i wrote this song', 'i made this song', 'my original song', 'wrote a song about',
  'i produced this', 'i made this beat',
  // Creation moments
  'sang this in my car', 'recorded in my bedroom', 'wrote this at 3am',
  "couldn't sleep so i wrote a song", 'just me and my guitar', 'one take no autotune',
  // Vulnerability signals
  'scared to post this', 'finally posting my music', 'nervous to post',
  'first song ever', 'wrote this in 30 minutes',
  // Identity
  'small artist original', 'unsigned artist original', 'home studio original song',
  'raw vocals original', 'writing songs in my room', 'bedroom pop original song',
  'indie artist original song',
  // Folk & Country
  'original country song', 'original folk song', 'wrote this on guitar',
  'small country artist original', 'original americana song',
  // R&B & Soul
  'original r&b song', 'original soul song', 'wrote this r&b', 'original neo soul',
  // Rap & Hip-Hop
  'original rap song', 'wrote this rap', 'i wrote these bars', 'original freestyle rap',
  // Pop & Other
  'original pop song', 'original song on piano', 'original song ukulele', 'wrote this chorus',
]

const HASHTAG_QUERIES = [
  // Core identity
  'originalmusic', 'originalsong', 'originalartist',
  'singersongwriter', 'songwriter', 'lyricswriter',
  'newartist', 'emergingartist', 'upandcomingartist',
  'indieartist', 'indiemusic', 'independentartist', 'independentmusic',
  'unsigned', 'unsignedartist', 'smallartist',
  // Folk & Country
  'countrymusic', 'countryoriginal', 'newcountry', 'countryartist',
  'folkmusic', 'folk', 'folkartist', 'americana', 'americanamusic',
  'acousticmusic', 'acousticguitar', 'guitarsinger',
  // R&B & Soul
  'rnbmusic', 'rnb', 'rnbartist', 'soulmusic', 'soul', 'neosoul',
  'gospelmusic', 'christianmusic', 'worshipmusic',
  // Rap & Hip-Hop
  'rapmusic', 'rap', 'rapper', 'hiphop', 'hiphopmusic',
  'undergroundrap', 'undergroundhiphop', 'bars', 'freestyle',
  // Pop & Bedroom
  'indiepop', 'altpop', 'alternativepop', 'bedroommusic',
  'bedroompop', 'lofi', 'lofimusic', 'lofihiphop', 'chillmusic',
  // Rock & Alt
  'indierock', 'alternativerock', 'softrock', 'poppunk',
  // Producers
  'bedroomproducer', 'musicproducer', 'beatmaker', 'typebeat', 'beatmaking',
  // Discovery & community
  'musicdiscovery', 'hiddengem', 'underratedartist', 'underratedmusic',
  'newmusic', 'newrelease', 'freshdrop',
  'songwritersoftiktok', 'musiciansoftiktok', 'singeroftiktok', 'artistsoftiktok',
]

export const ingestTikTok = inngest.createFunction(
  {
    id: 'ingest-tiktok',
    triggers: [
      { cron: '0 */4 * * *' },
      { event: 'cultural-intel/ingest.tiktok' as string },
    ],
  },
  async ({ step, logger }) => {
    if (!RAPIDAPI_KEY) { logger.warn('RAPIDAPI_KEY not set — skipping'); return }
    const db = requireDb()

    // All keyword searches run in parallel — no actor run limits with RapidAPI
    const keywordItems = await step.run('search-keywords', () =>
      Promise.all(KEYWORD_QUERIES.map(searchKeyword)).then(r => r.flat())
    )

    // Hashtag searches also parallel
    const hashtagItems = await step.run('search-hashtags', () =>
      Promise.all(HASHTAG_QUERIES.map(searchHashtag)).then(r => r.flat())
    )

    const keywordIds = new Set(keywordItems.map(getVideoId).filter(Boolean) as string[])
    const allItems = dedup([...keywordItems, ...hashtagItems])

    logger.info(`TikTok scraped — ${keywordItems.length} keyword, ${hashtagItems.length} hashtag, ${allItems.length} unique`)

    const inserted = await step.run('upsert-to-db', async () => {
      let count = 0
      for (const v of allItems) {
        const videoId = getVideoId(v)
        if (!videoId) continue

        const views    = v.play_count    ?? v.statistics?.play_count    ?? 0
        const likes    = v.digg_count    ?? v.statistics?.digg_count    ?? 0
        const comments = v.comment_count ?? v.statistics?.comment_count ?? 0
        const shares   = v.share_count   ?? v.statistics?.share_count   ?? 0
        const saves    = v.collect_count ?? v.statistics?.collect_count ?? 0
        const followers = v.author?.follower_count ?? v.author?.fans ?? 0

        if (views === 0) continue
        if (followers > 0 && followers > MAX_FOLLOWERS) continue

        const caption  = (v.desc ?? v.title ?? v.text ?? '') as string
        const username = getUsername(v)
        const rawAudio = v.music_info?.title ?? v.music?.title ?? v.musicMeta?.musicName
        const hashtags: string[] = (v.hashtags ?? [])
          .map((h: V) => h.name ?? h.title ?? '')
          .filter(Boolean)
          .slice(0, 6)

        // Extract inline hashtags from caption — TikTok embeds them as #tag in the desc field
        const inlineHashtags = (caption.match(/#(\w+)/g) ?? []).map(h => h.slice(1))
        const allHashtags = [...new Set([...hashtags, ...inlineHashtags])].slice(0, 10)
        const contentText = [caption, ...allHashtags, rawAudio ?? ''].join(' ')

        // All searches target music content already — only reject obvious non-music
        if (isDefinitelyNotMusic(contentText)) continue

        const handle = username.startsWith('@') ? username : `@${username}`
        const authorId = v.author?.id ?? v.author?.uid ?? v.author?.sec_uid ?? username
        const createdAt = v.create_time
          ? new Date(v.create_time * 1000).toISOString()
          : new Date().toISOString()

        const { data: creator } = await db.from('creators').upsert({
          platform: 'tiktok',
          platform_id: String(authorId),
          handle,
          display_name: v.author?.nickname ?? v.author?.name ?? username,
          follower_count: followers,
          follower_count_updated_at: new Date().toISOString(),
          niche: inferNiche([...allHashtags, caption].join(' ')),
        }, { onConflict: 'platform,platform_id' }).select('id').single()

        if (!creator) continue

        const audioName = rawAudio && !rawAudio.toLowerCase().startsWith('original sound')
          ? rawAudio : null

        const { data: post } = await db.from('posts').upsert({
          platform_post_id: `tt-${videoId}`,
          platform: 'tiktok',
          creator_id: creator.id,
          caption: caption.slice(0, 300),
          audio_name: audioName,
          hashtags,
          format_cluster: inferFormat([...allHashtags, caption].join(' ')),
          thumbnail_url: getThumbnail(v),
          post_url: `https://www.tiktok.com/@${username}/video/${videoId}`,
          posted_at: createdAt,
        }, { onConflict: 'platform_post_id' }).select('id').single()

        if (!post) continue

        await db.from('post_snapshots').insert({
          post_id: post.id, views, likes, comments, shares, saves,
          creator_followers_at_capture: followers,
        })
        count++
      }
      return count
    })

    await step.run('update-audio-trends', async () => {
      for (const v of allItems) {
        const audioName = v.music_info?.title ?? v.music?.title
        if (!audioName || audioName.toLowerCase().startsWith('original sound')) continue
        const views = v.play_count ?? v.statistics?.play_count ?? 0
        await db.from('audio_trends').upsert({
          platform: 'tiktok', audio_name: audioName,
          last_seen_at: new Date().toISOString(), total_views: views,
        }, { onConflict: 'platform,audio_name' })
      }
    })

    logger.info(`TikTok ingest — inserted ${inserted} of ${allItems.length}`)
    return { inserted }
  }
)
