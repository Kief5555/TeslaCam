// Video Exporter for TeslaCam Viewer
// Handles compositing videos with overlays and exporting

import { GearState, gearStateToString, autopilotStateToString } from './sei-parser'
import type { SeiFrame, SeiMetadata } from './sei-parser'
import { formatSpeed } from './utils'

export interface ExportOptions {
  includeOverlays: boolean
  autoSwitchCamera: boolean
  showSpeed: boolean
  showTurnSignals: boolean
  showGForce: boolean
  showGear: boolean
  showCompass: boolean
  format: 'mp4' | 'webm'
  quality: 'high' | 'medium' | 'low'
}

export interface CameraFiles {
  front?: string
  back?: string
  left_repeater?: string
  right_repeater?: string
  left_pillar?: string
  right_pillar?: string
}

export interface ClipData {
  cameras: CameraFiles
  seiFrames: SeiFrame[]
}

interface ExportProgress {
  percent: number
  stage: 'preparing' | 'rendering' | 'encoding' | 'done'
  message: string
}

type ProgressCallback = (progress: ExportProgress) => void

const QUALITY_SETTINGS = {
  high: { videoBitrate: 8000000, audioBitrate: 192000, width: 1920, height: 1080 },
  medium: { videoBitrate: 4000000, audioBitrate: 128000, width: 1280, height: 720 },
  low: { videoBitrate: 2000000, audioBitrate: 96000, width: 854, height: 480 },
}

export class VideoExporter {
  private canvas: HTMLCanvasElement
  private ctx: CanvasRenderingContext2D
  private clips: ClipData[]
  private options: ExportOptions
  private progressCallback?: ProgressCallback

  constructor(
    cameras: CameraFiles,
    seiFrames: SeiFrame[],
    options: ExportOptions,
    progressCallback?: ProgressCallback
  )
  constructor(
    clips: ClipData[],
    options: ExportOptions,
    progressCallback?: ProgressCallback
  )
  constructor(
    camerasOrClips: CameraFiles | ClipData[],
    seiFramesOrOptions: SeiFrame[] | ExportOptions,
    optionsOrCallback?: ExportOptions | ProgressCallback,
    maybeProgressCallback?: ProgressCallback
  ) {
    // Determine which overload was called
    if (Array.isArray(camerasOrClips) && camerasOrClips.length > 0 && 'cameras' in camerasOrClips[0]) {
      // Called with clips array
      this.clips = camerasOrClips as ClipData[]
      this.options = seiFramesOrOptions as ExportOptions
      this.progressCallback = optionsOrCallback as ProgressCallback | undefined
    } else {
      // Called with cameras, seiFrames, options
      this.clips = [{
        cameras: camerasOrClips as CameraFiles,
        seiFrames: seiFramesOrOptions as SeiFrame[],
      }]
      this.options = optionsOrCallback as ExportOptions
      this.progressCallback = maybeProgressCallback
    }

    const quality = QUALITY_SETTINGS[this.options.quality]
    this.canvas = document.createElement('canvas')
    this.canvas.width = quality.width
    this.canvas.height = quality.height
    this.ctx = this.canvas.getContext('2d')!
  }

  private getCurrentClipSeiFrames(clipIndex: number): SeiFrame[] {
    return this.clips[clipIndex]?.seiFrames || []
  }

  private reportProgress(progress: ExportProgress) {
    this.progressCallback?.(progress)
  }

  private getSeiAtTime(seiFrames: SeiFrame[], time: number): SeiMetadata | null {
    if (seiFrames.length === 0) return null

    let closest = seiFrames[0]
    let minDiff = Math.abs(seiFrames[0].timestamp - time)

    for (const frame of seiFrames) {
      const diff = Math.abs(frame.timestamp - time)
      if (diff < minDiff) {
        minDiff = diff
        closest = frame
      }
    }

    return closest.metadata
  }

