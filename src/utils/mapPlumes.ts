import { SCREENING_THRESHOLDS } from '../constants'
import type { Pollutant, Station, StationSnapshot } from '../types'

const OVERLAY_WIDTH = 1000
const OVERLAY_HEIGHT = 720

const COLOR_STOPS = [
  { at: 0, color: '#6dbba8' },
  { at: 0.38, color: '#c2a64f' },
  { at: 0.68, color: '#d47a46' },
  { at: 1, color: '#922f30' },
] as const

interface OverlayBounds {
  minLat: number
  maxLat: number
  minLng: number
  maxLng: number
}

export interface PollutionPlumeLayer {
  id: string
  path: string
  color: string
  opacity: number
  variant: 'ambient' | 'body' | 'core'
  duration: number
  delay: number
  driftX: number
  driftY: number
  scale: number
  rotation: number
}

export interface PollutionPlume {
  id: string
  value: number
  intensity: number
  center: {
    x: number
    y: number
  }
  layers: PollutionPlumeLayer[]
}

export const POLLUTION_OVERLAY_VIEWBOX = `0 0 ${OVERLAY_WIDTH} ${OVERLAY_HEIGHT}`

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

function hashString(value: string) {
  let hash = 0

  for (let index = 0; index < value.length; index += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(index)
    hash |= 0
  }

  return Math.abs(hash)
}

function fract(value: number) {
  return value - Math.floor(value)
}

function seededNoise(seed: number) {
  return fract(Math.sin(seed * 12.9898) * 43758.5453123)
}

function mixHex(left: string, right: string, weight: number) {
  const amount = clamp(weight, 0, 1)
  const l = left.replace('#', '')
  const r = right.replace('#', '')

  const leftRgb = [0, 2, 4].map((index) => Number.parseInt(l.slice(index, index + 2), 16))
  const rightRgb = [0, 2, 4].map((index) => Number.parseInt(r.slice(index, index + 2), 16))

  const mixed = leftRgb.map((channel, index) =>
    Math.round(channel * (1 - amount) + rightRgb[index] * amount),
  )

  return `#${mixed.map((channel) => channel.toString(16).padStart(2, '0')).join('')}`
}

function interpolateColor(intensity: number) {
  const normalized = clamp(intensity, 0, 1)
  const upperIndex = COLOR_STOPS.findIndex((stop) => normalized <= stop.at)

  if (upperIndex <= 0) {
    return COLOR_STOPS[0].color
  }

  if (upperIndex === -1) {
    return COLOR_STOPS.at(-1)!.color
  }

  const lower = COLOR_STOPS[upperIndex - 1]
  const upper = COLOR_STOPS[upperIndex]
  const localWeight = (normalized - lower.at) / (upper.at - lower.at)

  return mixHex(lower.color, upper.color, localWeight)
}

function boundsToOverlay(bounds: [[number, number], [number, number]]): OverlayBounds {
  return {
    minLat: bounds[0][0],
    minLng: bounds[0][1],
    maxLat: bounds[1][0],
    maxLng: bounds[1][1],
  }
}

function projectPoint(
  lat: number,
  lng: number,
  bounds: OverlayBounds,
) {
  const x = ((lng - bounds.minLng) / (bounds.maxLng - bounds.minLng)) * OVERLAY_WIDTH
  const y = ((bounds.maxLat - lat) / (bounds.maxLat - bounds.minLat)) * OVERLAY_HEIGHT

  return {
    x: clamp(x, -40, OVERLAY_WIDTH + 40),
    y: clamp(y, -40, OVERLAY_HEIGHT + 40),
  }
}

function buildBlobPath(
  cx: number,
  cy: number,
  radius: number,
  seed: number,
  stretchX: number,
  stretchY: number,
) {
  const totalPoints = 14
  const points: Array<{ x: number; y: number }> = []

  for (let index = 0; index < totalPoints; index += 1) {
    const angle = (index / totalPoints) * Math.PI * 2
    const noise = seededNoise(seed + index * 13)
    const wave =
      Math.sin(angle * 3 + seed * 0.0011) * 0.16 +
      Math.cos(angle * 5 - seed * 0.0017) * 0.08 +
      (noise - 0.5) * 0.2
    const localRadius = radius * (0.82 + wave)

    points.push({
      x: cx + Math.cos(angle) * localRadius * stretchX,
      y: cy + Math.sin(angle) * localRadius * stretchY,
    })
  }

  let path = `M ${points[0].x.toFixed(1)} ${points[0].y.toFixed(1)}`

  for (let index = 0; index < points.length; index += 1) {
    const previous = points[(index - 1 + points.length) % points.length]
    const current = points[index]
    const next = points[(index + 1) % points.length]
    const nextNext = points[(index + 2) % points.length]
    const tension = 0.84
    const cp1x = current.x + ((next.x - previous.x) / 6) * tension
    const cp1y = current.y + ((next.y - previous.y) / 6) * tension
    const cp2x = next.x - ((nextNext.x - current.x) / 6) * tension
    const cp2y = next.y - ((nextNext.y - current.y) / 6) * tension

    path += ` C ${cp1x.toFixed(1)} ${cp1y.toFixed(1)}, ${cp2x.toFixed(1)} ${cp2y.toFixed(1)}, ${next.x.toFixed(1)} ${next.y.toFixed(1)}`
  }

  return `${path} Z`
}

