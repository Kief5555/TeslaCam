import { cn } from '@/lib/utils'
import { formatSpeed } from '@/lib/utils'
import { useState, useEffect, useRef } from 'react'

interface SpeedDisplayProps {
  speedMps: number
  unit?: 'mph' | 'kmh'
  className?: string
  brakeApplied?: boolean
  gearState?: number // 0=Park, 1=Drive, 2=Reverse, 3=Neutral
}

// Text shadow style for legibility over video
const textShadowStyle = {
  textShadow: '0 2px 8px rgba(0,0,0,0.8), 0 1px 3px rgba(0,0,0,0.9)',
}

export function SpeedDisplay({ speedMps, unit = 'mph', className, brakeApplied = false, gearState }: SpeedDisplayProps) {
  const speed = formatSpeed(speedMps, unit)
  const [showHold, setShowHold] = useState(false)
  const holdTimerRef = useRef<number | null>(null)

  // Check if vehicle is stationary (less than ~0.5 km/h)
  const isStationary = Math.abs(speedMps) < 0.15
  // Only show hold in Drive (gearState === 1)
  const isInDrive = gearState === 1

  useEffect(() => {
    // Clear any existing timer
    if (holdTimerRef.current) {
      clearTimeout(holdTimerRef.current)
      holdTimerRef.current = null
    }

    if (isStationary && !brakeApplied && isInDrive) {
      // Start 2 second timer to show hold indicator
      holdTimerRef.current = window.setTimeout(() => {
        setShowHold(true)
      }, 2000)
    } else {
      // Reset hold state when moving, brake is applied, or not in Drive
      setShowHold(false)
    }

    return () => {
      if (holdTimerRef.current) {
        clearTimeout(holdTimerRef.current)
      }
    }
  }, [isStationary, brakeApplied, isInDrive])

  // Show Hold indicator - only when stationary, no brake, and in Drive
  if (showHold && isStationary && !brakeApplied && isInDrive) {
    return (
      <div className={cn('flex flex-col items-center', className)}>
        <div
          className="text-white flex items-center justify-center"
          style={textShadowStyle}
        >
          {/* Brackets around circle with H - car hold symbol style */}
          <span className="text-3xl font-light mr-1" style={textShadowStyle}>(</span>
          <div className="w-10 h-10 rounded-full border-2 border-white flex items-center justify-center"
            style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.8)' }}
          >
            <span className="text-xl font-semibold">H</span>
          </div>
          <span className="text-3xl font-light ml-1" style={textShadowStyle}>)</span>
        </div>
        <div
          className="text-xs font-medium text-neutral-300 uppercase tracking-wider mt-1"
          style={textShadowStyle}
        >
          HOLD
        </div>
      </div>
    )
  }

  return (
    <div className={cn('flex flex-col items-center', className)}>
      <div
        className="text-6xl font-light tracking-tight text-white tabular-nums"
        style={textShadowStyle}
      >
        {speed}
      </div>
      <div
        className="text-lg font-medium text-neutral-300 uppercase tracking-wider -mt-1"
        style={textShadowStyle}
      >
        {unit == "kmh" ? "km/h" : unit}
      </div>
    </div>
  )
}

export function SpeedDisplayCompact({ speedMps, unit = 'mph', className }: SpeedDisplayProps) {
  const speed = formatSpeed(speedMps, unit)

  return (
    <div className={cn('flex items-baseline gap-1', className)}>
      <span className="text-3xl font-light text-white tabular-nums" style={textShadowStyle}>{speed}</span>
      <span className="text-sm font-medium text-neutral-300 uppercase" style={textShadowStyle}>{unit}</span>
    </div>
  )
}
