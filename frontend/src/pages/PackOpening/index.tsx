import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { openPacks, type OpenedPack } from '../../api/packs'
import type { Card } from '../../types/card'
import CardFace from '../../components/card/CardFace'
import { useDeckBuildStore } from '../../store/deckBuildStore'

const PACK_COUNT = 4

const rarityOrder = { UR: 0, SR: 1, R: 2, N: 3 } as const

export default function PackOpening() {
  const navigate = useNavigate()
  const setPool = useDeckBuildStore((s) => s.setPool)

  const [packs, setPacks] = useState<OpenedPack[] | null>(null)
  const [error, setError] = useState('')
  // openedCount: 開封済みパック数 / revealed: 現在のパックがめくられたか
  const [openedCount, setOpenedCount] = useState(0)
  const [revealed, setRevealed] = useState(false)

  useEffect(() => {
    openPacks(PACK_COUNT)
      .then(setPacks)
      .catch((e: Error) => setError(e.message))
  }, [])

  const allCards = useMemo(() => packs?.flatMap((p) => p.cards) ?? [], [packs])
  const finished = openedCount >= PACK_COUNT

  const summarySorted = useMemo(
    () =>
      [...allCards].sort(
        (a, b) =>
          rarityOrder[a.rarity] - rarityOrder[b.rarity] ||
          (a.stars ?? 0) - (b.stars ?? 0) ||
          a.id.localeCompare(b.id),
      ),
    [allCards],
  )

  const goToBuilder = () => {
    setPool(allCards)
    navigate('/deck-builder')
  }

  if (error) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4">
        <p className="text-red-400">{error}</p>
        <Link to="/" className="text-slate-400 hover:text-white">← ホームへ戻る</Link>
      </div>
    )
  }

  if (!packs) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-slate-400">パックを準備中...</p>
      </div>
    )
  }

  // 全パック開封後のサマリー表示
  if (finished) {
    return (
      <div className="mx-auto max-w-5xl p-6">
        <h1 className="mb-2 text-2xl font-bold">開封結果(全{allCards.length}枚)</h1>
        <p className="mb-6 text-sm text-slate-400">
          この中からちょうど20枚を選んでデッキを構築します
        </p>
        <div className="mb-8 flex flex-wrap gap-3">
          {summarySorted.map((card, i) => (
            <div key={`${card.id}-${i}`} className="animate-card-reveal" style={{ animationDelay: `${i * 30}ms` }}>
              <CardFace card={card} />
            </div>
          ))}
        </div>
        <button
          onClick={goToBuilder}
          className="rounded-lg bg-indigo-600 px-8 py-3 text-lg font-semibold hover:bg-indigo-500"
        >
          デッキを構築する
        </button>
      </div>
    )
  }

  const currentPack = packs[openedCount]

  return (
    <div className="mx-auto flex min-h-screen max-w-5xl flex-col items-center justify-center gap-8 p-6">
      <div className="flex items-center gap-4">
        <h1 className="text-2xl font-bold">パック開封</h1>
        <span className="text-slate-400">{openedCount + 1} / {PACK_COUNT}パック目</span>
      </div>

      {!revealed ? (
        <>
          {/* 未開封パック */}
          <button
            onClick={() => setRevealed(true)}
            className="flex h-72 w-52 flex-col items-center justify-center gap-3 rounded-xl border-4 border-amber-500/60 bg-gradient-to-b from-indigo-800 to-slate-900 shadow-xl transition hover:scale-105 hover:border-amber-400"
          >
            <span className="text-5xl">🎴</span>
            <span className="text-lg font-bold">第{openedCount + 1}パック</span>
            <span className="text-xs text-slate-300">クリックで開封</span>
          </button>
          <button
            onClick={() => setOpenedCount(PACK_COUNT)}
            className="text-sm text-slate-400 underline hover:text-white"
          >
            演出をスキップしてすべて開封
          </button>
        </>
      ) : (
        <>
          {/* 開封演出: 1枚ずつ時間差で表示 */}
          <div className="flex max-w-3xl flex-wrap justify-center gap-3">
            {currentPack.cards.map((card: Card, i: number) => (
              <div key={`${card.id}-${i}`} className="animate-card-reveal" style={{ animationDelay: `${i * 180}ms` }}>
                <CardFace card={card} />
              </div>
            ))}
          </div>
          <button
            onClick={() => {
              setOpenedCount((n) => n + 1)
              setRevealed(false)
            }}
            className="rounded-lg bg-indigo-600 px-6 py-2.5 font-semibold hover:bg-indigo-500"
          >
            {openedCount + 1 < PACK_COUNT ? '次のパックへ' : '開封結果を見る'}
          </button>
        </>
      )}

      <Link to="/" className="text-sm text-slate-500 hover:text-white">← ホームへ戻る</Link>
    </div>
  )
}
