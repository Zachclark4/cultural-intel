import { inngest } from '../client'
import { requireDb } from '@/lib/db/supabase'
import Anthropic from '@anthropic-ai/sdk'

const client = new Anthropic()

interface PostToProcess {
  id: string
  platform: string
  caption: string | null
  hashtags: string[]
  format_cluster: string | null
}

async function callClaude(post: PostToProcess): Promise<{ format_summary: string; artist_adaptation: string } | null> {
  const context = [
    post.caption?.slice(0, 300) ?? '',
    post.hashtags.length > 0 ? `#${post.hashtags.join(' #')}` : '',
    post.format_cluster ? `Format cluster: ${post.format_cluster}` : '',
  ].filter(Boolean).join('\n')

  if (!context.trim()) return null

  try {
    const message = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 120,
      messages: [{
        role: 'user',
        content: `You analyze social media posts for music marketing teams. Given this ${post.platform} post, provide exactly two things:

1. format_summary: One objective sentence describing what literally happens in the video (setting, action, format — no value judgments)
2. artist_adaptation: One sentence suggesting how a music artist could film something similar

Post:
${context}

Reply with only valid JSON: {"format_summary": "...", "artist_adaptation": "..."}`,
      }],
    })

    const text = message.content[0].type === 'text' ? message.content[0].text : ''
    const match = text.match(/\{[\s\S]*\}/)
    if (!match) return null
    return JSON.parse(match[0])
  } catch { return null }
}

export const generateFormatIntel = inngest.createFunction(
  {
    id: 'generate-format-intel',
    triggers: [
      { cron: '0 * * * *' },
      { event: 'cultural-intel/generate.format-intel' as string },
    ],
    // Concurrency limit to stay within Claude rate limits
    concurrency: { limit: 1 },
  },
  async ({ step, logger }) => {
    const db = requireDb()

    // Find posts that haven't been processed yet, prioritize recent ones
    const posts = await step.run('find-unprocessed', async () => {
      const { data } = await db
        .from('posts')
        .select('id, platform, caption, hashtags, format_cluster')
        .is('format_processed_at', null)
        .order('first_seen_at', { ascending: false })
        .limit(20) // process 20 per hourly run — ~$0.001 cost
      return (data ?? []) as PostToProcess[]
    })

    if (posts.length === 0) {
      logger.info('Format intel — no unprocessed posts')
      return { processed: 0 }
    }

    let processed = 0
    for (const post of posts) {
      const result = await step.run(`process-${post.id}`, () => callClaude(post))

      await step.run(`save-${post.id}`, async () => {
        await db.from('posts').update({
          format_summary: result?.format_summary ?? null,
          artist_adaptation: result?.artist_adaptation ?? null,
          format_processed_at: new Date().toISOString(),
        }).eq('id', post.id)
      })

      if (result) processed++
    }

    logger.info(`Format intel — processed ${processed}/${posts.length} posts`)
    return { processed }
  }
)
