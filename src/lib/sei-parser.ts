// SEI Data Parser for Tesla Dashcam Videos
// Based on Tesla's official dashcam protobuf spec

export interface SeiMetadata {
  version?: number
  gearState?: GearState
  frameSeqNo?: bigint
  vehicleSpeedMps?: number
  acceleratorPedalPosition?: number
  steeringWheelAngle?: number
  blinkerOnLeft?: boolean
  blinkerOnRight?: boolean
  brakeApplied?: boolean
  autopilotState?: AutopilotState
  latitudeDeg?: number
  longitudeDeg?: number
  headingDeg?: number
  linearAccelerationMps2X?: number
  linearAccelerationMps2Y?: number
  linearAccelerationMps2Z?: number
  timestamp?: number
}

export const GearState = {
  PARK: 0,
  DRIVE: 1,
  REVERSE: 2,
  NEUTRAL: 3,
} as const
export type GearState = typeof GearState[keyof typeof GearState]

export const AutopilotState = {
  NONE: 0,
  SELF_DRIVING: 1,
  AUTOSTEER: 2,
  TACC: 3,
} as const
export type AutopilotState = typeof AutopilotState[keyof typeof AutopilotState]

export function gearStateToString(gear: GearState): string {
  switch (gear) {
    case GearState.PARK: return 'P'
    case GearState.DRIVE: return 'D'
    case GearState.REVERSE: return 'R'
    case GearState.NEUTRAL: return 'N'
    default: return '-'
  }
}

export function autopilotStateToString(state: AutopilotState): string {
  switch (state) {
    case AutopilotState.NONE: return 'Off'
    case AutopilotState.SELF_DRIVING: return 'FSD'
    case AutopilotState.AUTOSTEER: return 'Autosteer'
    case AutopilotState.TACC: return 'TACC'
    default: return 'Unknown'
  }
}

// Find mdat atom in MP4 file
function findMdat(data: Uint8Array): { offset: number; size: number } | null {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength)
  let pos = 0

  while (pos < data.length - 8) {
    const size32 = view.getUint32(pos)
    const atomType = String.fromCharCode(data[pos + 4], data[pos + 5], data[pos + 6], data[pos + 7])

    let atomSize: number
    let headerSize: number

    if (size32 === 1) {
      // Extended size
      if (pos + 16 > data.length) return null
      const high = view.getUint32(pos + 8)
      const low = view.getUint32(pos + 12)
      atomSize = high * 0x100000000 + low
      headerSize = 16
    } else {
      atomSize = size32 || data.length - pos
      headerSize = 8
    }

    if (atomType === 'mdat') {
      return {
        offset: pos + headerSize,
        size: atomSize - headerSize,
      }
    }

    if (atomSize < headerSize) return null
    pos += atomSize
  }

  return null
}

// Remove emulation prevention bytes (0x03 following 0x00 0x00)
function stripEmulationPreventionBytes(data: Uint8Array): Uint8Array {
  const result: number[] = []
  let zeroCount = 0

  for (let i = 0; i < data.length; i++) {
    const byte = data[i]
    if (zeroCount >= 2 && byte === 0x03) {
      zeroCount = 0
      continue
    }
    result.push(byte)
    zeroCount = byte === 0 ? zeroCount + 1 : 0
  }

  return new Uint8Array(result)
}

// Extract protobuf payload from SEI NAL unit
function extractProtoPayload(nal: Uint8Array): Uint8Array | null {
  if (nal.length < 2) return null

  // Look for 0x42...0x69 pattern to find protobuf start
  for (let i = 3; i < nal.length - 1; i++) {
    const byte = nal[i]
    if (byte === 0x42) continue
    if (byte === 0x69) {
      if (i > 2) {
        // Protobuf data starts after 0x69, exclude last byte (RBSP trailing)
        return stripEmulationPreventionBytes(nal.slice(i + 1, -1))
      }
      break
    }
    break
  }

  return null
}

// Iterate over NAL units in mdat
function* iterNals(data: Uint8Array, offset: number, size: number): Generator<Uint8Array> {
  const NAL_ID_SEI = 6
  const NAL_SEI_ID_USER_DATA_UNREGISTERED = 5

  const view = new DataView(data.buffer, data.byteOffset, data.byteLength)
  let pos = offset
  const end = size > 0 ? offset + size : data.length

  while (pos < end - 4) {
    const nalSize = view.getUint32(pos)
    pos += 4

    if (nalSize < 2 || pos + nalSize > end) {
      pos += Math.max(0, nalSize - 4)
      continue
    }

    const firstByte = data[pos]
    const secondByte = data[pos + 1]

    // Check if this is an SEI NAL with user data unregistered
    if ((firstByte & 0x1f) === NAL_ID_SEI && secondByte === NAL_SEI_ID_USER_DATA_UNREGISTERED) {
      yield data.slice(pos, pos + nalSize)
    }

    pos += nalSize
  }
}

