import { cn } from '@/lib/utils'
import { Slider } from './ui/slider'
import { Button } from './ui/button'
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
  Maximize,
  Download,
  ChevronDown,
} from 'lucide-react'
import { formatTime } from '@/lib/utils'
import { useState } from 'react'

const PLAYBACK_SPEEDS = [0.5, 1, 1.5, 2, 3, 5]

interface VideoControlBarProps {
  currentTime: number
  duration: number
  isPlaying: boolean
  isMuted: boolean
  playbackSpeed: number
  onSeek: (time: number) => void
  onTogglePlay: () => void
  onToggleMute: () => void
  onSkip: (seconds: number) => void
  onSpeedChange: (speed: number) => void
  onExport?: () => void
  className?: string
}

export function VideoControlBar({
  currentTime,
  duration,
  isPlaying,
  isMuted,
  playbackSpeed,
  onSeek,
  onTogglePlay,
  onToggleMute,
  onSkip,
  onSpeedChange,
  onExport,
  className,
}: VideoControlBarProps) {
  const [showSpeedMenu, setShowSpeedMenu] = useState(false)

  return (
    <div className={cn('h-20 bg-neutral-900/95 backdrop-blur-sm border-t border-neutral-800 px-6 py-2 flex flex-col gap-2', className)}>
      {/* Timeline */}
      <div className="flex items-center gap-3">
        <span className="text-xs text-neutral-400 font-mono w-12">
          {formatTime(currentTime)}
        </span>
        <Slider
          value={[currentTime]}
          max={duration || 60}
          step={0.1}
          onValueChange={(values) => onSeek(values[0])}
          className="flex-1"
        />
        <span className="text-xs text-neutral-400 font-mono w-12 text-right">
          {formatTime(duration)}
        </span>
      </div>

      {/* Playback controls */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={() => onSkip(-10)}>
            <SkipBack className="w-4 h-4" />
          </Button>
          <Button variant="ghost" size="icon" onClick={onTogglePlay}>
            {isPlaying ? (
              <Pause className="w-5 h-5" />
            ) : (
              <Play className="w-5 h-5" />
            )}
          </Button>
          <Button variant="ghost" size="icon" onClick={() => onSkip(10)}>
            <SkipForward className="w-4 h-4" />
          </Button>
          <Button variant="ghost" size="icon" onClick={onToggleMute}>
            {isMuted ? (
              <VolumeX className="w-4 h-4" />
            ) : (
              <Volume2 className="w-4 h-4" />
            )}
          </Button>

          {/* Playback speed selector */}
          <div className="relative">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowSpeedMenu(!showSpeedMenu)}
              className="text-xs font-mono"
            >
              {playbackSpeed}x
              <ChevronDown className="w-3 h-3 ml-1" />
            </Button>
            {showSpeedMenu && (
              <div className="absolute bottom-full mb-1 left-0 bg-neutral-800 rounded-lg border border-neutral-700 py-1 min-w-[60px] z-50">
                {PLAYBACK_SPEEDS.map(speed => (
                  <button
                    key={speed}
                    onClick={() => {
                      onSpeedChange(speed)
                      setShowSpeedMenu(false)
                    }}
                    className={cn(
                      'w-full px-3 py-1 text-xs font-mono text-left hover:bg-neutral-700',
                      playbackSpeed === speed && 'text-blue-400'
                    )}
                  >
                    {speed}x
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {onExport && (
            <Button variant="outline" size="sm" onClick={onExport}>
              <Download className="w-4 h-4 mr-1" />
              Export
            </Button>
          )}
          <Button variant="ghost" size="icon">
            <Maximize className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </div>
  )
}
