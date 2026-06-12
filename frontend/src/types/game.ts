import type { Card } from './card'

export type Phase = 'main' | 'battle' | 'ended'
export type Position = 'attack' | 'defense'
export type PlayerIdx = 0 | 1

export const MONSTER_ZONES = 5
export const TRAP_ZONES = 3
export const INITIAL_LIFE = 8000 // v1.1で6000→8000
export const INITIAL_HAND = 5

/** 期限付きの攻撃力補正(プラス=強化、マイナス=弱体化) */
export interface BuffEntry {
  amount: number
  /** このターン数の終了時に失効する(例: 軍配=現在ターン、草薙剣=次の相手ターン) */
  expiresAfterTurn: number
}

export interface FieldMonster {
  card: Card
  position: Position
  hasAttacked: boolean
  changedPositionThisTurn: boolean
  summonedThisTurn: boolean
  buffs: BuffEntry[] // 攻撃力補正(戦闘強化は含まない。あれは戦闘中のみ)
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
  summonUsedThisTurn: boolean // v1.2: 召喚は1ターン1回
  reinforceDoubledThisTurn: boolean // お焚き上げ(N29)発動中
}

/** 召喚時のリリース指定(手札の供物または場から1体) */
export interface ReleaseSpec {
  source: 'hand' | 'field'
  index: number
  /** 可変星モンスター(化け狸・鵺)をリリースする時に扱う星の値 */
  starsAs?: number
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

/** 進行中の戦闘コンテキスト(戦闘強化フェーズで使用) */
export interface BattleContext {
  attackerZone: number
  target: number | 'direct'
  attackerBoost: number // 攻撃側の戦闘強化(この戦闘の間のみ)
  defenderBoost: number // 防御側の戦闘強化(攻撃表示=攻、守備表示=守に加算)
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
      ctx?: { attackerZone?: number; zone?: number; attackerBoost?: number }
    }
  | {
      // v1.3 戦闘強化: 攻撃側が手札モンスターを捨てて星×100加算できる
      kind: 'attackerBoost'
      forPlayer: PlayerIdx // 攻撃側
      options: number[] // 捨てられる手札インデックス
      battle: BattleContext
    }
  | {
      // v1.3 防御側リアクション: 罠1枚 or 戦闘強化のどちらか一方
      kind: 'defenderReaction'
      forPlayer: PlayerIdx // 防御側
      trapZones: number[] // 発動可能な罠
      boostOptions: number[] // 捨てられる手札インデックス(直接攻撃時は空)
      battle: BattleContext
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
