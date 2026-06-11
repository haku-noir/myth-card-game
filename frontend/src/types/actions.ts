import type { ReleaseSpec, TargetOption } from './game'

/** 防御側リアクション(罠 or 戦闘強化 or 何もしない) */
export type ReactionChoice =
  | { type: 'trap'; zone: number }
  | { type: 'boost'; handIdx: number }
  | null

/** プレイヤーが行う全アクション。PvPではこれをシリアライズして送受信する */
export type GameAction =
  | { kind: 'summon'; handIdx: number; position: 'attack' | 'defense'; release?: ReleaseSpec }
  | { kind: 'setTrap'; handIdx: number }
  | { kind: 'magic'; handIdx: number; target?: TargetOption }
  | { kind: 'changePos'; zone: number }
  | { kind: 'toBattle' }
  | { kind: 'attack'; attackerZone: number; target: number | 'direct' }
  | { kind: 'endTurn' }
  | { kind: 'respondTrap'; zone: number | null }
  | { kind: 'respondTarget'; choice: TargetOption | null }
  | { kind: 'respondBoost'; handIdx: number | null } // 攻撃側の戦闘強化
  | { kind: 'respondReaction'; choice: ReactionChoice } // 防御側リアクション
