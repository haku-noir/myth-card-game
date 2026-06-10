export interface SavedDeck {
  id: number
  name: string
  cardIds: string[] // 20枚のカードID(重複あり可)
  poolCardIds: string[] | null // 構築元の手持ちカード(開封した40枚)。編集時の選び直しに使う
  createdAt: string
  updatedAt: string
}

export const DECK_SIZE = 20
export const MAX_DECKS = 10
