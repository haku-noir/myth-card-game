import type { Card } from '../types/card'
import type {
  Difficulty,
  FieldMonster,
  GameState,
  PlayerIdx,
  ReleaseSpec,
  TargetOption,
} from '../types/game'
import type { ReactionChoice } from '../types/actions'
import {
  attackTargets,
  boostValue,
  canAttackWith,
  canCastMagic,
  canSetTrap,
  canSummon,
  effectiveAtk,
  magicTargets,
  other,
  releaseOptionsFor,
} from './gameEngine'

export type CpuMainAction =
  | { type: 'summon'; handIdx: number; position: 'attack' | 'defense'; release?: ReleaseSpec }
  | { type: 'magic'; handIdx: number; target?: TargetOption }
  | { type: 'setTrap'; handIdx: number }
  | { type: 'endMain' }

const atkOf = effectiveAtk

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

  // --- 1. 除去・弱体化・回復魔法 ---
  for (let i = 0; i < p.hand.length; i++) {
    const card = p.hand[i]
    if (card.type !== 'magic' || !canCastMagic(s, i)) continue
    const targets = magicTargets(s, i)

    switch (card.id) {
      case 'UR4': {
        // 天罰: 易=1体でも使う / 普通・難=2体以上か高打点
        const count = oppMonsters.length
        const totalAtk = oppMonsters.reduce((sum, { m }) => sum + atkOf(m), 0)
        if (diff === 'easy' ? count >= 1 : count >= 2 || totalAtk >= 2300) {
          return { type: 'magic', handIdx: i }
        }
        break
      }
      case 'SR9':
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
      case 'N27': {
        // 神便鬼毒酒: -700で自軍最強が相手最強を上回れる時、または相手が圧倒的な時
        if (!targets || targets.length === 0 || diff === 'easy') break
        const strongest = targets.reduce((a, b) =>
          atkOf(opp.monsters[a.index]!) >= atkOf(opp.monsters[b.index]!) ? a : b,
        )
        const targetAtk = atkOf(opp.monsters[strongest.index]!)
        const flips = targetAtk > myBest && targetAtk - 700 < myBest
        if (flips || targetAtk >= 2800) {
          return { type: 'magic', handIdx: i, target: strongest }
        }
        break
      }
      case 'N21': {
        // 払い清め: 伏せがあれば使う(確認済みの危険な罠を優先)
        if (targets && targets.length > 0) {
          const known = targets.find((t) => {
            const slot = opp.traps[t.index]
            return slot?.knownToOpponent && ['UR5', 'SR10', 'N24'].includes(slot.card.id)
          })
          return { type: 'magic', handIdx: i, target: known ?? targets[0] }
        }
        break
      }
      case 'R10': {
        // 人魚の肉: ライフが減ったら使う
        const threshold = diff === 'easy' ? 6000 : 4000
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
      case 'N29': {
        // お焚き上げ: 鬼火を持っていて攻撃に向かう時(難のみ)
        if (
          diff === 'hard' &&
          s.turnCount > 1 &&
          p.hand.some((c) => c.id === 'N03') &&
          fieldMonsters(s, me).some(({ m }) => m.position === 'attack' && !m.hasAttacked)
        ) {
          return { type: 'magic', handIdx: i }
        }
        break
      }
    }
  }

  // --- 2. 召喚(1ターン1回) ---
  const summonAction = decideSummon(s, me, diff)
  if (summonAction) return summonAction

  // --- 3. バフ(普通・難のみ) ---
  if (diff !== 'easy' && s.turnCount > 1) {
    for (let i = 0; i < p.hand.length; i++) {
      const card = p.hand[i]
      if (card.type !== 'magic' || !canCastMagic(s, i)) continue
      if (card.id === 'N20' && myBest > 0 && oppBest > myBest && oppBest <= myBest + 500) {
        const targets = magicTargets(s, i)
        if (targets && targets.length > 0) {
          const best = targets.reduce((a, b) =>
            atkOf(p.monsters[a.index]!) >= atkOf(p.monsters[b.index]!) ? a : b,
          )
          return { type: 'magic', handIdx: i, target: best }
        }
      }
      if (card.id === 'N23' && fieldMonsters(s, me).length >= 3 && oppMonsters.length <= 1) {
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

/**
 * 召喚判断(v1.2: 1ターン1回・ぴったりブースト)。
 * 通常召喚の最良とブースト召喚の最良を比較して決める。
 */
function decideSummon(s: GameState, me: PlayerIdx, diff: Difficulty): CpuMainAction | null {
  const p = s.players[me]
  if (p.summonUsedThisTurn) return null

  // 通常召喚の最良(出せる中で最強)
  let bestNormal: { handIdx: number; atk: number } | null = null
  for (let i = 0; i < p.hand.length; i++) {
    if (!canSummon(s, i)) continue
    const atk = p.hand[i].atk ?? 0
    if (!bestNormal || atk > bestNormal.atk) bestNormal = { handIdx: i, atk }
  }

  // ブースト召喚の最良(リリースの損失を引いた純益で評価)
  let bestBoost: { handIdx: number; release: ReleaseSpec; net: number; atk: number } | null = null
  if (diff !== 'easy') {
    for (let i = 0; i < p.hand.length; i++) {
      const card = p.hand[i]
      if (card.type !== 'monster') continue
      for (const spec of releaseOptionsFor(s, i)) {
        // リリースの損失: 場のモンスター=実効攻撃力 / 手札=攻撃力×0.8(手札価値)
        const cost =
          spec.source === 'field'
            ? atkOf(p.monsters[spec.index]!)
            : (p.hand[spec.index].atk ?? 0) * 0.8
        const net = (card.atk ?? 0) - cost
        if (!bestBoost || net > bestBoost.net) {
          bestBoost = { handIdx: i, release: spec, net, atk: card.atk ?? 0 }
        }
      }
    }
  }

  // 比較: ブーストは純益が閾値以上、かつ通常召喚より強い時のみ
  const boostThreshold = diff === 'hard' ? 300 : 500
  if (
    bestBoost &&
    bestBoost.net >= boostThreshold &&
    (!bestNormal || bestBoost.atk > bestNormal.atk)
  ) {
    return { type: 'summon', handIdx: bestBoost.handIdx, position: 'attack', release: bestBoost.release }
  }

  if (!bestNormal) return null

  // 表示形式: 守勢(ライフ少・相手が強い)なら守備の固いカードを壁に
  const card = p.hand[bestNormal.handIdx]
  const oppBest = bestAtk(s, other(me))
  const defensive =
    diff !== 'easy' &&
    p.life <= 3000 &&
    (card.def ?? 0) > (card.atk ?? 0) &&
    (card.atk ?? 0) < oppBest
  return { type: 'summon', handIdx: bestNormal.handIdx, position: defensive ? 'defense' : 'attack' }
}

// ============================================================
// バトルフェイズの攻撃決定
// ============================================================

/** 手札から出せる最大の戦闘強化値(難の攻撃判断用) */
function maxCheapBoost(s: GameState, me: PlayerIdx): number {
  const p = s.players[me]
  let best = 0
  for (const c of p.hand) {
    if (c.type !== 'monster') continue
    // 安いカードのみ強化に回す(★3以下 or 鬼火)
    if ((c.stars ?? 9) > 3 && c.id !== 'N03') continue
    const v = boostValue(c, 'attacker', undefined, p.reinforceDoubledThisTurn)
    if (v > best) best = v
  }
  return best
}

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

  // 難は戦闘強化込みの打点で攻撃可否を判断する
  const boostReach = diff === 'hard' ? maxCheapBoost(s, me) : 0

  for (const { m: attacker, zone } of attackers) {
    const atk = atkOf(attacker)
    let best: { target: number; score: number } | null = null
    for (const t of targets) {
      if (t === 'direct') continue
      const defender = opp.monsters[t]!
      const isMedusa = defender.card.id === 'R08'
      if (diff === 'hard' && isMedusa && atk >= 2000) continue

      if (defender.position === 'attack') {
        const dAtk = atkOf(defender)
        if (atk > dAtk) {
          const score = (atk - dAtk) + dAtk * 0.5
          if (!best || score > best.score) best = { target: t, score }
        } else if (atk + boostReach > dAtk && boostReach > 0) {
          // 強化込みなら勝てる(実際の強化はdecideBoostが行う)
          const score = dAtk * 0.4
          if (!best || score > best.score) best = { target: t, score }
        } else if (atk === dAtk && diff !== 'easy' && dAtk >= 1500) {
          if (!best || dAtk * 0.3 > best.score) best = { target: t, score: dAtk * 0.3 }
        }
      } else {
        const dDef = defender.card.def ?? 0
        if (atk > dDef) {
          const score = dDef * 0.4
          if (!best || score > best.score) best = { target: t, score }
        }
      }
    }
    if (best) return { attackerZone: zone, target: best.target }
  }

  return null
}

// ============================================================
// 戦闘強化の判断
// ============================================================

/** 攻撃側の戦闘強化(attackerBoost pending)。捨てる手札インデックス or null */
export function decideBoost(s: GameState, me: PlayerIdx, diff: Difficulty): number | null {
  const pend = s.pending
  if (!pend || pend.kind !== 'attackerBoost' || pend.forPlayer !== me) return null
  const p = s.players[me]
  const oppIdx = other(me)
  const battle = pend.battle
  const attacker = p.monsters[battle.attackerZone]
  if (!attacker) return null
  const atk = atkOf(attacker)

  // 候補: (handIdx, 加算値, 手札価値) 価値の低い順に試す
  const candidates = pend.options
    .map((i) => {
      const c = p.hand[i]
      return {
        handIdx: i,
        value: boostValue(c, 'attacker', undefined, p.reinforceDoubledThisTurn),
        cardWorth: c.id === 'N03' ? 100 : (c.atk ?? 0), // 鬼火は捨てて本望
      }
    })
    .sort((a, b) => a.cardWorth - b.cardWorth)

  if (battle.target === 'direct') {
    // 直接攻撃: トドメが刺せる時のみ強化(難は鬼火なら気軽に使う)
    const oppLife = s.players[oppIdx].life
    for (const c of candidates) {
      if (atk < oppLife && atk + c.value >= oppLife) return c.handIdx
    }
    if (diff === 'hard') {
      const onibi = candidates.find((c) => p.hand[c.handIdx].id === 'N03')
      if (onibi && oppLife <= 4000) return onibi.handIdx
    }
    return null
  }

  const defender = s.players[oppIdx].monsters[battle.target]
  if (!defender) return null
  const defValue = defender.position === 'attack' ? atkOf(defender) : (defender.card.def ?? 0)

  if (atk > defValue) return null // すでに勝っている

  // 負け・相打ちの状況: 安いカードでひっくり返せるなら強化
  for (const c of candidates) {
    if (atk + c.value > defValue) {
      // 易は★2以下(または鬼火)しか切らない
      const card = p.hand[c.handIdx]
      if (diff === 'easy' && (card.stars ?? 9) > 2 && card.id !== 'N03') continue
      return c.handIdx
    }
  }
  return null
}

/** 防御側リアクション(defenderReaction pending)。罠/強化/何もしない */
export function decideReaction(s: GameState, me: PlayerIdx, diff: Difficulty): ReactionChoice {
  const pend = s.pending
  if (!pend || pend.kind !== 'defenderReaction' || pend.forPlayer !== me) return null
  const p = s.players[me]
  const oppIdx = other(me)
  const battle = pend.battle
  const attacker = s.players[oppIdx].monsters[battle.attackerZone]
  if (!attacker) return null
  const attackerValue = atkOf(attacker) + battle.attackerBoost

  const defender = battle.target !== 'direct' ? p.monsters[battle.target] : null
  const defValue = defender
    ? defender.position === 'attack'
      ? atkOf(defender)
      : (defender.card.def ?? 0)
    : 0
  // この攻撃を通した場合の想定被ダメージ
  const expectedDmg =
    battle.target === 'direct'
      ? attackerValue
      : defender && defender.position === 'attack' && attackerValue > defValue
        ? attackerValue - defValue
        : 0
  const lethal = expectedDmg >= p.life

  // --- 罠の評価(優先度順) ---
  const trapsByPriority = [...pend.trapZones].sort((a, b) => {
    const pri = (z: number) => {
      const id = p.traps[z]?.card.id
      return id === 'N24' ? 0 : id === 'UR5' ? 1 : id === 'R14' ? 2 : id === 'N28' ? 3 : 4
    }
    return pri(a) - pri(b)
  })

  for (const zone of trapsByPriority) {
    const trap = p.traps[zone]
    if (!trap) continue
    switch (trap.card.id) {
      case 'N24': {
        // 金縛り
        const threshold = diff === 'easy' ? 800 : diff === 'normal' ? 1200 : 1500
        if (lethal || expectedDmg >= threshold) return { type: 'trap', zone }
        break
      }
      case 'R14': {
        // 神隠し
        const threshold = diff === 'easy' ? 1500 : 1800
        if (lethal || attackerValue >= threshold) return { type: 'trap', zone }
        break
      }
      case 'UR5': {
        // アイギスの盾
        const oppAttackers = fieldMonsters(s, oppIdx).filter(({ m }) => m.position === 'attack')
        const totalAtk = oppAttackers.reduce((sum, { m }) => sum + atkOf(m), 0)
        const need = diff === 'easy' ? 1 : 2
        if (lethal || oppAttackers.length >= need + 1 || (oppAttackers.length >= need && totalAtk >= 3500)) {
          return { type: 'trap', zone }
        }
        break
      }
      case 'N28': {
        // 砂かけ婆: -600で戦闘がひっくり返る、または直撃の軽減
        if (defender && attackerValue > defValue && attackerValue - 600 < defValue) {
          return { type: 'trap', zone }
        }
        if (battle.target === 'direct' && (lethal || expectedDmg >= 1800)) {
          return { type: 'trap', zone }
        }
        break
      }
      case 'R12': {
        // 背水の陣
        if (lethal || expectedDmg >= (diff === 'easy' ? 1000 : 1500)) return { type: 'trap', zone }
        break
      }
    }
  }

  // --- 戦闘強化の評価(罠を使わなかった場合) ---
  if (defender && pend.boostOptions.length > 0) {
    const candidates = pend.boostOptions
      .map((i) => {
        const c = p.hand[i]
        return {
          handIdx: i,
          value: boostValue(c, 'defender', defender.position, p.reinforceDoubledThisTurn),
          cardWorth: c.id === 'N10' && defender.position === 'defense' ? 100 : (c.atk ?? 0),
        }
      })
      .sort((a, b) => a.cardWorth - b.cardWorth)

    for (const c of candidates) {
      const newValue = defValue + c.value
      const card = p.hand[c.handIdx]
      const cheap = (card.stars ?? 9) <= 3 || card.id === 'N10'
      if (diff === 'easy' && !cheap) continue
      if (defender.position === 'attack') {
        // 返り討ち(攻撃側が死ぬ)になるなら強化
        if (attackerValue > defValue && newValue > attackerValue) return { type: 'boost', handIdx: c.handIdx }
        // 相打ちで自分の主力を守る
        if (diff === 'hard' && attackerValue === defValue && newValue > attackerValue && atkOf(defender) >= 1500) {
          return { type: 'boost', handIdx: c.handIdx }
        }
      } else {
        // 守備: 破壊を防げるなら強化(被ダメなしなので安いカード限定)
        if (attackerValue > defValue && newValue >= attackerValue && cheap) {
          return { type: 'boost', handIdx: c.handIdx }
        }
      }
    }
  }

  return null
}

// ============================================================
// 罠発動の判断(召喚トリガー: 落とし穴)
// ============================================================

export function decideTrap(s: GameState, me: PlayerIdx, diff: Difficulty): number | null {
  const pend = s.pending
  if (!pend || pend.kind !== 'trapPrompt' || pend.forPlayer !== me) return null
  const p = s.players[me]
  const oppIdx = other(me)
  const opp = s.players[oppIdx]
  const trigger = pend.trigger
  if (trigger.type !== 'summon') return null

  for (const zone of pend.zones) {
    const trap = p.traps[zone]
    if (!trap || trap.card.id !== 'SR10') continue
    const summoned = opp.monsters[trigger.zone]
    if (!summoned) continue
    const atk = summoned.card.atk ?? 0
    const threshold = diff === 'easy' ? 1400 : diff === 'normal' ? 1600 : 1700
    if (atk >= threshold || atk > bestAtk(s, me) + 500) return zone
  }
  return null
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
      // 浦島太郎: 最も価値の高いカードを回収
      const score = (c: Card) =>
        c.type === 'monster' ? (c.atk ?? 0) : c.id === 'UR4' ? 2600 : c.id === 'SR9' ? 2000 : 1200
      return options.reduce((a, b) => (score(p.grave[a.index]) >= score(p.grave[b.index]) ? a : b))
    }
    case 'R04': {
      // 安倍晴明: 除去・弱体化優先でサーチ
      const priority = ['UR4', 'SR9', 'R09', 'SR7', 'N24', 'SR10', 'N27', 'R14', 'UR5', 'N21', 'N28', 'R10']
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
