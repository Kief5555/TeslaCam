import { cn } from '@/lib/utils'

interface AccelerationDisplayProps {
  x?: number // lateral (left/right)
  y?: number // longitudinal (forward/back)
  z?: number // vertical
  className?: string
}

export function AccelerationDisplay({ x = 0, y = 0, z = 0, className }: AccelerationDisplayProps) {
  // Normalize for display (assuming max ~1.5g = ~15 m/s²)
  const normalizedX = Math.min(Math.max(x / 15, -1), 1)
  const normalizedY = Math.min(Math.max(y / 15, -1), 1)

  // Convert to g-force for display
  const gX = (x / 9.81).toFixed(2)
  const gY = (y / 9.81).toFixed(2)
  const gZ = (z / 9.81).toFixed(2)

  return (
    <div className={cn('flex flex-col gap-2', className)}>
      {/* G-force ball display */}
      <div className="relative w-24 h-24 rounded-full bg-neutral-800/80 border border-neutral-700 backdrop-blur-sm">
        {/* Grid lines */}
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-px h-full bg-neutral-700" />
        </div>
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-full h-px bg-neutral-700" />
        </div>
        <div className="absolute inset-2 rounded-full border border-neutral-700/50" />
        <div className="absolute inset-4 rounded-full border border-neutral-700/30" />

        {/* G-force indicator ball */}
        <div
          className="absolute w-4 h-4 rounded-full bg-blue-500 shadow-lg shadow-blue-500/50 transition-all duration-100"
          style={{
            left: `calc(50% + ${normalizedX * 40}% - 8px)`,
            top: `calc(50% - ${normalizedY * 40}% - 8px)`,
          }}
        />

        {/* Labels */}
        <span className="absolute top-1 left-1/2 -translate-x-1/2 text-[8px] text-neutral-500">ACCEL</span>
        <span className="absolute bottom-1 left-1/2 -translate-x-1/2 text-[8px] text-neutral-500">BRAKE</span>
        <span className="absolute left-1 top-1/2 -translate-y-1/2 text-[8px] text-neutral-500">L</span>
        <span className="absolute right-1 top-1/2 -translate-y-1/2 text-[8px] text-neutral-500">R</span>
      </div>

      {/* Numeric values */}
      <div className="grid grid-cols-3 gap-1 text-center">
        <div className="flex flex-col">
          <span className="text-[10px] text-neutral-500">LAT</span>
          <span className="text-xs font-mono text-neutral-300">{gX}g</span>
        </div>
        <div className="flex flex-col">
          <span className="text-[10px] text-neutral-500">LON</span>
          <span className="text-xs font-mono text-neutral-300">{gY}g</span>
        </div>
        <div className="flex flex-col">
          <span className="text-[10px] text-neutral-500">VRT</span>
          <span className="text-xs font-mono text-neutral-300">{gZ}g</span>
        </div>
      </div>
    </div>
  )
}

export function AccelerationBar({ value, label, max = 1.5, className }: { value: number; label: string; max?: number; className?: string }) {
  const gForce = value / 9.81
  const percent = Math.min(Math.abs(gForce) / max * 100, 100)
  const isNegative = gForce < 0

  return (
    <div className={cn('flex items-center gap-2', className)}>
      <span className="text-xs text-neutral-500 w-8">{label}</span>
      <div className="flex-1 h-2 bg-neutral-800 rounded-full overflow-hidden">
        <div
          className={cn(
            'h-full transition-all duration-100 rounded-full',
            isNegative ? 'bg-orange-500 ml-auto' : 'bg-blue-500'
          )}
          style={{ width: `${percent}%` }}
        />
      </div>
      <span className="text-xs font-mono text-neutral-400 w-12 text-right">{gForce.toFixed(2)}g</span>
    </div>
  )
}
