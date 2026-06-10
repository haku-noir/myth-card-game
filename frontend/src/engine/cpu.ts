import type { Card } from '../types/card'
import type { Difficulty, FieldMonster, GameState, PlayerIdx, TargetOption } from '../types/game'
import {
  attackTargets,
  canAttackWith,
  canCastMagic,
  canSetTrap,
  canSummon,
  magicTargets,
  other,
  releaseOptionsFor,
} from './gameEngine'

export type CpuMainAction =
  | { type: 'summon'; handIdx: number; position: 'attack' | 'defense'; releaseZone?: number }
  | { type: 'magic'; handIdx: number; target?: TargetOption }
  | { type: 'setTrap'; handIdx: number }
  | { type: 'endMain' }

const atkOf = (m: FieldMonster) => (m.card.atk ?? 0) + m.atkBuff

function fieldMonsters(s: GameState, p: PlayerIdx): { m: FieldMonster; zone: number }[] {
  const out: { m: FieldMonster; zone: number }[] = []
  s.players[p].monsters.forEach((m, zone) => {
    if (m) out.push({ m, zone })
  })
  return out
}

const bestAtk = (s: GameState, p: PlayerIdx) =>
  Math.max(0, ...fieldMonsters(s, p).map(({ m }) => atkOf(m)))

// ============================================================
// メインフェイズの行動決定(1回の呼び出しで1アクション返す)
// ============================================================

export function nextMainAction(s: GameState, me: PlayerIdx, diff: Difficulty): CpuMainAction {
  const p = s.players[me]
  const oppIdx = other(me)
  const opp = s.players[oppIdx]
  const oppMonsters = fieldMonsters(s, oppIdx)
  const myBest = bestAtk(s, me)
  const oppBest = bestAtk(s, oppIdx)

  // --- 1. 除去・回復魔法 ---
  for (let i = 0; i < p.hand.length; i++) {
    const card = p.hand[i]
    if (card.type !== 'magic' || !canCastMagic(s, i)) continue
    const targets = magicTargets(s, i)

    switch (card.id) {
      case 'SR6': {
        // 天罰: 易=1体でも使う / 普通・難=2体以上か高打点
        const count = oppMonsters.length
        const totalAtk = oppMonsters.reduce((sum, { m }) => sum + atkOf(m), 0)
        if (diff === 'easy' ? count >= 1 : count >= 2 || totalAtk >= 2300) {
          return { type: 'magic', handIdx: i }
        }
        break
      }
      case 'N19':
      case 'R09': {
        // 鬼退治・強制送還: 最大打点の相手に。易は無条件、普通・難は自軍で勝てない相手にのみ
        if (!targets || targets.length === 0) break
        const strongest = targets.reduce((a, b) =>
          atkOf(opp.monsters[a.index]!) >= atkOf(opp.monsters[b.index]!) ? a : b,
        )
        const targetAtk = atkOf(opp.monsters[strongest.index]!)
        if (diff === 'easy' || targetAtk > myBest || targetAtk >= 2000) {
          return { type: 'magic', handIdx: i, target: strongest }
        }
        break
      }
      case 'N21': {
        // 払い清め: 伏せがあれば使う(難は確認済みの危険な罠を優先)
        if (targets && targets.length > 0) {
          const known = targets.find((t) => {
            const slot = opp.traps[t.index]
            return slot?.knownToOpponent && ['SR8', 'R11', 'N24'].includes(slot.card.id)
          })
          return { type: 'magic', handIdx: i, target: known ?? targets[0] }
        }
        break
      }
      case 'R10': {
        // 人魚の肉: ライフが減ったら使う
        const threshold = diff === 'easy' ? 4500 : 3000
        if (p.life <= threshold) return { type: 'magic', handIdx: i }
        break
      }
      case 'N22': {
        // 死者の声: 場が空で墓地に守備の固いモンスターがいれば壁を出す
        if (targets && targets.length > 0 && oppMonsters.length > 0) {
          const best = targets.reduce((a, b) =>
            (p.grave[a.index].def ?? 0) >= (p.grave[b.index].def ?? 0) ? a : b,
          )
          return { type: 'magic', handIdx: i, target: best }
        }
        break
      }
      case 'SR7': {
        // 黄泉返り: 墓地の高打点を釣る
        if (targets && targets.length > 0) {
          const best = targets.reduce((a, b) =>
            (p.grave[a.index].atk ?? 0) >= (p.grave[b.index].atk ?? 0) ? a : b,
          )
          const reviveAtk = p.grave[best.index].atk ?? 0
          if (diff === 'easy' ? reviveAtk >= 1000 : reviveAtk >= 1500) {
            return { type: 'magic', handIdx: i, target: best }
          }
        }
        break
      }
    }
  }

  // --- 2. 召喚 ---
  const summonAction = decideSummon(s, me, diff)
  if (summonAction) return summonAction

  // --- 3. バフ(普通・難のみ。バトルで打点が届かない時に使う) ---
  if (diff !== 'easy' && s.turnCount > 1) {
    for (let i = 0; i < p.hand.length; i++) {
      const card = p.hand[i]
      if (card.type !== 'magic' || !canCastMagic(s, i)) continue
      if (card.id === 'N20' && myBest > 0 && oppBest > myBest && oppBest <= myBest + 500) {
        // 草薙剣で最大打点が相手を上回るなら使う
        const targets = magicTargets(s, i)
        if (targets && targets.length > 0) {
          const best = targets.reduce((a, b) =>
            atkOf(p.monsters[a.index]!) >= atkOf(p.monsters[b.index]!) ? a : b,
          )
          return { type: 'magic', handIdx: i, target: best }
        }
      }
      if (card.id === 'N23' && fieldMonsters(s, me).length >= 3 && oppMonsters.length <= 1) {
        // 軍配: 横並びで攻め込む時
        return { type: 'magic', handIdx: i }
      }
    }
  }

  // --- 4. 罠セット ---
  for (let i = 0; i < p.hand.length; i++) {
    if (canSetTrap(s, i)) return { type: 'setTrap', handIdx: i }
  }

  return { type: 'endMain' }
}

