export type Rarity = 'N' | 'R' | 'SR' | 'UR'
export type CardType = 'monster' | 'magic' | 'trap'

export interface Card {
  id: string // "N01", "R04", "SR1", "UR1" など
  name: string
  type: CardType
  rarity: Rarity
  stars?: number // モンスターのみ 1〜8
  atk?: number
  def?: number
  effectText: string // 効果なし = ""
}
