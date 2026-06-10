import type { Card } from './card'

export type Phase = 'main' | 'battle' | 'ended'
export type Position = 'attack' | 'defense'
export type PlayerIdx = 0 | 1

export const MONSTER_ZONES = 5
export const TRAP_ZONES = 3
export const INITIAL_LIFE = 6000
export const INITIAL_HAND = 5

export interface FieldMonster {
  card: Card
  position: Position
  hasAttacked: boolean
  changedPositionThisTurn: boolean
  summonedThisTurn: boolean
  atkBuff: number // 「ターン終了時まで」の攻撃力補正
  destroyAtEndOfTurn: boolean // メデューサと戦闘した
}

export interface TrapSlot {
  card: Card
  setOnTurn: number
  knownToOpponent: boolean // 卑弥呼で確認された
}

export interface PlayerState {
  name: string
  life: number
  level: number
  hand: Card[]
  deck: Card[]
  grave: Card[]
  monsters: (FieldMonster | null)[] // 長さ5
  traps: (TrapSlot | null)[] // 長さ3
}

/** 罠の発動トリガー */
export type TrapTrigger =
  | { type: 'summon'; zone: number } // zone=召喚されたゾーン(召喚側視点)
  | { type: 'attack'; attackerZone: number; target: number | 'direct' }

/** 効果の対象候補(UI/CPUが選択して返す) */
export interface TargetOption {
  /** oppMonster=相手モンスター / ownMonster=自分モンスター / grave=自分墓地 /
      oppTrap=相手伏せ / deck=自分デッキ / hand=自分手札 */
  area: 'oppMonster' | 'ownMonster' | 'grave' | 'oppTrap' | 'deck' | 'hand'
  index: number
}

export type Pending =
  | {
      kind: 'trapPrompt'
      forPlayer: PlayerIdx // 罠の持ち主(発動するか選ぶ側)
      zones: number[] // 発動可能な罠ゾーン
      trigger: TrapTrigger
    }
  | {
      kind: 'effectTarget'
      forPlayer: PlayerIdx // 対象を選ぶ側
      sourceId: string // 効果元カードID(N11, R12など)
      optional: boolean
      options: TargetOption[]
      ctx?: { attackerZone?: number; zone?: number }
    }

export interface LogEntry {
  turn: number
  message: string
}

export interface GameState {
  phase: Phase
  turnPlayer: PlayerIdx
  turnCount: number
  firstPlayer: PlayerIdx
  players: [PlayerState, PlayerState]
  log: LogEntry[]
  pending?: Pending
  winner?: PlayerIdx | 'draw'
  winReason?: string
}

export type Difficulty = 'easy' | 'normal' | 'hard'
