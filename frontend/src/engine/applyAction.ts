import type { GameAction } from '../types/actions'
import type { GameState, PlayerIdx } from '../types/game'
import {
  canEnterBattle,
  castMagic,
  changePosition,
  declareAttack,
  endTurn,
  respondTarget,
  respondTrap,
  setTrap,
  summon,
  toBattlePhase,
} from './gameEngine'

/**
 * アクションを実行者の権限チェック付きで適用する。
 * 不正なアクション(相手のターンの操作など)は状態を変えずに返す。
 * CPU戦・PvP(ホスト側での検証)の両方で使う。
 */
export function applyAction(s: GameState, actor: PlayerIdx, a: GameAction): GameState {
  if (s.winner !== undefined) return s

  if (a.kind === 'respondTrap' || a.kind === 'respondTarget') {
    // pending応答はforPlayer本人のみ
    if (!s.pending || s.pending.forPlayer !== actor) return s
  } else {
    // 通常アクションはターンプレイヤーのみ、pending中は不可
    if (s.pending || s.turnPlayer !== actor) return s
  }

  switch (a.kind) {
    case 'summon':
      return summon(s, a.handIdx, a.position, a.releaseZone)
    case 'setTrap':
      return setTrap(s, a.handIdx)
    case 'magic':
      return castMagic(s, a.handIdx, a.target)
    case 'changePos':
      return changePosition(s, a.zone)
    case 'toBattle':
      return canEnterBattle(s) ? toBattlePhase(s) : s
    case 'attack':
      return declareAttack(s, a.attackerZone, a.target)
    case 'endTurn':
      return endTurn(s)
    case 'respondTrap':
      return respondTrap(s, a.zone)
    case 'respondTarget':
      return respondTarget(s, a.choice)
  }
}
