import { create } from 'zustand'
import type { Card } from '../types/card'
import type { GameAction } from '../types/actions'
import type { Difficulty, GameState } from '../types/game'
import {
  canEnterBattle,
  castMagic,
  createGame,
  declareAttack,
  endTurn,
  respondTarget,
  respondTrap,
  setTrap,
  summon,
  toBattlePhase,
} from '../engine/gameEngine'
import { applyAction } from '../engine/applyAction'
import { decideTarget, decideTrap, nextAttack, nextMainAction } from '../engine/cpu'

export const HUMAN = 0 as const
export const CPU = 1 as const

const CPU_DELAY_MS = 750

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms))

interface GameStore {
  game: GameState | null
  difficulty: Difficulty
  cpuThinking: boolean

  startCpuGame: (playerDeck: Card[], playerName: string, cpuDeck: Card[], difficulty: Difficulty) => void
  reset: () => void
  /** プレイヤーのアクション(権限チェック付き)。実行後CPUループを起動 */
  act: (action: GameAction) => void
}

export const useGameStore = create<GameStore>((set, get) => {
  /** CPUの行動ループ。CPUの番・CPUのpendingが解消されるまで1手ずつ進める */
  async function pump() {
    if (get().cpuThinking) return
    set({ cpuThinking: true })
    try {
      for (;;) {
        const s = get().game
        if (!s || s.winner !== undefined) break

        if (s.pending) {
          if (s.pending.forPlayer !== CPU) break // プレイヤーの選択待ち
          await delay(CPU_DELAY_MS)
          const cur = get().game
          if (!cur || !cur.pending) continue
          if (cur.pending.kind === 'trapPrompt') {
            set({ game: respondTrap(cur, decideTrap(cur, CPU, get().difficulty)) })
          } else {
            const choice = decideTarget(cur, CPU)
            set({ game: respondTarget(cur, choice ?? (cur.pending.optional ? null : cur.pending.options[0])) })
          }
          continue
        }

        if (s.turnPlayer !== CPU) break // プレイヤーのターン

        await delay(CPU_DELAY_MS)
        const cur = get().game
        if (!cur || cur.winner !== undefined || cur.pending || cur.turnPlayer !== CPU) continue

        if (cur.phase === 'main') {
          const action = nextMainAction(cur, CPU, get().difficulty)
          switch (action.type) {
            case 'summon':
              set({ game: summon(cur, action.handIdx, action.position, action.releaseZone) })
              break
            case 'magic':
              set({ game: castMagic(cur, action.handIdx, action.target) })
              break
            case 'setTrap':
              set({ game: setTrap(cur, action.handIdx) })
              break
            case 'endMain':
              set({ game: canEnterBattle(cur) ? toBattlePhase(cur) : endTurn(cur) })
              break
          }
        } else if (cur.phase === 'battle') {
          const atk = nextAttack(cur, CPU, get().difficulty)
          if (atk) {
            set({ game: declareAttack(cur, atk.attackerZone, atk.target) })
          } else {
            set({ game: endTurn(cur) })
          }
        }
      }
    } finally {
      set({ cpuThinking: false })
    }
  }

  return {
    game: null,
    difficulty: 'normal',
    cpuThinking: false,

    startCpuGame: (playerDeck, playerName, cpuDeck, difficulty) => {
      const firstPlayer = Math.random() < 0.5 ? HUMAN : CPU
      const game = createGame([playerDeck, cpuDeck], [playerName, 'CPU'], firstPlayer)
      set({ game, difficulty })
      void pump()
    },

    reset: () => set({ game: null, cpuThinking: false }),

    act: (action) => {
      const s = get().game
      if (!s) return
      set({ game: applyAction(s, HUMAN, action) })
      void pump()
    },
  }
})
