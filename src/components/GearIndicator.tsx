import { cn } from '@/lib/utils'
import { GearState, gearStateToString } from '@/lib/sei-parser'

interface GearIndicatorProps {
  gear: GearState
  className?: string
}

export function GearIndicator({ gear, className }: GearIndicatorProps) {
  const gears: GearState[] = [GearState.PARK, GearState.REVERSE, GearState.NEUTRAL, GearState.DRIVE]

  return (
    <div className={cn('flex gap-3', className)}>
      {gears.map((g) => {
        const isActive = g === gear
        const label = gearStateToString(g)

        return (
          <div
            key={g}
            className={cn(
              'w-8 h-8 rounded-lg flex items-center justify-center text-lg font-bold transition-all',
              isActive
                ? 'bg-neutral-100 text-neutral-900 shadow-lg shadow-white/20'
                : 'bg-neutral-800/50 text-neutral-500'
            )}
          >
            {label}
          </div>
        )
      })}
    </div>
  )
}

export function GearIndicatorVertical({ gear, className }: GearIndicatorProps) {
  const gears: GearState[] = [GearState.PARK, GearState.REVERSE, GearState.NEUTRAL, GearState.DRIVE]

  return (
    <div className={cn('flex flex-col gap-1', className)}>
      {gears.map((g) => {
        const isActive = g === gear
        const label = gearStateToString(g)

        return (
          <div
            key={g}
            className={cn(
              'w-7 h-7 rounded flex items-center justify-center text-sm font-bold transition-all',
              isActive
                ? 'bg-neutral-100 text-neutral-900'
                : 'bg-transparent text-neutral-600'
            )}
          >
            {label}
          </div>
        )
      })}
    </div>
  )
}

export function GearIndicatorSingle({ gear, className }: GearIndicatorProps) {
  return (
    <div
      className={cn(
        'w-12 h-12 rounded-xl flex items-center justify-center text-2xl font-bold bg-neutral-800/80 text-white border border-neutral-700 backdrop-blur-sm',
        className
      )}
    >
      {gearStateToString(gear)}
    </div>
  )
}