// Protobuf decoder
function decodeVarint(data: Uint8Array, offset: number): { value: number; bytesRead: number } {
  let value = 0
  let shift = 0
  let bytesRead = 0

  while (offset + bytesRead < data.length) {
    const byte = data[offset + bytesRead]
    value |= (byte & 0x7f) << shift
    bytesRead++
    if ((byte & 0x80) === 0) break
    shift += 7
  }

  return { value, bytesRead }
}

function decodeFloat(data: Uint8Array, offset: number): number {
  if (offset + 4 > data.length) return 0
  const view = new DataView(data.buffer, data.byteOffset + offset, 4)
  return view.getFloat32(0, true)
}

function decodeDouble(data: Uint8Array, offset: number): number {
  if (offset + 8 > data.length) return 0
  const view = new DataView(data.buffer, data.byteOffset + offset, 8)
  return view.getFloat64(0, true)
}

function decodeProtobuf(data: Uint8Array): SeiMetadata {
  const result: SeiMetadata = {}
  let offset = 0

  while (offset < data.length) {
    const { value: tag, bytesRead: tagBytes } = decodeVarint(data, offset)
    offset += tagBytes
    if (offset >= data.length) break

    const fieldNumber = tag >> 3
    const wireType = tag & 0x7

    switch (fieldNumber) {
      case 1: // version (uint32)
        if (wireType === 0) {
          const { value, bytesRead } = decodeVarint(data, offset)
          result.version = value
          offset += bytesRead
        }
        break
      case 2: // gear_state (enum)
        if (wireType === 0) {
          const { value, bytesRead } = decodeVarint(data, offset)
          result.gearState = value as GearState
          offset += bytesRead
        }
        break
      case 3: // frame_seq_no (uint64)
        if (wireType === 0) {
          const { value, bytesRead } = decodeVarint(data, offset)
          result.frameSeqNo = BigInt(value)
          offset += bytesRead
        }
        break
      case 4: // vehicle_speed_mps (float)
        if (wireType === 5) {
          result.vehicleSpeedMps = decodeFloat(data, offset)
          offset += 4
        }
        break
      case 5: // accelerator_pedal_position (float)
        if (wireType === 5) {
          result.acceleratorPedalPosition = decodeFloat(data, offset)
          offset += 4
        }
        break
      case 6: // steering_wheel_angle (float)
        if (wireType === 5) {
          result.steeringWheelAngle = decodeFloat(data, offset)
          offset += 4
        }
        break
      case 7: // blinker_on_left (bool)
        if (wireType === 0) {
          const { value, bytesRead } = decodeVarint(data, offset)
          result.blinkerOnLeft = value !== 0
          offset += bytesRead
        }
        break
      case 8: // blinker_on_right (bool)
        if (wireType === 0) {
          const { value, bytesRead } = decodeVarint(data, offset)
          result.blinkerOnRight = value !== 0
          offset += bytesRead
        }
        break
      case 9: // brake_applied (bool)
        if (wireType === 0) {
          const { value, bytesRead } = decodeVarint(data, offset)
          result.brakeApplied = value !== 0
          offset += bytesRead
        }
        break
      case 10: // autopilot_state (enum)
        if (wireType === 0) {
          const { value, bytesRead } = decodeVarint(data, offset)
          result.autopilotState = value as AutopilotState
          offset += bytesRead
        }
        break
      case 11: // latitude_deg (double)
        if (wireType === 1) {
          result.latitudeDeg = decodeDouble(data, offset)
          offset += 8
        }
        break
      case 12: // longitude_deg (double)
        if (wireType === 1) {
          result.longitudeDeg = decodeDouble(data, offset)
          offset += 8
        }
        break
      case 13: // heading_deg (double)
        if (wireType === 1) {
          result.headingDeg = decodeDouble(data, offset)
          offset += 8
        }
        break
      case 14: // linear_acceleration_mps2_x (double)
        if (wireType === 1) {
          result.linearAccelerationMps2X = decodeDouble(data, offset)
          offset += 8
        }
        break
      case 15: // linear_acceleration_mps2_y (double)
        if (wireType === 1) {
          result.linearAccelerationMps2Y = decodeDouble(data, offset)
          offset += 8
        }
        break
      case 16: // linear_acceleration_mps2_z (double)
        if (wireType === 1) {
          result.linearAccelerationMps2Z = decodeDouble(data, offset)
          offset += 8
        }
        break
      default:
        // Skip unknown fields
        if (wireType === 0) {
          const { bytesRead } = decodeVarint(data, offset)
          offset += bytesRead
        } else if (wireType === 1) {
          offset += 8
        } else if (wireType === 2) {
          const { value: len, bytesRead } = decodeVarint(data, offset)
          offset += bytesRead + len
        } else if (wireType === 5) {
          offset += 4
        } else {
          break
        }
    }
  }

  return result
}

export interface SeiFrame {
  frameNumber: number
  timestamp: number
  metadata: SeiMetadata
}

