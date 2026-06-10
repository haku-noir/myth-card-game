export interface SavedDeck {
  id: number
  name: string
  cardIds: string[] // 20枚のカードID(重複あり可)
  createdAt: string
  updatedAt: string
}

export const DECK_SIZE = 20
export const MAX_DECKS = 10
