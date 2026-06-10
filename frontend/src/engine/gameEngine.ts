import { produce, type Draft } from 'immer'
import type { Card } from '../types/card'
import {
  INITIAL_HAND,
  INITIAL_LIFE,
  MONSTER_ZONES,
  TRAP_ZONES,
  type FieldMonster,
  type GameState,
  type PlayerIdx,
  type PlayerState,
  type TargetOption,
  type TrapTrigger,
} from '../types/game'

type D = Draft<GameState>

export const other = (p: PlayerIdx): PlayerIdx => (p === 0 ? 1 : 0)

const log = (d: D, message: string) => {
  d.log.push({ turn: d.turnCount, message })
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

// ============================================================
// ゲーム生成・ターン進行
// ============================================================

function makePlayer(name: string, deck: Card[], isFirst: boolean): PlayerState {
  const d = shuffle(deck)
  return {
    name,
    life: INITIAL_LIFE,
    // ターン開始時に+1されるので、先攻は第1ターンでLv1、後攻はLv2になる
    level: isFirst ? 0 : 1,
    hand: d.slice(0, INITIAL_HAND),
    deck: d.slice(INITIAL_HAND),
    grave: [],
    monsters: Array(MONSTER_ZONES).fill(null),
    traps: Array(TRAP_ZONES).fill(null),
  }
}

export function createGame(
  decks: [Card[], Card[]],
  names: [string, string],
  firstPlayer: PlayerIdx,
): GameState {
  const second = other(firstPlayer)
  const players: [PlayerState, PlayerState] = [
    makePlayer(names[0], decks[0], firstPlayer === 0),
    makePlayer(names[1], decks[1], firstPlayer === 1),
  ]
  const state: GameState = {
    phase: 'main',
    turnPlayer: firstPlayer,
    turnCount: 0,
    firstPlayer,
    players,
    log: [
      { turn: 0, message: `先攻: ${players[firstPlayer].name} / 後攻: ${players[second].name}` },
    ],
  }
  return startTurn(state)
}

function startTurn(s: GameState): GameState {
  return produce(s, (d) => {
    d.turnCount++
    const p = d.players[d.turnPlayer]
    p.level++
    for (const m of p.monsters) {
      if (m) {
        m.hasAttacked = false
        m.changedPositionThisTurn = false
        m.summonedThisTurn = false
      }
    }
    log(d, `── ターン${d.turnCount}: ${p.name}(Lv${p.level}) ──`)
    if (p.deck.length === 0) {
      d.winner = other(d.turnPlayer)
      d.winReason = `${p.name}はデッキ切れでドローできない`
      d.phase = 'ended'
      log(d, d.winReason)
      return
    }
    p.hand.push(p.deck.shift()!)
    d.phase = 'main'
  })
}

export function endTurn(s: GameState): GameState {
  const cleaned = produce(s, (d) => {
    // ターン終了時処理: メデューサ印の破壊と「ターン終了時まで」バフの解除
    for (const pi of [0, 1] as const) {
      const p = d.players[pi]
      for (let z = 0; z < MONSTER_ZONES; z++) {
        const m = p.monsters[z]
        if (!m) continue
        if (m.destroyAtEndOfTurn) {
          log(d, `${m.card.name}はメデューサの呪いで破壊された`)
          p.grave.push(m.card)
          p.monsters[z] = null
        } else {
          m.atkBuff = 0
        }
      }
    }
    d.turnPlayer = other(d.turnPlayer)
  })
  return startTurn(cleaned)
}

export function toBattlePhase(s: GameState): GameState {
  return produce(s, (d) => {
    d.phase = 'battle'
    log(d, 'バトルフェイズ')
  })
}

/** 先攻の第1ターンは攻撃できない */
export const canEnterBattle = (s: GameState): boolean =>
  s.phase === 'main' && !s.pending && s.turnCount > 1

// ============================================================
// 共通ヘルパー
// ============================================================

const effectiveAtk = (m: FieldMonster) => (m.card.atk ?? 0) + m.atkBuff

function destroyMonster(d: D, owner: PlayerIdx, zone: number, cause: string) {
  const m = d.players[owner].monsters[zone]
  if (!m) return
  log(d, `${m.card.name}は${cause}により破壊された`)
  d.players[owner].grave.push(m.card)
  d.players[owner].monsters[zone] = null
}

function checkLifeWinner(d: D) {
  for (const pi of [0, 1] as const) {
    if (d.players[pi].life <= 0) {
      d.players[pi].life = 0
      d.winner = other(pi)
      d.winReason = `${d.players[pi].name}のライフが0になった`
      d.phase = 'ended'
      log(d, d.winReason)
      return
    }
  }
}

function firstEmptyZone(p: PlayerState | Draft<PlayerState>): number {
  return p.monsters.findIndex((m) => m === null)
}

/** レベル無視でモンスターを場に置く(「場に出す」。召喚時効果は発動しない) */
function placeMonster(
  d: D,
  owner: PlayerIdx,
  card: Card,
  position: 'attack' | 'defense',
): number {
  const zone = firstEmptyZone(d.players[owner])
  if (zone < 0) return -1
  d.players[owner].monsters[zone] = {
    card,
    position,
    hasAttacked: false,
    changedPositionThisTurn: false,
    summonedThisTurn: true,
    atkBuff: 0,
    destroyAtEndOfTurn: false,
  }
  return zone
}

// ============================================================
// 召喚
// ============================================================

/** 通常召喚できる星の上限(リリースなし) */
export const summonLimit = (s: GameState, p: PlayerIdx): number => s.players[p].level

/** 手札のモンスターが通常召喚可能か */
export function canSummon(s: GameState, handIdx: number): boolean {
  const p = s.players[s.turnPlayer]
  const card = p.hand[handIdx]
  return (
    s.phase === 'main' &&
    !s.pending &&
    !!card &&
    card.type === 'monster' &&
    (card.stars ?? 99) <= p.level &&
    firstEmptyZone(p) >= 0
  )
}

/** リリースすれば召喚可能になる自分フィールドのゾーン一覧 */
export function releaseOptionsFor(s: GameState, handIdx: number): number[] {
  const p = s.players[s.turnPlayer]
  const card = p.hand[handIdx]
  if (s.phase !== 'main' || s.pending || !card || card.type !== 'monster') return []
  const stars = card.stars ?? 99
  if (stars <= p.level) return [] // リリース不要
  const zones: number[] = []
  for (let z = 0; z < MONSTER_ZONES; z++) {
    const m = p.monsters[z]
    if (m && stars <= p.level + (m.card.stars ?? 0)) zones.push(z)
  }
  return zones
}

/**
 * 召喚(releaseZone指定でブースト召喚)。
 * 相手に落とし穴があれば罠確認のpendingを立てる。
 */
export function summon(
  s: GameState,
  handIdx: number,
  position: 'attack' | 'defense',
  releaseZone?: number,
): GameState {
  return produce(s, (d) => {
    const me = d.turnPlayer
    const p = d.players[me]
    const card = p.hand[handIdx]
    if (!card || card.type !== 'monster' || d.phase !== 'main' || d.pending) return

    let limit = p.level
    if (releaseZone !== undefined) {
      const rel = p.monsters[releaseZone]
      if (!rel) return
      limit += rel.card.stars ?? 0
      log(d, `${p.name}は${rel.card.name}をリリース`)
      p.grave.push(rel.card)
      p.monsters[releaseZone] = null
    }
    if ((card.stars ?? 99) > limit) return
    const zone = firstEmptyZone(p)
    if (zone < 0) return

    p.hand.splice(handIdx, 1)
    p.monsters[zone] = {
      card,
      position,
      hasAttacked: false,
      changedPositionThisTurn: false,
      summonedThisTurn: true,
      atkBuff: 0,
      destroyAtEndOfTurn: false,
    }
    log(d, `${p.name}は${card.name}を${position === 'attack' ? '攻撃' : '守備'}表示で召喚`)

    // 相手の罠チェック(召喚トリガー: 落とし穴)
    const opp = other(me)
    const trapZones = usableTrapZones(d, opp, { type: 'summon', zone })
    if (trapZones.length > 0) {
      d.pending = { kind: 'trapPrompt', forPlayer: opp, zones: trapZones, trigger: { type: 'summon', zone } }
    } else {
      queueSummonEffect(d, zone)
    }
  })
}

/** 召喚時効果の処理(対象選択が必要ならpendingを立てる) */
function queueSummonEffect(d: D, zone: number) {
  const me = d.turnPlayer
  const p = d.players[me]
  const opp = d.players[other(me)]
  const m = p.monsters[zone]
  if (!m) return // 落とし穴で破壊済みなら効果は発動しない

  const id = m.card.id
  switch (id) {
    case 'N05': {
      // 座敷童子: 1ドロー(デッキが空なら何も起きない)
      if (p.deck.length > 0) {
        p.hand.push(p.deck.shift()!)
        log(d, `${m.card.name}の効果: 1枚ドロー`)
      }
      return
    }
    case 'N11':
    case 'R07': {
      // 相手モンスター1体を守備表示にできる
      const options = optionList(opp.monsters, (fm) => fm.position === 'attack', 'oppMonster')
      setEffectTarget(d, me, id, options)
      return
    }
    case 'N17': {
      // 卑弥呼: 相手の伏せ1枚を確認できる
      const options = trapOptionList(opp.traps)
      setEffectTarget(d, me, id, options)
      return
    }
    case 'N18': {
      // 浦島太郎: 自分の墓地1枚を回収できる
      const options = p.grave.map((_, i) => ({ area: 'grave' as const, index: i }))
      setEffectTarget(d, me, id, options)
      return
    }
    case 'R04': {
      // 安倍晴明: デッキから魔法・罠をサーチ
      const options = p.deck
        .map((c, i) => ({ card: c, i }))
        .filter(({ card }) => card.type !== 'monster')
        .map(({ i }) => ({ area: 'deck' as const, index: i }))
      setEffectTarget(d, me, id, options)
      return
    }
    case 'SR3': {
      // 織田信長: 相手の伏せ1枚を破壊できる
      const options = trapOptionList(opp.traps)
      setEffectTarget(d, me, id, options)
      return
    }
    case 'SR5': {
      // ヴァルキリー: 墓地の★3以下を場に出せる
      if (firstEmptyZone(p) < 0) return
      const options = p.grave
        .map((c, i) => ({ card: c, i }))
        .filter(({ card }) => card.type === 'monster' && (card.stars ?? 99) <= 3)
        .map(({ i }) => ({ area: 'grave' as const, index: i }))
      setEffectTarget(d, me, id, options)
      return
    }
  }
}

function optionList(
  monsters: (FieldMonster | null)[] | Draft<(FieldMonster | null)[]>,
  pred: (m: FieldMonster) => boolean,
  area: 'oppMonster' | 'ownMonster',
): TargetOption[] {
  const out: TargetOption[] = []
  monsters.forEach((m, i) => {
    if (m && pred(m as FieldMonster)) out.push({ area, index: i })
  })
  return out
}

function trapOptionList(traps: Draft<PlayerState>['traps'] | PlayerState['traps']): TargetOption[] {
  const out: TargetOption[] = []
  traps.forEach((t, i) => {
    if (t) out.push({ area: 'oppTrap', index: i })
  })
  return out
}

function setEffectTarget(d: D, forPlayer: PlayerIdx, sourceId: string, options: TargetOption[]) {
  if (options.length === 0) return
  d.pending = { kind: 'effectTarget', forPlayer, sourceId, optional: true, options }
}

// ============================================================
// 罠
// ============================================================

/** トリガーに対して発動可能な罠ゾーン一覧 */
function usableTrapZones(d: D, owner: PlayerIdx, trigger: TrapTrigger): number[] {
  const p = d.players[owner]
  const zones: number[] = []
  for (let z = 0; z < TRAP_ZONES; z++) {
    const t = p.traps[z]
    if (!t || t.setOnTurn === d.turnCount) continue // セットしたターンは発動不可
    const id = t.card.id
    if (trigger.type === 'summon') {
      if (id === 'R11') zones.push(z) // 落とし穴
    } else {
      if (id === 'N24' || id === 'N25') zones.push(z) // 金縛り・神隠し
      if (id === 'SR8') zones.push(z) // アイギスの盾
      if (id === 'R12') {
        // 背水の陣: 自分の場が空・手札にモンスター・(直接攻撃時のみ成立)
        const fieldEmpty = p.monsters.every((m) => m === null)
        const hasHandMonster = p.hand.some((c) => c.type === 'monster')
        if (fieldEmpty && hasHandMonster && trigger.target === 'direct') zones.push(z)
      }
    }
  }
  return zones
}

export function canSetTrap(s: GameState, handIdx: number): boolean {
  const p = s.players[s.turnPlayer]
  const card = p.hand[handIdx]
  return (
    s.phase === 'main' &&
    !s.pending &&
    !!card &&
    card.type === 'trap' &&
    p.traps.some((t) => t === null)
  )
}

export function setTrap(s: GameState, handIdx: number): GameState {
  return produce(s, (d) => {
    if (!canSetTrap(s, handIdx)) return
    const p = d.players[d.turnPlayer]
    const card = p.hand[handIdx]
    const zone = p.traps.findIndex((t) => t === null)
    p.hand.splice(handIdx, 1)
    p.traps[zone] = { card, setOnTurn: d.turnCount, knownToOpponent: false }
    log(d, `${p.name}はカードを1枚セットした`)
  })
}

/** 罠発動の応答。zone=null は発動しない */
export function respondTrap(s: GameState, zone: number | null): GameState {
  return produce(s, (d) => {
    const pend = d.pending
    if (!pend || pend.kind !== 'trapPrompt') return
    d.pending = undefined
    const trigger = pend.trigger

    if (zone === null) {
      continueAfterTrapWindow(d, trigger)
      return
    }

    const owner = pend.forPlayer
    const p = d.players[owner]
    const slot = p.traps[zone]
    if (!slot) {
      continueAfterTrapWindow(d, trigger)
      return
    }
    p.traps[zone] = null
    p.grave.push(slot.card)
    log(d, `${p.name}は罠「${slot.card.name}」を発動!`)

    const attacker = other(owner) // トリガーを起こした側
    switch (slot.card.id) {
      case 'R11': {
        // 落とし穴: 召喚されたモンスターを破壊(召喚時効果は発動しない)
        if (trigger.type === 'summon') destroyMonster(d, attacker, trigger.zone, '落とし穴')
        return
      }
      case 'N24': {
        // 金縛り: 攻撃無効(攻撃権は消費)
        if (trigger.type === 'attack') {
          const m = d.players[attacker].monsters[trigger.attackerZone]
          if (m) m.hasAttacked = true
          log(d, '攻撃は無効化された')
        }
        return
      }
      case 'N25': {
        // 神隠し: 攻撃モンスターを手札に戻す
        if (trigger.type === 'attack') {
          const m = d.players[attacker].monsters[trigger.attackerZone]
          if (m) {
            d.players[attacker].hand.push(m.card)
            d.players[attacker].monsters[trigger.attackerZone] = null
            log(d, `${m.card.name}は手札に戻された`)
          }
        }
        return
      }
      case 'SR8': {
        // アイギスの盾: 攻撃側の攻撃表示モンスターを全破壊
        if (trigger.type === 'attack') {
          for (let z = 0; z < MONSTER_ZONES; z++) {
            const m = d.players[attacker].monsters[z]
            if (m && m.position === 'attack') destroyMonster(d, attacker, z, 'アイギスの盾')
          }
        }
        return
      }
      case 'R12': {
        // 背水の陣: 手札からモンスターを選んで場に出す(必須選択)
        if (trigger.type === 'attack') {
          const options = p.hand
            .map((c, i) => ({ card: c, i }))
            .filter(({ card }) => card.type === 'monster')
            .map(({ i }) => ({ area: 'hand' as const, index: i }))
          d.pending = {
            kind: 'effectTarget',
            forPlayer: owner,
            sourceId: 'R12',
            optional: false,
            options,
            ctx: { attackerZone: trigger.attackerZone },
          }
        }
        return
      }
    }
  })
}

function continueAfterTrapWindow(d: D, trigger: TrapTrigger) {
  if (trigger.type === 'summon') {
    queueSummonEffect(d, trigger.zone)
  } else {
    resolveBattle(d, trigger.attackerZone, trigger.target)
  }
}

// ============================================================
// 効果対象の応答
// ============================================================

/** 効果対象の応答。choice=null はスキップ(optionalのみ) */
export function respondTarget(s: GameState, choice: TargetOption | null): GameState {
  return produce(s, (d) => {
    const pend = d.pending
    if (!pend || pend.kind !== 'effectTarget') return
    if (choice === null && !pend.optional) return // 必須選択はスキップ不可
    d.pending = undefined

    const me = pend.forPlayer
    const p = d.players[me]
    const opp = d.players[other(me)]

    if (choice === null) {
      log(d, '効果の発動を見送った')
      return
    }

    switch (pend.sourceId) {
      case 'N11':
      case 'R07': {
        const m = opp.monsters[choice.index]
        if (m) {
          m.position = 'defense'
          log(d, `${m.card.name}は守備表示になった`)
        }
        return
      }
      case 'N17': {
        const t = opp.traps[choice.index]
        if (t) {
          t.knownToOpponent = true
          log(d, `${p.name}は伏せカード「${t.card.name}」を確認した`)
        }
        return
      }
      case 'N18': {
        const card = p.grave[choice.index]
        if (card) {
          p.grave.splice(choice.index, 1)
          p.hand.push(card)
          log(d, `${card.name}を墓地から手札に戻した`)
        }
        return
      }
      case 'R04': {
        const card = p.deck[choice.index]
        if (card) {
          p.deck.splice(choice.index, 1)
          p.hand.push(card)
          p.deck = shuffle(p.deck as Card[])
          log(d, `${card.name}をデッキから手札に加えた`)
        }
        return
      }
      case 'SR3': {
        const t = opp.traps[choice.index]
        if (t) {
          opp.traps[choice.index] = null
          opp.grave.push(t.card)
          log(d, `伏せカード「${t.card.name}」を破壊した`)
        }
        return
      }
      case 'SR5': {
        const card = p.grave[choice.index]
        if (card && card.type === 'monster' && (card.stars ?? 99) <= 3) {
          p.grave.splice(choice.index, 1)
          const zone = placeMonster(d, me, card, 'attack')
          if (zone >= 0) log(d, `${card.name}を墓地から場に出した`)
          else p.grave.push(card)
        }
        return
      }
      case 'R12': {
        // 背水の陣: 選んだモンスターを守備表示で場に出し、攻撃をそのモンスターへ
        const card = p.hand[choice.index]
        const attackerZone = pend.ctx?.attackerZone
        if (card && card.type === 'monster' && attackerZone !== undefined) {
          p.hand.splice(choice.index, 1)
          const zone = placeMonster(d, me, card, 'defense')
          log(d, `${card.name}を守備表示で場に出した。攻撃はこのモンスターへ向かう`)
          resolveBattle(d, attackerZone, zone)
        }
        return
      }
    }
  })
}

// ============================================================
// 魔法
// ============================================================

/** 魔法の対象候補。対象不要ならnull、発動不可なら空配列を返す */
export function magicTargets(s: GameState, handIdx: number): TargetOption[] | null {
  const p = s.players[s.turnPlayer]
  const opp = s.players[other(s.turnPlayer)]
  const card = p.hand[handIdx]
  if (!card || card.type !== 'magic') return []

  switch (card.id) {
    case 'N19': // 鬼退治
    case 'R09': // 強制送還
      return optionList(opp.monsters, () => true, 'oppMonster')
    case 'N20': // 草薙剣
      return optionList(p.monsters, () => true, 'ownMonster')
    case 'N21': // 払い清め
      return trapOptionList(opp.traps)
    case 'N22': {
      // 死者の声: 自分の場が空の時のみ
      if (p.monsters.some((m) => m !== null)) return []
      return p.grave
        .map((c, i) => ({ card: c, i }))
        .filter(({ card: c }) => c.type === 'monster')
        .map(({ i }) => ({ area: 'grave' as const, index: i }))
    }
    case 'N23': // 軍配: 対象不要(自分の場に1体以上)
      return p.monsters.some((m) => m !== null) ? null : []
    case 'R10': // 人魚の肉: 対象不要
      return null
    case 'SR6': // 天罰: 対象不要(相手の場に1体以上)
      return opp.monsters.some((m) => m !== null) ? null : []
    case 'SR7': {
      // 黄泉返り
      if (s.players[s.turnPlayer].monsters.every((m) => m !== null)) return []
      return p.grave
        .map((c, i) => ({ card: c, i }))
        .filter(({ card: c }) => c.type === 'monster')
        .map(({ i }) => ({ area: 'grave' as const, index: i }))
    }
    default:
      return []
  }
}

export function canCastMagic(s: GameState, handIdx: number): boolean {
  if (s.phase !== 'main' || s.pending) return false
  const card = s.players[s.turnPlayer].hand[handIdx]
  if (!card || card.type !== 'magic') return false
  const targets = magicTargets(s, handIdx)
  return targets === null || targets.length > 0
}

export function castMagic(s: GameState, handIdx: number, target?: TargetOption): GameState {
  return produce(s, (d) => {
    if (!canCastMagic(s, handIdx)) return
    const me = d.turnPlayer
    const p = d.players[me]
    const opp = d.players[other(me)]
    const card = p.hand[handIdx]
    p.hand.splice(handIdx, 1)
    log(d, `${p.name}は魔法「${card.name}」を発動`)

    switch (card.id) {
      case 'N19':
        if (target) destroyMonster(d, other(me), target.index, '鬼退治')
        break
      case 'N20': {
        const m = target ? p.monsters[target.index] : null
        if (m) {
          m.atkBuff += 500
          log(d, `${m.card.name}の攻撃力+500(ターン終了時まで)`)
        }
        break
      }
      case 'N21': {
        const t = target ? opp.traps[target.index] : null
        if (t && target) {
          opp.traps[target.index] = null
          opp.grave.push(t.card)
          log(d, `伏せカード「${t.card.name}」を破壊した`)
        }
        break
      }
      case 'N22': {
        const c = target ? p.grave[target.index] : null
        if (c && target) {
          p.grave.splice(target.index, 1)
          placeMonster(d, me, c, 'defense')
          log(d, `${c.name}を守備表示で場に出した`)
        }
        break
      }
      case 'N23':
        for (const m of p.monsters) if (m) m.atkBuff += 300
        log(d, '自分の全モンスターの攻撃力+300(ターン終了時まで)')
        break
      case 'R09': {
        const m = target ? opp.monsters[target.index] : null
        if (m && target) {
          opp.hand.push(m.card)
          opp.monsters[target.index] = null
          log(d, `${m.card.name}は手札に戻された`)
        }
        break
      }
      case 'R10':
        p.life += 1500
        log(d, `ライフを1500回復(→${p.life})`)
        break
      case 'SR6':
        for (let z = 0; z < MONSTER_ZONES; z++) {
          if (opp.monsters[z]) destroyMonster(d, other(me), z, '天罰')
        }
        break
      case 'SR7': {
        const c = target ? p.grave[target.index] : null
        if (c && target) {
          p.grave.splice(target.index, 1)
          placeMonster(d, me, c, 'attack')
          log(d, `${c.name}を攻撃表示で場に出した`)
        }
        break
      }
    }
    p.grave.push(card)
  })
}

// ============================================================
// 表示形式変更
// ============================================================

export function canChangePosition(s: GameState, zone: number): boolean {
  const m = s.players[s.turnPlayer].monsters[zone]
  return (
    s.phase === 'main' &&
    !s.pending &&
    !!m &&
    !m.hasAttacked &&
    !m.changedPositionThisTurn
  )
}

export function changePosition(s: GameState, zone: number): GameState {
  return produce(s, (d) => {
    if (!canChangePosition(s, zone)) return
    const m = d.players[d.turnPlayer].monsters[zone]!
    m.position = m.position === 'attack' ? 'defense' : 'attack'
    m.changedPositionThisTurn = true
    log(d, `${m.card.name}を${m.position === 'attack' ? '攻撃' : '守備'}表示に変更`)
  })
}

// ============================================================
// バトル
// ============================================================

export function canAttackWith(s: GameState, zone: number): boolean {
  const m = s.players[s.turnPlayer].monsters[zone]
  return s.phase === 'battle' && !s.pending && !!m && m.position === 'attack' && !m.hasAttacked
}

/** 攻撃対象の候補(相手モンスターのゾーン、いなければ'direct') */
export function attackTargets(s: GameState): (number | 'direct')[] {
  const opp = s.players[other(s.turnPlayer)]
  const zones: (number | 'direct')[] = []
  opp.monsters.forEach((m, i) => {
    if (m) zones.push(i)
  })
  return zones.length > 0 ? zones : ['direct']
}

export function declareAttack(s: GameState, attackerZone: number, target: number | 'direct'): GameState {
  return produce(s, (d) => {
    if (!canAttackWith(s, attackerZone)) return
    const me = d.turnPlayer
    const opp = other(me)
    const attacker = d.players[me].monsters[attackerZone]!
    // 直接攻撃は相手の場が空の時のみ
    const oppHasMonster = d.players[opp].monsters.some((m) => m !== null)
    if (target === 'direct' && oppHasMonster) return
    if (target !== 'direct' && !d.players[opp].monsters[target]) return

    attacker.hasAttacked = true // 金縛りで無効化されても攻撃権は消費
    const targetName =
      target === 'direct' ? '直接攻撃' : `${d.players[opp].monsters[target]!.card.name}に攻撃`
    log(d, `${attacker.card.name}が${targetName}を宣言`)

    const trapZones = usableTrapZones(d, opp, { type: 'attack', attackerZone, target })
    if (trapZones.length > 0) {
      d.pending = {
        kind: 'trapPrompt',
        forPlayer: opp,
        zones: trapZones,
        trigger: { type: 'attack', attackerZone, target },
      }
    } else {
      resolveBattle(d, attackerZone, target)
    }
  })
}

function resolveBattle(d: D, attackerZone: number, target: number | 'direct') {
  const me = d.turnPlayer
  const oppIdx = other(me)
  const attacker = d.players[me].monsters[attackerZone]
  if (!attacker) return // 罠で除去された場合など

  const atk = effectiveAtk(attacker)

  if (target === 'direct') {
    d.players[oppIdx].life -= atk
    log(d, `直接攻撃! ${d.players[oppIdx].name}に${atk}ダメージ(残り${Math.max(0, d.players[oppIdx].life)})`)
    checkLifeWinner(d)
    return
  }

  const defender = d.players[oppIdx].monsters[target]
  if (!defender) return

  const attackerIsMedusa = attacker.card.id === 'R08'
  const defenderIsMedusa = defender.card.id === 'R08'

  if (defender.position === 'attack') {
    const dAtk = effectiveAtk(defender)
    if (atk > dAtk) {
      const diff = atk - dAtk
      destroyMonster(d, oppIdx, target, '戦闘')
      d.players[oppIdx].life -= diff
      log(d, `${d.players[oppIdx].name}に${diff}ダメージ(残り${Math.max(0, d.players[oppIdx].life)})`)
      if (defenderIsMedusa) attacker.destroyAtEndOfTurn = true
    } else if (atk === dAtk) {
      destroyMonster(d, oppIdx, target, '戦闘')
      destroyMonster(d, me, attackerZone, '戦闘')
    } else {
      const diff = dAtk - atk
      destroyMonster(d, me, attackerZone, '戦闘')
      d.players[me].life -= diff
      log(d, `${d.players[me].name}に${diff}ダメージ(残り${Math.max(0, d.players[me].life)})`)
      if (attackerIsMedusa) defender.destroyAtEndOfTurn = true
    }
  } else {
    const dDef = defender.card.def ?? 0
    if (atk > dDef) {
      destroyMonster(d, oppIdx, target, '戦闘')
      if (defenderIsMedusa) attacker.destroyAtEndOfTurn = true
    } else if (atk < dDef) {
      const diff = dDef - atk
      d.players[me].life -= diff
      log(d, `守備は固い! ${d.players[me].name}に${diff}ダメージ(残り${Math.max(0, d.players[me].life)})`)
      if (attackerIsMedusa) defender.destroyAtEndOfTurn = true
      if (defenderIsMedusa) attacker.destroyAtEndOfTurn = true
    } else {
      log(d, '攻守同値。どちらも破壊されない')
      if (attackerIsMedusa) defender.destroyAtEndOfTurn = true
      if (defenderIsMedusa) attacker.destroyAtEndOfTurn = true
    }
  }
  checkLifeWinner(d)
}
