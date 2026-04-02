import { startTransition, useEffect, useMemo, useState } from 'react'

import type {
  AnalysisManifest,
  BursaDataset,
  FilterState,
  SpatialAnalysisPackage,
} from '../types'
import {
  loadAnalysisManifest,
  loadSpatialAnalysisPackage,
  resolveSpatialAnalysis,
} from '../utils/spatialAnalysis'

interface SpatialAnalysisState {
  manifest: AnalysisManifest | null
  packageData: SpatialAnalysisPackage | null
  error: string | null
}

const INITIAL_STATE: SpatialAnalysisState = {
  manifest: null,
  packageData: null,
  error: null,
}

export function useSpatialAnalysis(
  dataset: BursaDataset | null,
  filters: FilterState,
  enabled: boolean,
) {
  const [state, setState] = useState<SpatialAnalysisState>(INITIAL_STATE)

  useEffect(() => {
    if (!enabled || !dataset) {
      return
    }

    const controller = new AbortController()

    async function load() {
      try {
        const manifest = await loadAnalysisManifest(controller.signal)
        const packageData = await loadSpatialAnalysisPackage(
          manifest,
          filters.pollutant,
          controller.signal,
        )

        if (controller.signal.aborted) {
          return
        }

        startTransition(() => {
          setState({
            manifest,
            packageData,
            error: null,
          })
        })
      } catch (error) {
        if (controller.signal.aborted) {
          return
        }

        const message =
          error instanceof Error ? error.message : 'Mekansal analiz paketi yuklenemedi.'

        startTransition(() => {
          setState({
            manifest: null,
            packageData: null,
            error: message,
          })
        })
      }
    }

    void load()

    return () => controller.abort()
  }, [dataset, enabled, filters.pollutant])

  return useMemo(() => {
    if (!dataset || !enabled) {
      return {
        ...INITIAL_STATE,
        surface: null,
        stats: null,
        risk: null,
        sourceSummary: null,
        forecast: null,
        loading: false,
        notices: [],
        unsupportedReason: null,
      }
    }

    const resolved = resolveSpatialAnalysis(
      dataset,
      filters,
      state.manifest,
      state.packageData,
    )

    return {
      manifest: state.manifest,
      packageData: state.packageData,
      loading:
        !state.error &&
        (!state.manifest ||
          !state.packageData ||
          state.packageData.pollutant !== filters.pollutant),
      error: state.error,
      surface: resolved.surface,
      stats: resolved.stats,
      risk: resolved.risk,
      sourceSummary: resolved.sourceSummary,
      forecast: resolved.forecast,
      notices: resolved.notices,
      unsupportedReason: resolved.unsupportedReason,
    }
  }, [dataset, enabled, filters, state.error, state.manifest, state.packageData])
}
