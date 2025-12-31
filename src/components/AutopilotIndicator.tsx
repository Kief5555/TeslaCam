import { cn } from '@/lib/utils'
import { AutopilotState, autopilotStateToString } from '@/lib/sei-parser'
import { Car, Navigation, CircleDot, CircleOff } from 'lucide-react'

interface AutopilotIndicatorProps {
  state: AutopilotState
  className?: string
}

export function AutopilotIndicator({ state, className }: AutopilotIndicatorProps) {
  const getIcon = () => {
    switch (state) {
      case AutopilotState.SELF_DRIVING:
        return <Car className="w-5 h-5" />
      case AutopilotState.AUTOSTEER:
        return <Navigation className="w-5 h-5" />
      case AutopilotState.TACC:
        return <CircleDot className="w-5 h-5" />
      default:
        return <CircleOff className="w-5 h-5" />
    }
  }

  const getColor = () => {
    switch (state) {
      case AutopilotState.SELF_DRIVING:
        return 'bg-blue-500/20 text-blue-400 border-blue-500/50'
      case AutopilotState.AUTOSTEER:
        return 'bg-blue-500/20 text-blue-400 border-blue-500/50'
      case AutopilotState.TACC:
        return 'bg-green-500/20 text-green-400 border-green-500/50'
      default:
        return 'bg-neutral-800/50 text-neutral-500 border-neutral-700'
    }
  }

  return (
    <div
      className={cn(
        'flex items-center gap-2 px-3 py-2 rounded-lg border backdrop-blur-sm transition-all',
        getColor(),
        className
      )}
    >
      {getIcon()}
      <span className="text-sm font-medium">{autopilotStateToString(state)}</span>
    </div>
  )
}

export function AutopilotBadge({ state, className }: AutopilotIndicatorProps) {
  if (state === AutopilotState.NONE) return null

  const getColor = () => {
    switch (state) {
      case AutopilotState.SELF_DRIVING:
        return 'bg-blue-500 animate-pulse'
      case AutopilotState.AUTOSTEER:
        return 'bg-blue-500'
      case AutopilotState.TACC:
        return 'bg-green-500'
      default:
        return 'bg-neutral-600'
    }
  }

  return (
    <div
      className={cn(
        'flex items-center gap-1.5 px-2 py-1 rounded text-xs font-bold text-white',
        getColor(),
        className
      )}
    >
      <Car className="w-3 h-3" />
      {autopilotStateToString(state)}
    </div>
  )
}
