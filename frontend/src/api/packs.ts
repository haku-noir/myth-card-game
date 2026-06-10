import type { Card } from '../types/card'

export interface OpenedPack {
  packIndex: number
  cards: Card[]
}

export async function openPacks(count = 4): Promise<OpenedPack[]> {
  const res = await fetch('/api/packs/open', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ count }),
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error((body as { error?: string }).error ?? `APIエラー (${res.status})`)
  }
  return res.json()
}
