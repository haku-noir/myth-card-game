import { create } from 'zustand'
import type { Card } from '../types/card'
import type { Difficulty, GameState, TargetOption } from '../types/game'
import {
  canEnterBattle,
  castMagic,
  createGame,
  declareAttack,
  endTurn,
  changePosition,
  respondTarget,
  respondTrap,
  setTrap,
  summon,
  toBattlePhase,
} from '../engine/gameEngine'
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

  // プレイヤー操作(全てpump付き)
  doSummon: (handIdx: number, position: 'attack' | 'defense', releaseZone?: number) => void
  doSetTrap: (handIdx: number) => void
  doCastMagic: (handIdx: number, target?: TargetOption) => void
  doChangePosition: (zone: number) => void
  doToBattle: () => void
  doAttack: (attackerZone: number, target: number | 'direct') => void
  doEndTurn: () => void
  doRespondTrap: (zone: number | null) => void
  doRespondTarget: (choice: TargetOption | null) => void
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

        // pending処理
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

  /** プレイヤー操作後の共通処理: 状態を更新してCPUループを起動 */
  const apply = (next: GameState) => {
    set({ game: next })
    void pump()
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

    doSummon: (handIdx, position, releaseZone) => {
      const s = get().game
      if (s) apply(summon(s, handIdx, position, releaseZone))
    },
    doSetTrap: (handIdx) => {
      const s = get().game
      if (s) apply(setTrap(s, handIdx))
    },
    doCastMagic: (handIdx, target) => {
      const s = get().game
      if (s) apply(castMagic(s, handIdx, target))
    },
    doChangePosition: (zone) => {
      const s = get().game
      if (s) apply(changePosition(s, zone))
    },
    doToBattle: () => {
      const s = get().game
      if (s && canEnterBattle(s)) apply(toBattlePhase(s))
    },
    doAttack: (attackerZone, target) => {
      const s = get().game
      if (s) apply(declareAttack(s, attackerZone, target))
    },
    doEndTurn: () => {
      const s = get().game
      if (s) apply(endTurn(s))
    },
    doRespondTrap: (zone) => {
      const s = get().game
      if (s) apply(respondTrap(s, zone))
    },
    doRespondTarget: (choice) => {
      const s = get().game
      if (s) apply(respondTarget(s, choice))
    },
  }
})
