import { useRef, useState, useEffect, useCallback } from 'react'
import { cn } from '@/lib/utils'
import { VideoPlayer } from './VideoPlayer'
import type { VideoPlayerHandle } from './VideoPlayer'
import { TurnIndicator, TurnIndicatorCompact } from './TurnIndicator'
import { PowerBarVertical } from './PowerBar'
import { SpeedDisplay } from './SpeedDisplay'
import { GearIndicatorSingle } from './GearIndicator'
import { AutopilotBadge } from './AutopilotIndicator'
import { SteeringWheel } from './SteeringWheel'
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
import {
  GearState,
  AutopilotState,
  interpolateSeiData,
  gearStateToString,
} from '@/lib/sei-parser'
import type { SeiMetadata, SeiFrame } from '@/lib/sei-parser'
import { formatTime } from '@/lib/utils'

interface CameraFiles {
  front?: string
  back?: string
  left_repeater?: string
  right_repeater?: string
  left_pillar?: string
  right_pillar?: string
}

interface DrivingModeProps {
  cameras: CameraFiles
  seiFrames: SeiFrame[]
  onExport?: () => void
  onNextClip?: () => void
  className?: string
  initialTime?: number
  initialPlaying?: boolean
  onTimeUpdate?: (time: number) => void
  onPlayingChange?: (playing: boolean) => void
  playbackSpeed?: number
  onPlaybackSpeedChange?: (speed: number) => void
  speedUnit?: 'mph' | 'kmh'
  onReady?: () => void
}

const PLAYBACK_SPEEDS = [0.5, 1, 1.5, 2, 3, 5]