  private drawOverlays(sei: SeiMetadata | null, currentTime: number) {
    if (!this.options.includeOverlays || !sei) return

    const ctx = this.ctx
    const width = this.canvas.width
    const height = this.canvas.height

    // Semi-transparent overlay backgrounds
    ctx.fillStyle = 'rgba(0, 0, 0, 0.6)'

    // Speed display (top left)
    if (this.options.showSpeed && sei.vehicleSpeedMps !== undefined) {
      ctx.fillRect(20, 20, 120, 80)
      ctx.fillStyle = '#ffffff'
      ctx.font = 'bold 48px -apple-system, sans-serif'
      ctx.textAlign = 'center'
      const speed = formatSpeed(sei.vehicleSpeedMps, 'mph')
      ctx.fillText(speed.toString(), 80, 70)
      ctx.font = '14px -apple-system, sans-serif'
      ctx.fillStyle = '#a3a3a3'
      ctx.fillText('MPH', 80, 90)
    }

    // Gear indicator (below speed)
    if (this.options.showGear && sei.gearState !== undefined) {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.6)'
      ctx.fillRect(20, 110, 50, 50)
      ctx.fillStyle = '#ffffff'
      ctx.font = 'bold 28px -apple-system, sans-serif'
      ctx.textAlign = 'center'
      ctx.fillText(gearStateToString(sei.gearState), 45, 145)
    }

    // Turn signals
    if (this.options.showTurnSignals) {
      const blinkState = Math.floor(currentTime * 2.5) % 2 === 0

      // Left signal
      if (sei.blinkerOnLeft && blinkState) {
        ctx.fillStyle = '#22c55e'
        ctx.beginPath()
        ctx.moveTo(30, height - 100)
        ctx.lineTo(10, height - 70)
        ctx.lineTo(30, height - 40)
        ctx.lineTo(30, height - 55)
        ctx.lineTo(50, height - 55)
        ctx.lineTo(50, height - 85)
        ctx.lineTo(30, height - 85)
        ctx.closePath()
        ctx.fill()
      }

      // Right signal
      if (sei.blinkerOnRight && blinkState) {
        ctx.fillStyle = '#22c55e'
        ctx.beginPath()
        ctx.moveTo(width - 30, height - 100)
        ctx.lineTo(width - 10, height - 70)
        ctx.lineTo(width - 30, height - 40)
        ctx.lineTo(width - 30, height - 55)
        ctx.lineTo(width - 50, height - 55)
        ctx.lineTo(width - 50, height - 85)
        ctx.lineTo(width - 30, height - 85)
        ctx.closePath()
        ctx.fill()
      }
    }

    // G-force indicator (bottom center)
    if (this.options.showGForce) {
      const gX = (sei.linearAccelerationMps2X ?? 0) / 9.81
      const gY = (sei.linearAccelerationMps2Y ?? 0) / 9.81

      const centerX = width / 2
      const centerY = height - 80
      const radius = 50

      // Background circle
      ctx.fillStyle = 'rgba(0, 0, 0, 0.6)'
      ctx.beginPath()
      ctx.arc(centerX, centerY, radius, 0, Math.PI * 2)
      ctx.fill()

      // Grid lines
      ctx.strokeStyle = '#404040'
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(centerX - radius, centerY)
      ctx.lineTo(centerX + radius, centerY)
      ctx.moveTo(centerX, centerY - radius)
      ctx.lineTo(centerX, centerY + radius)
      ctx.stroke()

      // G-force dot
      const dotX = centerX + (gX / 1.5) * radius
      const dotY = centerY - (gY / 1.5) * radius
      ctx.fillStyle = '#3b82f6'
      ctx.beginPath()
      ctx.arc(dotX, dotY, 8, 0, Math.PI * 2)
      ctx.fill()
    }

    // Compass (top right)
    if (this.options.showCompass && sei.headingDeg !== undefined) {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.6)'
      ctx.fillRect(width - 100, 20, 80, 60)

      const directions = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']
      const index = Math.round(sei.headingDeg / 45) % 8
      const direction = directions[index]

      ctx.fillStyle = '#ffffff'
      ctx.font = 'bold 24px -apple-system, sans-serif'
      ctx.textAlign = 'center'
      ctx.fillText(direction, width - 60, 55)

