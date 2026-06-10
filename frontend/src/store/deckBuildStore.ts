import { create } from 'zustand'
import type { Card } from '../types/card'

/**
 * パック開封→デッキ構築の画面間で手持ちカード(プール)を受け渡すストア。
 * リロードで消えるが、保存済みデッキの編集時はサーバーから復元できる。
 */
interface DeckBuildState {
  pool: Card[]
  setPool: (pool: Card[]) => void
  clear: () => void
}

export const useDeckBuildStore = create<DeckBuildState>((set) => ({
  pool: [],
  setPool: (pool) => set({ pool }),
  clear: () => set({ pool: [] }),
}))
