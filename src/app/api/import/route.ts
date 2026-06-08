import { NextRequest, NextResponse } from 'next/server'
import { scrapePost } from '@/lib/scraper'

export async function POST(req: NextRequest) {
  try {
    const { url } = await req.json()
    if (!url || typeof url !== 'string') {
      return NextResponse.json({ error: 'url is required' }, { status: 400 })
    }
    const post = await scrapePost(url)
    return NextResponse.json(post)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to import post'
    return NextResponse.json({ error: message }, { status: 422 })
  }
}
