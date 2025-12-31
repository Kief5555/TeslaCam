import { cn } from '@/lib/utils'
import { PiSteeringWheelFill } from 'react-icons/pi'

interface SteeringWheelProps {
  angle: number // degrees, negative = left, positive = right
  className?: string
  size?: 'sm' | 'md' | 'lg'
}

// Tesla-style steering wheel icon that rotates with steering input
export function SteeringWheel({ angle, className, size = 'md' }: SteeringWheelProps) {
  const displayAngle = Math.min(Math.max(angle, -540), 540)

  const sizeClasses = {
    sm: 'text-xl',
    md: 'text-3xl',
    lg: 'text-5xl',
  }

  return (
    <div className={cn('flex items-center justify-center', className)}>
      <PiSteeringWheelFill
        className={cn(sizeClasses[size], 'text-neutral-200')}
        style={{
          transform: `rotate(${displayAngle}deg)`,
        }}
      />
    </div>
  )
}
