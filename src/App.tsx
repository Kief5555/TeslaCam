import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { DrivingMode } from './components/DrivingMode'
import { ClipSelector } from './components/ClipSelector'
import { ExportDialog } from './components/ExportDialog'
import { SettingsPanel } from './components/SettingsPanel'
import { Button } from './components/ui/button'
import { Switch } from './components/ui/switch'
import { Slider } from './components/ui/slider'
import { extractSeiFromFile } from './lib/sei-parser'
import type { SeiFrame } from './lib/sei-parser'
import { formatTime } from './lib/utils'
import {
  Cog,
  Monitor,
  Grid2X2,
  Car,
  Info,
  Play,
  Pause,
  SkipBack,
  SkipForward,
  ChevronDown,
  PanelLeftClose,
  PanelLeft,
} from 'lucide-react'

const PLAYBACK_SPEEDS = [0.5, 1, 1.5, 2, 3, 5]

interface ClipGroup {
  timestamp: string
  date: string
  time: string
  cameras: {
    front?: string
    back?: string
    left_repeater?: string
    right_repeater?: string
    left_pillar?: string
    right_pillar?: string
  }
}

type ViewMode = 'driving' | 'grid' | 'single'

declare global {
  interface Window {
    electronAPI?: {
      selectFolder: () => Promise<string | null>
      readDirectory: (path: string) => Promise<string[]>
      readFile: (path: string) => Promise<ArrayBuffer | null>
      getFilePath: (relativePath: string) => Promise<string>
      saveFile: (options: { defaultPath: string; filters: { name: string; extensions: string[] }[]; data: Uint8Array }) => Promise<string | null>
      showSaveDialog: (options: { defaultPath: string; filters: { name: string; extensions: string[] }[] }) => Promise<string | null>
      getAppPath: () => Promise<string>
      showItemInFolder: (path: string) => void
      maximizeWindow: () => Promise<boolean>
      isMaximized: () => Promise<boolean>
    }
  }
}

