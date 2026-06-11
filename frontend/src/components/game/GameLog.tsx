import { useEffect, useRef, useState } from 'react'
import { CARDS } from '../../data/cards'
import type { Card } from '../../types/card'
import type { LogEntry } from '../../types/game'
import CardFace from '../card/CardFace'

// カード名を長い順に並べた正規表現(「一寸法師」が「一寸」等に部分マッチしないように)
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const namePattern = new RegExp(
  `(${[...CARDS]
    .sort((a, b) => b.name.length - a.name.length)
    .map((c) => escapeRe(c.name))
    .join('|')})`,
  'g',
)
const nameToCard = new Map(CARDS.map((c) => [c.name, c]))

interface Props {
  log: LogEntry[]
  onCardClick: (card: Card) => void
}

/**
 * ゲームログ。メッセージ中のカード名を自動でリンク化し、
 * ホバーでカードプレビュー、クリックで詳細を開ける。
 */
export default function GameLog({ log, onCardClick }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const [hoverCard, setHoverCard] = useState<Card | null>(null)

  useEffect(() => {
    ref.current?.scrollTo({ top: ref.current.scrollHeight })
  }, [log.length])

  return (
    <div className="relative">
      <div
        ref={ref}
        className="h-28 overflow-y-auto rounded-lg bg-black/40 p-2 text-xs leading-relaxed text-slate-300"
      >
        {log.map((entry, i) => (
          <p key={i}>
            {entry.message.split(namePattern).map((part, j) => {
              const card = nameToCard.get(part)
              return card ? (
                <span
                  key={j}
                  className="cursor-pointer text-indigo-300 underline decoration-dotted hover:text-indigo-100"
                  onClick={() => onCardClick(card)}
                  onMouseEnter={() => setHoverCard(card)}
                  onMouseLeave={() => setHoverCard(null)}
                >
                  {part}
                </span>
              ) : (
                <span key={j}>{part}</span>
              )
            })}
          </p>
        ))}
      </div>
      {/* ホバープレビュー(スクロール領域にクリップされないよう外側に固定表示) */}
      {hoverCard && (
        <div className="pointer-events-none absolute bottom-full right-2 z-40 mb-2">
          <CardFace card={hoverCard} size="sm" />
        </div>
      )}
    </div>
  )
}
