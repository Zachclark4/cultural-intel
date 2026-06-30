'use client'

import { useAppStore } from '@/store/app-store'
import { Bookmark, Target, Rows3 } from 'lucide-react'

export default function Sidebar() {
  const activeNav = useAppStore(s => s.activeNav)
  const setActiveNav = useAppStore(s => s.setActiveNav)
  const savedPostIds = useAppStore(s => s.savedPostIds)
  const viewMode = useAppStore(s => s.viewMode)
  const setViewMode = useAppStore(s => s.setViewMode)

  return (
    <aside style={{
      width: 72,
      flexShrink: 0,
      height: '100vh',
      background: '#ffffff',
      borderRight: '1px solid #e9e9e9',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      paddingTop: 20,
      paddingBottom: 20,
      gap: 4,
    }}>
      {/* Logo → Feed */}
      <button
        onClick={() => setActiveNav('feed')}
        title="Feed"
        style={{
          width: 44,
          height: 44,
          borderRadius: 12,
          background: activeNav === 'feed' ? '#f0f0f0' : 'transparent',
          border: 'none',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transition: 'background 0.15s',
          marginBottom: 12,
        }}
        onMouseEnter={e => { if (activeNav !== 'feed') (e.currentTarget as HTMLButtonElement).style.background = '#f5f5f5' }}
        onMouseLeave={e => { if (activeNav !== 'feed') (e.currentTarget as HTMLButtonElement).style.background = 'transparent' }}
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
          <path d="M13 2L4.5 13.5H11L10 22L19.5 10.5H13L13 2Z"
            fill={activeNav === 'feed' ? '#111' : '#aaa'}
            stroke={activeNav === 'feed' ? '#111' : '#aaa'}
            strokeWidth="1.5" strokeLinejoin="round" />
        </svg>
      </button>

      <div style={{ width: 28, height: 1, background: '#e9e9e9', marginBottom: 4 }} />

      {/* Copyable Viral */}
      <button
        onClick={() => setActiveNav('copyable')}
        title="Copyable Viral — 2k–50k creators, 100k+ views, sorted by reach"
        style={{
          width: 44,
          height: 44,
          borderRadius: 12,
          background: activeNav === 'copyable' ? '#f0f0f0' : 'transparent',
          border: 'none',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transition: 'background 0.15s',
        }}
        onMouseEnter={e => { if (activeNav !== 'copyable') (e.currentTarget as HTMLButtonElement).style.background = '#f5f5f5' }}
        onMouseLeave={e => { if (activeNav !== 'copyable') (e.currentTarget as HTMLButtonElement).style.background = 'transparent' }}
      >
        <Target
          size={18}
          strokeWidth={2}
          color={activeNav === 'copyable' ? '#111' : '#aaa'}
        />
      </button>

      {/* Feed / Grid toggle */}
      <button
        onClick={() => setViewMode(viewMode === 'feed' ? 'grid' : 'feed')}
        title={viewMode === 'feed' ? 'Switch to grid' : 'Switch to feed'}
        style={{
          width: 44,
          height: 44,
          borderRadius: 12,
          background: viewMode === 'feed' ? '#f0f0f0' : 'transparent',
          border: 'none',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transition: 'background 0.15s',
        }}
        onMouseEnter={e => { if (viewMode !== 'feed') (e.currentTarget as HTMLButtonElement).style.background = '#f5f5f5' }}
        onMouseLeave={e => { if (viewMode !== 'feed') (e.currentTarget as HTMLButtonElement).style.background = 'transparent' }}
      >
        <Rows3 size={18} strokeWidth={2} color={viewMode === 'feed' ? '#111' : '#aaa'} />
      </button>

      {/* Saved Posts */}
      <button
        onClick={() => setActiveNav('saved')}
        title="Saved Posts"
        style={{
          width: 44,
          height: 44,
          borderRadius: 12,
          background: activeNav === 'saved' ? '#f0f0f0' : 'transparent',
          border: 'none',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transition: 'background 0.15s',
          position: 'relative',
        }}
        onMouseEnter={e => { if (activeNav !== 'saved') (e.currentTarget as HTMLButtonElement).style.background = '#f5f5f5' }}
        onMouseLeave={e => { if (activeNav !== 'saved') (e.currentTarget as HTMLButtonElement).style.background = 'transparent' }}
      >
        <Bookmark
          size={20}
          strokeWidth={2}
          color={activeNav === 'saved' ? '#111' : '#aaa'}
          fill={activeNav === 'saved' ? '#111' : 'none'}
        />
        {savedPostIds.size > 0 && (
          <span style={{
            position: 'absolute',
            top: 8,
            right: 8,
            width: 7,
            height: 7,
            borderRadius: '50%',
            background: '#e60023',
            border: '1.5px solid #fff',
          }} />
        )}
      </button>
    </aside>
  )
}
