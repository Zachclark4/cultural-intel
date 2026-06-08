'use client'

import { useAppStore } from '@/store/app-store'
import { FOLLOWER_PRESETS, VIEW_PRESETS, PLATFORM_CONFIG, SORT_OPTIONS, TIME_FILTERS, GENRE_FILTERS, FORMAT_FILTERS, SCORE_PRESETS, ENGAGEMENT_PRESETS, VELOCITY_PRESETS, GROWTH_DELTA_PRESETS } from '@/lib/constants'
import { Platform, TimeWindow } from '@/lib/types'
import { toggleArrayItem } from '@/lib/utils'
import { Search, X, RotateCw } from 'lucide-react'
import { useState } from 'react'

type ChipProps = {
  active: boolean
  onClick: () => void
  children: React.ReactNode
  accentColor?: string
}

function Chip({ active, onClick, children, accentColor }: ChipProps) {
  const [hov, setHov] = useState(false)
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        padding: '4px 10px',
        borderRadius: 6,
        fontSize: 12,
        fontWeight: active ? 600 : 400,
        background: active ? '#0a0a0a' : 'transparent',
        color: active ? '#ffffff' : hov ? '#333333' : '#888888',
        border: 'none',
        cursor: 'pointer',
        whiteSpace: 'nowrap',
        flexShrink: 0,
        transition: 'background 0.12s, color 0.12s',
        letterSpacing: active ? '-0.01em' : '0',
      }}
    >
      {children}
    </button>
  )
}

function Divider() {
  return (
    <div
      style={{
        width: 1,
        height: 16,
        background: 'rgba(0,0,0,0.08)',
        flexShrink: 0,
        alignSelf: 'center',
        marginLeft: 2,
        marginRight: 2,
      }}
    />
  )
}

