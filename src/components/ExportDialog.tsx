import { useState } from 'react'
import { cn } from '@/lib/utils'
import { formatTime } from '@/lib/utils'
import { Button } from './ui/button'
import { Switch } from './ui/switch'
import { Progress } from './ui/progress'
import { Slider } from './ui/slider'
import * as Dialog from '@radix-ui/react-dialog'
import {
  Download,
  X,
  Video,
  FileJson,
  Settings2,
  Check,
  Clock,
  FolderOpen,
  Car,
  Grid2X2,
  Camera,
} from 'lucide-react'
import { seiFramesToCsv } from '@/lib/sei-parser'
import type { SeiFrame } from '@/lib/sei-parser'

type ExportMode = 'driving' | 'multicam' | 'single'
type CameraKey = 'front' | 'back' | 'left_repeater' | 'right_repeater' | 'left_pillar' | 'right_pillar'

interface ExportOptions {
  exportMode: ExportMode
  selectedCamera: CameraKey
  includeOverlays: boolean
  autoSwitchCamera: boolean
  showSpeed: boolean
  showTurnSignals: boolean
  showSteering: boolean
  showGear: boolean
  showCompass: boolean
  format: 'mp4' | 'webm'
  quality: 'high' | 'medium' | 'low'
  startTime: number
  endTime: number
}

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

interface ExportDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  seiFrames: SeiFrame[]
  clipName: string
  clipDuration?: number
  selectedClips?: ClipGroup[]
  onExportVideo: (options: ExportOptions) => Promise<void>
  availableCameras?: CameraKey[]
}

const CAMERA_LABELS: Record<CameraKey, string> = {
  front: 'Front',
  back: 'Back',
  left_repeater: 'Left Repeater',
  right_repeater: 'Right Repeater',
  left_pillar: 'Left Pillar',
  right_pillar: 'Right Pillar',
}

