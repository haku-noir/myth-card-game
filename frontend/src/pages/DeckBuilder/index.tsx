import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { createDeck, updateDeck, fetchDeck } from '../../api/decks'
import { cardById } from '../../data/cards'
import { buildDeckIndices } from '../../engine/cpuDeck'
import type { Card } from '../../types/card'
import { DECK_SIZE } from '../../types/deck'
import CardFace from '../../components/card/CardFace'
import Modal from '../../components/common/Modal'
import { useDeckBuildStore } from '../../store/deckBuildStore'

type SortKey = 'rarity' | 'stars' | 'id'

const rarityOrder = { UR: 0, SR: 1, R: 2, N: 3 } as const

interface PoolEntry {
  card: Card
  poolIdx: number // プール内の通し番号(同名カードを区別する)
}

export default function DeckBuilder() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const editDeckId = params.get('deckId') ? Number(params.get('deckId')) : null

  const clearStore = useDeckBuildStore((s) => s.clear)

  // ストアのプールはマウント時に1回だけ取り込む(保存後にclearしても画面が消えないように)
  const [pool, setPoolState] = useState<Card[]>(() =>
    editDeckId ? [] : useDeckBuildStore.getState().pool,
  )
  const [selectedIdx, setSelectedIdx] = useState<number[]>([]) // poolへのインデックス
  const [deckName, setDeckName] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('rarity')
  const [loading, setLoading] = useState(!!editDeckId)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [savedId, setSavedId] = useState<number | null>(null)

  // 編集モードはサーバーからプールとデッキを復元する
  useEffect(() => {
    if (editDeckId) {
      fetchDeck(editDeckId)
        .then((deck) => {
          const poolIds = deck.poolCardIds ?? deck.cardIds
          const cards = poolIds.map((id) => cardById(id)).filter((c): c is Card => !!c)
          setPoolState(cards)
          setDeckName(deck.name)
          // デッキの各カードをプール内の未使用エントリに割り当てる
          const used = new Set<number>()
          const indices: number[] = []
          for (const id of deck.cardIds) {
            const idx = cards.findIndex((c, i) => c.id === id && !used.has(i))
            if (idx >= 0) {
              used.add(idx)
              indices.push(idx)
            }
          }
          setSelectedIdx(indices)
        })
        .catch((e: Error) => setError(e.message))
        .finally(() => setLoading(false))
    }
  }, [editDeckId])

  const selectedSet = useMemo(() => new Set(selectedIdx), [selectedIdx])

  const sortedPool = useMemo(() => {
    const entries: PoolEntry[] = pool.map((card, poolIdx) => ({ card, poolIdx }))
    const cmp: Record<SortKey, (a: PoolEntry, b: PoolEntry) => number> = {
      rarity: (a, b) =>
        rarityOrder[a.card.rarity] - rarityOrder[b.card.rarity] ||
        (b.card.stars ?? 0) - (a.card.stars ?? 0) ||
        a.card.id.localeCompare(b.card.id),
      stars: (a, b) => (b.card.stars ?? 0) - (a.card.stars ?? 0) || a.card.id.localeCompare(b.card.id),
      id: (a, b) => a.card.id.localeCompare(b.card.id),
    }
    return entries.sort(cmp[sortKey])
  }, [pool, sortKey])

  const deckEntries = useMemo(
    () =>
      selectedIdx
        .map((poolIdx) => ({ card: pool[poolIdx], poolIdx }))
        .filter((e) => e.card)
        .sort(
          (a, b) =>
            (a.card.stars ?? 99) - (b.card.stars ?? 99) ||
            a.card.id.localeCompare(b.card.id),
        ),
    [selectedIdx, pool],
  )

  const addCard = (poolIdx: number) => {
    if (selectedSet.has(poolIdx) || selectedIdx.length >= DECK_SIZE) return
    setSelectedIdx((prev) => [...prev, poolIdx])
  }

  const removeCard = (poolIdx: number) => {
    setSelectedIdx((prev) => prev.filter((i) => i !== poolIdx))
  }

  // CPUのデッキ構築ロジックで20枚を自動選択する
  const autoBuild = () => {
    setSelectedIdx(buildDeckIndices(pool))
  }

  const handleSave = async () => {
    setSaving(true)
    setError('')
    try {
      const cardIds = selectedIdx.map((i) => pool[i].id)
      const poolIds = pool.map((c) => c.id)
      const name = deckName.trim() || `デッキ ${new Date().toLocaleDateString('ja-JP')}`
      const saved = editDeckId
        ? await updateDeck(editDeckId, name, cardIds, poolIds)
        : await createDeck(name, cardIds, poolIds)
      clearStore()
      setSavedId(saved.id)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return <div className="flex min-h-screen items-center justify-center text-slate-400">読み込み中...</div>
  }

  if (pool.length === 0) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4">
        <p className="text-slate-400">手持ちカードがありません。パックを開封してください。</p>
        <Link to="/pack-opening" className="rounded bg-indigo-600 px-6 py-2 hover:bg-indigo-500">
          パック開封へ
        </Link>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-7xl p-4">
      <div className="mb-4 flex flex-wrap items-center gap-4">
        <Link to="/" className="text-slate-400 hover:text-white">← ホーム</Link>
        <h1 className="text-xl font-bold">{editDeckId ? 'デッキ編集' : 'デッキ構築'}</h1>
        <input
          className="rounded bg-slate-800 px-3 py-2 text-sm"
          placeholder="デッキ名(省略可)"
          value={deckName}
          onChange={(e) => setDeckName(e.target.value)}
        />
        <span className={`text-lg font-bold ${selectedIdx.length === DECK_SIZE ? 'text-emerald-400' : 'text-amber-400'}`}>
          {selectedIdx.length} / {DECK_SIZE}枚
        </span>
        <button
          onClick={autoBuild}
          className="rounded bg-indigo-700 px-4 py-2 text-sm font-semibold hover:bg-indigo-600"
        >
          おまかせ構築
        </button>
        <button
          onClick={handleSave}
          disabled={selectedIdx.length !== DECK_SIZE || saving}
          className="ml-auto rounded bg-emerald-700 px-6 py-2 font-semibold hover:bg-emerald-600 disabled:opacity-40"
        >
          {saving ? '保存中...' : '保存して確定する'}
        </button>
      </div>

      {error && <p className="mb-4 rounded bg-red-900/50 p-3 text-sm text-red-300">{error}</p>}

      <div className="grid gap-6 lg:grid-cols-2">
        {/* 手持ちカード */}
        <section>
          <div className="mb-2 flex items-center gap-3">
            <h2 className="font-semibold">手持ちカード({pool.length - selectedIdx.length}枚)</h2>
            <select
              className="rounded bg-slate-800 px-2 py-1 text-xs"
              value={sortKey}
              onChange={(e) => setSortKey(e.target.value as SortKey)}
            >
              <option value="rarity">レアリティ順</option>
              <option value="stars">星順</option>
              <option value="id">No.順</option>
            </select>
            <span className="text-xs text-slate-500">クリックでデッキに追加</span>
          </div>
          <div className="flex max-h-[70vh] flex-wrap content-start gap-2 overflow-y-auto rounded-lg bg-slate-800/50 p-3">
            {sortedPool.map(({ card, poolIdx }) =>
              selectedSet.has(poolIdx) ? null : (
                <CardFace key={poolIdx} card={card} onClick={() => addCard(poolIdx)} />
              ),
            )}
          </div>
        </section>

        {/* デッキ */}
        <section>
          <div className="mb-2 flex items-center gap-3">
            <h2 className="font-semibold">デッキ</h2>
            <span className="text-xs text-slate-500">クリックで手持ちに戻す</span>
          </div>
          <div className="flex max-h-[70vh] min-h-44 flex-wrap content-start gap-2 overflow-y-auto rounded-lg bg-indigo-950/40 p-3 ring-1 ring-indigo-500/30">
            {deckEntries.map(({ card, poolIdx }) => (
              <CardFace key={poolIdx} card={card} onClick={() => removeCard(poolIdx)} />
            ))}
            {deckEntries.length === 0 && (
              <p className="p-4 text-sm text-slate-500">左の手持ちカードをクリックして20枚選んでください</p>
            )}
          </div>
        </section>
      </div>

      {/* 保存完了 */}
      <Modal open={savedId !== null} onClose={() => navigate('/my-decks')}>
        <p className="mb-4 text-lg font-semibold">デッキを保存しました</p>
        <div className="flex gap-3">
          <button
            onClick={() => navigate(`/game?mode=cpu&deckId=${savedId}`)}
            className="rounded bg-emerald-700 px-5 py-2 hover:bg-emerald-600"
          >
            このデッキでCPU戦
          </button>
          <button
            onClick={() => navigate('/my-decks')}
            className="rounded bg-slate-700 px-5 py-2 hover:bg-slate-600"
          >
            マイデッキへ
          </button>
        </div>
      </Modal>
    </div>
  )
}