/** 召喚判断。難易度でリリース活用度が変わる */
function decideSummon(s: GameState, me: PlayerIdx, diff: Difficulty): CpuMainAction | null {
  const p = s.players[me]
  const hasEmptyZone = p.monsters.some((m) => m === null)
  if (!hasEmptyZone) return null

  // 通常召喚: 出せる中で最強を出す
  let bestIdx = -1
  let bestScore = -1
  for (let i = 0; i < p.hand.length; i++) {
    if (!canSummon(s, i)) continue
    const score = p.hand[i].atk ?? 0
    if (score > bestScore) {
      bestScore = score
      bestIdx = i
    }
  }

  // リリース召喚の検討(普通: 1段 / 難: 最得な1段を厳選)
  if (diff !== 'easy') {
    let bestRelease: { handIdx: number; releaseZone: number; gain: number } | null = null
    for (let i = 0; i < p.hand.length; i++) {
      const card = p.hand[i]
      if (card.type !== 'monster') continue
      const zones = releaseOptionsFor(s, i)
      for (const z of zones) {
        const released = p.monsters[z]!
        const gain = (card.atk ?? 0) - atkOf(released)
        // リリース損を超える打点上昇がある時のみ
        const threshold = diff === 'hard' ? 300 : 500
        if (gain >= threshold && (!bestRelease || gain > bestRelease.gain)) {
          bestRelease = { handIdx: i, releaseZone: z, gain }
        }
      }
    }
    if (bestRelease && (bestIdx < 0 || bestRelease.gain > 0)) {
      const releasedStars = p.monsters[bestRelease.releaseZone]!.card.stars ?? 0
      const newStars = p.hand[bestRelease.handIdx].stars ?? 0
      // 通常召喚で同等以上が出せるなら通常を優先
      if (bestIdx < 0 || (p.hand[bestRelease.handIdx].atk ?? 0) > bestScore || newStars > releasedStars) {
        return {
          type: 'summon',
          handIdx: bestRelease.handIdx,
          position: 'attack',
          releaseZone: bestRelease.releaseZone,
        }
      }
    }
  }

  if (bestIdx < 0) return null

  // 表示形式: 守勢(ライフ少・相手が強い)なら守備の固いカードを壁に
  const card = p.hand[bestIdx]
  const oppBest = bestAtk(s, other(me))
  const defensive =
    diff !== 'easy' &&
    p.life <= 2500 &&
    (card.def ?? 0) > (card.atk ?? 0) &&
    (card.atk ?? 0) < oppBest
  return { type: 'summon', handIdx: bestIdx, position: defensive ? 'defense' : 'attack' }
}

