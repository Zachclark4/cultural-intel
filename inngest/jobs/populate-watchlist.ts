import { inngest } from '../client'
import { requireDb } from '@/lib/db/supabase'

// Creators in this follower range are realistic models for developing artists —
// large enough to have proven the format works, small enough to be replicable.
const MIN_FOLLOWERS = 2_000
const MAX_FOLLOWERS = 50_000

export const populateWatchlist = inngest.createFunction(
  {
    id: 'populate-watchlist',
    triggers: [
      { cron: '0 */6 * * *' },
      { event: 'cultural-intel/populate.watchlist' as string },
    ],
  },
  async ({ step, logger }) => {
    const db = requireDb()

    // Find all creators in the sweet spot from our existing DB
    const creators = await step.run('find-sweet-spot-creators', async () => {
      const { data } = await db
        .from('creators')
        .select('id, platform, platform_id, handle, follower_count')
        .gte('follower_count', MIN_FOLLOWERS)
        .lte('follower_count', MAX_FOLLOWERS)
        .order('follower_count_updated_at', { ascending: false })
        .limit(500)
      return data ?? []
    })

    const added = await step.run('upsert-to-watchlist', async () => {
      if (creators.length === 0) return 0
      const { error } = await db.from('creator_watchlist').upsert(
        creators.map(c => ({
          creator_id: c.id,
          platform: c.platform,
          platform_id: c.platform_id,
          handle: c.handle,
          reason: 'sweet-spot',
        })),
        { onConflict: 'platform,platform_id' }
      )
      if (error) { logger.warn('Watchlist upsert error:', error.message); return 0 }
      return creators.length
    })

    logger.info(`Watchlist populate — ${added} creators (${MIN_FOLLOWERS/1000}k-${MAX_FOLLOWERS/1000}k followers)`)
    return { added }
  }
)
