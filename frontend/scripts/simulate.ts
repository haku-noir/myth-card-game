/**
 * エンジン検証用: CPU同士で多数のゲームを自動対戦させ、
 * クラッシュ・無限ループ・不変条件違反がないことを確認する。
 * 実行: npx tsx scripts/simulate.ts [ゲーム数]
 */
import { CARDS } from '../src/data/cards'
import { buildCpuDeck } from '../src/engine/cpuDeck'
import {
  castMagic,
  createGame,
  declareAttack,
  endTurn,
  respondTarget,
  respondTrap,
  setTrap,
  summon,
  toBattlePhase,
  canEnterBattle,
} from '../src/engine/gameEngine'
import { decideTarget, decideTrap, nextAttack, nextMainAction } from '../src/engine/cpu'
import type { Card } from '../src/types/card'
import type { Difficulty, GameState, PlayerIdx } from '../src/types/game'

// パック生成(backend/packService.tsと同じロジックの簡易版・v1.4)
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

function totalCards(s: GameState, p: PlayerIdx): number {
  const pl = s.players[p]
  return (
    pl.hand.length +
    pl.deck.length +
    pl.grave.length +
    pl.monsters.filter(Boolean).length +
    pl.traps.filter(Boolean).length
  )
}

function runGame(diffs: [Difficulty, Difficulty], verbose = false): GameState {
  const deck0 = buildCpuDeck(randomPool())
  const deck1 = buildCpuDeck(randomPool())
  if (deck0.length !== 20 || deck1.length !== 20) throw new Error('デッキが20枚でない')

  let s = createGame([deck0, deck1], ['CPU-A', 'CPU-B'], Math.random() < 0.5 ? 0 : 1)
  let safety = 0

  // 注意: winner=0(プレイヤー0)はfalsyなのでundefined比較で判定する
  while (s.winner === undefined) {
    if (++safety > 5000) {
      throw new Error(`無限ループ検出 (turn=${s.turnCount}, phase=${s.phase})`)
    }

    // pending処理(両プレイヤーCPU)
    if (s.pending) {
      const actor = s.pending.forPlayer
      const diff = diffs[actor]
      if (s.pending.kind === 'trapPrompt') {
        s = respondTrap(s, decideTrap(s, actor, diff))
      } else {
        const choice = decideTarget(s, actor)
        // optional効果はCPUが選べなければスキップ、必須は先頭を強制
        s = respondTarget(s, choice ?? (s.pending.optional ? null : s.pending.options[0]))
      }
      continue
    }

    const me = s.turnPlayer
    const diff = diffs[me]

    if (s.phase === 'main') {
      const action = nextMainAction(s, me, diff)
      const before = s
      switch (action.type) {
        case 'summon':
          s = summon(s, action.handIdx, action.position, action.releaseZone)
          break
        case 'magic':
          s = castMagic(s, action.handIdx, action.target)
          break
        case 'setTrap':
          s = setTrap(s, action.handIdx)
          break
        case 'endMain':
          s = canEnterBattle(s) ? toBattlePhase(s) : endTurn(s)
          break
      }
      if (s === before && action.type !== 'endMain') {
        throw new Error(`アクションが状態を変えなかった: ${JSON.stringify(action)}`)
      }
    } else if (s.phase === 'battle') {
      const atk = nextAttack(s, me, diff)
      if (atk) {
        const before = s
        s = declareAttack(s, atk.attackerZone, atk.target)
        if (s === before) throw new Error(`攻撃が処理されなかった: ${JSON.stringify(atk)}`)
      } else {
        s = endTurn(s)
      }
    }

    // 不変条件: カードの総数は常に20枚
    for (const p of [0, 1] as const) {
      const total = totalCards(s, p)
      if (total !== 20 && s.winner === undefined) {
        // 神隠し・強制送還で相手の手札に戻る場合があるため、両者の合計で検証
        const sum = totalCards(s, 0) + totalCards(s, 1)
        if (sum !== 40) {
          throw new Error(`カード総数異常: P${p}=${total}, 合計=${sum} (turn=${s.turnCount})`)
        }
      }
    }
  }

  if (verbose) {
    console.log(`勝者: ${s.winner === 'draw' ? '引き分け' : s.players[s.winner as PlayerIdx].name}`)
    console.log(`理由: ${s.winReason} / ターン数: ${s.turnCount}`)
  }
  return s
}

const games = Number(process.argv[2] ?? 200)
const matchups: [Difficulty, Difficulty][] = [
  ['easy', 'easy'],
  ['normal', 'normal'],
  ['hard', 'hard'],
  ['easy', 'hard'],
  ['normal', 'hard'],
]

console.log(`${games}ゲームを実行中...`)
const stats = new Map<string, { wins: [number, number]; turns: number[]; deckout: number }>()

for (let i = 0; i < games; i++) {
  const matchup = matchups[i % matchups.length]
  const key = `${matchup[0]} vs ${matchup[1]}`
  const s = runGame(matchup)
  const st = stats.get(key) ?? { wins: [0, 0] as [number, number], turns: [], deckout: 0 }
  if (s.winner !== 'draw') st.wins[s.winner as PlayerIdx]++
  st.turns.push(s.turnCount)
  if (s.winReason?.includes('デッキ切れ')) st.deckout++
  stats.set(key, st)
}

console.log('\n=== 結果 ===')
for (const [key, st] of stats) {
  const n = st.turns.length
  const avgTurns = (st.turns.reduce((a, b) => a + b, 0) / n).toFixed(1)
  console.log(
    `${key}: ${n}戦 | 勝率 ${st.wins[0]}-${st.wins[1]} | 平均${avgTurns}ターン | デッキ切れ${st.deckout}回`,
  )
}
console.log('\n全ゲーム正常終了(クラッシュ・無限ループ・カード総数異常なし)')
