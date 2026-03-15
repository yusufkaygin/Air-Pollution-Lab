const EARTH_RADIUS_KM = 6371

function toRadians(value: number) {
  return (value * Math.PI) / 180
}

function toDegrees(value: number) {
  return (value * 180) / Math.PI
}

export function haversineDistanceKm(
  start: { lat: number; lng: number },
  end: { lat: number; lng: number },
) {
  const dLat = toRadians(end.lat - start.lat)
  const dLng = toRadians(end.lng - start.lng)
  const lat1 = toRadians(start.lat)
  const lat2 = toRadians(end.lat)

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2)

  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(a))
}

export function bearingDegrees(
  start: { lat: number; lng: number },
  end: { lat: number; lng: number },
) {
  const lat1 = toRadians(start.lat)
  const lat2 = toRadians(end.lat)
  const dLng = toRadians(end.lng - start.lng)

  const y = Math.sin(dLng) * Math.cos(lat2)
  const x =
    Math.cos(lat1) * Math.sin(lat2) -
    Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng)

  return (toDegrees(Math.atan2(y, x)) + 360) % 360
}

export function angularDifference(a: number, b: number) {
  const raw = Math.abs(a - b) % 360
  return raw > 180 ? 360 - raw : raw
}
