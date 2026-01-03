import { useRef, useEffect, forwardRef, useImperativeHandle } from 'react'
import { cn } from '@/lib/utils'

export interface VideoPlayerHandle {
  play: () => void
  pause: () => void
  seek: (time: number) => void
  getCurrentTime: () => number
  getDuration: () => number
  getVideoElement: () => HTMLVideoElement | null
}

interface VideoPlayerProps {
  src: string
  className?: string
  muted?: boolean
  onTimeUpdate?: (time: number) => void
  onLoadedMetadata?: (duration: number) => void
  onEnded?: () => void
  onClick?: () => void
  showControls?: boolean
}

export const VideoPlayer = forwardRef<VideoPlayerHandle, VideoPlayerProps>(
  ({ src, className, muted = true, onTimeUpdate, onLoadedMetadata, onEnded, onClick, showControls = false }, ref) => {
    const videoRef = useRef<HTMLVideoElement>(null)

    useImperativeHandle(ref, () => ({
      play: () => videoRef.current?.play(),
      pause: () => videoRef.current?.pause(),
      seek: (time: number) => {
        if (videoRef.current) {
          videoRef.current.currentTime = time
        }
      },
      getCurrentTime: () => videoRef.current?.currentTime ?? 0,
      getDuration: () => videoRef.current?.duration ?? 0,
      getVideoElement: () => videoRef.current,
    }))

    useEffect(() => {
      const video = videoRef.current
      if (!video) return

      const handleTimeUpdate = () => {
        onTimeUpdate?.(video.currentTime)
      }

      const handleLoadedMetadata = () => {
        onLoadedMetadata?.(video.duration)
      }

      const handleEnded = () => {
        onEnded?.()
      }

      video.addEventListener('timeupdate', handleTimeUpdate)
      video.addEventListener('loadedmetadata', handleLoadedMetadata)
      video.addEventListener('ended', handleEnded)

      return () => {
        video.removeEventListener('timeupdate', handleTimeUpdate)
        video.removeEventListener('loadedmetadata', handleLoadedMetadata)
        video.removeEventListener('ended', handleEnded)
      }
    }, [onTimeUpdate, onLoadedMetadata, onEnded])

    return (
      <video
        ref={videoRef}
        src={src}
        className={cn('w-full h-full object-cover', className)}
        muted={muted}
        playsInline
        preload="auto"
        controls={showControls}
        onClick={onClick}
      />
    )
  }
)

VideoPlayer.displayName = 'VideoPlayer'
