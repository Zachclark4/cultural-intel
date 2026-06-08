'use client'

import { getExplosionColors, getExplosionLabel, getExplosionTier } from '@/lib/utils'

export default function ExplosionBadge({
  score,
  size = 'md',
}: {
  score: number
  size?: 'sm' | 'md' | 'lg'
}) {
  const colors = getExplosionColors(score)
  const label = getExplosionLabel(score)
  const tier = getExplosionTier(score)

  const sizeMap = {
    sm: { numSize: 14, labelSize: 9, padding: '4px 9px', gap: 6, dotSize: 5 },
    md: { numSize: 16, labelSize: 10, padding: '5px 11px', gap: 7, dotSize: 6 },
    lg: { numSize: 20, labelSize: 11, padding: '6px 14px', gap: 8, dotSize: 7 },
  }
  const s = sizeMap[size]

  return (
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: s.gap,
        padding: s.padding,
        borderRadius: 8,
        background: 'rgba(0,0,0,0.5)',
        backdropFilter: 'blur(12px)',
        border: '1px solid rgba(255,255,255,0.1)',
      }}
    >
      <div
        style={{
          width: s.dotSize,
          height: s.dotSize,
          borderRadius: '50%',
          background: colors.text,
          flexShrink: 0,
          animation: tier === 'fire' ? 'explosion-pulse 2.4s ease-in-out infinite' : 'none',
        }}
      />
      <span
        className="stat-number"
        style={{
          fontSize: s.numSize,
          fontWeight: 800,
          color: '#f0f0f8',
          letterSpacing: '-0.03em',
        }}
      >
        {score}
      </span>
      <span
        style={{
          fontSize: s.labelSize,
          fontWeight: 700,
          color: colors.text,
          letterSpacing: '0.06em',
          opacity: 0.9,
        }}
      >
        {label}
      </span>
    </div>
  )
}
