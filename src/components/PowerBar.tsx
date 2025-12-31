import { cn } from '@/lib/utils'
import { useRef, useEffect, useState } from 'react'

interface PowerBarProps {
  acceleratorPosition: number // 0-1 (or 0-100, will be normalized)
  brakeApplied: boolean
  vehicleSpeed?: number // m/s
  longitudinalAcceleration?: number // m/s² (negative when decelerating/regen)
  className?: string
}

// Normalize value to 0-1 range
function normalize(value: number): number {
  if (value > 1) return value / 100
  return Math.max(0, Math.min(1, value))
}

// Vertical power bar - Tesla style
// Top 70%: Power (white, fills bottom-to-top)
// Bottom 30%: Regen (green) or Brake (red), fills top-to-bottom
export function PowerBarVertical({ acceleratorPosition, brakeApplied, vehicleSpeed = 0, longitudinalAcceleration = 0, className }: PowerBarProps) {
  const accel = normalize(acceleratorPosition)
  const speed = Math.abs(vehicleSpeed)
  const isMoving = speed > 0.5 // > ~1.8 km/h

  // Track previous values for smooth transitions
  const prevBrakeRef = useRef(brakeApplied)
  const [suppressAccel, setSuppressAccel] = useState(false)
  const [smoothRegen, setSmoothRegen] = useState(0)

  useEffect(() => {
    // When brake is released, briefly suppress accel display to prevent flash
    if (prevBrakeRef.current && !brakeApplied) {
      setSuppressAccel(true)
      const timeout = setTimeout(() => setSuppressAccel(false), 100)
      return () => clearTimeout(timeout)
    }
    prevBrakeRef.current = brakeApplied
  }, [brakeApplied])

  // Calculate regen from actual deceleration
  // Negative longitudinalAcceleration = deceleration (regen)
  // Typical regen is 0 to -3 m/s² (maps to 0-1)
  const rawRegen = isMoving && !brakeApplied && accel < 0.05 && longitudinalAcceleration < -0.3
    ? Math.min(Math.abs(longitudinalAcceleration) / 3, 1)
    : 0

  // Smooth the regen value to prevent flickering
  useEffect(() => {
    setSmoothRegen(prev => {
      const target = rawRegen
      // Ease towards target
      const diff = target - prev
      if (Math.abs(diff) < 0.02) return target
      return prev + diff * 0.3
    })
  }, [rawRegen])

  // Brake takes priority, then power, then regen
  const showBrake = brakeApplied
  const showPower = !showBrake && !suppressAccel && accel > 0.02
  const showRegen = !showBrake && !showPower && smoothRegen > 0.02

  // Power: show when accelerating
  const powerFill = showPower ? accel : 0

  // Regen: based on actual deceleration from acceleration sensor
  const regenFill = showRegen ? smoothRegen : 0

  // Brake: fixed fill when applied
  const brakeFill = showBrake ? 0.8 : 0

  return (
    <div className={cn('flex flex-col', className)}>
      <div className="relative w-1.5 h-full bg-neutral-800/50 overflow-hidden">
        {/* Subtle divider at 70% mark */}
        <div
          className="absolute left-0 right-0 h-px bg-neutral-500/30 z-10"
          style={{ top: '70%' }}
        />

        {/* Power fill (top 70%) - grows upward from 70% line */}
        <div
          className="absolute left-0 right-0 bg-white"
          style={{
            bottom: '30%',
            height: `${powerFill * 70}%`,
            opacity: powerFill > 0 ? 1 : 0,
            transition: 'height 80ms ease-out, opacity 150ms ease-out',
          }}
        />

        {/* Regen fill (bottom 30%) - green, grows downward from 70% line */}
        <div
          className="absolute left-0 right-0 bg-green-500"
          style={{
            top: '70%',
            height: `${regenFill * 30}%`,
            opacity: regenFill > 0 ? 1 : 0,
            transition: 'height 80ms ease-out, opacity 150ms ease-out',
          }}
        />

        {/* Brake fill (bottom 30%) - red, grows downward from 70% line */}
        <div
          className="absolute left-0 right-0 bg-red-500"
          style={{
            top: '70%',
            height: `${brakeFill * 30}%`,
            opacity: brakeFill > 0 ? 1 : 0,
            transition: 'height 80ms ease-out, opacity 150ms ease-out',
          }}
        />
      </div>
    </div>
  )
}
