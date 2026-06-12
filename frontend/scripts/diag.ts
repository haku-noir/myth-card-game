/**
 * バランス診断: normal vs hard の詳細メトリクス
 * (敗因内訳・ブースト召喚・供物経由率・守備召喚・UR召喚・先攻勝率)
 * 実行: npx tsx scripts/diag.ts [ゲーム数]
 */
import { buildCpuDeck } from '../src/engine/cpuDeck'
import { CARDS } from '../src/data/cards'
import {
  castMagic,
  createGame,
  declareAttack,
  endTurn,
  respondBoost,
  respondReaction,
  respondTarget,
  respondTrap,
  setTrap,
  summon,
  toBattlePhase,
  canEnterBattle,
} from '../src/engine/gameEngine'
import {
  decideBoost,
  decideReaction,
  decideTarget,
  decideTrap,
  nextAttack,
  nextMainAction,
} from '../src/engine/cpu'
import type { Card } from '../src/types/card'
import type { Difficulty, GameState, PlayerIdx } from '../src/types/game'

const N_MONSTERS = CARDS.filter((c) => c.rarity === 'N' && c.type === 'monster')
const ANSWERS = CARDS.filter((c) => ['N21', 'N24', 'N22', 'N27', 'N28'].includes(c.id))
const MIRACLES = CARDS.filter((c) => ['UR4', 'UR5'].includes(c.id))
const N_SPELLS = CARDS.filter((c) => c.rarity === 'N' && c.type !== 'monster')
const R_CARDS = CARDS.filter((c) => c.rarity === 'R')
const SR_CARDS = CARDS.filter((c) => c.rarity === 'SR')
const UR_GODS = CARDS.filter((c) => c.rarity === 'UR' && c.type === 'monster')
const pick = <T,>(arr: T[]) => arr[Math.floor(Math.random() * arr.length)]

function randomPool(): Card[] {
  const pool: Card[] = []
  for (let p = 0; p < 4; p++) {
    for (let i = 0; i < 5; i++) pool.push(pick(N_MONSTERS))
    pool.push(pick(N_SPELLS))
    pool.push(Math.random() < 1 / 16 ? pick(MIRACLES) : pick(ANSWERS))
    pool.push(pick(R_CARDS), pick(R_CARDS))
    pool.push(Math.random() < 0.25 ? pick(UR_GODS) : pick(SR_CARDS))
  }
  return pool
}

const diffs: [Difficulty, Difficulty] = ['normal', 'hard']
const games = Number(process.argv[2] ?? 400)

const agg = {
  wins: [0, 0] as [number, number],
  deckoutLoss: [0, 0], // そのプレイヤーがデッキ切れで負けた数
  boosts: [0, 0],
  handReleases: [0, 0], // 供物(手札リリース)経由のブースト
  wallSummons: [0, 0], // 守備表示召喚
  urSummons: [0, 0],
  firstPlayerWins: 0,
  turns: 0,
}

for (let g = 0; g < games; g++) {
  const first = Math.random() < 0.5 ? 0 : 1
  let s = createGame(
    [buildCpuDeck(randomPool()), buildCpuDeck(randomPool())],
    ['CPU-A', 'CPU-B'],
    first,
  )
  let safety = 0
  while (s.winner === undefined) {
    if (++safety > 5000) throw new Error('loop')
    if (s.pending) {
      const actor = s.pending.forPlayer
      const diff = diffs[actor]
      if (s.pending.kind === 'trapPrompt') s = respondTrap(s, decideTrap(s, actor, diff))
      else if (s.pending.kind === 'attackerBoost') s = respondBoost(s, decideBoost(s, actor, diff))
      else if (s.pending.kind === 'defenderReaction')
        s = respondReaction(s, decideReaction(s, actor, diff))
      else {
        const choice = decideTarget(s, actor)
        s = respondTarget(s, choice ?? (s.pending.optional ? null : s.pending.options[0]))
      }
      continue
    }
    const me = s.turnPlayer
    const diff = diffs[me]
    if (s.phase === 'main') {
      const action = nextMainAction(s, me, diff)
      if (action.type === 'summon') {
        if (action.release) agg.boosts[me]++
        if (action.release?.source === 'hand') agg.handReleases[me]++
        if (action.position === 'defense') agg.wallSummons[me]++
        const card = s.players[me].hand[action.handIdx]
        if (card?.rarity === 'UR') agg.urSummons[me]++
        s = summon(s, action.handIdx, action.position, action.release)
      } else if (action.type === 'magic') s = castMagic(s, action.handIdx, action.target)
      else if (action.type === 'setTrap') s = setTrap(s, action.handIdx)
      else s = canEnterBattle(s) ? toBattlePhase(s) : endTurn(s)
    } else {
      const atk = nextAttack(s, me, diff)
      s = atk ? declareAttack(s, atk.attackerZone, atk.target) : endTurn(s)
    }
  }
  if (s.winner !== 'draw') {
    agg.wins[s.winner as PlayerIdx]++
    if (s.winner === first) agg.firstPlayerWins++
    if (s.winReason?.includes('デッキ切れ')) {
      agg.deckoutLoss[s.winner === 0 ? 1 : 0]++
    }
  }
  agg.turns += s.turnCount
}

const per = (arr: number[]) => arr.map((v) => (v / games).toFixed(2)).join(' / ')
console.log(`normal(P0) vs hard(P1): ${games}戦`)
console.log(`勝率: ${agg.wins[0]}-${agg.wins[1]}`)
console.log(`デッキ切れ負け(P0/P1): ${agg.deckoutLoss[0]} / ${agg.deckoutLoss[1]}`)
console.log(`ブースト召喚/試合: ${per(agg.boosts)}`)
console.log(`うち供物(手札リリース)経由: ${per(agg.handReleases)}`)
console.log(`守備召喚/試合: ${per(agg.wallSummons)}`)
console.log(`UR召喚/試合: ${per(agg.urSummons)}`)
console.log(`先攻勝率: ${((agg.firstPlayerWins / games) * 100).toFixed(1)}%`)
console.log(`平均決着: ${(agg.turns / games / 2).toFixed(1)}巡 (${(agg.turns / games).toFixed(1)}ターン)`)
