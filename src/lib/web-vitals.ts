import { onCLS, onFCP, onINP, onLCP, onTTFB, type Metric } from 'web-vitals'

export type WebVitalName = Metric['name']

export type WebVitalReport = {
  name: WebVitalName
  value: number
  id: string
  rating: Metric['rating']
}

declare global {
  interface Window {
    __scrapbookWebVitals?: WebVitalReport[]
  }
}

function reportMetric(metric: Metric) {
  const entry: WebVitalReport = {
    name: metric.name,
    value: metric.value,
    id: metric.id,
    rating: metric.rating,
  }
  if (typeof window !== 'undefined') {
    const bag = window.__scrapbookWebVitals ?? []
    bag.push(entry)
    window.__scrapbookWebVitals = bag
  }
  if (import.meta.env.DEV) {
    console.debug('[web-vitals]', entry.name, entry.value, entry.rating, entry.id)
  }
}

/** Subscribe once per page load to Core Web Vitals reporters. */
export function startWebVitalsReporting() {
  onCLS(reportMetric)
  onINP(reportMetric)
  onLCP(reportMetric)
  onFCP(reportMetric)
  onTTFB(reportMetric)
}
