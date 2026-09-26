import type { AcquiredVia } from '~/domain/url'

const dateTimeFormat = new Intl.DateTimeFormat('ja-JP', {
  timeZone: 'Asia/Tokyo',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
})

export function sourceDateTime(timestamp: number | null): { label: string; dateTime: string } | null {
  if (timestamp === null || !Number.isFinite(timestamp)) return null
  const date = new Date(timestamp)
  if (Number.isNaN(date.getTime())) return null
  return { label: `${dateTimeFormat.format(date)} JST`, dateTime: date.toISOString() }
}

export function sourceBodyDateLabel(acquiredVia: AcquiredVia): string {
  switch (acquiredVia) {
    case 'fetch': return '本文の取得日時'
    case 'paste': return '本文の貼付日時'
    case 'upload': return '本文の抽出日時'
  }
}