export default function FilterBar({ postCount, onRefresh, refreshing }: { postCount: number; onRefresh?: () => void; refreshing?: boolean }) {
  const {
    filters,
    platformCounts,
    setPlatformFilter,
    setMaxFollowers,
    setMinViews,
    setMinExplosionScore,
    setNiches,
    setFormatTypes,
    setTimeWindow,
    setSortBy,
    setSearchQuery,
    setEnglishOnly,
    setMinEngagementRate,
    setMinVelocity,
    setAudioFilter,
    setMinGrowthDelta,
    resetFilters,
  } = useAppStore()

  const [searchOpen, setSearchOpen] = useState(false)

  const [audioOpen, setAudioOpen] = useState(false)

  const activeCount = [
    filters.platforms.length > 0,
    filters.maxFollowers !== null,
    filters.minViews > 0,
    filters.minExplosionScore > 0,
    filters.niches.length > 0,
    filters.formatTypes.length > 0,
    filters.timeWindow !== null,
    filters.searchQuery !== '',
    filters.englishOnly,
    filters.minEngagementRate > 0,
    filters.minVelocity > 0,
    filters.audioFilter !== '',
    filters.minGrowthDelta > 0,
  ].filter(Boolean).length

  function togglePlatform(p: Platform) {
    setPlatformFilter(toggleArrayItem(filters.platforms, p))
  }

  function toggleFollower(val: number) {
    setMaxFollowers(filters.maxFollowers === val ? null : val)
  }

  function toggleTimeWindow(val: TimeWindow) {
    setTimeWindow(filters.timeWindow === val ? null : val)
  }

  function toggleNiche(val: string) {
    setNiches(toggleArrayItem(filters.niches, val))
  }

  function toggleFormat(val: string) {
    setFormatTypes(toggleArrayItem(filters.formatTypes, val))
  }

  return (
    <div
      style={{
        background: '#ffffff',
        borderBottom: '1px solid rgba(0,0,0,0.08)',
        flexShrink: 0,
      }}
    >
      {/* Main filter strip */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          padding: '0 8px',
          height: 44,
          overflowX: 'auto',
          scrollbarWidth: 'none',
          gap: 2,
        }}
      >
        {/* Signal count */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '0 10px',
            flexShrink: 0,
          }}
        >
          <span
            className="stat-number"
            style={{ fontSize: 13, fontWeight: 700, color: '#0a0a0a' }}
          >
            {postCount}
          </span>
          <span style={{ fontSize: 12, color: '#aaaaaa' }}>signals</span>
        </div>

        <Divider />

        {/* Subscriber cap */}
        {FOLLOWER_PRESETS.map(preset => (
          <Chip
            key={preset.value}
            active={filters.maxFollowers === preset.value}
            onClick={() => toggleFollower(preset.value)}
          >
            {preset.label} subs
          </Chip>
        ))}

        <Divider />

        {/* Min views */}
        {VIEW_PRESETS.map(preset => (
          <Chip
            key={preset.value}
            active={filters.minViews === preset.value}
            onClick={() => setMinViews(filters.minViews === preset.value ? 0 : preset.value)}
          >
            {preset.label}
          </Chip>
        ))}

        <Divider />

        {/* Time window */}
        {TIME_FILTERS.map(t => (
          <Chip
            key={t.value}
            active={filters.timeWindow === t.value}
            onClick={() => toggleTimeWindow(t.value)}
          >
            {t.label}
          </Chip>
        ))}

        <Divider />

        {/* Platform — only show sources that have real data */}
        {(['youtube', 'tiktok', 'spotify'] as Platform[]).map(key => {
          const cfg = PLATFORM_CONFIG[key]
          const count = platformCounts[key] ?? 0
          return (
            <Chip
              key={key}
              active={filters.platforms.includes(key)}
              onClick={() => togglePlatform(key)}
            >
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: filters.platforms.includes(key) ? '#0a0a0a' : '#cccccc', display: 'inline-block', flexShrink: 0 }} />
              {cfg.label}
              {count > 0 && (
                <span style={{ fontSize: 10, color: filters.platforms.includes(key) ? 'rgba(255,255,255,0.6)' : '#aaaaaa', marginLeft: 2 }}>
                  {count}
                </span>
              )}
            </Chip>
          )
        })}

        <Divider />

        {/* Genre */}
        {GENRE_FILTERS.map(g => (
          <Chip
            key={g.value}
            active={filters.niches.includes(g.value)}
            onClick={() => toggleNiche(g.value)}
          >
            {g.label}
          </Chip>
        ))}

        <Divider />

        {/* Format */}
        {FORMAT_FILTERS.map(f => (
          <Chip
            key={f.value}
            active={filters.formatTypes.includes(f.value)}
            onClick={() => toggleFormat(f.value)}
          >
            {f.label}
          </Chip>
        ))}

        <Divider />

        {/* Explosion score presets */}
        {SCORE_PRESETS.map(preset => (
          <Chip
            key={preset.value}
            active={filters.minExplosionScore === preset.value}
            onClick={() => setMinExplosionScore(filters.minExplosionScore === preset.value ? 0 : preset.value)}
            accentColor={preset.accentColor}
          >
            {preset.label}
          </Chip>
        ))}

        <Divider />

        {/* Engagement rate */}
        {ENGAGEMENT_PRESETS.map(preset => (
          <Chip
            key={preset.value}
            active={filters.minEngagementRate === preset.value}
            onClick={() => setMinEngagementRate(filters.minEngagementRate === preset.value ? 0 : preset.value)}
          >
            {preset.label}
          </Chip>
        ))}

        <Divider />

        {/* Velocity */}
        {VELOCITY_PRESETS.map(preset => (
          <Chip
            key={preset.value}
            active={filters.minVelocity === preset.value}
            onClick={() => setMinVelocity(filters.minVelocity === preset.value ? 0 : preset.value)}
          >
            {preset.label}
          </Chip>
        ))}

        <Divider />

        {/* Growth delta */}
        {GROWTH_DELTA_PRESETS.map(preset => (
          <Chip
            key={preset.value}
            active={filters.minGrowthDelta === preset.value}
            onClick={() => setMinGrowthDelta(filters.minGrowthDelta === preset.value ? 0 : preset.value)}
          >
            {preset.label}
          </Chip>
        ))}

        <Divider />

        {/* Audio filter toggle */}
        <Chip
          active={filters.audioFilter !== '' || audioOpen}
          onClick={() => setAudioOpen(v => !v)}
        >
          {filters.audioFilter ? `🎵 ${filters.audioFilter}` : '🎵 Audio'}
        </Chip>

        <Divider />

        {/* Sort */}
        <select
          value={filters.sortBy}
          onChange={e => setSortBy(e.target.value as typeof filters.sortBy)}
          style={{
            background: 'transparent',
            border: 'none',
            color: '#555555',
            fontSize: 12,
            fontWeight: 500,
            padding: '4px 6px',
            cursor: 'pointer',
            outline: 'none',
            flexShrink: 0,
            appearance: 'none',
          }}
        >
          {SORT_OPTIONS.map(opt => (
            <option key={opt.value} value={opt.value} style={{ background: '#ffffff', color: '#0a0a0a' }}>
              {opt.label}
            </option>
          ))}
        </select>

        {/* English only */}
        <Chip
          active={filters.englishOnly}
          onClick={() => setEnglishOnly(!filters.englishOnly)}
        >
          EN
        </Chip>

        {/* Search toggle */}
        <button
          onClick={() => setSearchOpen(v => !v)}
          style={{
            marginLeft: 4,
            width: 28,
            height: 28,
            borderRadius: 6,
            background: searchOpen ? 'rgba(0,0,0,0.06)' : 'transparent',
            border: 'none',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            flexShrink: 0,
            color: searchOpen ? '#0a0a0a' : '#888888',
          }}
        >
          <Search size={13} />
        </button>

        {/* Refresh */}
        {onRefresh && (
          <button
            onClick={onRefresh}
            disabled={refreshing}
            style={{
              width: 28,
              height: 28,
              borderRadius: 6,
              background: 'transparent',
              border: 'none',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: refreshing ? 'default' : 'pointer',
              flexShrink: 0,
              color: '#888888',
              opacity: refreshing ? 0.4 : 1,
            }}
          >
            <RotateCw size={13} style={refreshing ? { animation: 'spin 0.8s linear infinite' } : undefined} />
          </button>
        )}

        {/* Reset — only when filters active */}
        {activeCount > 0 && (
          <>
            <Divider />
            <button
              onClick={resetFilters}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                padding: '4px 8px',
                borderRadius: 6,
                background: 'transparent',
                border: 'none',
                color: '#888888',
                fontSize: 12,
                cursor: 'pointer',
                flexShrink: 0,
                whiteSpace: 'nowrap',
              }}
            >
              <X size={11} />
              Clear {activeCount}
            </button>
          </>
        )}
      </div>

      {/* Search bar — inline expand */}
      {searchOpen && (
        <div style={{ padding: '0 12px 8px', borderTop: '1px solid rgba(0,0,0,0.06)' }}>
          <input
            autoFocus
            value={filters.searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search creators, formats, niches..."
            style={{
              width: '100%',
              background: 'rgba(0,0,0,0.04)',
              border: '1px solid rgba(0,0,0,0.1)',
              borderRadius: 7,
              padding: '7px 12px',
              color: '#0a0a0a',
              fontSize: 13,
              outline: 'none',
            }}
          />
        </div>
      )}

      {/* Audio filter — inline expand */}
      {audioOpen && (
        <div style={{ padding: '0 12px 8px', borderTop: '1px solid rgba(0,0,0,0.06)' }}>
          <input
            autoFocus
            value={filters.audioFilter}
            onChange={e => setAudioFilter(e.target.value)}
            placeholder="Filter by audio / song name..."
            style={{
              width: '100%',
              background: 'rgba(0,0,0,0.04)',
              border: '1px solid rgba(0,0,0,0.1)',
              borderRadius: 7,
              padding: '7px 12px',
              color: '#0a0a0a',
              fontSize: 13,
              outline: 'none',
            }}
          />
        </div>
      )}
    </div>
  )
}
