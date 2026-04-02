import type { Pollutant, Station, StationSourceScope } from '../types'

export function matchesStationScope(
  station: Station,
  scope: StationSourceScope,
) {
  if (scope === 'all') {
    return true
  }

  if (scope === 'official') {
    return station.dataSource === 'official' || !station.dataSource
  }

  if (scope === 'municipal-official') {
    return station.dataSource === 'municipal-official'
  }

  if (scope === 'sensor') {
    return station.dataSource === 'municipal-sensor'
  }

  return station.dataSource === 'modeled'
}

export function supportsStationPollutant(
  station: Station,
  pollutant: Pollutant,
) {
  return station.pollutants.includes(pollutant)
}

export function matchesStationFilters(
  station: Station,
  scope: StationSourceScope,
  pollutant: Pollutant,
) {
  return matchesStationScope(station, scope) && supportsStationPollutant(station, pollutant)
}

export function stationSourceBadge(station: Station) {
  if (station.dataSource === 'municipal-official') {
    return 'Resmi belediye'
  }

  if (station.dataSource === 'municipal-sensor') {
    return 'Sensör ağı'
  }

  if (station.dataSource === 'modeled') {
    return 'Model'
  }

  return 'Resmî'
}
