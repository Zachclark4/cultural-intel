export const NAV_ITEMS = [
  { id: 'feed', label: 'Feed', icon: 'LayoutGrid', href: '/' },
  { id: 'exploding', label: 'Exploding', icon: 'Flame', href: '/exploding' },
  { id: 'audio', label: 'Audio Trends', icon: 'Music', href: '/audio' },
  { id: 'formats', label: 'Formats', icon: 'Layers', href: '/formats' },
  { id: 'niches', label: 'Niches', icon: 'Hash', href: '/niches' },
  { id: 'artists', label: 'Artists', icon: 'Mic', href: '/artists' },
] as const

export const BOARD_NAV_ITEMS = [
  { id: 'boards', label: 'Saved Boards', icon: 'Bookmark', href: '/boards' },
  { id: 'workspace', label: 'Team Workspace', icon: 'Users', href: '/workspace' },
  { id: 'campaigns', label: 'Campaigns', icon: 'Target', href: '/campaigns' },
] as const

export const PLATFORM_CONFIG = {
  tiktok:   { label: 'TikTok',   color: '#ff0050', bg: 'rgba(255,0,80,0.15)' },
  instagram: { label: 'Instagram', color: '#e1306c', bg: 'rgba(225,48,108,0.15)' },
  youtube:  { label: 'YouTube',  color: '#ff0000', bg: 'rgba(255,0,0,0.15)' },
  twitter:  { label: 'X',        color: '#1d9bf0', bg: 'rgba(29,155,240,0.15)' },
  spotify:  { label: 'Spotify',  color: '#1db954', bg: 'rgba(29,185,84,0.15)' },
} as const

export const FOLLOWER_PRESETS = [
  { label: '< 10K', value: 10_000 },
  { label: '< 50K', value: 50_000 },
  { label: '< 100K', value: 100_000 },
  { label: '< 500K', value: 500_000 },
] as const

export const VIEW_PRESETS = [
  { label: '10K+ views', value: 10_000 },
  { label: '100K+ views', value: 100_000 },
  { label: '500K+ views', value: 500_000 },
  { label: '1M+ views', value: 1_000_000 },
] as const

export const TIME_FILTERS = [
  { label: '24h', value: '24h' as const },
  { label: '7 days', value: '7d' as const },
  { label: '14 days', value: '14d' as const },
] as const

export const GENRE_FILTERS = [
  { label: 'Country', value: 'country' },
  { label: 'Rap', value: 'rap' },
  { label: 'Indie', value: 'indie' },
  { label: 'R&B', value: 'r&b' },
  { label: 'Soul', value: 'soul' },
  { label: 'Pop', value: 'pop' },
] as const

export const FORMAT_FILTERS = [
  { label: 'Music Video', value: 'music-video' },
  { label: 'Live', value: 'live-performance' },
  { label: 'Acoustic', value: 'acoustic' },
  { label: 'Studio Session', value: 'studio-session' },
  { label: 'Lyric Video', value: 'lyric-video' },
  { label: 'Cover', value: 'cover' },
  { label: 'Beat / Cookup', value: 'producer-cookup' },
  { label: 'Demo → Final', value: 'demo-to-final' },
] as const

export const SORT_OPTIONS = [
  { label: '⚡ Score', value: 'explosionScore' },
  { label: '🚀 Velocity', value: 'velocity' },
  { label: '📡 Reach ×', value: 'reachMultiplier' },
  { label: '🕐 Newest', value: 'createdAt' },
  { label: '🔖 Save Rate', value: 'saveShareRatio' },
  { label: '👤 Disparity', value: 'followerDisparity' },
] as const

export const NICHE_OPTIONS = [
  'country', 'rap', 'hip-hop', 'pop', 'indie', 'r&b', 'soul',
  'electronic', 'folk', 'rock', 'latin', 'k-pop', 'gospel',
  'singer-songwriter', 'producer', 'dj',
]

export const SCORE_PRESETS = [
  { label: '🔥 Fire', value: 90, accentColor: '#ef4444' },
  { label: 'Hot', value: 80, accentColor: '#f97316' },
] as const

export const ENGAGEMENT_PRESETS = [
  { label: '>2% eng', value: 2 },
  { label: '>5% eng', value: 5 },
  { label: '>10% eng', value: 10 },
] as const

export const VELOCITY_PRESETS = [
  { label: '>500/hr', value: 500 },
  { label: '>2K/hr', value: 2_000 },
  { label: '>10K/hr', value: 10_000 },
] as const

export const GROWTH_DELTA_PRESETS = [
  { label: 'Rising', value: 0.05 },
  { label: 'Surging', value: 0.25 },
] as const

export const DEFAULT_BOARDS = [
  { id: 'board-1', name: 'Country Breakouts', emoji: '🤠', color: '#f97316', postIds: [], createdAt: new Date().toISOString() },
  { id: 'board-2', name: 'Rap Formats', emoji: '🎤', color: '#a855f7', postIds: [], createdAt: new Date().toISOString() },
  { id: 'board-3', name: 'Summer Campaign', emoji: '☀️', color: '#fbbf24', postIds: [], createdAt: new Date().toISOString() },
]
