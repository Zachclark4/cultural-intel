import { generateCopyBrief } from '@/lib/copy-brief'
import { Post } from '@/lib/types'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  try {
    const { post } = await request.json() as { post: Post }
    if (!post?.id) return Response.json({ error: 'post required' }, { status: 400 })
    const brief = await generateCopyBrief(post)
    return Response.json(brief)
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : 'Failed to generate brief' },
      { status: 500 }
    )
  }
}
