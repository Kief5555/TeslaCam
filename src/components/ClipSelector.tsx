import { useState, useMemo } from 'react'
import { cn } from '@/lib/utils'
import { Button } from './ui/button'
import { Checkbox } from './ui/checkbox'
import {
  FolderOpen,
  Video,
  ChevronRight,
  Calendar,
  Clock,
  Camera,
  Download,
} from 'lucide-react'

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
  files?: {
    front?: File
    back?: File
    left_repeater?: File
    right_repeater?: File
    left_pillar?: File
    right_pillar?: File
  }
}

interface ClipSelectorProps {
  folderPath: string | null
  files: string[]
  onSelectFolder: () => void
  onSelectClip: (clip: ClipGroup) => void
  selectedClip: ClipGroup | null
  selectedClipsForExport: ClipGroup[]
  onSelectedClipsChange: (clips: ClipGroup[]) => void
  onExportSelected: () => void
  className?: string
}

export function ClipSelector({
  folderPath,
  files,
  onSelectFolder,
  onSelectClip,
  selectedClip,
  selectedClipsForExport,
  onSelectedClipsChange,
  onExportSelected,
  className,
}: ClipSelectorProps) {
  const [expandedDates, setExpandedDates] = useState<Set<string>>(new Set())

  // Group files by timestamp
  const clipGroups = useMemo(() => {
    const groups = new Map<string, ClipGroup>()

    files.forEach(file => {
      // Parse filename: 2025-12-30_09-14-14-front.mp4
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
      b.timestamp.localeCompare(a.timestamp)
    )
  }, [files, folderPath])

  // Group by date
  const clipsByDate = useMemo(() => {
    const byDate = new Map<string, ClipGroup[]>()
    clipGroups.forEach(clip => {
      const existing = byDate.get(clip.date) || []
      existing.push(clip)
      byDate.set(clip.date, existing)
    })
    return byDate
  }, [clipGroups])

  const toggleDate = (date: string) => {
    const newExpanded = new Set(expandedDates)
    if (newExpanded.has(date)) {
      newExpanded.delete(date)
    } else {
      newExpanded.add(date)
    }
    setExpandedDates(newExpanded)
  }

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr)
    return date.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    })
  }

  const getCameraCount = (cameras: ClipGroup['cameras']) => {
    return Object.values(cameras).filter(Boolean).length
  }

  const isClipSelected = (clip: ClipGroup) => {
    return selectedClipsForExport.some(c => c.timestamp === clip.timestamp)
  }

  const toggleClipSelection = (clip: ClipGroup, e: React.MouseEvent) => {
    e.stopPropagation()
    if (isClipSelected(clip)) {
      onSelectedClipsChange(selectedClipsForExport.filter(c => c.timestamp !== clip.timestamp))
    } else {
      onSelectedClipsChange([...selectedClipsForExport, clip].sort((a, b) => a.timestamp.localeCompare(b.timestamp)))
    }
  }

  return (
    <div className={cn('flex flex-col h-full bg-neutral-900', className)}>
      {/* Header */}
      <div className="p-4 border-b border-neutral-800">
        <Button
          onClick={onSelectFolder}
          variant="outline"
          className="w-full justify-start"
        >
          <FolderOpen className="w-4 h-4 mr-2" />
          {folderPath ? 'Change Folder' : 'Select Folder'}
        </Button>
        {folderPath && (
          <p className="mt-2 text-xs text-neutral-500 truncate">
            {folderPath}
          </p>
        )}
      </div>

      {/* Clip list */}
      <div className="flex-1 overflow-y-auto">
        {clipGroups.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-neutral-500 p-4">
            <Video className="w-12 h-12 mb-2 opacity-50" />
            <p className="text-sm text-center">
              {folderPath
                ? 'No Tesla dashcam clips found'
                : 'Select a folder to load clips'}
            </p>
          </div>
        ) : (
          <div className="p-2">
            {Array.from(clipsByDate.entries()).map(([date, clips]) => (
              <div key={date} className="mb-2">
                {/* Date header */}
                <button
                  onClick={() => toggleDate(date)}
                  className="w-full flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-neutral-800 transition-colors"
                >
                  <ChevronRight
                    className={cn(
                      'w-4 h-4 text-neutral-500 transition-transform',
                      expandedDates.has(date) && 'rotate-90'
                    )}
                  />
                  <Calendar className="w-4 h-4 text-neutral-500" />
                  <span className="text-sm font-medium text-neutral-300">
                    {formatDate(date)}
                  </span>
                  <span className="ml-auto text-xs text-neutral-500">
                    {clips.length} clips
                  </span>
                </button>

                {/* Clips for this date */}
                {expandedDates.has(date) && (
                  <div className="ml-6 mt-1 space-y-1">
                    {clips.map(clip => (
                      <div
                        key={clip.timestamp}
                        className={cn(
                          'w-full flex items-center gap-2 px-3 py-2 rounded-lg transition-colors text-left',
                          selectedClip?.timestamp === clip.timestamp
                            ? 'bg-[#3e6ae1]/20 border border-[#3e6ae1]/50'
                            : 'hover:bg-neutral-800 border border-transparent'
                        )}
                      >
                        <Checkbox
                          checked={isClipSelected(clip)}
                          onClick={(e) => toggleClipSelection(clip, e)}
                          className="shrink-0"
                        />
                        <button
                          onClick={() => onSelectClip(clip)}
                          className="flex-1 flex items-center gap-3"
                        >
                          <Clock className="w-4 h-4 text-neutral-500" />
                          <span className="text-sm text-neutral-200 font-mono">
                            {clip.time}
                          </span>
                          <div className="flex items-center gap-1 ml-auto">
                            <Camera className="w-3 h-3 text-neutral-500" />
                            <span className="text-xs text-neutral-500">
                              {getCameraCount(clip.cameras)}
                            </span>
                          </div>
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Stats & Export */}
      {clipGroups.length > 0 && (
        <div className="p-4 border-t border-neutral-800 space-y-3">
          {selectedClipsForExport.length > 0 ? (
            <Button
              variant="tesla"
              className="w-full"
              onClick={onExportSelected}
            >
              <Download className="w-4 h-4 mr-2" />
              Export {selectedClipsForExport.length} clip{selectedClipsForExport.length > 1 ? 's' : ''}
            </Button>
          ) : (
            <div className="text-xs text-neutral-500">
              {clipGroups.length} clips total
            </div>
          )}
        </div>
      )}
    </div>
  )
}
