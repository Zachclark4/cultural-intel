import { Post } from './types'

export type ReplicationLevel = 'Very High' | 'High' | 'Medium' | 'Low'

export interface ReplicationPotential {
  level: ReplicationLevel
  color: string
  dot: string
  reasons: string[]
  difficulty: string
  score: number
}

export function computeReplicationPotential(post: Post): ReplicationPotential {
  const reasons: string[] = []
  let score = 0

  // Creator size — smaller creator = more replicable
  if (post.followerCount < 1_000) {
    score += 3; reasons.push('Creator under 1K followers')
  } else if (post.followerCount < 5_000) {
    score += 2; reasons.push('Creator under 5K followers')
  } else if (post.followerCount < 50_000) {
    score += 1; reasons.push('Creator under 50K followers')
  }

  // Reach multiplier — algorithm amplified far beyond the fanbase
  if (post.reachMultiplier > 500) {
    score += 3; reasons.push('Reach multiplier above 500×')
  } else if (post.reachMultiplier > 100) {
    score += 2; reasons.push('Reach multiplier above 100×')
  } else if (post.reachMultiplier > 20) {
    score += 1; reasons.push('Reach multiplier above 20×')
  }

  // Share rate — content that spreads itself
  if (post.shareRate > 0.02) {
    score += 2; reasons.push('Strong share rate (viral distribution)')
  } else if (post.shareRate > 0.005) {
    score += 1; reasons.push('Above-average share rate')
  }

  // Engagement — audience response beyond passive viewing
  if (post.engagementRate > 0.10) {
    score += 1; reasons.push('High engagement rate')
  } else if (post.engagementRate > 0.05) {
    score += 0.5
  }

  // Format — short-form is inherently more replicable
  if (post.platform === 'tiktok' || post.platform === 'instagram') {
    score += 0.5; reasons.push('Short-form format (low production barrier)')
  }

  // Content type — music performance is highly replicable
  const musicNiches = ['pop', 'indie', 'country', 'rap', 'soul', 'rnb', 'folk', 'singer-songwriter', 'acoustic', 'alternative']
  if (post.niche.some(n => musicNiches.includes(n)) || post.audioName) {
    score += 0.5; reasons.push('Music-focused content')
  }

  if (score >= 7)      return { level: 'Very High', color: '#22c55e', dot: '🟢', reasons, difficulty: 'Low', score }
  if (score >= 5)      return { level: 'High',      color: '#84cc16', dot: '🟡', reasons, difficulty: 'Low–Medium', score }
  if (score >= 3)      return { level: 'Medium',    color: '#f59e0b', dot: '🟠', reasons, difficulty: 'Medium', score }
  return               { level: 'Low',       color: '#ef4444', dot: '🔴', reasons, difficulty: 'High', score }
}
