import { cn } from '@/lib/utils'
import { MapPin, Navigation2, Compass } from 'lucide-react'

interface LocationDisplayProps {
  latitude?: number
  longitude?: number
  heading?: number
  className?: string
}

export function LocationDisplay({ latitude, longitude, heading, className }: LocationDisplayProps) {
  const hasLocation = latitude !== undefined && longitude !== undefined

  return (
    <div className={cn('flex flex-col gap-2 p-3 rounded-lg bg-neutral-800/50 border border-neutral-700 backdrop-blur-sm', className)}>
      <div className="flex items-center gap-2 text-neutral-400">
        <MapPin className="w-4 h-4" />
        <span className="text-xs font-medium uppercase">Location</span>
      </div>

      {hasLocation ? (
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="text-xs text-neutral-500 w-8">LAT</span>
            <span className="text-sm font-mono text-neutral-200">{latitude?.toFixed(6)}°</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-neutral-500 w-8">LON</span>
            <span className="text-sm font-mono text-neutral-200">{longitude?.toFixed(6)}°</span>
          </div>
          {heading !== undefined && (
            <div className="flex items-center gap-2">
              <Compass className="w-3 h-3 text-neutral-500" />
              <span className="text-sm font-mono text-neutral-200">{heading.toFixed(0)}°</span>
            </div>
          )}
        </div>
      ) : (
        <div className="text-sm text-neutral-500">No GPS data</div>
      )}
    </div>
  )
}

export function CompassDisplay({ heading, className }: { heading?: number; className?: string }) {
  if (heading === undefined) return null

  const directions = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']
  const index = Math.round(heading / 45) % 8
  const direction = directions[index]

  return (
    <div className={cn('flex items-center gap-2', className)}>
      <div className="relative w-10 h-10">
        <div
          className="absolute inset-0 flex items-center justify-center"
          style={{ transform: `rotate(${-heading}deg)` }}
        >
          <Navigation2 className="w-6 h-6 text-blue-400" />
        </div>
      </div>
      <div className="flex flex-col">
        <span className="text-lg font-bold text-white">{direction}</span>
        <span className="text-xs font-mono text-neutral-500">{heading.toFixed(0)}°</span>
      </div>
    </div>
  )
}