export function ExportDialog({
  open,
  onOpenChange,
  seiFrames,
  clipName,
  clipDuration = 60,
  selectedClips = [],
  onExportVideo,
  availableCameras = ['front', 'back', 'left_repeater', 'right_repeater', 'left_pillar', 'right_pillar'],
}: ExportDialogProps) {
  const [options, setOptions] = useState<ExportOptions>({
    exportMode: 'driving',
    selectedCamera: 'front',
    includeOverlays: true,
    autoSwitchCamera: true,
    showSpeed: true,
    showTurnSignals: true,
    showSteering: true,
    showGear: true,
    showCompass: true,
    format: 'mp4',
    quality: 'high',
    startTime: 0,
    endTime: clipDuration,
  })
  const [isExporting, setIsExporting] = useState(false)
  const [progress, setProgress] = useState(0)
  const [exportComplete, setExportComplete] = useState(false)
  const [exportedFilePath, setExportedFilePath] = useState<string | null>(null)
  const [exportRange, setExportRange] = useState<'full' | 'custom'>('full')
  const [savePath, setSavePath] = useState<string | null>(null)

  const hasMultipleClips = selectedClips.length > 1
  const exportClipName = hasMultipleClips
    ? `${selectedClips[0].timestamp}_to_${selectedClips[selectedClips.length - 1].timestamp}`
    : clipName

  const handleExportCsv = async () => {
    const csv = seiFramesToCsv(seiFrames)
    const blob = new Blob([csv], { type: 'text/csv' })

    if (window.electronAPI) {
      const data = await blob.arrayBuffer()
      await window.electronAPI.saveFile({
        defaultPath: `${clipName}_sei_data.csv`,
        filters: [{ name: 'CSV', extensions: ['csv'] }],
        data: new Uint8Array(data),
      })
    } else {
      // Fallback for browser
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${clipName}_sei_data.csv`
      a.click()
      URL.revokeObjectURL(url)
    }
  }

  const handleSelectSaveLocation = async () => {
    if (window.electronAPI?.showSaveDialog) {
      const format = options.format
      const result = await window.electronAPI.showSaveDialog({
        defaultPath: `${exportClipName}.${format}`,
        filters: [{ name: format.toUpperCase(), extensions: [format] }],
      })
      if (result) {
        setSavePath(result)
      }
    }
  }

  const handleExportVideo = async () => {
    if (!savePath && window.electronAPI) {
      await handleSelectSaveLocation()
      return
    }

    if (!savePath) return

    setIsExporting(true)
    setProgress(0)

    try {
      // Import VideoExporter dynamically
      const { VideoExporter } = await import('@/lib/video-exporter')

      // Prepare clips for export
      const clipsToExport = selectedClips.length > 0
        ? selectedClips.map(clip => ({ cameras: clip.cameras, seiFrames }))
        : [{ cameras: {} as ClipGroup['cameras'], seiFrames }]

      // Create exporter with clips array
      const exporter = new VideoExporter(
        clipsToExport,
        {
          includeOverlays: options.includeOverlays,
          autoSwitchCamera: options.autoSwitchCamera,
          showSpeed: options.showSpeed,
          showTurnSignals: options.showTurnSignals,
          showGForce: false, // Not in current options
          showGear: options.showGear,
          showCompass: options.showCompass,
          format: options.format,
          quality: options.quality,
        },
        (progressInfo) => {
          setProgress(progressInfo.percent)
        }
      )

      // Export and get blob
      const blob = await exporter.export()

      // Convert blob to Uint8Array and save
      const arrayBuffer = await blob.arrayBuffer()
      const data = new Uint8Array(arrayBuffer)

      if (window.electronAPI) {
        await window.electronAPI.saveFile({
          defaultPath: savePath,
          filters: [{ name: options.format.toUpperCase(), extensions: [options.format] }],
          data,
        })
      }

      setIsExporting(false)
      setExportComplete(true)
      setExportedFilePath(savePath)
    } catch (err) {
      console.error('Export failed:', err)
      setIsExporting(false)
      setProgress(0)
    }
  }

  const updateOption = <K extends keyof ExportOptions>(
    key: K,
    value: ExportOptions[K]
  ) => {
    setOptions(prev => ({ ...prev, [key]: value }))
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/80 backdrop-blur-sm" />
        <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-130 max-h-[85vh] bg-neutral-900 rounded-xl border border-neutral-800 shadow-2xl overflow-hidden">
          <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-800">
            <Dialog.Title className="text-lg font-semibold text-white flex items-center gap-2">
              <Download className="w-5 h-5" />
              Export {selectedClips.length > 1 ? `${selectedClips.length} Clips` : 'Clip'}
            </Dialog.Title>
            <Dialog.Close asChild>
              <Button variant="ghost" size="icon">
                <X className="w-4 h-4" />
              </Button>
            </Dialog.Close>
          </div>

          <div className="px-6 py-5 space-y-6 overflow-y-auto max-h-[60vh]">
            {/* Selected Clips */}
            {selectedClips.length > 0 && (
              <div className="space-y-3">
                <h3 className="text-sm font-medium text-neutral-300 flex items-center gap-2">
                  <Video className="w-4 h-4" />
                  Selected Clips ({selectedClips.length})
                </h3>
                <div className="bg-neutral-800/50 rounded-lg p-3 max-h-32 overflow-y-auto space-y-1">
                  {selectedClips.map((clip) => (
                    <div key={clip.timestamp} className="flex items-center gap-2 text-xs text-neutral-300">
                      <Clock className="w-3 h-3 text-neutral-500" />
                      <span className="font-mono">{clip.date}</span>
                      <span className="text-neutral-500">|</span>
                      <span className="font-mono">{clip.time}</span>
                    </div>
                  ))}
                </div>
                {selectedClips.length > 1 && (
                  <p className="text-xs text-neutral-500">
                    Clips will be merged in chronological order with overlays
                  </p>
                )}
              </div>
            )}

            {selectedClips.length > 0 && <div className="border-t border-neutral-800" />}

            {/* Export SEI Data */}
            <div className="space-y-3">
              <h3 className="text-sm font-medium text-neutral-300 flex items-center gap-2">
                <FileJson className="w-4 h-4" />
                Export SEI Data
              </h3>
              <p className="text-xs text-neutral-500">
                Export all telemetry data (speed, location, signals, etc.) as CSV
              </p>
              <Button variant="outline" onClick={handleExportCsv} className="w-full">
                <FileJson className="w-4 h-4 mr-2" />
                Export CSV ({seiFrames.length} frames)
              </Button>
            </div>

            <div className="border-t border-neutral-800" />

            {/* Export Video */}
            <div className="space-y-5">
              <h3 className="text-sm font-medium text-neutral-300 flex items-center gap-2">
                <Video className="w-4 h-4" />
                Export Video
              </h3>

              {/* Export Mode Selection */}
              <div className="space-y-3">
                <h4 className="text-xs font-medium text-neutral-400">Export Mode</h4>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    onClick={() => updateOption('exportMode', 'driving')}
                    className={cn(
                      'py-3 px-3 rounded-lg text-xs font-medium transition-colors flex flex-col items-center gap-1.5',
                      options.exportMode === 'driving'
                        ? 'bg-[#3e6ae1] text-white'
                        : 'bg-neutral-800 text-neutral-400 hover:bg-neutral-700'
                    )}
                  >
                    <Car className="w-5 h-5" />
                    <span>Driving Mode</span>
                  </button>
                  <button
                    onClick={() => updateOption('exportMode', 'multicam')}
                    className={cn(
                      'py-3 px-3 rounded-lg text-xs font-medium transition-colors flex flex-col items-center gap-1.5',
                      options.exportMode === 'multicam'
                        ? 'bg-[#3e6ae1] text-white'
                        : 'bg-neutral-800 text-neutral-400 hover:bg-neutral-700'
                    )}
                  >
                    <Grid2X2 className="w-5 h-5" />
                    <span>Multi-cam</span>
                  </button>
                  <button
                    onClick={() => updateOption('exportMode', 'single')}
                    className={cn(
                      'py-3 px-3 rounded-lg text-xs font-medium transition-colors flex flex-col items-center gap-1.5',
                      options.exportMode === 'single'
                        ? 'bg-[#3e6ae1] text-white'
                        : 'bg-neutral-800 text-neutral-400 hover:bg-neutral-700'
                    )}
                  >
                    <Camera className="w-5 h-5" />
                    <span>Single Camera</span>
                  </button>
                </div>
              </div>

              {/* Camera Selection (for single camera mode) */}
              {options.exportMode === 'single' && (
                <div className="space-y-3">
                  <h4 className="text-xs font-medium text-neutral-400">Select Camera</h4>
                  <div className="grid grid-cols-3 gap-2">
                    {availableCameras.map((cam) => (
                      <button
                        key={cam}
                        onClick={() => updateOption('selectedCamera', cam)}
                        className={cn(
                          'py-2 px-3 rounded-lg text-xs font-medium transition-colors',
                          options.selectedCamera === cam
                            ? 'bg-[#3e6ae1] text-white'
                            : 'bg-neutral-800 text-neutral-400 hover:bg-neutral-700'
                        )}
                      >
                        {CAMERA_LABELS[cam]}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Duration selection */}
              <div className="space-y-3">
                <h4 className="text-xs font-medium text-neutral-400 flex items-center gap-2">
                  <Clock className="w-3 h-3" />
                  Duration
                </h4>
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      setExportRange('full')
                      updateOption('startTime', 0)
                      updateOption('endTime', clipDuration)
                    }}
                    className={cn(
                      'flex-1 py-2 px-3 rounded-lg text-xs font-medium transition-colors',
                      exportRange === 'full'
                        ? 'bg-[#3e6ae1] text-white'
                        : 'bg-neutral-800 text-neutral-400 hover:bg-neutral-700'
                    )}
                  >
                    Full Clip ({formatTime(clipDuration)})
                  </button>
                  <button
                    onClick={() => setExportRange('custom')}
                    className={cn(
                      'flex-1 py-2 px-3 rounded-lg text-xs font-medium transition-colors',
                      exportRange === 'custom'
                        ? 'bg-[#3e6ae1] text-white'
                        : 'bg-neutral-800 text-neutral-400 hover:bg-neutral-700'
                    )}
                  >
                    Custom Range
                  </button>
                </div>
                {exportRange === 'custom' && (
                  <div className="space-y-3 pt-2">
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-neutral-500 w-12">Start:</span>
                      <Slider
                        value={[options.startTime]}
                        max={clipDuration}
                        step={0.1}
                        onValueChange={([v]) => updateOption('startTime', v)}
                        className="flex-1"
                      />
                      <span className="text-xs text-neutral-400 font-mono w-14 text-right">
                        {formatTime(options.startTime)}
                      </span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-neutral-500 w-12">End:</span>
                      <Slider
                        value={[options.endTime]}
                        min={options.startTime}
                        max={clipDuration}
                        step={0.1}
                        onValueChange={([v]) => updateOption('endTime', v)}
                        className="flex-1"
                      />
                      <span className="text-xs text-neutral-400 font-mono w-14 text-right">
                        {formatTime(options.endTime)}
                      </span>
                    </div>
                    <p className="text-xs text-neutral-500">
                      Export duration: {formatTime(options.endTime - options.startTime)}
                    </p>
                  </div>
                )}
              </div>

              {/* Overlay options (only for driving mode) */}
              {options.exportMode === 'driving' && (
                <div className="space-y-3">
                  <label className="flex items-center justify-between">
                    <span className="text-sm text-neutral-400">Include data overlays</span>
                    <Switch
                      checked={options.includeOverlays}
                      onCheckedChange={(checked) => updateOption('includeOverlays', checked)}
                    />
                  </label>

                  {options.includeOverlays && (
                    <div className="space-y-2 pl-4 border-l border-neutral-800">
                      <label className="flex items-center justify-between">
                        <span className="text-xs text-neutral-500">Speed display</span>
                        <Switch
                          checked={options.showSpeed}
                          onCheckedChange={(checked) => updateOption('showSpeed', checked)}
                        />
                      </label>
                      <label className="flex items-center justify-between">
                        <span className="text-xs text-neutral-500">Turn signals</span>
                        <Switch
                          checked={options.showTurnSignals}
                          onCheckedChange={(checked) => updateOption('showTurnSignals', checked)}
                        />
                      </label>
                      <label className="flex items-center justify-between">
                        <span className="text-xs text-neutral-500">Steering wheel</span>
                        <Switch
                          checked={options.showSteering}
                          onCheckedChange={(checked) => updateOption('showSteering', checked)}
                        />
                      </label>
                      <label className="flex items-center justify-between">
                        <span className="text-xs text-neutral-500">Gear indicator</span>
                        <Switch
                          checked={options.showGear}
                          onCheckedChange={(checked) => updateOption('showGear', checked)}
                        />
                      </label>
                      <label className="flex items-center justify-between">
                        <span className="text-xs text-neutral-500">Compass/heading</span>
                        <Switch
                          checked={options.showCompass}
                          onCheckedChange={(checked) => updateOption('showCompass', checked)}
                        />
                      </label>
                    </div>
                  )}

                  <label className="flex items-center justify-between">
                    <span className="text-sm text-neutral-400">Auto-switch camera (reverse)</span>
                    <Switch
                      checked={options.autoSwitchCamera}
                      onCheckedChange={(checked) => updateOption('autoSwitchCamera', checked)}
                    />
                  </label>
                </div>
              )}

              {/* Quality settings */}
              <div className="space-y-2">
                <h4 className="text-xs font-medium text-neutral-400 flex items-center gap-2">
                  <Settings2 className="w-3 h-3" />
                  Quality
                </h4>
                <div className="flex gap-2">
                  {(['high', 'medium', 'low'] as const).map((q) => (
                    <button
                      key={q}
                      onClick={() => updateOption('quality', q)}
                      className={cn(
                        'flex-1 py-2 px-3 rounded-lg text-xs font-medium transition-colors',
                        options.quality === q
                          ? 'bg-[#3e6ae1] text-white'
                          : 'bg-neutral-800 text-neutral-400 hover:bg-neutral-700'
                      )}
                    >
                      {q.charAt(0).toUpperCase() + q.slice(1)}
                    </button>
                  ))}
                </div>
              </div>

              {/* Format selection */}
              <div className="space-y-2">
                <h4 className="text-xs font-medium text-neutral-400">Format</h4>
                <div className="flex gap-2">
                  {(['mp4', 'webm'] as const).map((f) => (
                    <button
                      key={f}
                      onClick={() => {
                        updateOption('format', f)
                        setSavePath(null) // Reset path when format changes
                      }}
                      className={cn(
                        'flex-1 py-2 px-3 rounded-lg text-xs font-medium transition-colors uppercase',
                        options.format === f
                          ? 'bg-[#3e6ae1] text-white'
                          : 'bg-neutral-800 text-neutral-400 hover:bg-neutral-700'
                      )}
                    >
                      {f}
                    </button>
                  ))}
                </div>
              </div>

              {/* Save location */}
              <div className="space-y-2">
                <h4 className="text-xs font-medium text-neutral-400 flex items-center gap-2">
                  <FolderOpen className="w-3 h-3" />
                  Save Location
                </h4>
                <Button
                  variant="outline"
                  className="w-full justify-start"
                  onClick={handleSelectSaveLocation}
                >
                  <FolderOpen className="w-4 h-4 mr-2 shrink-0" />
                  <span className="truncate">
                    {savePath || 'Choose save location...'}
                  </span>
                </Button>
              </div>
            </div>
          </div>

          {/* Export progress/button */}
          <div className="px-6 py-5 border-t border-neutral-800">
            {isExporting ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-neutral-400">Exporting...</span>
                  <span className="text-neutral-300">{progress}%</span>
                </div>
                <Progress value={progress} />
              </div>
            ) : exportComplete ? (
              <div className="space-y-4">
                <div className="flex items-center justify-center gap-2 text-green-400">
                  <Check className="w-5 h-5" />
                  <span>Export complete!</span>
                </div>
                {exportedFilePath && (
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={() => {
                      if (window.electronAPI?.showItemInFolder) {
                        window.electronAPI.showItemInFolder(exportedFilePath)
                      }
                    }}
                  >
                    <FolderOpen className="w-4 h-4 mr-2" />
                    Show in Finder
                  </Button>
                )}
              </div>
            ) : (
              <Button
                variant="tesla"
                className="w-full"
                onClick={handleExportVideo}
                disabled={!savePath}
              >
                <Video className="w-4 h-4 mr-2" />
                {savePath ? 'Export Video' : 'Select save location first'}
              </Button>
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