// ============================================================
// バトルフェイズの攻撃決定
// ============================================================

export function nextAttack(
  s: GameState,
  me: PlayerIdx,
  diff: Difficulty,
): { attackerZone: number; target: number | 'direct' } | null {
  const oppIdx = other(me)
  const opp = s.players[oppIdx]
  const targets = attackTargets(s)

  const attackers = fieldMonsters(s, me).filter(({ zone }) => canAttackWith(s, zone))
  if (attackers.length === 0) return null

  // 相手の場が空: 全員で直接攻撃
  if (targets.length === 1 && targets[0] === 'direct') {
    return { attackerZone: attackers[0].zone, target: 'direct' }
  }

  // 各攻撃者について、勝てる相手を探す
  for (const { m: attacker, zone } of attackers) {
    const atk = atkOf(attacker)
    let best: { target: number; score: number } | null = null
    for (const t of targets) {
      if (t === 'direct') continue
      const defender = opp.monsters[t]!
      const isMedusa = defender.card.id === 'R08'
      // 難: 高打点モンスターでメデューサに触らない(呪いで失うため)
      if (diff === 'hard' && isMedusa && atk >= 2000) continue

      if (defender.position === 'attack') {
        const dAtk = atkOf(defender)
        if (atk > dAtk) {
          // 勝てる: ダメージ+除去価値
          const score = (atk - dAtk) + dAtk * 0.5
          if (!best || score > best.score) best = { target: t, score }
        } else if (atk === dAtk && diff !== 'easy' && dAtk >= 1500) {
          // 相打ち: 普通・難は高打点同士なら取る
          if (!best || dAtk * 0.3 > best.score) best = { target: t, score: dAtk * 0.3 }
        }
      } else {
        const dDef = defender.card.def ?? 0
        if (atk > dDef) {
          // 壁を除去(ダメージはないので除去価値のみ)
          const score = dDef * 0.4
          if (!best || score > best.score) best = { target: t, score }
        }
      }
    }
    if (best) return { attackerZone: zone, target: best.target }
  }

  // 勝てる相手がいない: 易はここで終了。普通・難も無理攻めしない
  return null
}

// ============================================================
// 罠発動の判断
// ============================================================

export function decideTrap(s: GameState, me: PlayerIdx, diff: Difficulty): number | null {
  const pend = s.pending
  if (!pend || pend.kind !== 'trapPrompt' || pend.forPlayer !== me) return null
  const p = s.players[me]
  const oppIdx = other(me)
  const opp = s.players[oppIdx]
  const trigger = pend.trigger

  // 発動優先度の高い順に評価する
  const ordered = [...pend.zones].sort((a, b) => {
    const pri = (z: number) => {
      const id = p.traps[z]?.card.id
      return id === 'N24' ? 0 : id === 'SR8' ? 1 : id === 'N25' ? 2 : id === 'R12' ? 3 : 4
    }
    return pri(a) - pri(b)
  })

  for (const zone of ordered) {
    const trap = p.traps[zone]
    if (!trap) continue
    const id = trap.card.id

    if (trigger.type === 'summon') {
      if (id === 'R11') {
        const summoned = opp.monsters[trigger.zone]
        if (!summoned) continue
        const atk = summoned.card.atk ?? 0
        const threshold = diff === 'easy' ? 1400 : diff === 'normal' ? 1600 : 1700
        if (atk >= threshold || atk > bestAtk(s, me) + 500) return zone
      }
      continue
    }

    // 攻撃トリガー
    const attacker = opp.monsters[trigger.attackerZone]
    if (!attacker) continue
    const expectedDmg = estimateDamage(s, me, attacker, trigger.target)
    const lethal = expectedDmg >= p.life

    switch (id) {
      case 'N24': {
        // 金縛り
        const threshold = diff === 'easy' ? 800 : diff === 'normal' ? 1200 : 1500
        if (lethal || expectedDmg >= threshold) return zone
        break
      }
      case 'N25': {
        // 神隠し: 高打点を手札に帰すとテンポを取れる
        const threshold = diff === 'easy' ? 1500 : 1800
        if (lethal || atkOf(attacker) >= threshold) return zone
        break
      }
      case 'SR8': {
        // アイギスの盾: 攻撃表示が並んでいる時に撃つほど得
        const count = fieldMonsters(s, oppIdx).filter(({ m }) => m.position === 'attack').length
        const need = diff === 'easy' ? 1 : diff === 'normal' ? 2 : 2
        const totalAtk = fieldMonsters(s, oppIdx)
          .filter(({ m }) => m.position === 'attack')
          .reduce((sum, { m }) => sum + atkOf(m), 0)
        if (lethal || count >= need + 1 || (count >= need && totalAtk >= 3000)) return zone
        break
      }
      case 'R12': {
        // 背水の陣: 直撃が痛い時に壁を出す
        if (lethal || expectedDmg >= (diff === 'easy' ? 1000 : 1500)) return zone
        break
      }
    }
  }
  return null
}