function App() {
  const [folderPath, setFolderPath] = useState<string | null>(null)
  const [files, setFiles] = useState<string[]>([])
  const [selectedClip, setSelectedClip] = useState<ClipGroup | null>(null)
  const [seiFrames, setSeiFrames] = useState<SeiFrame[]>([])
  const [viewMode, setViewMode] = useState<ViewMode>('driving')
  const [showExportDialog, setShowExportDialog] = useState(false)
  const [showSettingsPanel, setShowSettingsPanel] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [speedUnit, setSpeedUnit] = useState<'mph' | 'kmh'>('kmh')
  const [selectedClipsForExport, setSelectedClipsForExport] = useState<ClipGroup[]>([])

  // Shared video state across all view modes
  const [sharedCurrentTime, setSharedCurrentTime] = useState(0)
  const [sharedIsPlaying, setSharedIsPlaying] = useState(false)
  const [sharedPlaybackSpeed, setSharedPlaybackSpeed] = useState(1)
  const [isTransitioning, setIsTransitioning] = useState(false)

  // Compute clip groups from files
  const clipGroups = useMemo(() => {
    const groups = new Map<string, ClipGroup>()

    files.forEach(file => {
      const match = file.match(/^(\d{4}-\d{2}-\d{2})_(\d{2}-\d{2}-\d{2})-(.+)\.mp4$/)
      if (!match) return

      const [, date, time, camera] = match
      const timestamp = `${date}_${time}`

      if (!groups.has(timestamp)) {
        groups.set(timestamp, {
          timestamp,
          date,
          time: time.replace(/-/g, ':'),
          cameras: {},
        })
      }

      const group = groups.get(timestamp)!
      const cameraKey = camera as keyof ClipGroup['cameras']
      if (cameraKey && folderPath) {
        group.cameras[cameraKey] = `file://${folderPath}/${file}`
      }
    })

    return Array.from(groups.values()).sort((a, b) =>
      a.timestamp.localeCompare(b.timestamp) // Sort ascending for sequential playback
    )
  }, [files, folderPath])

  // Callback when video is ready - hides transition overlay
  const handleVideoReady = useCallback(() => {
    setIsTransitioning(false)
  }, [])

  // Handle auto-advance to next clip
  const handleNextClip = useCallback(() => {
    if (!selectedClip || clipGroups.length === 0) return

    const currentIndex = clipGroups.findIndex(c => c.timestamp === selectedClip.timestamp)
    if (currentIndex >= 0 && currentIndex < clipGroups.length - 1) {
      // Start transition - show overlay to hide black flash
      setIsTransitioning(true)
      setSharedCurrentTime(0) // Reset time
      setSharedIsPlaying(true) // Auto-play next clip
      setSelectedClip(clipGroups[currentIndex + 1])
      // Transition will end when onReady is called by the view component
    }
  }, [selectedClip, clipGroups])

  // Reset state when clip changes
  useEffect(() => {
    if (selectedClip) {
      setSharedCurrentTime(0)
    }
  }, [selectedClip?.timestamp])

  // Handle folder selection
  const handleSelectFolder = useCallback(async () => {
    if (window.electronAPI) {
      const path = await window.electronAPI.selectFolder()
      if (path) {
        setFolderPath(path)
        const fileList = await window.electronAPI.readDirectory(path)
        setFiles(fileList)
        setSelectedClip(null)
        setSeiFrames([])
      }
    } else {
      // For browser testing, use a default path
      setFolderPath('/Users/kieferlin/Downloads/N Test Route/Comp')
      // Mock files for testing
      setFiles([
        '2025-12-30_09-14-14-front.mp4',
        '2025-12-30_09-14-14-back.mp4',
        '2025-12-30_09-14-14-left_repeater.mp4',
        '2025-12-30_09-14-14-right_repeater.mp4',
        '2025-12-30_09-14-14-left_pillar.mp4',
        '2025-12-30_09-14-14-right_pillar.mp4',
      ])
    }
  }, [])

  // Load SEI data when clip is selected
  useEffect(() => {
    if (!selectedClip?.cameras.front || !folderPath) return

    const loadSeiData = async () => {
      setIsLoading(true)
      try {
        const frontPath = selectedClip.cameras.front!.replace('file://', '')

        if (window.electronAPI) {
          const data = await window.electronAPI.readFile(frontPath)
          if (data) {
            // Convert Uint8Array to ArrayBuffer (IPC serializes Buffer to Uint8Array)
            const arrayBuffer = data instanceof ArrayBuffer
              ? data
              : (data as Uint8Array).buffer.slice(
                (data as Uint8Array).byteOffset,
                (data as Uint8Array).byteOffset + (data as Uint8Array).byteLength
              ) as ArrayBuffer
            const frames = await extractSeiFromFile(arrayBuffer)
            setSeiFrames(frames)
            console.log(`Loaded ${frames.length} SEI frames`)
          }
        }
      } catch (err) {
        console.error('Failed to load SEI data:', err)
      } finally {
        setIsLoading(false)
      }
    }

    loadSeiData()
  }, [selectedClip, folderPath])

  // Auto-load default folder
  useEffect(() => {
    const defaultPath = '/Users/kieferlin/Downloads/N Test Route/Comp'
    setFolderPath(defaultPath)

    const loadFiles = async () => {
      if (window.electronAPI) {
        const fileList = await window.electronAPI.readDirectory(defaultPath)
        setFiles(fileList)
      }
    }

    loadFiles()
  }, [])

  const handleExportVideo = async () => {
    // Implementation would use MediaRecorder or ffmpeg.wasm
    // For now, this is a placeholder
    return new Promise<void>((resolve) => {
      setTimeout(resolve, 5000)
    })
  }

  return (
    <div className="h-screen w-screen bg-neutral-950 text-white flex overflow-hidden">
      {/* Sidebar */}
      <div
        className={`${sidebarCollapsed ? 'w-0' : 'w-72'
          } shrink-0 border-r border-neutral-800 transition-all duration-300 overflow-hidden`}
      >
        <div className="w-72 h-full flex flex-col">
          {/* App header - padded for macOS traffic lights */}
          <div className="flex items-center h-14 justify-between pl-24 pr-4 border-b border-neutral-800 draggable">
            <div className="flex items-center gap-2">
              <Car className="w-5 h-5 text-[#3e6ae1]" />
              <span className="font-semibold">TeslaCam</span>
            </div>
          </div>

          {/* Clip selector */}
          <ClipSelector
            folderPath={folderPath}
            files={files}
            onSelectFolder={handleSelectFolder}
            onSelectClip={setSelectedClip}
            selectedClip={selectedClip}
            selectedClipsForExport={selectedClipsForExport}
            onSelectedClipsChange={setSelectedClipsForExport}
            onExportSelected={() => setShowExportDialog(true)}
            className="flex-1"
          />
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top toolbar - extra left padding when sidebar collapsed for macOS traffic lights */}
        <div className={`h-14 flex items-center justify-between ${sidebarCollapsed ? 'pl-20' : 'pl-4'} pr-4 border-b border-neutral-800 bg-neutral-900/50 draggable`}>
          {/* Left side - toggle sidebar and view mode */}
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            >
              {sidebarCollapsed ? <PanelLeft className="w-4 h-4" /> : <PanelLeftClose className="w-4 h-4" />}
            </Button>

            {/* View mode selector */}
            <div className="flex items-center gap-1 bg-neutral-800 rounded-lg p-1">
              <button
                onClick={() => setViewMode('driving')}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${viewMode === 'driving'
                    ? 'bg-[#3e6ae1] text-white'
                    : 'text-neutral-400 hover:text-white'
                  }`}
              >
                <Car className="w-4 h-4" />
              </button>
              <button
                onClick={() => setViewMode('grid')}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${viewMode === 'grid'
                    ? 'bg-[#3e6ae1] text-white'
                    : 'text-neutral-400 hover:text-white'
                  }`}
              >
                <Grid2X2 className="w-4 h-4" />
              </button>
              <button
                onClick={() => setViewMode('single')}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${viewMode === 'single'
                    ? 'bg-[#3e6ae1] text-white'
                    : 'text-neutral-400 hover:text-white'
                  }`}
              >
                <Monitor className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Center - clip info */}
          <div className="flex items-center gap-2 text-sm text-neutral-400">
            {selectedClip && (
              <>
                <span className="font-mono">{selectedClip.date}</span>
                <span className="text-neutral-600">|</span>
                <span className="font-mono">{selectedClip.time}</span>
                <span className="text-neutral-600">|</span>
                <span className="font-mono text-white">{formatTime(sharedCurrentTime)}</span>
              </>
            )}
            {isLoading && <span className="text-yellow-500">Loading...</span>}
          </div>

          {/* Right side - settings */}
          <div className="flex items-center gap-3">
            {/* Speed unit toggle */}
            <div className="flex items-center gap-2 text-xs text-neutral-400">
              <span>mph</span>
              <Switch
                checked={speedUnit === 'kmh'}
                onCheckedChange={(checked) => setSpeedUnit(checked ? 'kmh' : 'mph')}
              />
              <span>km/h</span>
            </div>

            <Button variant="ghost" size="icon">
              <Info className="w-4 h-4" />
            </Button>
            <Button variant="ghost" size="icon" onClick={() => setShowSettingsPanel(true)}>
              <Cog className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {/* Video viewer */}
        <div className="flex-1 bg-neutral-950 relative">
          {/* Transition overlay to prevent black flash */}
          <div
            className="absolute inset-0 bg-neutral-950 pointer-events-none z-10 transition-opacity duration-150"
            style={{ opacity: isTransitioning ? 1 : 0 }}
          />
          {selectedClip ? (
            viewMode === 'driving' ? (
              <DrivingMode
                key={selectedClip.timestamp}
                cameras={selectedClip.cameras}
                seiFrames={seiFrames}
                onExport={() => setShowExportDialog(true)}
                onNextClip={handleNextClip}
                initialTime={sharedCurrentTime}
                initialPlaying={sharedIsPlaying}
                onTimeUpdate={setSharedCurrentTime}
                onPlayingChange={setSharedIsPlaying}
                playbackSpeed={sharedPlaybackSpeed}
                onPlaybackSpeedChange={setSharedPlaybackSpeed}
                speedUnit={speedUnit}
                onReady={handleVideoReady}
              />
            ) : viewMode === 'grid' ? (
              <GridView
                key={selectedClip.timestamp}
                cameras={selectedClip.cameras}
                seiFrames={seiFrames}
                onExport={() => setShowExportDialog(true)}
                onNextClip={handleNextClip}
                initialTime={sharedCurrentTime}
                initialPlaying={sharedIsPlaying}
                onTimeUpdate={setSharedCurrentTime}
                onPlayingChange={setSharedIsPlaying}
                playbackSpeed={sharedPlaybackSpeed}
                onPlaybackSpeedChange={setSharedPlaybackSpeed}
                speedUnit={speedUnit}
                onReady={handleVideoReady}
              />
            ) : (
              <SingleView
                key={selectedClip.timestamp}
                cameras={selectedClip.cameras}
                seiFrames={seiFrames}
                onExport={() => setShowExportDialog(true)}
                onNextClip={handleNextClip}
                initialTime={sharedCurrentTime}
                initialPlaying={sharedIsPlaying}
                onTimeUpdate={setSharedCurrentTime}
                onPlayingChange={setSharedIsPlaying}
                playbackSpeed={sharedPlaybackSpeed}
                onPlaybackSpeedChange={setSharedPlaybackSpeed}
                speedUnit={speedUnit}
                onReady={handleVideoReady}
              />
            )
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-neutral-500">
              <Car className="w-24 h-24 mb-4 opacity-20" />
              <p className="text-lg">Select a clip to start viewing</p>
              <p className="text-sm mt-2">Use the sidebar to browse your dashcam footage</p>
            </div>
          )}
        </div>
      </div>

      {/* Export dialog */}
      <ExportDialog
        open={showExportDialog}
        onOpenChange={(open) => {
          setShowExportDialog(open)
          if (!open) setSelectedClipsForExport([]) // Clear selection when dialog closes
        }}
        seiFrames={seiFrames}
        clipName={selectedClip?.timestamp ?? 'clip'}
        selectedClips={selectedClipsForExport}
        onExportVideo={handleExportVideo}
      />

      {/* Settings panel */}
      <SettingsPanel
        open={showSettingsPanel}
        onOpenChange={setShowSettingsPanel}
        speedUnit={speedUnit}
        onSpeedUnitChange={setSpeedUnit}
      />
    </div>
  )
}

// Grid view component showing front and back cameras with synchronized playback
interface GridViewProps {
  cameras: ClipGroup['cameras']
  seiFrames: SeiFrame[]
  onExport?: () => void
  onNextClip?: () => void
  initialTime?: number
  initialPlaying?: boolean
  onTimeUpdate?: (time: number) => void
  onPlayingChange?: (playing: boolean) => void
  playbackSpeed?: number
  onPlaybackSpeedChange?: (speed: number) => void
  speedUnit?: 'mph' | 'kmh'
  onReady?: () => void
}

function GridView({
  cameras,
  onNextClip,
  initialTime = 0,
  initialPlaying = false,
  onTimeUpdate,
  onPlayingChange,
  playbackSpeed: externalPlaybackSpeed = 1,
  onPlaybackSpeedChange,
  onReady,
}: GridViewProps) {
  const videoRefs = useRef<(HTMLVideoElement | null)[]>([])
  const [isPlaying, setIsPlaying] = useState(initialPlaying)
  const [currentTime, setCurrentTime] = useState(initialTime)
  const [duration, setDuration] = useState(0)
  const [internalPlaybackSpeed, setInternalPlaybackSpeed] = useState(externalPlaybackSpeed)
  const playbackSpeed = onPlaybackSpeedChange ? externalPlaybackSpeed : internalPlaybackSpeed
  const setPlaybackSpeed = onPlaybackSpeedChange ?? setInternalPlaybackSpeed
  const [showSpeedMenu, setShowSpeedMenu] = useState(false)
  const initializedRef = useRef(false)
  const [videoReady, setVideoReady] = useState(false)

  // Set playback rate on all videos
  useEffect(() => {
    videoRefs.current.forEach(v => {
      if (v) v.playbackRate = playbackSpeed
    })
  }, [playbackSpeed])

  // Show all 6 cameras
  const cameraOrder = [
    { key: 'front', label: 'Front' },
    { key: 'back', label: 'Back' },
    { key: 'left_repeater', label: 'Left Repeater' },
    { key: 'right_repeater', label: 'Right Repeater' }
  ] as const

  // Sync time updates
  useEffect(() => {
    onTimeUpdate?.(currentTime)
  }, [currentTime, onTimeUpdate])

  useEffect(() => {
    onPlayingChange?.(isPlaying)
  }, [isPlaying, onPlayingChange])

  // Handle video loaded - trigger autoplay if initialPlaying is true
  const handleVideoLoaded = (e: React.SyntheticEvent<HTMLVideoElement>) => {
    setDuration(e.currentTarget.duration)

    if (!initializedRef.current) {
      initializedRef.current = true
      const videos = videoRefs.current.filter(Boolean) as HTMLVideoElement[]

      // Apply playback speed
      videos.forEach(v => { v.playbackRate = playbackSpeed })

      if (initialTime > 0) {
        videos.forEach(v => { v.currentTime = initialTime })
      }
      if (initialPlaying) {
        videos.forEach(v => v.play())
        setIsPlaying(true)
      }
      // Fade in after video has rendered first frame
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setVideoReady(true)
          onReady?.()
        })
      })
    }
  }

  const handleTimeUpdate = (e: React.SyntheticEvent<HTMLVideoElement>) => {
    setCurrentTime(e.currentTarget.currentTime)
    // Sync other videos
    const time = e.currentTarget.currentTime
    videoRefs.current.forEach(v => {
      if (v && Math.abs(v.currentTime - time) > 0.2) {
        v.currentTime = time
      }
    })
  }

  const handleEnded = () => {
    setIsPlaying(false)
    onNextClip?.()
  }

  const togglePlay = () => {
    const videos = videoRefs.current.filter(Boolean) as HTMLVideoElement[]
    if (isPlaying) {
      videos.forEach(v => v.pause())
    } else {
      videos.forEach(v => v.play())
    }
    setIsPlaying(!isPlaying)
  }

  const handleSeek = (values: number[]) => {
    const time = values[0]
    videoRefs.current.forEach(v => {
      if (v) v.currentTime = time
    })
    setCurrentTime(time)
  }

  const skip = (seconds: number) => {
    const newTime = Math.max(0, Math.min(duration, currentTime + seconds))
    videoRefs.current.forEach(v => {
      if (v) v.currentTime = newTime
    })
    setCurrentTime(newTime)
  }

  return (
    <div className="h-full flex flex-col bg-black">
      <div
        className="flex-1 grid grid-cols-2 grid-rows-2 gap-1 p-1 transition-opacity duration-150"
        style={{ opacity: videoReady ? 1 : 0 }}
      >
        {cameraOrder.map(({ key, label }, idx) => (
          <div key={key} className="relative bg-black rounded overflow-hidden">
            {cameras[key] ? (
              <>
                <video
                  ref={el => { videoRefs.current[idx] = el }}
                  src={cameras[key]}
                  className="w-full h-full object-cover cursor-pointer"
                  muted
                  onClick={togglePlay}
                  onTimeUpdate={idx === 0 ? handleTimeUpdate : undefined}
                  onLoadedMetadata={idx === 0 ? handleVideoLoaded : undefined}
                  onEnded={idx === 0 ? handleEnded : undefined}
                />
                <div className="absolute top-2 left-2 px-2 py-1 bg-black/60 rounded text-xs">
                  {label}
                </div>
              </>
            ) : (
              <div className="h-full flex items-center justify-center text-neutral-600">
                No {label} camera
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Control bar - with bottom padding for safe area */}
      <div className="h-20 bg-neutral-900/95 border-t border-neutral-800 px-6 py-3 pb-4 flex flex-col gap-2">
        <div className="flex items-center gap-3">
          <span className="text-xs text-neutral-400 font-mono w-12">{formatTime(currentTime)}</span>
          <Slider value={[currentTime]} max={duration || 60} step={0.1} onValueChange={handleSeek} className="flex-1" />
          <span className="text-xs text-neutral-400 font-mono w-12 text-right">{formatTime(duration)}</span>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={() => skip(-10)}>
            <SkipBack className="w-4 h-4" />
          </Button>
          <Button variant="ghost" size="icon" onClick={togglePlay}>
            {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
          </Button>
          <Button variant="ghost" size="icon" onClick={() => skip(10)}>
            <SkipForward className="w-4 h-4" />
          </Button>
          {/* Playback speed selector */}
          <div className="relative ml-2">
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
                    className={`w-full px-3 py-1 text-xs font-mono text-left hover:bg-neutral-700 ${playbackSpeed === speed ? 'text-blue-400' : ''
                      }`}
                  >
                    {speed}x
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// Single view component with camera selector - maintains position when switching cameras
interface SingleViewProps {
  cameras: ClipGroup['cameras']
  seiFrames: SeiFrame[]
  onExport?: () => void
  onNextClip?: () => void
  initialTime?: number
  initialPlaying?: boolean
  onTimeUpdate?: (time: number) => void
  onPlayingChange?: (playing: boolean) => void
  playbackSpeed?: number
  onPlaybackSpeedChange?: (speed: number) => void
  speedUnit?: 'mph' | 'kmh'
  onReady?: () => void
}

function SingleView({
  cameras,
  onNextClip,
  initialTime = 0,
  initialPlaying = false,
  onTimeUpdate,
  onPlayingChange,
  playbackSpeed: externalPlaybackSpeed = 1,
  onPlaybackSpeedChange,
  onReady,
}: SingleViewProps) {
  const [selectedCamera, setSelectedCamera] = useState<keyof ClipGroup['cameras']>('front')
  const videoRef = useRef<HTMLVideoElement>(null)
  const [isPlaying, setIsPlaying] = useState(initialPlaying)
  const [currentTime, setCurrentTime] = useState(initialTime)
  const [duration, setDuration] = useState(0)
  const [internalPlaybackSpeed, setInternalPlaybackSpeed] = useState(externalPlaybackSpeed)
  const playbackSpeed = onPlaybackSpeedChange ? externalPlaybackSpeed : internalPlaybackSpeed
  const setPlaybackSpeed = onPlaybackSpeedChange ?? setInternalPlaybackSpeed
  const [showSpeedMenu, setShowSpeedMenu] = useState(false)
  const initializedRef = useRef(false)
  const [videoReady, setVideoReady] = useState(false)

  // Set playback rate on video
  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.playbackRate = playbackSpeed
    }
  }, [playbackSpeed, selectedCamera])

  const cameraOptions = [
    { key: 'front', label: 'Front' },
    { key: 'back', label: 'Back' },
    { key: 'left_repeater', label: 'Left Repeater' },
    { key: 'right_repeater', label: 'Right Repeater' },
    { key: 'left_pillar', label: 'Left Pillar' },
    { key: 'right_pillar', label: 'Right Pillar' },
  ] as const

  // Sync time updates to parent
  useEffect(() => {
    onTimeUpdate?.(currentTime)
  }, [currentTime, onTimeUpdate])

  useEffect(() => {
    onPlayingChange?.(isPlaying)
  }, [isPlaying, onPlayingChange])

  // Handle video loaded - trigger autoplay if initialPlaying is true
  const handleVideoLoaded = (e: React.SyntheticEvent<HTMLVideoElement>) => {
    setDuration(e.currentTarget.duration)

    if (!initializedRef.current) {
      initializedRef.current = true

      // Apply playback speed
      if (videoRef.current) {
        videoRef.current.playbackRate = playbackSpeed
      }

      if (initialTime > 0 && videoRef.current) {
        videoRef.current.currentTime = initialTime
      }
      if (initialPlaying && videoRef.current) {
        videoRef.current.play()
        setIsPlaying(true)
      }
      // Fade in after video has rendered first frame
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setVideoReady(true)
          onReady?.()
        })
      })
    } else {
      // For camera changes, fade in quickly
      requestAnimationFrame(() => {
        setVideoReady(true)
      })
    }
  }

  // When camera changes, seek to current time and maintain play state
  const handleCameraChange = (newCamera: keyof ClipGroup['cameras']) => {
    const wasPlaying = isPlaying
    const time = currentTime
    setVideoReady(false) // Fade out before switching
    setSelectedCamera(newCamera)

    // After camera change, restore position and play state
    setTimeout(() => {
      if (videoRef.current) {
        videoRef.current.currentTime = time
        if (wasPlaying) {
          videoRef.current.play()
        }
      }
    }, 50)
  }

  const handleTimeUpdate = () => {
    if (videoRef.current) {
      setCurrentTime(videoRef.current.currentTime)
    }
  }

  const handleEnded = () => {
    setIsPlaying(false)
    onNextClip?.()
  }

  const togglePlay = () => {
    if (videoRef.current) {
      if (isPlaying) {
        videoRef.current.pause()
      } else {
        videoRef.current.play()
      }
      setIsPlaying(!isPlaying)
    }
  }

  const handleSeek = (values: number[]) => {
    const time = values[0]
    if (videoRef.current) {
      videoRef.current.currentTime = time
    }
    setCurrentTime(time)
  }

  const skip = (seconds: number) => {
    const newTime = Math.max(0, Math.min(duration, currentTime + seconds))
    if (videoRef.current) {
      videoRef.current.currentTime = newTime
    }
    setCurrentTime(newTime)
  }

  return (
    <div className="h-full flex flex-col">
      {/* Camera selector */}
      <div className="flex items-center gap-2 p-2 bg-neutral-900 border-b border-neutral-800">
        {cameraOptions.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => handleCameraChange(key)}
            disabled={!cameras[key]}
            className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${selectedCamera === key
                ? 'bg-[#3e6ae1] text-white'
                : cameras[key]
                  ? 'bg-neutral-800 text-neutral-300 hover:bg-neutral-700'
                  : 'bg-neutral-800/50 text-neutral-600 cursor-not-allowed'
              }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Video */}
      <div
        className="flex-1 bg-black cursor-pointer transition-opacity duration-150"
        style={{ opacity: videoReady ? 1 : 0 }}
        onClick={togglePlay}
      >
        {cameras[selectedCamera] ? (
          <video
            key={selectedCamera}
            ref={videoRef}
            src={cameras[selectedCamera]}
            className="w-full h-full object-contain"
            muted
            onTimeUpdate={handleTimeUpdate}
            onLoadedMetadata={handleVideoLoaded}
            onEnded={handleEnded}
            onPlay={() => setIsPlaying(true)}
            onPause={() => setIsPlaying(false)}
          />
        ) : (
          <div className="h-full flex items-center justify-center text-neutral-600">
            Camera not available
          </div>
        )}
      </div>

      {/* Control bar - with bottom padding for safe area */}
      <div className="h-20 bg-neutral-900/95 border-t border-neutral-800 px-6 py-3 pb-4 flex flex-col gap-2">
        <div className="flex items-center gap-3">
          <span className="text-xs text-neutral-400 font-mono w-12">{formatTime(currentTime)}</span>
          <Slider value={[currentTime]} max={duration || 60} step={0.1} onValueChange={handleSeek} className="flex-1" />
          <span className="text-xs text-neutral-400 font-mono w-12 text-right">{formatTime(duration)}</span>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={() => skip(-10)}>
            <SkipBack className="w-4 h-4" />
          </Button>
          <Button variant="ghost" size="icon" onClick={togglePlay}>
            {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
          </Button>
          <Button variant="ghost" size="icon" onClick={() => skip(10)}>
            <SkipForward className="w-4 h-4" />
          </Button>
          {/* Playback speed selector */}
          <div className="relative ml-2">
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
                    className={`w-full px-3 py-1 text-xs font-mono text-left hover:bg-neutral-700 ${playbackSpeed === speed ? 'text-blue-400' : ''
                      }`}
                  >
                    {speed}x
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default App