function spreadForValue(value: number, threshold: number, source?: Station['dataSource']) {
  const normalized = clamp(value / Math.max(threshold * 1.55, threshold + 28), 0, 1)
  const sourceWeight =
    source === 'official' || !source
      ? 1
      : source === 'municipal-official'
        ? 0.96
        : source === 'municipal-sensor'
          ? 0.92
          : 0.82

  return {
    normalized,
    intensity: 0.18 + normalized * 0.82,
    radius: (56 + normalized * 118) * sourceWeight,
  }
}

export function buildPollutionPlumes(
  stations: Station[],
  snapshotByStationId: Map<string, StationSnapshot>,
  pollutant: Pollutant,
  bounds: [[number, number], [number, number]],
): PollutionPlume[] {
  const overlayBounds = boundsToOverlay(bounds)
  const threshold = SCREENING_THRESHOLDS[pollutant]

  return stations
    .map((station) => {
      const snapshot = snapshotByStationId.get(station.id)

      if (!snapshot || snapshot.currentValue <= 0) {
        return null
      }

      const { normalized, intensity, radius } = spreadForValue(
        snapshot.currentValue,
        threshold,
        station.dataSource,
      )
      const seed = hashString(`${station.id}-${pollutant}`)
      const center = projectPoint(station.lat, station.lng, overlayBounds)
      const baseColor = interpolateColor(normalized)
      const ambientColor = mixHex(baseColor, '#f7efe1', 0.42)
      const bodyColor = mixHex(baseColor, '#efba78', 0.18)
      const coreColor = mixHex(baseColor, '#7e2424', 0.08)

      return {
        id: station.id,
        value: snapshot.currentValue,
        intensity,
        center,
        layers: [
          {
            id: `${station.id}-ambient`,
            variant: 'ambient',
            path: buildBlobPath(
              center.x - radius * 0.12,
              center.y + radius * 0.08,
              radius * 1.88,
              seed + 11,
              1.22,
              0.94,
            ),
            color: ambientColor,
            opacity: 0.08 + intensity * 0.05,
            duration: 12 + seededNoise(seed + 31) * 5,
            delay: seededNoise(seed + 43) * -6,
            driftX: -8 + seededNoise(seed + 59) * 16,
            driftY: -6 + seededNoise(seed + 71) * 12,
            scale: 1.03 + seededNoise(seed + 83) * 0.05,
            rotation: -4 + seededNoise(seed + 97) * 8,
          },
          {
            id: `${station.id}-body`,
            variant: 'body',
            path: buildBlobPath(
              center.x + radius * 0.05,
              center.y - radius * 0.04,
              radius * 1.18,
              seed + 113,
              1.08,
              0.9,
            ),
            color: bodyColor,
            opacity: 0.12 + intensity * 0.07,
            duration: 9 + seededNoise(seed + 127) * 4,
            delay: seededNoise(seed + 139) * -5,
            driftX: -5 + seededNoise(seed + 149) * 10,
            driftY: -4 + seededNoise(seed + 163) * 8,
            scale: 1.02 + seededNoise(seed + 173) * 0.04,
            rotation: -3 + seededNoise(seed + 181) * 6,
          },
          {
            id: `${station.id}-core`,
            variant: 'core',
            path: buildBlobPath(
              center.x,
              center.y,
              radius * 0.76,
              seed + 191,
              0.98,
              0.82,
            ),
            color: coreColor,
            opacity: 0.16 + intensity * 0.08,
            duration: 7 + seededNoise(seed + 211) * 3,
            delay: seededNoise(seed + 229) * -4,
            driftX: -3 + seededNoise(seed + 241) * 6,
            driftY: -2 + seededNoise(seed + 257) * 4,
            scale: 1.01 + seededNoise(seed + 271) * 0.03,
            rotation: -2 + seededNoise(seed + 283) * 4,
          },
        ],
      }
    })
    .filter((plume): plume is PollutionPlume => plume !== null)
}
