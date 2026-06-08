import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

const ALLOWED_HOSTS = [
  'tiktokcdn.com',
  'tiktokcdn-us.com',
  'p16-sign-va.tiktokcdn.com',
  'p19-sign-va.tiktokcdn.com',
  'p77-sign-va.tiktokcdn.com',
]

export async function GET(request: NextRequest) {
  const raw = request.nextUrl.searchParams.get('url')
  if (!raw) return new NextResponse(null, { status: 400 })

  let parsed: URL
  try {
    parsed = new URL(raw)
  } catch {
    return new NextResponse(null, { status: 400 })
  }

  const allowed = ALLOWED_HOSTS.some(h => parsed.hostname.endsWith(h))
  if (!allowed) return new NextResponse(null, { status: 403 })

  try {
    const res = await fetch(raw, {
      headers: {
        Referer: 'https://www.tiktok.com/',
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      },
      // Next.js server-side fetch — no browser CORS restrictions
    })

    if (!res.ok) return new NextResponse(null, { status: res.status })

    const buf = await res.arrayBuffer()
    return new NextResponse(buf, {
      headers: {
        'Content-Type': res.headers.get('Content-Type') ?? 'image/jpeg',
        'Cache-Control': 'public, max-age=86400, stale-while-revalidate=3600',
      },
    })
  } catch {
    return new NextResponse(null, { status: 502 })
  }
}
