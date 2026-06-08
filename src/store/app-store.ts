'use client'

import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { AppState, Board, Filters, Platform, Post, SortBy, TimeWindow } from '@/lib/types'
import { DEFAULT_BOARDS } from '@/lib/constants'

const DEFAULT_FILTERS: Filters = {
  platforms: [],
  maxFollowers: null,
  minViews: 1000,
  minExplosionScore: 0,
  niches: [],
  formatTypes: [],
  timeWindow: null,
  sortBy: 'explosionScore',
  searchQuery: '',
  englishOnly: false,
  minEngagementRate: 0,
  minVelocity: 0,
  audioFilter: '',
  minGrowthDelta: 0,
}

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      selectedPost: null,
      setSelectedPost: (post) => set({ selectedPost: post }),

      filters: DEFAULT_FILTERS,
      setPlatformFilter: (platforms) =>
        set(s => ({ filters: { ...s.filters, platforms } })),
      setMaxFollowers: (maxFollowers) =>
        set(s => ({ filters: { ...s.filters, maxFollowers } })),
      setMinViews: (minViews) =>
        set(s => ({ filters: { ...s.filters, minViews } })),
      setMinExplosionScore: (minExplosionScore) =>
        set(s => ({ filters: { ...s.filters, minExplosionScore } })),
      setNiches: (niches) =>
        set(s => ({ filters: { ...s.filters, niches } })),
      setFormatTypes: (formatTypes) =>
        set(s => ({ filters: { ...s.filters, formatTypes } })),
      setTimeWindow: (timeWindow: TimeWindow) =>
        set(s => ({ filters: { ...s.filters, timeWindow } })),
      setSortBy: (sortBy: SortBy) =>
        set(s => ({ filters: { ...s.filters, sortBy } })),
      setSearchQuery: (searchQuery) =>
        set(s => ({ filters: { ...s.filters, searchQuery } })),
      setEnglishOnly: (englishOnly) =>
        set(s => ({ filters: { ...s.filters, englishOnly } })),
      setMinEngagementRate: (minEngagementRate) =>
        set(s => ({ filters: { ...s.filters, minEngagementRate } })),
      setMinVelocity: (minVelocity) =>
        set(s => ({ filters: { ...s.filters, minVelocity } })),
      setAudioFilter: (audioFilter) =>
        set(s => ({ filters: { ...s.filters, audioFilter } })),
      setMinGrowthDelta: (minGrowthDelta) =>
        set(s => ({ filters: { ...s.filters, minGrowthDelta } })),
      resetFilters: () => set({ filters: DEFAULT_FILTERS }),

      boards: DEFAULT_BOARDS as Board[],
      savedPostIds: new Set<string>(),
      savedPostData: {} as Record<string, Post>,

      toggleSave: (postId, post) => {
        const current = get().savedPostIds
        const next = new Set(current)
        const data = { ...get().savedPostData }
        if (next.has(postId)) {
          next.delete(postId)
          delete data[postId]
        } else {
          next.add(postId)
          data[postId] = post
        }
        set({ savedPostIds: next, savedPostData: data })
      },

      saveToBoard: (postId, boardId) =>
        set(s => ({
          boards: s.boards.map(b =>
            b.id === boardId && !b.postIds.includes(postId)
              ? { ...b, postIds: [...b.postIds, postId] }
              : b
          ),
        })),

      removeFromBoard: (postId, boardId) =>
        set(s => ({
          boards: s.boards.map(b =>
            b.id === boardId
              ? { ...b, postIds: b.postIds.filter(id => id !== postId) }
              : b
          ),
        })),

      createBoard: (name, emoji) => {
        const newBoard: Board = {
          id: `board-${Date.now()}`,
          name,
          emoji,
          color: '#7c3aed',
          postIds: [],
          createdAt: new Date().toISOString(),
        }
        set(s => ({ boards: [...s.boards, newBoard] }))
      },

      importedPosts: [],
      addImportedPost: (post) =>
        set(s => ({ importedPosts: [post, ...s.importedPosts] })),

      livePostCount: 0,
      setLivePostCount: (livePostCount) => set({ livePostCount }),

      explosionCount: 0,
      setExplosionCount: (explosionCount) => set({ explosionCount }),

      platformCounts: {},
      setPlatformCounts: (platformCounts) => set({ platformCounts }),

      activeNav: 'feed',
      setActiveNav: (nav) => set({ activeNav: nav }),
    }),
    {
      name: 'cultural-intel-store',
      // Only persist what should survive a page reload — not ephemeral UI state
      partialize: (s) => ({
        savedPostData: s.savedPostData,
        boards: s.boards,
        importedPosts: s.importedPosts,
      }),
      // savedPostIds is derived from savedPostData keys on load — no separate serialization needed
      storage: {
        getItem: (key) => {
          const raw = localStorage.getItem(key)
          if (!raw) return null
          const parsed = JSON.parse(raw)
          if (parsed?.state?.savedPostData) {
            parsed.state.savedPostIds = new Set(Object.keys(parsed.state.savedPostData))
          }
          return parsed
        },
        setItem: (key, value) => {
          const copy = { ...value, state: { ...value.state } }
          // savedPostIds is a derived Set — don't persist it; savedPostData is the source of truth
          delete (copy.state as Record<string, unknown>).savedPostIds
          localStorage.setItem(key, JSON.stringify(copy))
        },
        removeItem: (key) => localStorage.removeItem(key),
      },
    }
  )
)
