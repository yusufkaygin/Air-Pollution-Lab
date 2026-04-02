import { describe, expect, it } from 'vitest'

import type { Station } from '../types'
import { matchesStationFilters, matchesStationScope } from './stations'

const station: Station = {
  id: 'bbb-kent-meydani',
  name: 'Kent Meydani',
  district: 'Osmangazi',
  stationType: 'municipal-official',
  lat: 40.19,
  lng: 29.06,
  elevationM: 100,
  pollutants: ['PM10', 'PM2.5', 'CO'],
  dataSource: 'municipal-official',
}

describe('stations utilities', () => {
  it('matches the municipal-official scope', () => {
    expect(matchesStationScope(station, 'municipal-official')).toBe(true)
    expect(matchesStationScope(station, 'official')).toBe(false)
  })

  it('filters out unsupported pollutants', () => {
    expect(matchesStationFilters(station, 'municipal-official', 'CO')).toBe(true)
    expect(matchesStationFilters(station, 'municipal-official', 'NO2')).toBe(false)
  })
})
