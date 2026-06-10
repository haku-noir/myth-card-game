import { useState } from 'react'
import type { Card } from '../../types/card'

const rarityBg: Record<Card['rarity'], string> = {
  N: 'bg-rarity-n',
  R: 'bg-rarity-r',
  SR: 'bg-rarity-sr',
  UR: 'bg-rarity-ur',
}

const typeLabel: Record<Card['type'], string> = {
  monster: 'モンスター',
  magic: '魔法',
  trap: '罠',
}

interface Props {
  card: Card
  onClick?: () => void
  /** sm: 一覧グリッド用 / md: 詳細・手札用 */
  size?: 'sm' | 'md'
}

/**
 * カード表面。public/images/cards/{id}.png があれば画像を表示し、
 * なければレアリティ色のプレースホルダーにフォールバックする。
 */
export default function CardFace({ card, onClick, size = 'sm' }: Props) {
  const [hasImage, setHasImage] = useState(true)
  const sizeClass = size === 'sm' ? 'w-28 h-40 text-xs' : 'w-44 h-64 text-sm'

  return (
    <div
      onClick={onClick}
      className={`${sizeClass} ${rarityBg[card.rarity]} relative flex cursor-pointer flex-col overflow-hidden rounded-lg p-1.5 shadow transition hover:scale-105 hover:shadow-lg`}
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
      <div className="relative z-10 flex h-full flex-col rounded bg-black/40 p-1.5">
        <div className="flex items-start justify-between gap-1">
          <span className="font-bold leading-tight">{card.name}</span>
          <span className="shrink-0 rounded bg-black/50 px-1 text-[10px]">{card.rarity}</span>
        </div>
        {card.type === 'monster' ? (
          <span className="text-amber-300">{'★'.repeat(card.stars ?? 0)}</span>
        ) : (
          <span className="text-emerald-300">{typeLabel[card.type]}</span>
        )}
        <div className="mt-auto">
          {card.effectText && (
            <p className="mb-1 line-clamp-3 text-[10px] leading-tight text-slate-200">
              {card.effectText}
            </p>
          )}
          {card.type === 'monster' && (
            <div className="flex justify-between font-mono text-[11px]">
              <span className="text-red-300">攻{card.atk}</span>
              <span className="text-sky-300">守{card.def}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
