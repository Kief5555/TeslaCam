import { cn } from '@/lib/utils'
import { ArrowBigLeft, ArrowBigRight } from 'lucide-react'

interface TurnIndicatorProps {
  direction: 'left' | 'right'
  active: boolean
  className?: string
}

// Tesla-style turn signal with lucide arrow icons
export function TurnIndicator({ direction, active, className }: TurnIndicatorProps) {
  const Icon = direction === 'left' ? ArrowBigLeft : ArrowBigRight

  return (
    <div
      className={cn(
        'transition-all duration-150',
        active ? 'animate-pulse' : 'opacity-20',
        className
      )}
    >
      <Icon
        className={cn(
          'w-10 h-10 transition-all duration-150',
          active
            ? 'text-green-500 fill-green-500 drop-shadow-[0_0_12px_rgba(34,197,94,0.8)]'
            : 'text-neutral-600 fill-none'
        )}
        strokeWidth={1.5}
      />
    </div>
  )
}

// Compact horizontal version for control bar
export function TurnIndicatorCompact({ direction, active, className }: TurnIndicatorProps) {
  const Icon = direction === 'left' ? ArrowBigLeft : ArrowBigRight

  return (
    <div
      className={cn(
        'transition-all duration-150',
        active ? 'animate-pulse' : 'opacity-30',
        className
      )}
    >
      <Icon
        className={cn(
          'w-5 h-5 transition-all',
          active
            ? 'text-green-500 fill-green-500'
            : 'text-neutral-500 fill-none'
        )}
        strokeWidth={1.5}
      />
    </div>
  )
}
