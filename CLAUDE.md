# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

TeslaCam Viewer is an Electron desktop application for viewing Tesla dashcam footage with real-time SEI (Supplemental Enhancement Information) metadata overlay. It displays vehicle telemetry data embedded in the video files.

## Development Commands

```bash
npm run dev              # Vite dev server only (browser)
npm run electron:dev     # Full Electron development with hot reload
npm run build            # TypeScript check + Vite production build
npm run lint             # ESLint
npm run electron:build   # Production build with electron-builder
npm run electron:preview # Preview production build in Electron
```

## Architecture

### Electron Layer (`electron/`)
- **main.cjs** - Main process: window management, file dialogs, file system access via IPC
- **preload.cjs** - Exposes `window.electronAPI` to renderer via contextBridge

### React Frontend (`src/`)
- **App.tsx** - Main component managing clip selection and view mode state
- **components/** - UI components using Radix UI primitives with Tailwind CSS v4
- **lib/sei-parser.ts** - Custom protobuf decoder for Tesla's SEI metadata format
- **lib/video-exporter.ts** - Video export functionality

### View Modes
1. **DrivingMode** - Tesla-style HUD overlay showing speed, gear, steering wheel, turn signals, autopilot status. Automatically shows side repeater cameras when turn signals are active and switches to rear camera in reverse.
2. **GridView** - All 6 cameras displayed simultaneously in a grid
3. **SingleView** - One camera with selector buttons, maintains playback position when switching

### Tesla Video File Format
Files follow the naming pattern: `YYYY-MM-DD_HH-MM-SS-{camera}.mp4`

Cameras: `front`, `back`, `left_repeater`, `right_repeater`, `left_pillar`, `right_pillar`

### SEI Metadata
Parsed from NAL units in the video's mdat atom. Contains per-frame data:
- Vehicle speed (m/s), gear state, steering angle
- Turn signals, brake status, accelerator position
- Autopilot state (None, TACC, Autosteer, FSD)
- GPS coordinates and heading
- Linear acceleration (X, Y, Z)

Videos are 36fps. The `interpolateSeiData()` function finds the closest frame for a given timestamp.

## Key Patterns

- Path alias `@` maps to `src/` (configured in vite.config.ts)
- All videos in a clip group are synchronized; the front camera drives time updates
- UI components in `components/ui/` follow shadcn/ui patterns using `class-variance-authority`
- The `cn()` utility merges Tailwind classes with clsx and tailwind-merge