export async function extractSeiFromFile(fileBuffer: ArrayBuffer): Promise<SeiFrame[]> {
  const frames: SeiFrame[] = []
  const data = new Uint8Array(fileBuffer)

  const mdat = findMdat(data)
  if (!mdat) {
    console.log('No mdat box found in file')
    return frames
  }

  console.log(`Found mdat at offset ${mdat.offset}, size ${mdat.size}`)

  let frameNumber = 0
  for (const nal of iterNals(data, mdat.offset, mdat.size)) {
    const protoPayload = extractProtoPayload(nal)
    if (!protoPayload) continue

    try {
      const metadata = decodeProtobuf(protoPayload)
      if (metadata.version !== undefined) {
        frames.push({
          frameNumber: frameNumber++,
          timestamp: frameNumber / 36, // Tesla uses 36fps
          metadata,
        })
      }
    } catch (e) {
      console.error('Failed to decode protobuf:', e)
    }
  }

  console.log(`Extracted ${frames.length} SEI frames`)
  return frames
}

export function interpolateSeiData(frames: SeiFrame[], currentTime: number): SeiMetadata | null {
  if (frames.length === 0) return null
  if (frames.length === 1) return frames[0].metadata

  // Find the two frames surrounding currentTime
  let beforeFrame: SeiFrame | null = null
  let afterFrame: SeiFrame | null = null

  for (let i = 0; i < frames.length; i++) {
    if (frames[i].timestamp <= currentTime) {
      beforeFrame = frames[i]
    }
    if (frames[i].timestamp > currentTime) {
      afterFrame = frames[i]
      break
    }
  }

  // Edge cases
  if (!beforeFrame) return frames[0].metadata
  if (!afterFrame) return frames[frames.length - 1].metadata

  // Calculate interpolation factor (0 to 1)
  const timeDiff = afterFrame.timestamp - beforeFrame.timestamp
  if (timeDiff === 0) return beforeFrame.metadata
  const t = (currentTime - beforeFrame.timestamp) / timeDiff

  // Helper to interpolate numbers
  const lerp = (a: number | undefined, b: number | undefined): number | undefined => {
    if (a === undefined || b === undefined) return a ?? b
    return a + (b - a) * t
  }

  // Interpolate numerical values, use nearest for booleans/enums
  const before = beforeFrame.metadata
  const after = afterFrame.metadata

  return {
    version: before.version,
    gearState: before.gearState,
    frameSeqNo: before.frameSeqNo,
    vehicleSpeedMps: lerp(before.vehicleSpeedMps, after.vehicleSpeedMps),
    acceleratorPedalPosition: lerp(before.acceleratorPedalPosition, after.acceleratorPedalPosition),
    steeringWheelAngle: lerp(before.steeringWheelAngle, after.steeringWheelAngle),
    blinkerOnLeft: before.blinkerOnLeft,
    blinkerOnRight: before.blinkerOnRight,
    brakeApplied: before.brakeApplied,
    autopilotState: before.autopilotState,
    latitudeDeg: lerp(before.latitudeDeg, after.latitudeDeg),
    longitudeDeg: lerp(before.longitudeDeg, after.longitudeDeg),
    headingDeg: lerp(before.headingDeg, after.headingDeg),
    linearAccelerationMps2X: lerp(before.linearAccelerationMps2X, after.linearAccelerationMps2X),
    linearAccelerationMps2Y: lerp(before.linearAccelerationMps2Y, after.linearAccelerationMps2Y),
    linearAccelerationMps2Z: lerp(before.linearAccelerationMps2Z, after.linearAccelerationMps2Z),
  }
}

// Export CSV
export function seiFramesToCsv(frames: SeiFrame[]): string {
  const headers = [
    'frame_number',
    'timestamp',
    'version',
    'gear_state',
    'vehicle_speed_mps',
    'accelerator_pedal_position',
    'steering_wheel_angle',
    'blinker_on_left',
    'blinker_on_right',
    'brake_applied',
    'autopilot_state',
    'latitude_deg',
    'longitude_deg',
    'heading_deg',
    'linear_acceleration_x',
    'linear_acceleration_y',
    'linear_acceleration_z',
  ]

  const rows = frames.map(frame => [
    frame.frameNumber,
    frame.timestamp.toFixed(3),
    frame.metadata.version ?? '',
    gearStateToString(frame.metadata.gearState ?? GearState.PARK),
    frame.metadata.vehicleSpeedMps?.toFixed(2) ?? '',
    frame.metadata.acceleratorPedalPosition?.toFixed(2) ?? '',
    frame.metadata.steeringWheelAngle?.toFixed(2) ?? '',
    frame.metadata.blinkerOnLeft ?? '',
    frame.metadata.blinkerOnRight ?? '',
    frame.metadata.brakeApplied ?? '',
    autopilotStateToString(frame.metadata.autopilotState ?? AutopilotState.NONE),
    frame.metadata.latitudeDeg?.toFixed(6) ?? '',
    frame.metadata.longitudeDeg?.toFixed(6) ?? '',
    frame.metadata.headingDeg?.toFixed(2) ?? '',
    frame.metadata.linearAccelerationMps2X?.toFixed(4) ?? '',
    frame.metadata.linearAccelerationMps2Y?.toFixed(4) ?? '',
    frame.metadata.linearAccelerationMps2Z?.toFixed(4) ?? '',
  ])

  return [headers.join(','), ...rows.map(r => r.join(','))].join('\n')
}
