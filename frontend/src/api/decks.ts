import type { SavedDeck } from '../types/deck'

async function handle<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error((body as { error?: string }).error ?? `APIエラー (${res.status})`)
  }
  return res.status === 204 ? (undefined as T) : ((await res.json()) as T)
}

export const fetchDecks = () =>
  fetch('/api/decks').then((r) => handle<SavedDeck[]>(r))

export const createDeck = (name: string, cardIds: string[]) =>
  fetch('/api/decks', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, cardIds }),
  }).then((r) => handle<SavedDeck>(r))

export const updateDeck = (id: number, name: string, cardIds: string[]) =>
  fetch(`/api/decks/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, cardIds }),
  }).then((r) => handle<SavedDeck>(r))

export const deleteDeck = (id: number) =>
  fetch(`/api/decks/${id}`, { method: 'DELETE' }).then((r) => handle<void>(r))
