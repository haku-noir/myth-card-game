import type { Card } from '../types/card'
import { DECK_SIZE } from '../types/deck'

/** 魔法・罠の採用優先度スコア(v1.4 ID) */
const SPELL_SCORE: Record<string, number> = {
  UR4: 10, // 天罰
  UR5: 9.5, // アイギスの盾
  SR9: 9, // 鬼退治
  SR10: 9, // 落とし穴
  R09: 8, // 強制送還
  N24: 8, // 金縛り
  R14: 7.5, // 神隠し
  SR7: 7, // 黄泉返り
  N27: 6.5, // 神便鬼毒酒
  N21: 6, // 払い清め
  R12: 6, // 背水の陣
  N28: 5.5, // 砂かけ婆
  N22: 5, // 死者の声
  R10: 5, // 人魚の肉
  N20: 4, // 草薙剣
  N23: 4, // 軍配
  N29: 3, // お焚き上げ
}

const rarityBonus = { N: 0, R: 100, SR: 200, UR: 300 } as const

/**
 * 開封した40枚から20枚デッキを自動構築し、プール内インデックスで返す。
 * 方針: モンスター約13枚(低星厚め+高星少々) + 除去中心の魔法・罠約7枚
 * 同名カードを区別するためインデックスで管理する。
 * CPUのデッキ構築と、デッキ構築画面の「おまかせ構築」で共用する。
 */
export function buildDeckIndices(pool: Card[]): number[] {
  const entries = pool.map((card, idx) => ({ card, idx }))
  const monsters = entries.filter(({ card }) => card.type === 'monster')
  const spells = entries.filter(({ card }) => card.type !== 'monster')

  const monsterScore = (c: Card) => (c.atk ?? 0) + (c.def ?? 0) * 0.3 + rarityBonus[c.rarity]
  const byScore = (a: { card: Card }, b: { card: Card }) =>
    monsterScore(b.card) - monsterScore(a.card)

  const low = monsters.filter(({ card }) => (card.stars ?? 0) <= 3).sort(byScore)
  const mid = monsters
    .filter(({ card }) => (card.stars ?? 0) >= 4 && (card.stars ?? 0) <= 5)
    .sort(byScore)
  const high = monsters.filter(({ card }) => (card.stars ?? 0) >= 6).sort(byScore)

  const picked: { card: Card; idx: number }[] = []
  // 低星8(リリースの起点と序盤の壁)、中星3、高星2 を目安に
  picked.push(...low.slice(0, 8))
  picked.push(...mid.slice(0, 3))
  picked.push(...high.slice(0, 2))

  // 魔法・罠をスコア順に
  const sortedSpells = [...spells].sort(
    (a, b) => (SPELL_SCORE[b.card.id] ?? 0) - (SPELL_SCORE[a.card.id] ?? 0),
  )
  picked.push(...sortedSpells.slice(0, Math.max(0, DECK_SIZE - picked.length)))

  // まだ足りなければ残りのモンスターから補充
  if (picked.length < DECK_SIZE) {
    const used = new Set(picked.map((e) => e.idx))
    const rest = monsters.filter((e) => !used.has(e.idx)).sort(byScore)
    picked.push(...rest.slice(0, DECK_SIZE - picked.length))
  }

  return picked.slice(0, DECK_SIZE).map((e) => e.idx)
}

/** 開封した40枚からCPU用の20枚デッキを自動構築する */
export function buildCpuDeck(pool: Card[]): Card[] {
  return buildDeckIndices(pool).map((i) => pool[i])
}
