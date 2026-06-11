import { useMemo, useState } from 'react'
import type { Card } from '../../types/card'
import { DECK_SIZE } from '../../types/deck'
import CardFace from '../card/CardFace'

const rarityOrder = { UR: 0, SR: 1, R: 2, N: 3 } as const

interface Props {
  pool: Card[]
  confirmLabel?: string
  onConfirm: (cardIds: string[]) => void
  disabled?: boolean
}

/**
 * 手持ちプールから20枚を選ぶインライン構築UI。
 * シールド戦・ブースタードラフト用(保存APIを使わない)。
 */
export default function PoolDeckBuilder({ pool, confirmLabel, onConfirm, disabled }: Props) {
  const [selectedIdx, setSelectedIdx] = useState<number[]>([])
  const selectedSet = useMemo(() => new Set(selectedIdx), [selectedIdx])

  const sorted = useMemo(
    () =>
      pool
        .map((card, poolIdx) => ({ card, poolIdx }))
        .sort(
          (a, b) =>
            rarityOrder[a.card.rarity] - rarityOrder[b.card.rarity] ||
            (b.card.stars ?? 0) - (a.card.stars ?? 0) ||
            a.card.id.localeCompare(b.card.id),
        ),
    [pool],
  )

  const deckEntries = useMemo(
    () =>
      selectedIdx
        .map((poolIdx) => ({ card: pool[poolIdx], poolIdx }))
        .sort(
          (a, b) => (a.card.stars ?? 99) - (b.card.stars ?? 99) || a.card.id.localeCompare(b.card.id),
        ),
    [selectedIdx, pool],
  )

  return (
    <div>
      <div className="mb-3 flex items-center gap-4">
        <span className={`text-lg font-bold ${selectedIdx.length === DECK_SIZE ? 'text-emerald-400' : 'text-amber-400'}`}>
          {selectedIdx.length} / {DECK_SIZE}枚
        </span>
        <button
          onClick={() => onConfirm(selectedIdx.map((i) => pool[i].id))}
          disabled={selectedIdx.length !== DECK_SIZE || disabled}
          className="rounded bg-emerald-700 px-6 py-2 font-semibold hover:bg-emerald-600 disabled:opacity-40"
        >
          {confirmLabel ?? '確定する'}
        </button>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section>
          <h3 className="mb-1 text-sm font-semibold text-slate-300">
            手持ち({pool.length - selectedIdx.length}枚) — クリックで追加
          </h3>
          <div className="flex max-h-[55vh] flex-wrap content-start gap-2 overflow-y-auto rounded-lg bg-slate-800/50 p-3">
            {sorted.map(({ card, poolIdx }) =>
              selectedSet.has(poolIdx) ? null : (
                <CardFace
                  key={poolIdx}
                  card={card}
                  size="xs"
                  onClick={() => {
                    if (selectedIdx.length < DECK_SIZE) setSelectedIdx((prev) => [...prev, poolIdx])
                  }}
                />
              ),
            )}
          </div>
        </section>
        <section>
          <h3 className="mb-1 text-sm font-semibold text-slate-300">デッキ — クリックで戻す</h3>
          <div className="flex max-h-[55vh] min-h-32 flex-wrap content-start gap-2 overflow-y-auto rounded-lg bg-indigo-950/40 p-3 ring-1 ring-indigo-500/30">
            {deckEntries.map(({ card, poolIdx }) => (
              <CardFace
                key={poolIdx}
                card={card}
                size="xs"
                onClick={() => setSelectedIdx((prev) => prev.filter((i) => i !== poolIdx))}
              />
            ))}
          </div>
        </section>
      </div>
    </div>
  )
}
