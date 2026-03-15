import { useEffect, useState } from 'react'

import type { BursaDataset } from '../types'

interface DatasetState {
  data: BursaDataset | null
  loading: boolean
  error: string | null
}

const DATA_URL = '/data/bursa-air-quality-v1.json'

export function useDataset(): DatasetState {
  const [state, setState] = useState<DatasetState>({
    data: null,
    loading: true,
    error: null,
  })

  useEffect(() => {
    const controller = new AbortController()

    async function loadDataset() {
      try {
        const response = await fetch(DATA_URL, { signal: controller.signal })

        if (!response.ok) {
          throw new Error(`Dataset request failed: ${response.status}`)
        }

        const data = (await response.json()) as BursaDataset

        setState({
          data,
          loading: false,
          error: null,
        })
      } catch (error) {
        if (controller.signal.aborted) {
          return
        }

        setState({
          data: null,
          loading: false,
          error:
            error instanceof Error
              ? error.message
              : 'Dataset could not be loaded.',
        })
      }
    }

    void loadDataset()

    return () => controller.abort()
  }, [])

  return state
}