export function DrivingMode({
  cameras,
  seiFrames,
  onExport,
  onNextClip,
  className,
  initialTime = 0,
  initialPlaying = false,
  onTimeUpdate,
  onPlayingChange,
  playbackSpeed: externalPlaybackSpeed = 1,
  onPlaybackSpeedChange,
  speedUnit = 'kmh',
  onReady,
}: DrivingModeProps) {
  const frontRef = useRef<VideoPlayerHandle>(null)
  const backRef = useRef<VideoPlayerHandle>(null)
  const leftRepeaterRef = useRef<VideoPlayerHandle>(null)
  const rightRepeaterRef = useRef<VideoPlayerHandle>(null)
  const leftPillarRef = useRef<VideoPlayerHandle>(null)
  const rightPillarRef = useRef<VideoPlayerHandle>(null)
  const initializedRef = useRef(false)
  const seekingRef = useRef(false)

  const [isPlaying, setIsPlaying] = useState(initialPlaying)
  const [currentTime, setCurrentTime] = useState(initialTime)
  const [duration, setDuration] = useState(0)
  const [isMuted, setIsMuted] = useState(true)
  const [seiData, setSeiData] = useState<SeiMetadata | null>(null)
  const [showRepeaters, setShowRepeaters] = useState({ left: false, right: false })
  const [blinkState, setBlinkState] = useState(false)
  const [internalPlaybackSpeed, setInternalPlaybackSpeed] = useState(externalPlaybackSpeed)
  const playbackSpeed = onPlaybackSpeedChange ? externalPlaybackSpeed : internalPlaybackSpeed
  const setPlaybackSpeed = onPlaybackSpeedChange ?? setInternalPlaybackSpeed
  const [showSpeedMenu, setShowSpeedMenu] = useState(false)
  const [videoReady, setVideoReady] = useState(false)
  const videoLoadedCountRef = useRef(0)

  // Get all video refs
  const getAllRefs = useCallback(() => [
    frontRef.current,
    backRef.current,
    leftRepeaterRef.current,
    rightRepeaterRef.current,
    leftPillarRef.current,
    rightPillarRef.current,
  ].filter(Boolean) as VideoPlayerHandle[], [])

  // Set playback rate on all videos
  useEffect(() => {
    getAllRefs().forEach(ref => {
      const video = ref.getVideoElement()
      if (video) {
        video.playbackRate = playbackSpeed
      }
    })
  }, [playbackSpeed, getAllRefs])

  // Handle video loaded - trigger autoplay if initialPlaying is true
  const handleVideoLoaded = useCallback((videoDuration: number) => {
    setDuration(videoDuration)
    videoLoadedCountRef.current++

    // Only run initialization once
    if (!initializedRef.current) {
      initializedRef.current = true

      // Use a small delay to ensure all video refs are assigned
      setTimeout(() => {
        const refs = getAllRefs()

        // Seek to initial time if not at start
        if (initialTime > 0) {
          refs.forEach(ref => ref.seek(initialTime))
        }

        // Auto-play if requested
        if (initialPlaying) {
          refs.forEach(ref => ref.play())
          setIsPlaying(true)
        }

        // Fade in video after video has had time to render first frame
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            setVideoReady(true)
            onReady?.()
          })
        })
      }, 50)
    }
  }, [initialTime, initialPlaying, getAllRefs, onReady])

  // Notify parent of time updates
  useEffect(() => {
    onTimeUpdate?.(currentTime)
  }, [currentTime, onTimeUpdate])

  // Notify parent of playing state changes
  useEffect(() => {
    onPlayingChange?.(isPlaying)
  }, [isPlaying, onPlayingChange])

  // Sync all videos to the same time
  const syncVideos = useCallback((time: number) => {
    getAllRefs().forEach(ref => {
      if (Math.abs(ref.getCurrentTime() - time) > 0.1) {
        ref.seek(time)
      }
    })
  }, [getAllRefs])

  // Handle time update from main video (native timeupdate event)
  const handleTimeUpdate = useCallback((time: number) => {
    // Skip updates while seeking to prevent overwriting seek position
    if (seekingRef.current) return

    setCurrentTime(time)

    // Update SEI data
    const data = interpolateSeiData(seiFrames, time)
    setSeiData(data)

    // Sync other videos periodically
    if (Math.floor(time * 10) % 5 === 0) {
      syncVideos(time)
    }
  }, [seiFrames, syncVideos])

  // Handle video ended - auto advance to next clip
  const handleVideoEnded = useCallback(() => {
    setIsPlaying(false)
    onNextClip?.()
  }, [onNextClip])

  // Handle play/pause
  const togglePlay = useCallback(() => {
    if (isPlaying) {
      getAllRefs().forEach(ref => ref.pause())
    } else {
      getAllRefs().forEach(ref => ref.play())
    }
    setIsPlaying(!isPlaying)
  }, [isPlaying, getAllRefs])

  // Handle seek
  const handleSeek = useCallback((values: number[]) => {
    const time = values[0]
    seekingRef.current = true
    getAllRefs().forEach(ref => ref.seek(time))
    setCurrentTime(time)

    // Update SEI data immediately for the new position
    const data = interpolateSeiData(seiFrames, time)
    setSeiData(data)

    // Allow time updates to resume after seek completes
    setTimeout(() => {
      seekingRef.current = false
    }, 150)
  }, [getAllRefs, seiFrames])

  // Skip forward/back
  const skip = useCallback((seconds: number) => {
    const newTime = Math.max(0, Math.min(duration, currentTime + seconds))
    seekingRef.current = true
    getAllRefs().forEach(ref => ref.seek(newTime))
    setCurrentTime(newTime)

    // Update SEI data immediately
    const data = interpolateSeiData(seiFrames, newTime)
    setSeiData(data)

    setTimeout(() => {
      seekingRef.current = false
    }, 150)
  }, [currentTime, duration, getAllRefs, seiFrames])

  // High-frequency SEI update loop using requestAnimationFrame (60fps)
  useEffect(() => {
    if (!isPlaying) return

    let animationId: number
    let lastTime = -1

    const updateLoop = () => {
      // Skip updates while seeking to prevent overwriting seek position
      if (!seekingRef.current) {
        const videoRef = frontRef.current || backRef.current
        if (videoRef) {
          const time = videoRef.getCurrentTime()
          // Only update if time changed (avoid unnecessary renders)
          if (Math.abs(time - lastTime) > 0.001) {
            lastTime = time
            setCurrentTime(time)
            const data = interpolateSeiData(seiFrames, time)
            setSeiData(data)
          }
        }
      }
      animationId = requestAnimationFrame(updateLoop)
    }

    animationId = requestAnimationFrame(updateLoop)
    return () => cancelAnimationFrame(animationId)
  }, [isPlaying, seiFrames])

  // Blink animation for turn signals
  useEffect(() => {
    const interval = setInterval(() => {
      setBlinkState(prev => !prev)
    }, 400)
    return () => clearInterval(interval)
  }, [])

  // Auto-show repeaters based on turn signals or reverse gear
  useEffect(() => {
    if (seiData) {
      const inReverse = seiData.gearState === GearState.REVERSE
      setShowRepeaters({
        left: inReverse || seiData.blinkerOnLeft || false,
        right: inReverse || seiData.blinkerOnRight || false,
      })
    }
  }, [seiData?.blinkerOnLeft, seiData?.blinkerOnRight, seiData?.gearState])

  // Keep all videos synced with play/pause state
  useEffect(() => {
    const refs = getAllRefs()
    refs.forEach(ref => {
      const video = ref.getVideoElement()
      if (video) {
        if (isPlaying && video.paused) {
          video.play()
        } else if (!isPlaying && !video.paused) {
          video.pause()
        }
      }
    })
  }, [isPlaying, getAllRefs])

  // Track previous reverse state to detect changes
  const prevIsReverse = useRef<boolean | null>(null)

  // Determine main camera based on gear
  const getMainCamera = useCallback(() => {
    if (seiData?.gearState === GearState.REVERSE) {
      return cameras.back
    }
    return cameras.front
  }, [seiData?.gearState, cameras])

  const isReverse = seiData?.gearState === GearState.REVERSE

  // When switching between forward/reverse, sync the new main video to current time
  useEffect(() => {
    if (prevIsReverse.current !== null && prevIsReverse.current !== isReverse) {
      // Camera switched - sync all videos to current time and apply playback speed
      const refs = getAllRefs()
      refs.forEach(ref => {
        ref.seek(currentTime)
        const video = ref.getVideoElement()
        if (video) {
          video.playbackRate = playbackSpeed
        }
        if (isPlaying) {
          ref.play()
        }
      })
    }
    prevIsReverse.current = isReverse
  }, [isReverse, currentTime, isPlaying, getAllRefs, playbackSpeed])

  const leftSignalActive = (seiData?.blinkerOnLeft && blinkState) || false
  const rightSignalActive = (seiData?.blinkerOnRight && blinkState) || false

  return (
    <div className={cn('relative w-full h-full bg-black flex flex-col', className)}>
      {/* Main video area */}
      <div className="flex-1 relative overflow-hidden">
        {/* Main camera view */}
        <div
          className="absolute inset-0 transition-opacity duration-150"
          style={{ opacity: videoReady ? 1 : 0 }}
        >
          {getMainCamera() && (
            <VideoPlayer
              ref={isReverse ? backRef : frontRef}
              src={getMainCamera()!}
              onTimeUpdate={handleTimeUpdate}
              onLoadedMetadata={handleVideoLoaded}
              onEnded={handleVideoEnded}
              onClick={togglePlay}
              className="w-full h-full object-cover"
            />
          )}
        </div>

        {/* Hidden videos for sync */}
        <div className="hidden">
          {!isReverse && cameras.back && (
            <VideoPlayer ref={backRef} src={cameras.back} />
          )}
          {isReverse && cameras.front && (
            <VideoPlayer ref={frontRef} src={cameras.front} />
          )}
          {cameras.left_pillar && (
            <VideoPlayer ref={leftPillarRef} src={cameras.left_pillar} />
          )}
          {cameras.right_pillar && (
            <VideoPlayer ref={rightPillarRef} src={cameras.right_pillar} />
          )}
        </div>

        {/* Repeater overlays (Tesla-style blind spot cameras) */}
        <div
          className={cn(
            'absolute left-4 bottom-24 w-48 h-32 rounded-lg overflow-hidden border-2 transition-all duration-300 shadow-2xl',
            showRepeaters.left ? 'opacity-100 scale-100' : 'opacity-0 scale-95 pointer-events-none',
            leftSignalActive ? 'border-green-500' : 'border-neutral-600'
          )}
        >
          {cameras.left_repeater && (
            <VideoPlayer
              ref={leftRepeaterRef}
              src={cameras.left_repeater}
              className="w-full h-full"
            />
          )}
          <div className="absolute top-1 left-1 px-1.5 py-0.5 bg-black/60 rounded text-xs text-white">
            LEFT
          </div>
        </div>

        <div
          className={cn(
            'absolute right-4 bottom-24 w-48 h-32 rounded-lg overflow-hidden border-2 transition-all duration-300 shadow-2xl',
            showRepeaters.right ? 'opacity-100 scale-100' : 'opacity-0 scale-95 pointer-events-none',
            rightSignalActive ? 'border-green-500' : 'border-neutral-600'
          )}
        >
          {cameras.right_repeater && (
            <VideoPlayer
              ref={rightRepeaterRef}
              src={cameras.right_repeater}
              className="w-full h-full"
            />
          )}
          <div className="absolute top-1 right-1 px-1.5 py-0.5 bg-black/60 rounded text-xs text-white">
            RIGHT
          </div>
        </div>

        {/* HUD Overlay - Top Left */}
        <div className="absolute left-4 top-4 flex items-start animate-slide-in-left gap-3">
          {/* Power bar - vertical */}
          <PowerBarVertical
            acceleratorPosition={seiData?.acceleratorPedalPosition ?? 0}
            brakeApplied={seiData?.brakeApplied ?? false}
            vehicleSpeed={seiData?.vehicleSpeedMps ?? 0}
            longitudinalAcceleration={seiData?.linearAccelerationMps2X ?? 0}
            className="h-44"
          />

          {/* Info panel */}
          <div className="flex flex-col gap-4">
            {/* Row 1: Speed + Turn signals */}
            <div className="flex items-center gap-4">
              <SpeedDisplay
                speedMps={seiData?.vehicleSpeedMps ?? 0}
                unit={speedUnit}
                brakeApplied={seiData?.brakeApplied ?? false}
                gearState={seiData?.gearState}
              />
              <div className="flex items-center gap-2">
                <TurnIndicator direction="left" active={leftSignalActive} />
                <TurnIndicator direction="right" active={rightSignalActive} />
              </div>
            </div>

            {/* Row 2: Gear + Steering wheel + Brake indicator */}
            <div className="flex items-center gap-3">
              <GearIndicatorSingle gear={seiData?.gearState ?? GearState.PARK} />
              <SteeringWheel angle={seiData?.steeringWheelAngle ?? 0} size="md" />
              {/* Brake indicator - "B" beside steering wheel */}
              {seiData?.brakeApplied && (
                <div className="w-8 h-8 rounded-lg bg-red-600 flex items-center justify-center shadow-lg shadow-red-600/50">
                  <span className="text-white font-bold text-sm">B</span>
                </div>
              )}
            </div>

            {/* Autopilot status */}
            {seiData?.autopilotState !== undefined && seiData.autopilotState !== AutopilotState.NONE && (
              <AutopilotBadge state={seiData.autopilotState} />
            )}
          </div>
        </div>

        {/* Reverse indicator */}
        {isReverse && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 px-6 py-2 bg-red-500/80 rounded-lg">
            <span className="text-white font-bold text-lg">REVERSE</span>
          </div>
        )}

      </div>

      {/* Controls bar */}
      <div className="h-20 bg-neutral-900/95 backdrop-blur-sm border-t border-neutral-800 px-6 py-2 flex flex-col gap-2">
        {/* Timeline */}
        <div className="flex items-center gap-3">
          <span className="text-xs text-neutral-400 font-mono w-12">
            {formatTime(currentTime)}
          </span>
          <Slider
            value={[currentTime]}
            max={duration || 60}
            step={0.1}
            onValueChange={handleSeek}
            className="flex-1"
          />
          <span className="text-xs text-neutral-400 font-mono w-12 text-right">
            {formatTime(duration)}
          </span>
        </div>

        {/* Playback controls */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" onClick={() => skip(-10)}>
              <SkipBack className="w-4 h-4" />
            </Button>
            <Button variant="ghost" size="icon" onClick={togglePlay}>
              {isPlaying ? (
                <Pause className="w-5 h-5" />
              ) : (
                <Play className="w-5 h-5" />
              )}
            </Button>
            <Button variant="ghost" size="icon" onClick={() => skip(10)}>
              <SkipForward className="w-4 h-4" />
            </Button>
            <Button variant="ghost" size="icon" onClick={() => setIsMuted(!isMuted)}>
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
                <div className="absolute bottom-full mb-1 left-0 bg-neutral-800 rounded-lg border border-neutral-700 py-1 min-w-15">
                  {PLAYBACK_SPEEDS.map(speed => (
                    <button
                      key={speed}
                      onClick={() => {
                        setPlaybackSpeed(speed)
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

          <div className="flex items-center gap-4 text-sm text-neutral-400">
            {/* SEI data summary */}
            {seiData && (
              <>
                <div className="flex items-center gap-1">
                  <TurnIndicatorCompact direction="left" active={seiData.blinkerOnLeft || false} />
                  <TurnIndicatorCompact direction="right" active={seiData.blinkerOnRight || false} />
                </div>
                <span className="font-mono">{speedUnit === 'mph' ? Math.round((seiData.vehicleSpeedMps ?? 0) * 2.237) : Math.round((seiData.vehicleSpeedMps ?? 0) * 3.6)} {speedUnit === 'mph' ? 'mph' : 'km/h'}</span>
                <span className="font-bold text-white">{gearStateToString(seiData.gearState ?? GearState.PARK)}</span>
              </>
            )}
          </div>

          <div className="flex items-center gap-2">
            {onExport && (
              <Button variant="outline" size="sm" onClick={onExport}>
                <Download className="w-4 h-4 mr-1" />
                Export
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon"
              onClick={() => {
                if (document.fullscreenElement) {
                  document.exitFullscreen()
                } else {
                  document.documentElement.requestFullscreen()
                }
              }}
            >
              <Maximize className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
