import { inngest } from '../client'
import { requireDb } from '@/lib/db/supabase'

const RESEND_KEY = process.env.RESEND_API_KEY
const ALERT_EMAIL = process.env.ALERT_EMAIL
const VELOCITY_SPIKE_MULTIPLIER = 3
const DISPARITY_THRESHOLD = 20
const MIN_VIEWS_TO_ALERT = 10_000

interface Snapshot {
  post_id: string; captured_at: string
  views: number; creator_followers_at_capture: number
}

export const detectBreakouts = inngest.createFunction(
  {
    id: 'detect-breakouts',
    triggers: [{ cron: '0 * * * *' }],
  },
  async ({ step, logger }) => {
    const db = requireDb()

    const candidates = await step.run('find-candidates', async () => {
      const cutoff = new Date(Date.now() - 48 * 3600 * 1000).toISOString()
      const { data } = await db
        .from('post_snapshots')
        .select('post_id, captured_at, views, creator_followers_at_capture')
        .gte('captured_at', cutoff)
        .order('post_id')
        .order('captured_at', { ascending: false })
      return (data ?? []) as Snapshot[]
    })

    const byPost = new Map<string, Snapshot[]>()
    for (const snap of candidates) {
      const arr = byPost.get(snap.post_id) ?? []
      arr.push(snap)
      byPost.set(snap.post_id, arr)
    }

    const signals: Array<{
      post_id: string; signal_type: string; confidence: number
      views_at_detection: number; velocity_at_detection: number
    }> = []

    for (const [postId, snaps] of byPost.entries()) {
      if (snaps.length < 2) continue
      const [latest, prev, older] = snaps
      const views = latest.views ?? 0
      const followers = latest.creator_followers_at_capture ?? 1
      if (views < MIN_VIEWS_TO_ALERT) continue

      const { data: existing } = await db
        .from('breakout_signals').select('id').eq('post_id', postId)
        .gte('detected_at', new Date(Date.now() - 12 * 3600 * 1000).toISOString()).limit(1)
      if (existing && existing.length > 0) continue

      const hoursLatest = Math.max(
        (new Date(latest.captured_at).getTime() - new Date(prev.captured_at).getTime()) / 3_600_000, 0.1
      )
      const velocityLatest = (latest.views - prev.views) / hoursLatest

      if (older) {
        const hoursPrev = Math.max(
          (new Date(prev.captured_at).getTime() - new Date(older.captured_at).getTime()) / 3_600_000, 0.1
        )
        const velocityPrev = (prev.views - older.views) / hoursPrev
        if (velocityLatest > velocityPrev * VELOCITY_SPIKE_MULTIPLIER && velocityLatest > 500) {
          signals.push({
            post_id: postId, signal_type: 'velocity_spike',
            confidence: Math.min(0.99, (velocityLatest / (velocityPrev * VELOCITY_SPIKE_MULTIPLIER + 1)) * 0.5),
            views_at_detection: views, velocity_at_detection: velocityLatest,
          })
          continue
        }
      }

      if (views > followers * DISPARITY_THRESHOLD) {
        signals.push({
          post_id: postId, signal_type: 'disparity_jump',
          confidence: Math.min(0.95, (views / followers) / 100),
          views_at_detection: views, velocity_at_detection: velocityLatest,
        })
      }
    }

    if (signals.length === 0) { logger.info('No new breakout signals'); return { signals: 0 } }

    await step.run('write-signals', async () => {
      await db.from('breakout_signals').insert(
        signals.map(s => ({
          post_id: s.post_id, signal_type: s.signal_type, confidence: s.confidence,
          views_at_detection: s.views_at_detection, velocity_at_detection: s.velocity_at_detection,
          features: { velocity: s.velocity_at_detection, views: s.views_at_detection },
        }))
      )
    })

    if (RESEND_KEY && ALERT_EMAIL) {
      await step.run('send-alert', async () => {
        const { Resend } = await import('resend')
        const resend = new Resend(RESEND_KEY)
        const { data: posts } = await db
          .from('posts')
          .select('id, platform, post_url, caption, creators(handle, follower_count)')
          .in('id', signals.map(s => s.post_id))

        const lines = (posts ?? []).map(p => {
          const sig = signals.find(s => s.post_id === p.id)!
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const creator = (p as any).creators
          return [
            `<b>${sig.signal_type.replace('_', ' ').toUpperCase()}</b> — ${creator?.handle ?? 'unknown'} (${(creator?.follower_count ?? 0).toLocaleString()} followers)`,
            `${sig.views_at_detection.toLocaleString()} views · ${Math.round(sig.velocity_at_detection).toLocaleString()}/hr`,
            `<a href="${p.post_url}">${p.post_url}</a>`,
            `Confidence: ${Math.round(sig.confidence * 100)}%`,
          ].join('<br/>')
        }).join('<hr/>')

        await resend.emails.send({
          from: 'Cultural Intel <alerts@yourdomain.com>',
          to: ALERT_EMAIL,
          subject: `🚨 ${signals.length} Breakout Signal${signals.length > 1 ? 's' : ''} Detected`,
          html: `<h2>Breakout Signals</h2>${lines}`,
        })
      })
    }

    logger.info(`Breakout detection — ${signals.length} signals`)
    return { signals: signals.length }
  }
)
