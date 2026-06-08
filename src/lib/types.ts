export type Platform = 'tiktok' | 'instagram' | 'youtube' | 'twitter' | 'spotify'
export type ArtistType = 'independent' | 'major-label' | 'indie-label' | 'unsigned'
export type SortBy = 'explosionScore' | 'velocity' | 'createdAt' | 'saveShareRatio' | 'followerDisparity' | 'reachMultiplier'

export interface ViralityFactors {
  hook: number
  production: number
  charisma: number
  timing: number
  shareability: number
  authenticity: number
}

export interface EditingAnalysis {
  cutFrequency: string
  pacing: 'slow-build' | 'fast-cut' | 'steady' | 'escalating'
  subtitleStyle: string
  shotTypes: string[]
}

export interface AIAnalysis {
  hookSentence: string
  hookTimingSeconds: number
  emotionalIntensity: number
  charismaScore: number
  whyItWorked: string[]
  howToRecreate: string[]
  viralityFactors: ViralityFactors
  audienceOverlap: string[]
  creatorArchetype: string
  relatedFormats: string[]
  editingAnalysis: EditingAnalysis
  formatCluster: string
}

export interface Post {
  id: string
  platform: Platform

  creatorId: string
  creatorName: string
  creatorHandle: string
  followerCount: number
  creatorGradient: string

  views: number
  likes: number
  comments: number
  shares: number
  saves: number
  engagementRate: number
  likeRate: number
  commentRate: number
  shareRate: number
  saveRate: number
  reachMultiplier: number
  saveShareRatio: number

  velocityViewsPerHour: number
  growthDelta: number
  explosionScore: number

  audioId?: string
  audioName?: string

  hashtags: string[]
  niche: string[]
  geography?: string
  artistType?: ArtistType

  thumbnailUrl?: string
  caption: string
  emoji: string
  gradient: string
  formatCluster: string
  postUrl: string

  createdAt: string
  growthHistory: number[]

  formatSummary?: string       // AI: objective description of content format
  artistAdaptation?: string    // AI: how a music artist could recreate this
  discoverySource?: string     // how it was found: hashtag | keyword | watchlist | etc.

  aiAnalysis?: AIAnalysis
}

export interface Board {
  id: string
  name: string
  emoji: string
  color: string
  postIds: string[]
  createdAt: string
  description?: string
}

export type TimeWindow = '24h' | '7d' | '14d' | null

export interface Filters {
  platforms: Platform[]
  maxFollowers: number | null
  minViews: number
  minExplosionScore: number
  niches: string[]
  formatTypes: string[]
  timeWindow: TimeWindow
  sortBy: SortBy
  searchQuery: string
  englishOnly: boolean
  minEngagementRate: number   // percent, e.g. 3 = 3%
  minVelocity: number         // views per hour
  audioFilter: string         // free-text match against audioName
  minGrowthDelta: number      // 0-1 ratio of velocity to total views
}

export interface AppState {
  selectedPost: Post | null
  setSelectedPost: (post: Post | null) => void

  filters: Filters
  setPlatformFilter: (platforms: Platform[]) => void
  setMaxFollowers: (max: number | null) => void
  setMinViews: (min: number) => void
  setMinExplosionScore: (min: number) => void
  setNiches: (niches: string[]) => void
  setFormatTypes: (formats: string[]) => void
  setTimeWindow: (window: TimeWindow) => void
  setSortBy: (sort: SortBy) => void
  setSearchQuery: (q: string) => void
  setEnglishOnly: (v: boolean) => void
  setMinEngagementRate: (min: number) => void
  setMinVelocity: (min: number) => void
  setAudioFilter: (audio: string) => void
  setMinGrowthDelta: (min: number) => void
  resetFilters: () => void

  boards: Board[]
  saveToBoard: (postId: string, boardId: string) => void
  removeFromBoard: (postId: string, boardId: string) => void
  createBoard: (name: string, emoji: string) => void
  savedPostIds: Set<string>
  savedPostData: Record<string, Post>
  toggleSave: (postId: string, post: Post) => void

  importedPosts: Post[]
  addImportedPost: (post: Post) => void

  livePostCount: number
  setLivePostCount: (n: number) => void

  explosionCount: number
  setExplosionCount: (n: number) => void

  platformCounts: Record<string, number>
  setPlatformCounts: (counts: Record<string, number>) => void

  activeNav: string
  setActiveNav: (nav: string) => void
}
