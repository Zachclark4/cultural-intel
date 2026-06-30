'use client'

import { useMemo, useState, useEffect, useCallback, useRef } from 'react'
import { useAppStore } from '@/store/app-store'
import { filterPosts } from '@/lib/filters'
import { Post } from '@/lib/types'
import PostCard from './PostCard'
import VerticalFeed from './VerticalFeed'
import FilterBar from '@/components/layout/FilterBar'

const BATCH_SIZE = 100

const NAV_META: Record<string, { title: string; desc: string }> = {
  exploding: { title: 'Exploding',        desc: 'Score 88+ · sorted by velocity' },
  audio:     { title: 'Audio Trends',     desc: 'Sorted by save rate — what listeners are bookmarking' },
  artists:   { title: 'Artists',          desc: 'Sorted by follower disparity — biggest overperformers' },
  formats:   { title: 'Formats',          desc: '' },
  niches:    { title: 'Niches',           desc: '' },
  copyable:  { title: 'Copyable Viral',   desc: '2k–50k creators · 100k+ views · last 14 days · sorted by reach multiplier' },
}

export default function FeedGrid() {
  const viewMode = useAppStore(s => s.viewMode)
  const filters = useAppStore(s => s.filters)
  const importedPosts = useAppStore(s => s.importedPosts)
  const setLivePostCount = useAppStore(s => s.setLivePostCount)
  const setExplosionCount = useAppStore(s => s.setExplosionCount)
  const setPlatformCounts = useAppStore(s => s.setPlatformCounts)
  const activeNav = useAppStore(s => s.activeNav)
  const savedPostIds = useAppStore(s => s.savedPostIds)
  const savedPostData = useAppStore(s => s.savedPostData)
  const [fetchedPosts, setFetchedPosts] = useState<Post[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [renderedCount, setRenderedCount] = useState(BATCH_SIZE)
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const sentinelRef = useRef<HTMLDivElement>(null)

  const loadPosts = useCallback(() => {
    setLoading(true)
    setError(null)
    fetch('/api/posts')
      .then(async r => {
        const data = await r.json()
        if (!r.ok) throw new Error(data.error ?? 'Failed to load')
        return data as Post[]
      })
      .then(posts => {
        setFetchedPosts(posts)
        setLivePostCount(posts.length)
        setExplosionCount(posts.filter(p => p.explosionScore >= 88).length)
        const counts: Record<string, number> = {}
        for (const p of posts) counts[p.platform] = (counts[p.platform] ?? 0) + 1
        setPlatformCounts(counts)
        setLoading(false)
      })
      .catch(err => {
        setError(err.message)
        setLoading(false)
      })
  }, [setLivePostCount, setExplosionCount, setPlatformCounts])

  useEffect(() => { loadPosts() }, [loadPosts])

  const allPosts = useMemo(
    () => [...importedPosts, ...fetchedPosts],
    [importedPosts, fetchedPosts]
  )

  const isSavedView = activeNav === 'saved'
  const navMeta = NAV_META[activeNav]

  // Fall back to persisted post data when a saved post is no longer in the live feed
  const savedPosts = useMemo(() => {
    const liveById = new Map(allPosts.map(p => [p.id, p]))
    return [...savedPostIds]
      .map(id => liveById.get(id) ?? savedPostData[id])
      .filter((p): p is Post => Boolean(p))
  }, [allPosts, savedPostIds, savedPostData])

  // Each nav view applies its own filter overrides on top of user filters
  const navOverrides = useMemo(() => {
    switch (activeNav) {
      case 'exploding': return { minExplosionScore: 88, sortBy: 'velocity' as const }
      case 'audio':     return { sortBy: 'saveShareRatio' as const }
      case 'artists':   return { sortBy: 'followerDisparity' as const }
      case 'copyable':  return {
        minFollowers: 2_000,
        maxFollowers: 50_000,
        minViews: 100_000,
        timeWindow: '14d' as const,
        sortBy: 'reachMultiplier' as const,
      }
      default:          return {}
    }
  }, [activeNav])

  const filteredPosts = useMemo(
    () =>
      filterPosts(allPosts, {
        platforms: filters.platforms,
        maxFollowers: filters.maxFollowers,
        minViews: filters.minViews,
        minExplosionScore: filters.minExplosionScore,
        niches: filters.niches,
        formatTypes: filters.formatTypes,
        timeWindow: filters.timeWindow,
        sortBy: filters.sortBy,
        searchQuery: filters.searchQuery,
        englishOnly: filters.englishOnly,
        minEngagementRate: filters.minEngagementRate,
        minVelocity: filters.minVelocity,
        audioFilter: filters.audioFilter,
        minGrowthDelta: filters.minGrowthDelta,
        ...navOverrides,
      }),
    [
      allPosts,
      filters.platforms,
      filters.maxFollowers,
      filters.minViews,
      filters.minExplosionScore,
      filters.niches,
      filters.formatTypes,
      filters.timeWindow,
      filters.sortBy,
      filters.searchQuery,
      filters.englishOnly,
      filters.minEngagementRate,
      filters.minVelocity,
      filters.audioFilter,
      filters.minGrowthDelta,
      navOverrides,
    ]
  )

  const posts = isSavedView ? savedPosts : filteredPosts

  // Reset to first batch whenever the active post set changes (filter/nav change)
  useEffect(() => {
    setRenderedCount(BATCH_SIZE)
  }, [posts])

  // Infinite scroll — load next batch when sentinel enters viewport
  useEffect(() => {
    const sentinel = sentinelRef.current
    const container = scrollContainerRef.current
    if (!sentinel || !container) return
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) setRenderedCount(n => Math.min(n + BATCH_SIZE, posts.length))
      },
      { root: container, rootMargin: '400px' }
    )
    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [posts.length])

  const visiblePosts = useMemo(() => posts.slice(0, renderedCount), [posts, renderedCount])

  // Keep sidebar count in sync with total available (not just rendered)
  useEffect(() => {
    if (!loading) setLivePostCount(posts.length)
  }, [posts.length, loading, setLivePostCount])

  return (
    <div style={{ display: 'flex', flex: 1, flexDirection: 'column', overflow: 'hidden', minHeight: 0 }}>
      {!isSavedView && <FilterBar postCount={loading ? 0 : posts.length} onRefresh={loadPosts} refreshing={loading} />}

      {/* Nav view header — shown for non-feed, non-boards nav items */}
      {navMeta && (
        <div style={{ padding: '12px 20px 0', flexShrink: 0 }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: '#0a0a0a' }}>{navMeta.title}</span>
          {navMeta.desc && (
            <span style={{ fontSize: 12, color: '#aaa', marginLeft: 8 }}>{navMeta.desc}</span>
          )}
        </div>
      )}

      {isSavedView && (
        <div
          style={{
            padding: '16px 20px 0',
            flexShrink: 0,
            borderBottom: '1px solid rgba(0,0,0,0.08)',
            paddingBottom: 12,
          }}
        >
          <div style={{ fontSize: 15, fontWeight: 700, color: '#0a0a0a' }}>Saved</div>
          <div style={{ fontSize: 12, color: '#888888', marginTop: 2 }}>
            {savedPosts.length} {savedPosts.length === 1 ? 'post' : 'posts'}
          </div>
        </div>
      )}

      {!isSavedView && loading ? (
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px' }}><LoadingSkeleton /></div>
      ) : !isSavedView && error ? (
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px' }}><ErrorState message={error} /></div>
      ) : posts.length === 0 ? (
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px' }}>
          {isSavedView ? <SavedEmptyState /> : <EmptyState />}
        </div>
      ) : !isSavedView && viewMode === 'feed' ? (
        <VerticalFeed posts={posts} />
      ) : (
        <div ref={scrollContainerRef} style={{ flex: 1, overflowY: 'auto', padding: '20px' }}>
          <div className="video-grid">
            {visiblePosts.map((post, i) => (
              <PostCard key={post.id} post={post} index={i} />
            ))}
          </div>
          {renderedCount < posts.length && (
            <div ref={sentinelRef} style={{ height: 48, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ fontSize: 12, color: '#ccc' }}>{renderedCount} of {posts.length}</span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function SavedEmptyState() {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '80px 40px',
        textAlign: 'center',
        gap: 12,
      }}
    >
      <div style={{ fontSize: 18, fontWeight: 700, color: '#0a0a0a' }}>No saved posts yet</div>
      <div style={{ fontSize: 14, color: '#888888', maxWidth: 280 }}>
        Hover a card in the feed and click the bookmark icon to save it here.
      </div>
    </div>
  )
}

function ErrorState({ message }: { message: string }) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '80px 40px',
        textAlign: 'center',
        gap: 12,
      }}
    >
      <div style={{ fontSize: 18, fontWeight: 700, color: '#0a0a0a' }}>YouTube fetch failed</div>
      <div
        style={{
          fontSize: 12,
          color: '#888888',
          maxWidth: 400,
          fontFamily: 'monospace',
          background: 'rgba(0,0,0,0.04)',
          padding: '8px 14px',
          borderRadius: 8,
          border: '1px solid rgba(0,0,0,0.08)',
        }}
      >
        {message}
      </div>
      <div style={{ fontSize: 13, color: '#888888', maxWidth: 340 }}>
        Check that <code>YOUTUBE_API_KEY</code> is set in <code>.env.local</code> and restart the dev server.
      </div>
    </div>
  )
}

