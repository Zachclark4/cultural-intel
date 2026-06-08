import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatViews(n: number): string {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}B`
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return n.toString()
}

export function formatFollowers(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return n.toString()
}

export function formatVelocity(viewsPerHour: number): string {
  if (viewsPerHour >= 1_000_000) return `${(viewsPerHour / 1_000_000).toFixed(1)}M/hr`
  if (viewsPerHour >= 1_000) return `${Math.round(viewsPerHour / 1_000)}K/hr`
  return `${viewsPerHour}/hr`
}

export function formatGrowthDelta(delta: number): string {
  return `+${Math.round(delta * 100)}%`
}

export function timeAgo(dateStr: string): string {
  const date = new Date(dateStr)
  const now = new Date()
  const diff = now.getTime() - date.getTime()
  const hours = Math.floor(diff / (1000 * 60 * 60))
  const days = Math.floor(hours / 24)
  if (days > 0) return `${days}d ago`
  if (hours > 0) return `${hours}h ago`
  return 'just now'
}

export type ExplosionTier = 'fire' | 'hot' | 'rising' | 'growing' | 'low'

export function getExplosionTier(score: number): ExplosionTier {
  if (score >= 90) return 'fire'
  if (score >= 80) return 'hot'
  if (score >= 65) return 'rising'
  if (score >= 50) return 'growing'
  return 'low'
}

export function getExplosionLabel(score: number): string {
  const tier = getExplosionTier(score)
  const labels: Record<ExplosionTier, string> = {
    fire: 'FIRE',
    hot: 'HOT',
    rising: 'RISING',
    growing: 'GROWING',
    low: 'EARLY',
  }
  return labels[tier]
}

export function getExplosionColors(score: number): { bg: string; text: string; glow: string } {
  const tier = getExplosionTier(score)
  const map: Record<ExplosionTier, { bg: string; text: string; glow: string }> = {
    fire: { bg: 'rgba(239,68,68,0.2)', text: '#f87171', glow: 'rgba(239,68,68,0.4)' },
    hot: { bg: 'rgba(249,115,22,0.2)', text: '#fb923c', glow: 'rgba(249,115,22,0.3)' },
    rising: { bg: 'rgba(234,179,8,0.2)', text: '#facc15', glow: 'rgba(234,179,8,0.2)' },
    growing: { bg: 'rgba(34,197,94,0.15)', text: '#4ade80', glow: 'rgba(34,197,94,0.15)' },
    low: { bg: 'rgba(148,163,184,0.1)', text: '#94a3b8', glow: 'transparent' },
  }
  return map[tier]
}

export function getFollowerTierLabel(count: number): string {
  if (count < 10_000) return 'NANO'
  if (count < 50_000) return 'MICRO'
  if (count < 100_000) return 'SMALL'
  if (count < 500_000) return 'MID'
  if (count < 1_000_000) return 'MACRO'
  return 'MEGA'
}

export function getFollowerTierColor(count: number): string {
  if (count < 10_000) return '#a78bfa'
  if (count < 50_000) return '#60a5fa'
  if (count < 100_000) return '#34d399'
  if (count < 500_000) return '#fbbf24'
  return '#f87171'
}

export function toggleArrayItem<T>(arr: T[], item: T): T[] {
  return arr.includes(item) ? arr.filter(x => x !== item) : [...arr, item]
}
