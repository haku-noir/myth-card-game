import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { CARDS } from '../../data/cards'
import type { Card, CardType, Rarity } from '../../types/card'
import CardFace from '../../components/card/CardFace'
import Modal from '../../components/common/Modal'

type SortKey = 'id' | 'stars' | 'atk' | 'def'

const rarities: Rarity[] = ['N', 'R', 'SR', 'UR']
const types: { value: CardType; label: string }[] = [
  { value: 'monster', label: 'モンスター' },
  { value: 'magic', label: '魔法' },
  { value: 'trap', label: '罠' },
]
const sortOptions: { value: SortKey; label: string }[] = [
  { value: 'id', label: 'No.順' },
  { value: 'stars', label: '星順' },
  { value: 'atk', label: '攻撃力順' },
  { value: 'def', label: '守備力順' },
]

export default function CardList() {
  const [rarity, setRarity] = useState<Rarity | ''>('')
  const [type, setType] = useState<CardType | ''>('')
  const [stars, setStars] = useState<number | ''>('')
  const [keyword, setKeyword] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('id')
  const [selected, setSelected] = useState<Card | null>(null)

  const filtered = useMemo(() => {
    const list = CARDS.filter(
      (c) =>
        (!rarity || c.rarity === rarity) &&
        (!type || c.type === type) &&
        (stars === '' || c.stars === stars) &&
        (!keyword || c.name.includes(keyword) || c.effectText.includes(keyword)),
    )
    if (sortKey === 'id') return list
    return [...list].sort((a, b) => (b[sortKey] ?? -1) - (a[sortKey] ?? -1))
  }, [rarity, type, stars, keyword, sortKey])

  const selectClass = 'rounded bg-slate-800 px-3 py-2 text-sm'

  return (
    <div className="mx-auto max-w-6xl p-6">
      <div className="mb-6 flex items-center gap-4">
        <Link to="/" className="text-slate-400 hover:text-white">← ホーム</Link>
        <h1 className="text-2xl font-bold">カード一覧</h1>
        <span className="text-sm text-slate-400">{filtered.length} / {CARDS.length}種</span>
      </div>

      <div className="mb-6 flex flex-wrap gap-3">
        <select className={selectClass} value={rarity} onChange={(e) => setRarity(e.target.value as Rarity | '')}>
          <option value="">レアリティ: 全て</option>
          {rarities.map((r) => <option key={r} value={r}>{r}</option>)}
        </select>
        <select className={selectClass} value={type} onChange={(e) => setType(e.target.value as CardType | '')}>
          <option value="">種別: 全て</option>
          {types.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
        <select className={selectClass} value={stars} onChange={(e) => setStars(e.target.value === '' ? '' : Number(e.target.value))}>
          <option value="">星: 全て</option>
          {[1, 2, 3, 4, 5, 6, 7, 8].map((s) => <option key={s} value={s}>★{s}</option>)}
        </select>
        <select className={selectClass} value={sortKey} onChange={(e) => setSortKey(e.target.value as SortKey)}>
          {sortOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <input
          className="rounded bg-slate-800 px-3 py-2 text-sm"
          placeholder="カード名・効果で検索"
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
        />
      </div>

      <div className="flex flex-wrap gap-3">
        {filtered.map((card) => (
          <CardFace key={card.id} card={card} onClick={() => setSelected(card)} />
        ))}
        {filtered.length === 0 && (
          <p className="text-slate-400">条件に合うカードがありません</p>
        )}
      </div>

      <Modal open={!!selected} onClose={() => setSelected(null)}>
        {selected && (
          <div className="flex gap-6">
            <CardFace card={selected} size="md" />
            <div className="max-w-xs">
              <p className="mb-1 text-sm text-slate-400">{selected.id} / {selected.rarity}</p>
              <h2 className="mb-2 text-xl font-bold">{selected.name}</h2>
              {selected.type === 'monster' ? (
                <dl className="mb-3 space-y-1 text-sm">
                  <div className="flex justify-between"><dt>星</dt><dd className="text-amber-300">{'★'.repeat(selected.stars ?? 0)}</dd></div>
                  <div className="flex justify-between"><dt>攻撃力</dt><dd className="font-mono">{selected.atk}</dd></div>
                  <div className="flex justify-between"><dt>守備力</dt><dd className="font-mono">{selected.def}</dd></div>
                </dl>
              ) : (
                <p className="mb-3 text-sm text-emerald-300">
                  {selected.type === 'magic' ? '魔法カード' : '罠カード'}
                </p>
              )}
              <p className="text-sm leading-relaxed">
                {selected.effectText || '効果なし(バニラ)'}
              </p>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
