import { startTransition, useEffect, useState } from 'react'

import type { FilterState, MapLayerBundle } from '../types'
import { loadMapLayers } from '../utils/datasetLoader'

const INITIAL_LAYERS: Partial<MapLayerBundle> = {}

export function useMapLayers(activeLayers: FilterState['activeLayers']) {
  const [layers, setLayers] = useState<Partial<MapLayerBundle>>(INITIAL_LAYERS)
  const {
    elevation,
    greenAreas,
    industries,
    roads,
  } = activeLayers

  useEffect(() => {
    let cancelled = false

    async function load() {
      try {
        const payload = await loadMapLayers({
          elevation,
          greenAreas,
          industries,
          roads,
        })
        if (cancelled) {
          return
        }

        startTransition(() => {
          setLayers((current) => ({
            ...current,
            ...payload,
          }))
        })
      } catch {
        if (cancelled) {
          return
        }
      }
    }

    void load()

    return () => {
      cancelled = true
    }
  }, [elevation, greenAreas, industries, roads])

  return layers
}
