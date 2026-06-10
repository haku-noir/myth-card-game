import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { fetchDecks, deleteDeck } from '../../api/decks'
import type { SavedDeck } from '../../types/deck'
import { MAX_DECKS } from '../../types/deck'
import { cardById } from '../../data/cards'
import CardFace from '../../components/card/CardFace'
import Modal from '../../components/common/Modal'

function DeckSummaryRow({ deck }: { deck: SavedDeck }) {
  const summary = useMemo(() => {
    const rarity: Record<string, number> = {}
    const stars: Record<number, number> = {}
    for (const id of deck.cardIds) {
      const card = cardById(id)
      if (!card) continue
      rarity[card.rarity] = (rarity[card.rarity] ?? 0) + 1
      if (card.stars) stars[card.stars] = (stars[card.stars] ?? 0) + 1
    }
    return { rarity, stars }
  }, [deck.cardIds])

  return (
    <div className="space-y-1 text-sm text-slate-400">
      <p>
        {Object.entries(summary.stars)
          .sort(([a], [b]) => Number(a) - Number(b))
          .map(([s, n]) => `★${s}×${n}`)
          .join(' ')}
      </p>
      <p>{['N', 'R', 'SR', 'UR'].filter((r) => summary.rarity[r]).map((r) => `${r}:${summary.rarity[r]}`).join(' / ')}</p>
    </div>
  )
}

export default function MyDecks() {
  const navigate = useNavigate()
  const [decks, setDecks] = useState<SavedDeck[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [preview, setPreview] = useState<SavedDeck | null>(null)
  const [deleting, setDeleting] = useState<SavedDeck | null>(null)

  useEffect(() => {
    fetchDecks()
      .then(setDecks)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  const handleDelete = async () => {
    if (!deleting) return
    try {
      await deleteDeck(deleting.id)
      setDecks((prev) => prev.filter((d) => d.id !== deleting.id))
      setDeleting(null)
    } catch (e) {
      setError((e as Error).message)
    }
  }

  return (
    <div className="mx-auto max-w-3xl p-6">
      <div className="mb-6 flex items-center gap-4">
        <Link to="/" className="text-slate-400 hover:text-white">← ホーム</Link>
        <h1 className="text-2xl font-bold">マイデッキ</h1>
        <span className="text-sm text-slate-400">{decks.length} / {MAX_DECKS}</span>
        <button
          onClick={() => navigate('/pack-opening')}
          disabled={decks.length >= MAX_DECKS}
          className="ml-auto rounded bg-indigo-600 px-4 py-2 text-sm font-semibold hover:bg-indigo-500 disabled:opacity-40"
        >
          + 新規作成(パック開封へ)
        </button>
      </div>

      {error && <p className="mb-4 rounded bg-red-900/50 p-3 text-red-300">{error}</p>}
      {loading && <p className="text-slate-400">読み込み中...</p>}
      {!loading && decks.length === 0 && (
        <p className="text-slate-400">
          保存されたデッキはありません。パックを開封してデッキを作成しましょう。
        </p>
      )}

      <div className="space-y-4">
        {decks.map((deck) => (
          <div key={deck.id} className="rounded-lg bg-slate-800 p-4">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-lg font-semibold">{deck.name}</h2>
              <span className="text-xs text-slate-500">
                更新: {new Date(deck.updatedAt).toLocaleDateString('ja-JP')}
              </span>
            </div>
            <DeckSummaryRow deck={deck} />
            <div className="mt-3 flex gap-2">
              <button
                onClick={() => navigate(`/game?mode=cpu&deckId=${deck.id}`)}
                className="rounded bg-emerald-700 px-4 py-1.5 text-sm hover:bg-emerald-600"
              >
                このデッキで対戦
              </button>
              <button
                onClick={() => setPreview(deck)}
                className="rounded bg-slate-700 px-4 py-1.5 text-sm hover:bg-slate-600"
              >
                中身を見る
              </button>
              <button
                onClick={() => navigate(`/deck-builder?deckId=${deck.id}`)}
                className="rounded bg-slate-700 px-4 py-1.5 text-sm hover:bg-slate-600"
              >
                編集
              </button>
              <button
                onClick={() => setDeleting(deck)}
                className="ml-auto rounded bg-red-900 px-4 py-1.5 text-sm hover:bg-red-800"
              >
                削除
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* デッキ内容プレビュー */}
      <Modal open={!!preview} onClose={() => setPreview(null)}>
        {preview && (
          <div className="max-w-2xl">
            <h2 className="mb-4 text-lg font-bold">{preview.name}(20枚)</h2>
            <div className="flex flex-wrap gap-2">
              {preview.cardIds.map((id, i) => {
                const card = cardById(id)
                return card ? <CardFace key={`${id}-${i}`} card={card} /> : null
              })}
            </div>
          </div>
        )}
      </Modal>

      {/* 削除確認 */}
      <Modal open={!!deleting} onClose={() => setDeleting(null)}>
        <p className="mb-4">「{deleting?.name}」を削除しますか？</p>
        <div className="flex justify-end gap-2">
          <button onClick={() => setDeleting(null)} className="rounded bg-slate-700 px-4 py-2 text-sm">
            キャンセル
          </button>
          <button onClick={handleDelete} className="rounded bg-red-700 px-4 py-2 text-sm">
            削除する
          </button>
        </div>
      </Modal>
    </div>
  )
}
