import { inngest } from '../client'
import { requireDb } from '@/lib/db/supabase'
import { inferNiche, inferFormat, isDefinitelyNotMusic } from '@/lib/media-utils'

const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY
const HOST = 'instagram-api-fast-reliable-data-scraper.p.rapidapi.com'
const MAX_FOLLOWERS = 500_000

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Item = Record<string, any>

async function igGet(path: string): Promise<Item[]> {
  if (!RAPIDAPI_KEY) return []
  try {
    const res = await fetch(`https://${HOST}${path}`, {
      headers: { 'x-rapidapi-key': RAPIDAPI_KEY, 'x-rapidapi-host': HOST },
      cache: 'no-store',
    })
    if (!res.ok) return []
    const json = await res.json()
    // Handle multiple possible response structures
    const edges = json?.data?.hashtag?.edge_hashtag_to_media?.edges
    if (Array.isArray(edges)) return edges.map((e: Item) => e.node ?? e)
    if (Array.isArray(json?.data?.recent?.sections)) {
      return json.data.recent.sections.flatMap((s: Item) =>
        (s.layout_content?.medias ?? []).map((m: Item) => m.media ?? m)
      )
    }
    if (Array.isArray(json?.items)) return json.items
    if (Array.isArray(json?.posts)) return json.posts
    if (Array.isArray(json?.data)) return json.data
    if (Array.isArray(json)) return json
    return []
  } catch { return [] }
}

const fetchHashtag = (tag: string) =>
  igGet(`/hashtag_section?tag=${encodeURIComponent(tag)}&section=recent`)

function getPostId(item: Item): string | undefined {
  return item.id ?? item.shortcode ?? item.pk ?? item.code ?? undefined
}

function getUsername(item: Item): string {
  return item.owner?.username ?? item.user?.username ?? item.username ?? 'unknown'
}

function getFollowers(item: Item): number {
  return (
    item.owner?.follower_count ??
    item.user?.follower_count ??
    item.owner?.edge_followed_by?.count ??
    0
  )
}

function getViews(item: Item): number {
  return (
    item.video_view_count ??
    item.view_count ??
    item.play_count ??
    item.video_play_count ??
    0
  )
}

function isVideo(item: Item): boolean {
  return (
    item.is_video === true ||
    item.media_type === 2 ||
    item.product_type === 'clips' ||
    item.type === 'Video' ||
    item.video_view_count > 0 ||
    item.view_count > 0
  )
}

function getThumbnail(item: Item): string | undefined {
  return (
    item.thumbnail_src ??
    item.display_url ??
    item.image_versions2?.candidates?.[0]?.url ??
    item.carousel_media?.[0]?.image_versions2?.candidates?.[0]?.url ??
    undefined
  )
}

function getCaption(item: Item): string {
  return (
    item.edge_media_to_caption?.edges?.[0]?.node?.text ??
    item.caption?.text ??
    item.caption ??
    ''
  )
}

function dedup(items: Item[]): Item[] {
  const seen = new Set<string>()
  return items.filter(item => {
    const id = getPostId(item)
    if (!id || seen.has(id)) return false
    seen.add(id)
    return true
  })
}

