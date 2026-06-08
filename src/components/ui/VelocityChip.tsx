'use client'

import { formatVelocity } from '@/lib/utils'
import { TrendingUp } from 'lucide-react'

export default function VelocityChip({
  viewsPerHour,
  compact = false,
}: {
  viewsPerHour: number
  compact?: boolean
}) {
  return (
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: compact ? 4 : 5,
        padding: compact ? '3px 8px' : '4px 10px',
        borderRadius: 6,
        background: 'rgba(6,182,212,0.12)',
        color: '#22d3ee',
      }}
    >
      <TrendingUp size={compact ? 10 : 12} strokeWidth={2.5} style={{ flexShrink: 0 }} />
      <span
        className="stat-number"
        style={{
          fontSize: compact ? 11 : 12,
          fontWeight: 700,
          letterSpacing: '-0.01em',
        }}
      >
        {formatVelocity(viewsPerHour)}
      </span>
    </div>
  )
}
