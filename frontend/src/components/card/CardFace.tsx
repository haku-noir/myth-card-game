import { useState } from 'react'
import type { Card } from '../../types/card'

// 背景色はカード種別で色分け(モンスター=茶 / 魔法=緑 / 罠=紫)
const typeBg: Record<Card['type'], string> = {
  monster: 'bg-amber-900',
  magic: 'bg-emerald-900',
  trap: 'bg-fuchsia-950',
}

// レア度は右上バッジの色で表現
const rarityBadge: Record<Card['rarity'], string> = {
  N: 'bg-gray-500 text-white',
  R: 'bg-blue-600 text-white',
  SR: 'bg-purple-600 text-white',
  UR: 'bg-amber-400 text-black',
}

const typeLabel: Record<Card['type'], string> = {
  monster: 'モンスター',
  magic: '魔法',
  trap: '罠',
}

interface Props {
  card: Card
  onClick?: () => void
  /** xs: フィールド用 / sm: 一覧グリッド用 / md: 詳細・手札用 */
  size?: 'xs' | 'sm' | 'md'
}

/**
 * カード表面。public/images/cards/{id}.png があれば画像を表示し、
 * なければ種別色のプレースホルダーにフォールバックする。
 * 効果テキストは省略せず全文表示する(カードは下方向に伸びる)。
 */
export default function CardFace({ card, onClick, size = 'sm' }: Props) {
  const [hasImage, setHasImage] = useState(true)
  const sizeClass =
    size === 'xs'
      ? 'w-20 min-h-28 text-[9px]'
      : size === 'sm'
        ? 'w-28 min-h-40 text-xs'
        : 'w-44 min-h-64 text-sm'
  const effectClass =
    size === 'xs' ? 'text-[8px]' : size === 'sm' ? 'text-[10px]' : 'text-xs'

  return (
    <div
      onClick={onClick}
      className={`${sizeClass} ${typeBg[card.type]} relative flex cursor-pointer flex-col overflow-hidden rounded-lg p-1.5 shadow transition hover:scale-105 hover:shadow-lg`}
    >
      {hasImage && (
        <img
          src={`/images/cards/${card.id}.png`}
          alt={card.name}
          onError={() => setHasImage(false)}
          className="absolute inset-0 h-full w-full object-cover"
        />
      )}
      {/* 画像の有無に関わらず情報をオーバーレイ表示 */}
      <div className="relative z-10 flex h-full flex-1 flex-col rounded bg-black/40 p-1.5">
        <div className="flex items-start justify-between gap-1">
          <span className="font-bold leading-tight">{card.name}</span>
          <span className={`shrink-0 rounded px-1 text-[10px] font-bold ${rarityBadge[card.rarity]}`}>
            {card.rarity}
          </span>
        </div>
        {card.type === 'monster' ? (
          <span className="text-amber-300">{'★'.repeat(card.stars ?? 0)}</span>
        ) : (
          <span className="text-emerald-300">{typeLabel[card.type]}</span>
        )}
        {card.effectText && (
          <p className={`${effectClass} mt-0.5 leading-tight text-slate-200`}>{card.effectText}</p>
        )}
        {card.type === 'monster' && (
          <div className="mt-auto flex justify-between pt-1 font-mono text-[11px]">
            <span className="text-red-300">攻{card.atk}</span>
            <span className="text-sky-300">守{card.def}</span>
          </div>
        )}
      </div>
    </div>
  )
}
