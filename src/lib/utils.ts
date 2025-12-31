import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatSpeed(mps: number, unit: 'mph' | 'kmh' = 'mph'): number {
  // Use absolute value to avoid negative speed in reverse
  const absMps = Math.abs(mps)
  if (unit === 'mph') {
    return Math.round(absMps * 2.237)
  }
  return Math.round(absMps * 3.6)
}

export function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
}
