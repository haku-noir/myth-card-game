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
  /** 可変星モンスター(化け狸・鵺): リリース時のみこの範囲の好きな星として扱える */
  releaseStarRange?: { min: number; max: number }
  /** 供物モンスター(豆狸・人魚姫・一反木綿): ブースト召喚で手札からリリースできる(v1.5) */
  handReleasable?: boolean
}