const HASHTAG_QUERIES = [
  // Core identity
  'originalmusic', 'originalsong', 'originalartist',
  'singersongwriter', 'songwriter',
  'newartist', 'emergingartist', 'indieartist', 'indiemusic',
  'independentartist', 'unsigned', 'smallartist',
  // Folk & Country
  'countrymusic', 'countryoriginal', 'folkmusic', 'americana',
  'acousticmusic', 'acousticguitar', 'guitarsinger',
  // R&B & Soul
  'rnbmusic', 'rnb', 'soulmusic', 'neosoul',
  'gospelmusic', 'christianmusic',
  // Rap & Hip-Hop
  'rapmusic', 'rap', 'hiphop', 'undergroundrap', 'bars',
  // Pop & Bedroom
  'indiepop', 'altpop', 'bedroompop', 'lofimusic',
  // Rock & Alt
  'indierock', 'alternativerock', 'poppunk',
  // Producers
  'bedroomproducer', 'musicproducer', 'beatmaker',
  // Discovery
  'musicdiscovery', 'hiddengem', 'underratedartist',
  'newmusic', 'newrelease',
  // Community
  'musiciansoftiktok', 'singeroftiktok', 'songwritersofinstagram',
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
    if (!RAPIDAPI_KEY) { logger.warn('RAPIDAPI_KEY not set — skipping'); return }
    const db = requireDb()

    // All hashtag searches in parallel — no actor run limits
    const rawItems = await step.run('fetch-hashtags', () =>
      Promise.all(HASHTAG_QUERIES.map(fetchHashtag)).then(r => r.flat())
    )

    const items = dedup(rawItems).filter(isVideo)
    logger.info(`Instagram scraped — ${rawItems.length} raw, ${items.length} unique videos`)

    const inserted = await step.run('upsert-to-db', async () => {
      let count = 0
      for (const item of items) {
        const postId = getPostId(item)
        if (!postId) continue

        const views    = getViews(item)
        const likes    = item.edge_liked_by?.count ?? item.like_count ?? item.likes_count ?? 0
        const comments = item.edge_media_to_comment?.count ?? item.comment_count ?? 0
        const followers = getFollowers(item)
        const username  = getUsername(item)

        if (views === 0 && likes === 0) continue
        if (followers > 0 && followers > MAX_FOLLOWERS) continue

        const caption = getCaption(item)
        const inlineHashtags = (caption.match(/#(\w+)/g) ?? []).map(h => h.slice(1))
        const hashtags: string[] = [
          ...(item.edge_media_to_tagged_user?.edges ?? []).map((e: Item) => e.node?.tag_name ?? ''),
          ...inlineHashtags,
        ].filter(Boolean).slice(0, 8)

        const songName = item.clips_metadata?.original_sound_info?.original_audio_title
          ?? item.music_metadata?.music_info?.music_asset_info?.title
        const artistName = item.music_metadata?.music_info?.music_asset_info?.display_artist
        const audioName = songName && artistName ? `${songName} — ${artistName}` : songName ?? null

        const contentText = [caption, ...hashtags, audioName ?? ''].join(' ')
        if (isDefinitelyNotMusic(contentText)) continue

        const handle = username.startsWith('@') ? username : `@${username}`
        const authorId = item.owner?.id ?? item.user?.pk ?? item.owner?.pk ?? username
        const shortcode = item.shortcode ?? item.code ?? postId
        const createdAt = item.taken_at_timestamp
          ? new Date(item.taken_at_timestamp * 1000).toISOString()
          : item.taken_at
            ? new Date(item.taken_at * 1000).toISOString()
            : item.timestamp ?? new Date().toISOString()

        const { data: creator } = await db.from('creators').upsert({
          platform: 'instagram',
          platform_id: String(authorId),
          handle,
          display_name: item.owner?.full_name ?? item.user?.full_name ?? username,
          follower_count: followers,
          follower_count_updated_at: new Date().toISOString(),
          niche: inferNiche([...hashtags, caption].join(' ')),
        }, { onConflict: 'platform,platform_id' }).select('id').single()

        if (!creator) continue

        const { data: post } = await db.from('posts').upsert({
          platform_post_id: `ig-${shortcode}`,
          platform: 'instagram',
          creator_id: creator.id,
          caption: caption.slice(0, 300),
          audio_name: audioName,
          hashtags,
          format_cluster: inferFormat([...hashtags, caption].join(' ')),
          thumbnail_url: getThumbnail(item),
          post_url: `https://www.instagram.com/p/${shortcode}/`,
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

    logger.info(`Instagram ingest — inserted ${inserted} of ${items.length}`)
    return { inserted }
  }
)
