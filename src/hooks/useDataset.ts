import { startTransition, useEffect, useState } from 'react'

import type { BursaDataset, Pollutant } from '../types'
import { loadBaseDataset, loadDatasetMeteo } from '../utils/datasetLoader'

interface DatasetState {
  data: BursaDataset | null
  loading: boolean
  error: string | null
}

export function useDataset(pollutant: Pollutant): DatasetState {
  const [state, setState] = useState<DatasetState>({
    data: null,
    loading: true,
    error: null,
  })

  useEffect(() => {
    let cancelled = false

    startTransition(() => {
      setState((current) => ({
        data: current.data,
        loading: current.data === null,
        error: null,
      }))
    })

    async function loadDataset() {
      try {
        const baseData = await loadBaseDataset(pollutant, { includeMeteo: false })

        if (cancelled) {
          return
        }

        startTransition(() => {
          setState((current) => ({
            data: {
              ...baseData,
              meteoTimeSeries:
                current.data?.metadata.version === baseData.metadata.version
                  ? current.data.meteoTimeSeries
                  : baseData.meteoTimeSeries,
            },
            loading: false,
            error: null,
          }))
        })

        if (baseData.meteoTimeSeries.length > 0) {
          return
        }

        const meteoTimeSeries = await loadDatasetMeteo()

        if (cancelled) {
          return
        }

        startTransition(() => {
          setState((current) => {
            if (!current.data || current.data.metadata.version !== baseData.metadata.version) {
              return current
            }

            return {
              data: {
                ...current.data,
                meteoTimeSeries,
              },
              loading: false,
              error: null,
            }
          })
        })
      } catch (error) {
        if (cancelled) {
          return
        }

        const message =
          error instanceof Error ? error.message : 'Dataset could not be loaded.'

        startTransition(() => {
          setState((current) => ({
            data: current.data,
            loading: false,
            error: current.data ? null : message,
          }))
        })
      }
    }

    void loadDataset()

    return () => {
      cancelled = true
    }
  }, [pollutant])

  return state
}
