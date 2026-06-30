'use client'

import { useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Post } from '@/lib/types'
import { formatFollowers, formatVelocity, formatViews, getFollowerTierLabel, timeAgo } from '@/lib/utils'
import { useAppStore } from '@/store/app-store'
import Sparkline from '@/components/ui/Sparkline'
import { Bookmark, BookmarkCheck, Share2 } from 'lucide-react'
import { PLATFORM_CONFIG } from '@/lib/constants'
import { computeReplicationPotential } from '@/lib/replication'


export default function PostCard({ post, index = 0 }: { post: Post; index?: number }) {
  const isSaved = useAppStore(s => s.savedPostIds.has(post.id))
  const toggleSave = useAppStore(s => s.toggleSave)
  const [hovered, setHovered] = useState(false)
  const [imgError, setImgError] = useState(false)
  const [slide, setSlide] = useState(0)
  const cardRef = useRef<HTMLDivElement>(null)
  const hoveredRef = useRef(false)

  useEffect(() => { hoveredRef.current = hovered }, [hovered])

  useEffect(() => {
    const el = cardRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      if (!hoveredRef.current) return
      if (Math.abs(e.deltaX) < 10) return
      if (Math.abs(e.deltaX) < Math.abs(e.deltaY) * 0.6) return
      e.preventDefault()
      e.stopPropagation()
      const maxSlide = post.formatSummary ? 2 : 1
      setSlide(s => e.deltaX > 0 ? Math.min(s + 1, maxSlide) : Math.max(s - 1, 0))
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  const platformLabel = PLATFORM_CONFIG[post.platform].label

  return (
    <motion.div
      ref={cardRef}
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, delay: Math.min(index * 0.03, 0.15), ease: [0.25, 0.46, 0.45, 0.94] }}
      onHoverStart={() => setHovered(true)}
      onHoverEnd={() => { setHovered(false); setSlide(0) }}
      whileHover={{ y: -2 }}
      onClick={() => window.open(post.postUrl, '_blank', 'noopener,noreferrer')}
      style={{
        borderRadius: 10,
        overflow: 'hidden',
        cursor: 'pointer',
        border: '1px solid rgba(0,0,0,0.08)',
        background: '#ffffff',
        boxShadow: hovered ? '0 6px 24px rgba(0,0,0,0.1)' : '0 1px 4px rgba(0,0,0,0.05)',
        transition: 'box-shadow 0.2s',
      }}
    >
      {/* ── Thumbnail (9:16 portrait) ── */}
      <div style={{ position: 'relative', aspectRatio: '9/16', overflow: 'hidden' }}>

        {post.thumbnailUrl && !imgError ? (
          <motion.img
            src={
              post.platform === 'tiktok'
                ? `/api/thumbnail?url=${encodeURIComponent(post.thumbnailUrl)}`
                : post.thumbnailUrl
            }
            alt={post.audioName ?? ''}
            onError={() => setImgError(true)}
            animate={{ scale: hovered ? 1.04 : 1 }}
            transition={{ duration: 0.5, ease: [0.25, 0.46, 0.45, 0.94] }}
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', transformOrigin: 'center',
              // TikTok thumbnails are portrait — anchor to top so faces aren't cropped out
              objectPosition: 'center',
            }}
          />
        ) : (
          <motion.div
            animate={{ scale: hovered ? 1.04 : 1 }}
            transition={{ duration: 0.5 }}
            style={{ position: 'absolute', inset: 0, background: post.gradient }}
          />
        )}

        {/* Hover scrim */}
        <AnimatePresence>
          {hovered && (
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.35)', zIndex: 2 }}
            />
          )}
        </AnimatePresence>

        {/* Top-left: score + views */}
        <div style={{ position: 'absolute', top: 10, left: 10, display: 'flex', gap: 5, zIndex: 3 }}>
          <div style={{ padding: '3px 8px', borderRadius: 6, background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(8px)' }}>
            <span className="stat-number" style={{ fontSize: 12, fontWeight: 800, color: '#fff', letterSpacing: '-0.02em' }}>
              {post.explosionScore}
            </span>
          </div>
          <div style={{ padding: '3px 8px', borderRadius: 6, background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(8px)', fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.9)' }}>
            {formatViews(post.views)} views
          </div>
        </div>

        {/* Top-right: platform + save */}
        <div style={{ position: 'absolute', top: 10, right: 10, display: 'flex', gap: 5, alignItems: 'center', zIndex: 4 }}>
          <div style={{ padding: '3px 7px', borderRadius: 6, background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(8px)', fontSize: 10, fontWeight: 700, color: 'rgba(255,255,255,0.85)', letterSpacing: '0.04em' }}>
            {platformLabel.toUpperCase()}
          </div>
          <AnimatePresence>
            {(hovered || isSaved) && (
              <motion.button
                initial={{ opacity: 0, scale: 0.85 }} animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.85 }} transition={{ duration: 0.12 }}
                onClick={e => { e.stopPropagation(); toggleSave(post.id, post) }}
                style={{ width: 28, height: 28, borderRadius: 6, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(8px)', border: '1px solid rgba(255,255,255,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
              >
                {isSaved
                  ? <BookmarkCheck size={12} color="#ffffff" strokeWidth={2.5} />
                  : <Bookmark size={12} color="rgba(255,255,255,0.75)" strokeWidth={2} />}
              </motion.button>
            )}
          </AnimatePresence>
        </div>

        {/* Hover: sliding overlay */}
        <AnimatePresence>
          {hovered && (
            <motion.div
              initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }} transition={{ duration: 0.15 }}
              style={{ position: 'absolute', inset: 0, zIndex: 3, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', padding: '42px 8px 8px', overflow: 'hidden' }}
            >
              {/* Slide window */}
              <div style={{ overflow: 'hidden', borderRadius: 7 }} onClick={e => e.stopPropagation()}>
                <motion.div
                  animate={{ x: slide === 0 ? '0%' : slide === 1 ? '-33.333%' : '-66.667%' }}
                  transition={{ type: 'spring', stiffness: 400, damping: 35 }}
                  style={{ display: 'flex', width: post.formatSummary ? '300%' : '200%' }}
                >
                  {/* Panel 0 — Raw DB stats */}
                  <div style={{ width: post.formatSummary ? '33.333%' : '50%', flexShrink: 0 }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 3 }}>
                      {[
                        { label: 'Views',     value: formatViews(post.views) },
                        { label: 'Likes',     value: formatViews(post.likes) },
                        { label: 'Comments',  value: formatViews(post.comments) },
                        { label: 'Shares',    value: formatViews(post.shares) },
                        { label: 'Saves',     value: formatViews(post.saves) },
                        { label: 'Followers', value: formatFollowers(post.followerCount) },
                      ].map(({ label, value }) => (
                        <div key={label} style={{ background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(6px)', borderRadius: 5, padding: '3px 5px' }}>
                          <div style={{ fontSize: 8, fontWeight: 600, color: 'rgba(255,255,255,0.45)', letterSpacing: '0.04em', marginBottom: 1, lineHeight: 1.2 }}>{label}</div>
                          <span className="stat-number" style={{ fontSize: 11, fontWeight: 700, color: '#fff', lineHeight: 1.2 }}>{value}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Panel 1 — Intelligence */}
                  <div style={{ width: post.formatSummary ? '33.333%' : '50%', flexShrink: 0, paddingLeft: 3, display: 'flex', flexDirection: 'column', gap: 3 }}>
                    {(() => {
                      const pct = (n: number) => isNaN(n) ? '—' : `${(n * 100).toFixed(1)}%`
                      const reach = post.reachMultiplier
                      const topRow = [
                        { label: 'Reach ×',  value: isNaN(reach) ? '—' : `${Math.round(reach)}x` },
                        { label: 'Velocity', value: formatVelocity(post.velocityViewsPerHour) },
                      ]
                      const bottomRow = [
                        { label: 'Eng%',      value: pct(post.engagementRate) },
                        { label: 'Like%',     value: pct(post.likeRate) },
                        { label: 'Share%',    value: pct(post.shareRate) },
                        { label: 'Save%',     value: pct(post.saveRate) },
                      ]
                      const cell = ({ label, value }: { label: string; value: string }) => (
                        <div key={label} style={{ background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(6px)', borderRadius: 5, padding: '3px 5px' }}>
                          <div style={{ fontSize: 8, fontWeight: 600, color: 'rgba(255,255,255,0.45)', letterSpacing: '0.04em', marginBottom: 1, lineHeight: 1.2 }}>{label}</div>
                          <span className="stat-number" style={{ fontSize: 11, fontWeight: 700, color: '#fff', lineHeight: 1.2 }}>{value}</span>
                        </div>
                      )
                      const rep = computeReplicationPotential(post)
                      return (
                        <>
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 3 }}>
                            {topRow.map(cell)}
                          </div>
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 3 }}>
                            {bottomRow.map(cell)}
                          </div>
                          <div style={{ background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(6px)', borderRadius: 5, padding: '4px 7px', border: `1px solid ${rep.color}55`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ fontSize: 8, fontWeight: 700, color: 'rgba(255,255,255,0.45)', letterSpacing: '0.06em' }}>REPLICATION</span>
                            <span style={{ fontSize: 10, fontWeight: 800, color: rep.color }}>{rep.level}</span>
                          </div>
                        </>
                      )
                    })()}
                  </div>
                  {/* Panel 2 — Format Intelligence (only when AI has processed this post) */}
                  {post.formatSummary && (
                    <div style={{ width: '33.333%', flexShrink: 0, paddingLeft: 3, display: 'flex', flexDirection: 'column', gap: 3 }}>
                      <div style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(6px)', borderRadius: 5, padding: '5px 7px' }}>
                        <div style={{ fontSize: 8, fontWeight: 700, color: 'rgba(255,255,255,0.4)', letterSpacing: '0.06em', marginBottom: 3 }}>FORMAT</div>
                        <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.85)', lineHeight: 1.4 }}>{post.formatSummary}</div>
                      </div>
                      <div style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(6px)', borderRadius: 5, padding: '5px 7px', border: '1px solid rgba(99,230,180,0.2)' }}>
                        <div style={{ fontSize: 8, fontWeight: 700, color: 'rgba(99,230,180,0.6)', letterSpacing: '0.06em', marginBottom: 3 }}>ARTIST ADAPTATION</div>
                        <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.85)', lineHeight: 1.4 }}>{post.artistAdaptation}</div>
                      </div>
                    </div>
                  )}
                </motion.div>
              </div>

              {/* Dot indicators + share */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 5 }} onClick={e => e.stopPropagation()}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 5, flex: 1, justifyContent: 'center' }}>
                  {(post.formatSummary ? [0, 1, 2] : [0, 1]).map(i => (
                    <button
                      key={i}
                      onClick={() => setSlide(i)}
                      style={{
                        width: slide === i ? 16 : 5,
                        height: 5,
                        borderRadius: 3,
                        background: slide === i ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.3)',
                        border: 'none',
                        cursor: 'pointer',
                        padding: 0,
                        transition: 'all 0.2s',
                      }}
                    />
                  ))}
                </div>
                <button
                  onClick={e => {
                    e.stopPropagation()
                    if (navigator.share) {
                      navigator.share({ url: post.postUrl, title: post.audioName ?? undefined }).catch(() => {})
                    } else {
                      navigator.clipboard.writeText(post.postUrl).catch(() => {})
                    }
                  }}
                  title="Share"
                  style={{ width: 24, height: 24, borderRadius: 5, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(8px)', border: '1px solid rgba(255,255,255,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}
                >
                  <Share2 size={11} color="rgba(255,255,255,0.8)" strokeWidth={2} />
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ── Info row below thumbnail ── */}
      <div style={{ padding: '10px 12px 12px' }}>
        {/* Video title */}
        {post.audioName && (
          <div style={{
            fontSize: 13, fontWeight: 600, color: '#0a0a0a', lineHeight: 1.35, marginBottom: 4,
            display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
          }}>
            {post.audioName}
          </div>
        )}

        {/* Format summary — shown when AI has processed this post */}
        {post.formatSummary && (
          <div style={{
            fontSize: 11, color: '#777', lineHeight: 1.4, marginBottom: 8, fontStyle: 'italic',
            display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
          }}>
            {post.formatSummary}
          </div>
        )}

        {/* Spacer when no audio name and no format summary */}
        {!post.audioName && !post.formatSummary && <div style={{ marginBottom: 8 }} />}

        {/* Creator row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ width: 22, height: 22, borderRadius: '50%', background: '#e8e8e8', border: '1px solid rgba(0,0,0,0.08)', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 700, color: '#555' }}>
            {post.creatorName[0]?.toUpperCase()}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#333', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {post.creatorHandle}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 1 }}>
              <span className="stat-number" style={{ fontSize: 10, color: '#999' }}>
                {formatFollowers(post.followerCount)}
              </span>
              <span style={{ fontSize: 9, fontWeight: 600, color: '#bbb', letterSpacing: '0.04em' }}>
                {getFollowerTierLabel(post.followerCount)}
              </span>
              {/* Reach multiplier chip — highlights the over-punch ratio */}
              {post.reachMultiplier >= 5 && (
                <span style={{
                  fontSize: 9, fontWeight: 700, letterSpacing: '0.02em',
                  color: post.reachMultiplier >= 50 ? '#16a34a'
                    : post.reachMultiplier >= 20 ? '#ea580c'
                    : '#ca8a04',
                  marginLeft: 2,
                }}>
                  {Math.round(post.reachMultiplier)}×
                </span>
              )}
            </div>
          </div>
          <span style={{ fontSize: 10, color: '#bbb', flexShrink: 0 }}>
            {timeAgo(post.createdAt)}
          </span>
        </div>

      </div>
    </motion.div>
  )
}
