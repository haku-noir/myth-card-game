import type { TargetOption } from './game'

/** プレイヤーが行う全アクション。PvPではこれをシリアライズして送受信する */
export type GameAction =
  | { kind: 'summon'; handIdx: number; position: 'attack' | 'defense'; releaseZone?: number }
  | { kind: 'setTrap'; handIdx: number }
  | { kind: 'magic'; handIdx: number; target?: TargetOption }
  | { kind: 'changePos'; zone: number }
  | { kind: 'toBattle' }
  | { kind: 'attack'; attackerZone: number; target: number | 'direct' }
  | { kind: 'endTurn' }
  | { kind: 'respondTrap'; zone: number | null }
  | { kind: 'respondTarget'; choice: TargetOption | null }
