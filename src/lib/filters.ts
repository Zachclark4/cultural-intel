import { Post } from './types'

// Returns true when text is predominantly Latin-script (English, Spanish, French, etc.).
// Rejects posts where >15% of characters are outside the Latin Extended-B range (e.g. Devanagari, CJK).
function isLikelyEnglish(text: string): boolean {
  if (!text) return true
  const nonLatin = (text.match(/[^ -ɏ\s\d]/gu) ?? []).length
  return nonLatin / text.length < 0.15
}

export interface FilterOptions {
  platforms: string[]
  minFollowers?: number
  maxFollowers: number | null
  minViews: number
  minExplosionScore: number
  niches: string[]
  formatTypes: string[]
  timeWindow: string | null
  sortBy: string
  searchQuery: string
  englishOnly?: boolean
  minEngagementRate?: number
  minVelocity?: number
  audioFilter?: string
  minGrowthDelta?: number
}

export function filterPosts(posts: Post[], filters: FilterOptions): Post[] {
  let result = [...posts]

  if (filters.platforms.length > 0) {
    result = result.filter(p => filters.platforms.includes(p.platform))
  }
  if (filters.minFollowers && filters.minFollowers > 0) {
    result = result.filter(p => p.followerCount >= filters.minFollowers!)
  }
  if (filters.maxFollowers !== null) {
    result = result.filter(p => p.followerCount <= filters.maxFollowers!)
  }
  if (filters.minViews > 0) {
    result = result.filter(p => p.views >= filters.minViews)
  }
  if (filters.minExplosionScore > 0) {
    result = result.filter(p => p.explosionScore >= filters.minExplosionScore)
  }
  if (filters.niches.length > 0) {
    result = result.filter(p => p.niche.some(n => filters.niches.includes(n)))
  }
  if (filters.formatTypes.length > 0) {
    result = result.filter(p => filters.formatTypes.includes(p.formatCluster))
  }
  if (filters.timeWindow) {
    const now = Date.now()
    const windowMs = filters.timeWindow === '24h' ? 86_400_000
      : filters.timeWindow === '14d' ? 14 * 86_400_000
      : 604_800_000
    result = result.filter(p => now - new Date(p.createdAt).getTime() <= windowMs)
  }
  if (filters.englishOnly) {
    result = result.filter(p => isLikelyEnglish(p.caption) && isLikelyEnglish(p.creatorName))
  }
  if (filters.minEngagementRate && filters.minEngagementRate > 0) {
    result = result.filter(p => p.engagementRate >= filters.minEngagementRate!)
  }
  if (filters.minVelocity && filters.minVelocity > 0) {
    result = result.filter(p => p.velocityViewsPerHour >= filters.minVelocity!)
  }
  if (filters.audioFilter) {
    const q = filters.audioFilter.toLowerCase()
    result = result.filter(p => p.audioName?.toLowerCase().includes(q))
  }
  if (filters.minGrowthDelta && filters.minGrowthDelta > 0) {
    result = result.filter(p => p.growthDelta >= filters.minGrowthDelta!)
  }
  if (filters.searchQuery) {
    const q = filters.searchQuery.toLowerCase()
    result = result.filter(p =>
      p.creatorHandle.toLowerCase().includes(q) ||
      p.caption.toLowerCase().includes(q) ||
      p.niche.some(n => n.includes(q)) ||
      p.hashtags.some(h => h.includes(q))
    )
  }

  const anyFilterActive =
    filters.platforms.length > 0 ||
    filters.maxFollowers !== null ||
    filters.minViews > 0 ||
    filters.niches.length > 0 ||
    filters.formatTypes.length > 0 ||
    filters.timeWindow !== null ||
    filters.englishOnly ||
    (filters.minEngagementRate ?? 0) > 0 ||
    (filters.minVelocity ?? 0) > 0 ||
    !!filters.audioFilter ||
    (filters.minGrowthDelta ?? 0) > 0 ||
    !!filters.searchQuery

  const effectiveSort = anyFilterActive && filters.sortBy === 'explosionScore'
    ? 'createdAt'
    : filters.sortBy

  switch (effectiveSort) {
    case 'velocity':         result.sort((a, b) => b.velocityViewsPerHour - a.velocityViewsPerHour); break
    case 'createdAt':        result.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()); break
    case 'saveShareRatio':   result.sort((a, b) => b.saveShareRatio - a.saveShareRatio); break
    case 'reachMultiplier':  result.sort((a, b) => b.reachMultiplier - a.reachMultiplier); break
    case 'followerDisparity': result.sort((a, b) => (b.views / Math.max(b.followerCount, 1)) - (a.views / Math.max(a.followerCount, 1))); break
    default:                 result.sort((a, b) => b.explosionScore - a.explosionScore)
  }

  return result
}