/** この攻撃を通した場合の自分への想定ダメージ */
function estimateDamage(
  s: GameState,
  me: PlayerIdx,
  attacker: FieldMonster,
  target: number | 'direct',
): number {
  const atk = atkOf(attacker)
  if (target === 'direct') return atk
  const defender = s.players[me].monsters[target]
  if (!defender) return atk
  if (defender.position === 'attack') {
    const dAtk = atkOf(defender)
    return atk > dAtk ? atk - dAtk : 0
  }
  return 0 // 守備表示はライフダメージなし
}

// ============================================================
// 効果対象の選択
// ============================================================

export function decideTarget(s: GameState, me: PlayerIdx): TargetOption | null {
  const pend = s.pending
  if (!pend || pend.kind !== 'effectTarget' || pend.forPlayer !== me) return null
  const p = s.players[me]
  const opp = s.players[other(me)]
  const options = pend.options
  if (options.length === 0) return null

  switch (pend.sourceId) {
    case 'N11':
    case 'R07': {
      // 最大打点の相手を守備に寝かす
      return options.reduce((a, b) =>
        atkOf(opp.monsters[a.index]!) >= atkOf(opp.monsters[b.index]!) ? a : b,
      )
    }
    case 'N17':
    case 'SR3':
      return options[0] // 伏せ確認・破壊は先頭でよい
    case 'N18': {
      // 浦島太郎: 最も価値の高いカードを回収(高打点モンスター or 強い魔法)
      const score = (c: Card) =>
        c.type === 'monster' ? (c.atk ?? 0) : c.id === 'SR6' ? 2600 : c.id === 'N19' ? 2000 : 1200
      return options.reduce((a, b) => (score(p.grave[a.index]) >= score(p.grave[b.index]) ? a : b))
    }
    case 'R04': {
      // 安倍晴明: 除去優先でサーチ
      const priority = ['SR6', 'N19', 'R09', 'SR7', 'N24', 'R11', 'N25', 'SR8', 'N21', 'R10']
      return options.reduce((a, b) => {
        const pa = priority.indexOf(p.deck[a.index].id)
        const pb = priority.indexOf(p.deck[b.index].id)
        return (pa < 0 ? 99 : pa) <= (pb < 0 ? 99 : pb) ? a : b
      })
    }
    case 'SR5': {
      // ヴァルキリー: 墓地の最大打点★3以下
      return options.reduce((a, b) =>
        (p.grave[a.index].atk ?? 0) >= (p.grave[b.index].atk ?? 0) ? a : b,
      )
    }
    case 'R12': {
      // 背水の陣: 最も守備の固いモンスターを壁に
      return options.reduce((a, b) =>
        (p.hand[a.index].def ?? 0) >= (p.hand[b.index].def ?? 0) ? a : b,
      )
    }
    default:
      return options[0]
  }
}
