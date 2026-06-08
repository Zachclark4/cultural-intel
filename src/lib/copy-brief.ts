import Anthropic from '@anthropic-ai/sdk'
import { Post } from './types'

const client = process.env.ANTHROPIC_API_KEY
  ? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  : null

export interface CopyBrief {
  formatName: string
  hookPattern: string
  keyVisual: string
  audioGuidance: string
  lengthSeconds: string
  bestPostingTime: string
  whyItWorked: string
  whatToCopy: string
  whatToAvoid: string
  captionTemplate: string
}

export async function generateCopyBrief(post: Post): Promise<CopyBrief> {
  if (!client) throw new Error('ANTHROPIC_API_KEY not set')

  const prompt = `You are a music marketing strategist. Analyze this viral post and generate an actionable copy brief for an independent artist.

POST DATA:
- Platform: ${post.platform}
- Creator: ${post.creatorHandle} (${post.followerCount.toLocaleString()} followers)
- Views: ${post.views.toLocaleString()} — ${post.velocityViewsPerHour.toLocaleString()} views/hr
- Engagement rate: ${post.engagementRate.toFixed(1)}%
- Format: ${post.formatCluster}
- Niche: ${post.niche.join(', ')}
- Audio: ${post.audioName ?? 'original sound'}
- Hashtags: ${post.hashtags.join(' ')}
- Caption: "${post.caption}"
- Explosion score: ${post.explosionScore}/99

Generate a copy brief in valid JSON matching this exact schema — no markdown, no explanation, just the JSON object:
{
  "formatName": "short, memorable format name (e.g. 'Car Singalong', 'Bedroom Confession')",
  "hookPattern": "describe the first 3 seconds — what happens, what text appears, what emotion lands",
  "keyVisual": "camera angle, lighting, setting, wardrobe details that make this work",
  "audioGuidance": "production quality, vocal style, music style, original vs trending sound",
  "lengthSeconds": "optimal length range in seconds",
  "bestPostingTime": "day and time range based on platform and niche",
  "whyItWorked": "1-2 sentence psychological or cultural reason this format resonates",
  "whatToCopy": "the specific elements to replicate — be concrete, not generic",
  "whatToAvoid": "the traps that would kill this format if done wrong",
  "captionTemplate": "fill-in-the-blank caption template the artist can adapt"
}`

  const message = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1024,
    messages: [{ role: 'user', content: prompt }],
  })

  const text = message.content[0].type === 'text' ? message.content[0].text : ''
  return JSON.parse(text) as CopyBrief
}

// Server action / API handler — call from a route, never from client components
export async function POST(request: Request): Promise<Response> {
  try {
    const { post } = await request.json() as { post: Post }
    const brief = await generateCopyBrief(post)
    return Response.json(brief)
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : 'Failed to generate brief' },
      { status: 500 }
    )
  }
}