function LoadingSkeleton() {
  return (
    <div className="video-grid">
      {Array.from({ length: 12 }).map((_, i) => (
        <div
          key={i}
          style={{
            aspectRatio: '9/16',
            borderRadius: 12,
            background: 'linear-gradient(135deg, #f0f0f0 0%, #e8e8e8 50%, #f0f0f0 100%)',
            backgroundSize: '200% 100%',
            animation: `velocity-shimmer ${1.4 + i * 0.07}s ease-in-out infinite`,
            border: '1px solid rgba(0,0,0,0.06)',
          }}
        />
      ))}
    </div>
  )
}

function EmptyState() {
  const { resetFilters } = useAppStore()
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '80px 40px',
        textAlign: 'center',
        gap: 16,
      }}
    >
      <div style={{ fontSize: 18, fontWeight: 700, color: '#0a0a0a' }}>No signals match your filters</div>
      <div style={{ fontSize: 14, color: '#888888', maxWidth: 300 }}>
        Try adjusting your filters to discover more breakout content.
      </div>
      <button
        onClick={resetFilters}
        style={{
          padding: '8px 20px',
          borderRadius: 10,
          background: '#0a0a0a',
          border: 'none',
          color: '#ffffff',
          fontSize: 13,
          fontWeight: 600,
          cursor: 'pointer',
        }}
      >
        Reset Filters
      </button>
    </div>
  )
}
