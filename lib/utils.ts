import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function fmt$(n: number, symbol = '$') {
  if (n >= 1_000_000) return `${symbol}${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${symbol}${(n / 1_000).toFixed(0)}K`
  return `${symbol}${n}`
}

export function fmtPct(n: number) {
  return `${n.toFixed(1)}%`
}
