'use client'

import { useState, useRef, useEffect } from 'react'
import { Post } from '@/lib/types'
import { formatFollowers, formatViews, timeAgo } from '@/lib/utils'
import { useAppStore } from '@/store/app-store'
import { Bookmark, BookmarkCheck, ExternalLink } from 'lucide-react'

function getEmbedUrl(post: Post): string | null {
  if (post.platform === 'youtube') {
    const videoId = post.id.replace('yt-', '')
    return `https://www.youtube.com/embed/${videoId}?autoplay=1&mute=1&controls=1&rel=0`
  }
  if (post.platform === 'tiktok') {
    const videoId = post.id.replace('tt-', '')
    return `https://www.tiktok.com/embed/v2/${videoId}`
  }
  if (post.platform === 'instagram') {
    const shortcode = post.id.replace('ig-', '')
    return `https://www.instagram.com/p/${shortcode}/embed/`
  }
  return null
}

function FeedCard({ post, isActive }: { post: Post; isActive: boolean }) {
  const isSaved = useAppStore(s => s.savedPostIds.has(post.id))
  const toggleSave = useAppStore(s => s.toggleSave)
  const embedUrl = getEmbedUrl(post)

  return (
    <div style={{ height: '100%', position: 'relative', background: '#000', overflow: 'hidden' }}>

      {/* Video embed (active) or thumbnail (inactive) */}
      {isActive && embedUrl ? (
        <iframe
          src={embedUrl}
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', border: 'none' }}
          allow="autoplay; fullscreen; picture-in-picture"
          allowFullScreen
        />
      ) : (
        <div style={{ position: 'absolute', inset: 0 }}>
          {post.thumbnailUrl ? (
            <img
              src={post.platform === 'tiktok'
                ? `/api/thumbnail?url=${encodeURIComponent(post.thumbnailUrl)}`
                : post.thumbnailUrl}
              alt=""
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            />
          ) : (
            <div style={{ width: '100%', height: '100%', background: post.gradient }} />
          )}
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.25)' }} />
        </div>
      )}

      {/* Top-left: score + platform */}
      <div style={{ position: 'absolute', top: 14, left: 14, display: 'flex', gap: 6, zIndex: 20 }}>
        <div style={{ padding: '3px 9px', borderRadius: 6, background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(8px)', fontSize: 12, fontWeight: 800, color: '#fff' }}>
          {post.explosionScore}
        </div>
        <div style={{ padding: '3px 9px', borderRadius: 6, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(8px)', fontSize: 10, fontWeight: 700, color: 'rgba(255,255,255,0.85)', letterSpacing: '0.05em' }}>
          {post.platform.toUpperCase()}
        </div>
      </div>

      {/* Right action bar */}
      <div style={{
        position: 'absolute', right: 14, bottom: 110,
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 28, zIndex: 20,
      }}>
        <button
          onClick={() => toggleSave(post.id, post)}
          style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5, padding: 0 }}
        >
          {isSaved
            ? <BookmarkCheck size={28} color="#fff" strokeWidth={2} />
            : <Bookmark size={28} color="rgba(255,255,255,0.9)" strokeWidth={2} />}
          <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.8)', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
            {formatViews(post.saves || post.likes)}
          </span>
        </button>
        <button
          onClick={() => window.open(post.postUrl, '_blank', 'noopener,noreferrer')}
          style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5, padding: 0 }}
        >
          <ExternalLink size={24} color="rgba(255,255,255,0.9)" strokeWidth={2} />
          <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.8)', fontWeight: 700 }}>Open</span>
        </button>
      </div>

      {/* Bottom info overlay */}
      <div style={{
        position: 'absolute', left: 0, right: 60, bottom: 0,
        padding: '80px 16px 22px',
        background: 'linear-gradient(to top, rgba(0,0,0,0.88) 0%, rgba(0,0,0,0.4) 55%, transparent 100%)',
        zIndex: 20,
      }}>
        <div style={{ fontWeight: 700, color: '#fff', fontSize: 14, marginBottom: 4 }}>
          {post.creatorHandle}
        </div>
        {post.audioName && (
          <div style={{ color: 'rgba(255,255,255,0.72)', fontSize: 12, marginBottom: 4, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
            {post.audioName}
          </div>
        )}
        {post.caption && (
          <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: 12, lineHeight: 1.45, marginBottom: 10, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
            {post.caption}
          </div>
        )}
        <div style={{ display: 'flex', gap: 14 }}>
          <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
            {formatViews(post.views)} views
          </span>
          <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', fontWeight: 600 }}>
            {formatFollowers(post.followerCount)} followers
          </span>
          <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)' }}>
            {timeAgo(post.createdAt)}
          </span>
        </div>
      </div>
    </div>
  )
}

export default function VerticalFeed({ posts }: { posts: Post[] }) {
  const [activeIndex, setActiveIndex] = useState(0)
  const containerRef = useRef<HTMLDivElement>(null)
  const cardRefs = useRef<(HTMLDivElement | null)[]>([])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const observers: IntersectionObserver[] = []
    cardRefs.current.slice(0, posts.length).forEach((el, i) => {
      if (!el) return
      const obs = new IntersectionObserver(
        ([entry]) => { if (entry.isIntersecting && entry.intersectionRatio >= 0.5) setActiveIndex(i) },
        { root: container, threshold: 0.5 }
      )
      obs.observe(el)
      observers.push(obs)
    })
    return () => observers.forEach(o => o.disconnect())
  }, [posts.length])

  return (
    <div
      ref={containerRef}
      style={{ flex: 1, overflowY: 'scroll', scrollSnapType: 'y mandatory' } as React.CSSProperties}
    >
      {posts.map((post, i) => (
        <div
          key={post.id}
          ref={el => { cardRefs.current[i] = el }}
          style={{ height: '100%', scrollSnapAlign: 'start', scrollSnapStop: 'always', flexShrink: 0 } as React.CSSProperties}
        >
          <FeedCard post={post} isActive={i === activeIndex} />
        </div>
      ))}
    </div>
  )
}