      ctx.font = '12px -apple-system, sans-serif'
      ctx.fillStyle = '#a3a3a3'
      ctx.fillText(`${sei.headingDeg.toFixed(0)}°`, width - 60, 72)
    }

    // Brake indicator
    if (sei.brakeApplied) {
      ctx.fillStyle = 'rgba(220, 38, 38, 0.8)'
      ctx.fillRect(width / 2 - 40, 20, 80, 30)
      ctx.fillStyle = '#ffffff'
      ctx.font = 'bold 16px -apple-system, sans-serif'
      ctx.textAlign = 'center'
      ctx.fillText('BRAKE', width / 2, 42)
    }

    // Reverse indicator
    if (sei.gearState === GearState.REVERSE) {
      ctx.fillStyle = 'rgba(220, 38, 38, 0.8)'
      ctx.fillRect(width / 2 - 50, 60, 100, 30)
      ctx.fillStyle = '#ffffff'
      ctx.font = 'bold 16px -apple-system, sans-serif'
      ctx.textAlign = 'center'
      ctx.fillText('REVERSE', width / 2, 82)
    }

    // Autopilot badge
    if (sei.autopilotState !== undefined && sei.autopilotState > 0) {
      ctx.fillStyle = 'rgba(59, 130, 246, 0.8)'
      ctx.fillRect(20, height - 150, 100, 25)
      ctx.fillStyle = '#ffffff'
      ctx.font = 'bold 12px -apple-system, sans-serif'
      ctx.textAlign = 'center'
      ctx.fillText(autopilotStateToString(sei.autopilotState), 70, height - 132)
    }

    // Timestamp
    ctx.fillStyle = 'rgba(0, 0, 0, 0.6)'
    ctx.fillRect(width - 100, height - 40, 90, 25)
    ctx.fillStyle = '#a3a3a3'
    ctx.font = '12px monospace'
    ctx.textAlign = 'center'
    const mins = Math.floor(currentTime / 60)
    const secs = Math.floor(currentTime % 60)
    ctx.fillText(`${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`, width - 55, height - 22)
  }

  private async loadVideo(src: string): Promise<HTMLVideoElement> {
    const video = document.createElement('video')
    video.src = src
    video.muted = true
    video.preload = 'auto'

    return new Promise((resolve, reject) => {
      video.onloadeddata = () => resolve(video)
      video.onerror = () => reject(new Error(`Failed to load video: ${src}`))
      video.load()
    })
  }

  private async seekVideo(video: HTMLVideoElement, time: number): Promise<void> {
    return new Promise((resolve) => {
      const onSeeked = () => {
        video.removeEventListener('seeked', onSeeked)
        resolve()
      }
      video.addEventListener('seeked', onSeeked)
      video.currentTime = time
    })
  }

  async export(): Promise<Blob> {
    this.reportProgress({ percent: 0, stage: 'preparing', message: 'Loading videos...' })

    const fps = 30
    const quality = QUALITY_SETTINGS[this.options.quality]

    // Calculate total frames across all clips
    let totalFrames = 0
    const clipInfo: { duration: number; frames: number }[] = []

    for (const clip of this.clips) {
      if (clip.cameras.front) {
        const video = await this.loadVideo(clip.cameras.front)
        const frames = Math.floor(video.duration * fps)
        clipInfo.push({ duration: video.duration, frames })
        totalFrames += frames
      }
    }

    if (totalFrames === 0) {
      throw new Error('No video content to export')
    }

    this.reportProgress({ percent: 5, stage: 'rendering', message: `Starting render of ${this.clips.length} clip(s)...` })

    // Set up MediaRecorder
    const stream = this.canvas.captureStream(fps)

    let mediaRecorder: MediaRecorder
    try {
      mediaRecorder = new MediaRecorder(stream, {
        mimeType: 'video/webm;codecs=vp9',
        videoBitsPerSecond: quality.videoBitrate,
      })
    } catch {
      // Fallback
      mediaRecorder = new MediaRecorder(stream, {
        mimeType: 'video/webm',
        videoBitsPerSecond: quality.videoBitrate,
      })
    }

    const chunks: Blob[] = []
    mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) {
        chunks.push(e.data)
      }
    }

    return new Promise<Blob>(async (resolve, reject) => {
      mediaRecorder.onstop = () => {
        this.reportProgress({ percent: 100, stage: 'done', message: 'Export complete!' })
        const blob = new Blob(chunks, { type: 'video/webm' })
        resolve(blob)
      }

      mediaRecorder.onerror = () => {
        reject(new Error('MediaRecorder error'))
      }

      // Request data more frequently for larger files
      mediaRecorder.start(1000) // Get data every second

      try {
        let globalFrame = 0

        // Process each clip sequentially
        for (let clipIndex = 0; clipIndex < this.clips.length; clipIndex++) {
          const clip = this.clips[clipIndex]
          const info = clipInfo[clipIndex]

          // Load videos for this clip
          const mainVideo = clip.cameras.front ? await this.loadVideo(clip.cameras.front) : null
          const backVideo = clip.cameras.back ? await this.loadVideo(clip.cameras.back) : null
          const leftRepeater = clip.cameras.left_repeater ? await this.loadVideo(clip.cameras.left_repeater) : null
          const rightRepeater = clip.cameras.right_repeater ? await this.loadVideo(clip.cameras.right_repeater) : null

          if (!mainVideo) continue

          const seiFrames = clip.seiFrames

          // Render frames for this clip
          for (let frameInClip = 0; frameInClip < info.frames; frameInClip++) {
            const currentTime = frameInClip / fps

            // Seek main video and wait for it to be ready
            await this.seekVideo(mainVideo, currentTime)

            // Get current SEI data
            const sei = this.getSeiAtTime(seiFrames, currentTime)

            // Determine which camera to show
            let activeVideo: HTMLVideoElement = mainVideo
            if (this.options.autoSwitchCamera && sei?.gearState === GearState.REVERSE && backVideo) {
              await this.seekVideo(backVideo, currentTime)
              activeVideo = backVideo
            }

            // Draw main video
            this.ctx.drawImage(activeVideo, 0, 0, this.canvas.width, this.canvas.height)

            // Draw repeater overlays when turn signals active
            if (this.options.includeOverlays && sei) {
              const repeaterWidth = this.canvas.width * 0.2
              const repeaterHeight = this.canvas.height * 0.15

              if (sei.blinkerOnLeft && leftRepeater) {
                await this.seekVideo(leftRepeater, currentTime)
                // Border
                this.ctx.strokeStyle = '#22c55e'
                this.ctx.lineWidth = 2
                this.ctx.strokeRect(10, this.canvas.height - repeaterHeight - 120, repeaterWidth, repeaterHeight)
                // Video
                this.ctx.drawImage(leftRepeater, 10, this.canvas.height - repeaterHeight - 120, repeaterWidth, repeaterHeight)
              }

              if (sei.blinkerOnRight && rightRepeater) {
                await this.seekVideo(rightRepeater, currentTime)
                // Border
                this.ctx.strokeStyle = '#22c55e'
                this.ctx.lineWidth = 2
                this.ctx.strokeRect(this.canvas.width - repeaterWidth - 10, this.canvas.height - repeaterHeight - 120, repeaterWidth, repeaterHeight)
                // Video
                this.ctx.drawImage(rightRepeater, this.canvas.width - repeaterWidth - 10, this.canvas.height - repeaterHeight - 120, repeaterWidth, repeaterHeight)
              }
            }

            // Draw overlays
            this.drawOverlays(sei, currentTime)

            // Wait for next frame to be captured
            await new Promise(r => requestAnimationFrame(r))

            globalFrame++
            const percent = Math.floor((globalFrame / totalFrames) * 90) + 5
            this.reportProgress({
              percent,
              stage: 'rendering',
              message: `Clip ${clipIndex + 1}/${this.clips.length}: Frame ${frameInClip + 1}/${info.frames}`
            })
          }
        }

        mediaRecorder.stop()
      } catch (err) {
        mediaRecorder.stop()
        reject(err)
      }
    })
  }
}

// Helper to trigger download
export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
