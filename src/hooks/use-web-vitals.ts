import { useEffect } from 'react'
import { startWebVitalsReporting } from '~/lib/web-vitals'

/** Mounts Core Web Vitals reporters after hydration. */
export function useWebVitalsReporting() {
  useEffect(() => {
    startWebVitalsReporting()
  }, [])
}
