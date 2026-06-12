import { produce, type Draft } from 'immer'
import type { Card } from '../types/card'
import {
  INITIAL_HAND,
  INITIAL_LIFE,
  MONSTER_ZONES,
  TRAP_ZONES,
  type BattleContext,
  type FieldMonster,
  type GameState,
  type PlayerIdx,
  type PlayerState,
  type ReleaseSpec,
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
    summonUsedThisTurn: false,
    reinforceDoubledThisTurn: false,
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
    p.summonUsedThisTurn = false
    p.reinforceDoubledThisTurn = false
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
    // ターン終了時処理: メデューサ印の破壊と期限切れバフの解除
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
          m.buffs = m.buffs.filter((b) => b.expiresAfterTurn > d.turnCount)
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

/** 実効攻撃力(期限付きバフ込み・0未満は0) */
export const effectiveAtk = (m: FieldMonster): number =>
  Math.max(0, (m.card.atk ?? 0) + m.buffs.reduce((sum, b) => sum + b.amount, 0))

/** 実効守備力(期限付きバフ込み・0未満は0)。v1.6: 草薙剣・毒酒が守備力にも効く */
export const effectiveDef = (m: FieldMonster): number =>
  Math.max(0, (m.card.def ?? 0) + m.buffs.reduce((sum, b) => sum + (b.defAmount ?? 0), 0))

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

/** レベル無視でモンスターを場に置く(「場に出す」。召喚時効果なし・召喚権も消費しない) */
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
    buffs: [],
    destroyAtEndOfTurn: false,
  }
  return zone
}

// ============================================================
// 召喚(v1.2: 1ターン1回、ぴったりブースト)
// ============================================================

/** 手札のモンスターが通常召喚可能か(リリースなし) */
export function canSummon(s: GameState, handIdx: number): boolean {
  const p = s.players[s.turnPlayer]
  const card = p.hand[handIdx]
  return (
    s.phase === 'main' &&
    !s.pending &&
    !p.summonUsedThisTurn &&
    !!card &&
    card.type === 'monster' &&
    (card.stars ?? 99) <= p.level &&
    firstEmptyZone(p) >= 0
  )
}

/**
 * ブースト召喚のリリース候補(ぴったり一致のみ)。
 * 必要星 = 召喚したい星 - レベル。手札と場の両方から探す。
 * 可変星モンスターは範囲内なら starsAs=必要星 で候補になる。
 */
export function releaseOptionsFor(s: GameState, handIdx: number): ReleaseSpec[] {
  const p = s.players[s.turnPlayer]
  const card = p.hand[handIdx]
  if (s.phase !== 'main' || s.pending || p.summonUsedThisTurn) return []
  if (!card || card.type !== 'monster') return []
  const needed = (card.stars ?? 99) - p.level
  if (needed < 1) return [] // レベル以下は通常召喚で出せる

  const matches = (c: Card): ReleaseSpec['starsAs'] | false => {
    if (c.releaseStarRange) {
      return c.releaseStarRange.min <= needed && needed <= c.releaseStarRange.max
        ? needed
        : false
    }
    return c.stars === needed ? undefined : false
  }

  const out: ReleaseSpec[] = []
  // 場のモンスター(リリースで1枠空くので場が満杯でも可)
  p.monsters.forEach((m, z) => {
    if (!m) return
    const starsAs = matches(m.card)
    if (starsAs !== false) out.push({ source: 'field', index: z, starsAs })
  })
  // 手札からは供物モンスター(handReleasable)のみリリース可(v1.5)。場に空きが必要
  if (firstEmptyZone(p) >= 0) {
    p.hand.forEach((c, i) => {
      if (i === handIdx || c.type !== 'monster' || !c.handReleasable) return
      const starsAs = matches(c)
      if (starsAs !== false) out.push({ source: 'hand', index: i, starsAs })
    })
  }
  return out
}

/**
 * 召喚(release指定でぴったりブースト召喚)。1ターン1回。
 * 相手に落とし穴があれば罠確認のpendingを立てる。
 */
export function summon(
  s: GameState,
  handIdx: number,
  position: 'attack' | 'defense',
  release?: ReleaseSpec,
): GameState {
  return produce(s, (d) => {
    const me = d.turnPlayer
    const p = d.players[me]
    const card = p.hand[handIdx]
    if (!card || card.type !== 'monster' || d.phase !== 'main' || d.pending) return
    if (p.summonUsedThisTurn) return
    const stars = card.stars ?? 99

    if (release === undefined) {
      // 通常召喚
      if (stars > p.level || firstEmptyZone(p) < 0) return
      p.hand.splice(handIdx, 1)
    } else {
      // ぴったりブースト召喚
      const releasedCard =
        release.source === 'field' ? p.monsters[release.index]?.card : p.hand[release.index]
      if (!releasedCard || releasedCard.type !== 'monster') return
      if (release.source === 'hand' && release.index === handIdx) return
      // v1.5: 手札からのリリースは供物モンスター(handReleasable)のみ
      if (release.source === 'hand' && !releasedCard.handReleasable) return

      let releasedStars: number
      if (release.starsAs !== undefined) {
        const range = releasedCard.releaseStarRange
        if (!range || release.starsAs < range.min || release.starsAs > range.max) return
        releasedStars = release.starsAs
      } else {
        if (releasedCard.releaseStarRange) return // 可変星はstarsAs必須
        releasedStars = releasedCard.stars ?? 0
      }
      if (stars !== p.level + releasedStars) return // ぴったり一致のみ

      // リリース実行(リリースは破壊ではない)
      if (release.source === 'field') {
        log(d, `${p.name}は場の${releasedCard.name}をリリース(星${releasedStars}として)`)
        p.grave.push(releasedCard)
        p.monsters[release.index] = null
        p.hand.splice(handIdx, 1)
      } else {
        if (firstEmptyZone(p) < 0) return
        log(d, `${p.name}は手札の${releasedCard.name}をリリース(星${releasedStars}として)`)
        // 手札から召喚カードとリリースカードの2枚を取り除く(大きいインデックスから)
        const [hi, lo] =
          release.index > handIdx ? [release.index, handIdx] : [handIdx, release.index]
        p.hand.splice(hi, 1)
        p.hand.splice(lo, 1)
        p.grave.push(releasedCard)
      }
    }

    const zone = firstEmptyZone(p)
    if (zone < 0) return
    p.monsters[zone] = {
      card,
      position,
      hasAttacked: false,
      changedPositionThisTurn: false,
      summonedThisTurn: true,
      buffs: [],
      destroyAtEndOfTurn: false,
    }
    p.summonUsedThisTurn = true
    log(
      d,
      `${p.name}は${card.name}を${position === 'attack' ? '攻撃' : '守備'}表示で${release ? 'ブースト召喚' : '召喚'}`,
    )

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
      if (id === 'SR10') zones.push(z) // 落とし穴
    } else {
      if (id === 'N24' || id === 'R14' || id === 'N28') zones.push(z) // 金縛り・神隠し・砂かけ婆
      if (id === 'UR5') {
        // アイギスの盾: 自分の場にモンスターがいない場合のみ(v1.6)
        if (p.monsters.every((m) => m === null)) zones.push(z)
      }
      if (id === 'R12') {
        // 背水の陣: 自分の場が空・手札にレベル以下のモンスター(v1.6)・(直接攻撃時のみ成立)
        const fieldEmpty = p.monsters.every((m) => m === null)
        const hasHandMonster = p.hand.some(
          (c) => c.type === 'monster' && (c.stars ?? 99) <= p.level,
        )
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

/** 罠発動の応答(召喚トリガーの落とし穴のみ)。zone=null は発動しない */
export function respondTrap(s: GameState, zone: number | null): GameState {
  return produce(s, (d) => {
    const pend = d.pending
    if (!pend || pend.kind !== 'trapPrompt') return
    d.pending = undefined
    const trigger = pend.trigger
    if (trigger.type !== 'summon') return

    if (zone === null) {
      queueSummonEffect(d, trigger.zone)
      return
    }

    const owner = pend.forPlayer
    const p = d.players[owner]
    const slot = p.traps[zone]
    if (!slot) {
      queueSummonEffect(d, trigger.zone)
      return
    }
    p.traps[zone] = null
    p.grave.push(slot.card)
    log(d, `${p.name}は罠「${slot.card.name}」を発動!`)

    if (slot.card.id === 'SR10') {
      // 落とし穴: 召喚されたモンスターを破壊(召喚時効果は発動しない)
      destroyMonster(d, other(owner), trigger.zone, '落とし穴')
    }
  })
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
        // 背水の陣: 選んだレベル以下のモンスターを守備表示で場に出し、攻撃をそのモンスターへ
        const card = p.hand[choice.index]
        const attackerZone = pend.ctx?.attackerZone
        if (
          card &&
          card.type === 'monster' &&
          (card.stars ?? 99) <= p.level &&
          attackerZone !== undefined
        ) {
          p.hand.splice(choice.index, 1)
          const zone = placeMonster(d, me, card, 'defense')
          log(d, `${card.name}を守備表示で場に出した。攻撃はこのモンスターへ向かう`)
          resolveBattle(d, {
            attackerZone,
            target: zone,
            attackerBoost: pend.ctx?.attackerBoost ?? 0,
            defenderBoost: 0,
          })
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
    case 'SR9': // 鬼退治
    case 'R09': // 強制送還
    case 'N27': // 神便鬼毒酒
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
    case 'N29': // お焚き上げ: 対象不要
      return null
    case 'R10': // 人魚の肉: 対象不要
      return null
    case 'UR4': // 天罰: 対象不要(相手の場に1体以上)
      return opp.monsters.some((m) => m !== null) ? null : []
    case 'SR7': {
      // 黄泉返り
      if (p.monsters.every((m) => m !== null)) return []
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
      case 'SR9':
        if (target) destroyMonster(d, other(me), target.index, '鬼退治')
        break
      case 'N20': {
        // 草薙剣: 次の相手ターンの終了時まで攻守+500(v1.6)
        const m = target ? p.monsters[target.index] : null
        if (m) {
          m.buffs.push({ amount: 500, defAmount: 500, expiresAfterTurn: d.turnCount + 1 })
          log(d, `${m.card.name}の攻撃力と守備力+500(次の相手ターン終了時まで)`)
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
        // 軍配: ターン終了時まで+500(v1.6で+300から強化)
        for (const m of p.monsters) {
          if (m) m.buffs.push({ amount: 500, expiresAfterTurn: d.turnCount })
        }
        log(d, '自分の全モンスターの攻撃力+500(ターン終了時まで)')
        break
      case 'N27': {
        // 神便鬼毒酒: 次の相手ターンの終了時まで攻守-700(v1.6)
        const m = target ? opp.monsters[target.index] : null
        if (m) {
          m.buffs.push({ amount: -700, defAmount: -700, expiresAfterTurn: d.turnCount + 1 })
          log(d, `${m.card.name}の攻撃力と守備力-700(次の相手ターン終了時まで)`)
        }
        break
      }
      case 'N29':
        // お焚き上げ: このターンの自分の戦闘強化が2倍
        p.reinforceDoubledThisTurn = true
        log(d, 'このターン、自分の戦闘強化の値が2倍になる')
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
        p.life += 2500
        log(d, `ライフを2500回復(→${p.life})`)
        break
      case 'UR4':
        // 天罰: お互いの場のモンスターを全て破壊(v1.6)
        for (let z = 0; z < MONSTER_ZONES; z++) {
          if (opp.monsters[z]) destroyMonster(d, other(me), z, '天罰')
          if (p.monsters[z]) destroyMonster(d, me, z, '天罰')
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
// バトル(v1.3: 戦闘強化 → 防御側リアクション → ダメージ計算)
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

/** 戦闘強化で捨てた時の加算値(鬼火・ぬりかべ・お焚き上げの特例込み) */
export function boostValue(
  card: Card,
  role: 'attacker' | 'defender',
  defenderPosition: 'attack' | 'defense' | undefined,
  doubled: boolean,
): number {
  let base = (card.stars ?? 0) * 100
  if (role === 'attacker' && card.id === 'N03') base = 1000 // 鬼火
  if (role === 'defender' && card.id === 'N10' && defenderPosition === 'defense') base = 800 // ぬりかべ
  return doubled ? base * 2 : base
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

    attacker.hasAttacked = true // 無効化されても攻撃権は消費
    const targetName =
      target === 'direct' ? '直接攻撃' : `${d.players[opp].monsters[target]!.card.name}に攻撃`
    log(d, `${attacker.card.name}が${targetName}を宣言`)

    const battle: BattleContext = { attackerZone, target, attackerBoost: 0, defenderBoost: 0 }

    // ①攻撃側の戦闘強化(任意): 手札にモンスターがあれば選択
    const boostOptions = d.players[me].hand
      .map((c, i) => ({ c, i }))
      .filter(({ c }) => c.type === 'monster')
      .map(({ i }) => i)
    if (boostOptions.length > 0) {
      d.pending = { kind: 'attackerBoost', forPlayer: me, options: boostOptions, battle }
    } else {
      proceedToDefenderReaction(d, battle)
    }
  })
}

/** 攻撃側の戦闘強化の応答。handIdx=null はスキップ */
export function respondBoost(s: GameState, handIdx: number | null): GameState {
  return produce(s, (d) => {
    const pend = d.pending
    if (!pend || pend.kind !== 'attackerBoost') return
    d.pending = undefined
    const battle = { ...pend.battle }
    const me = pend.forPlayer
    const p = d.players[me]

    if (handIdx !== null && pend.options.includes(handIdx)) {
      const card = p.hand[handIdx]
      if (card && card.type === 'monster') {
        p.hand.splice(handIdx, 1)
        p.grave.push(card)
        const value = boostValue(card, 'attacker', undefined, p.reinforceDoubledThisTurn)
        battle.attackerBoost = value
        log(d, `${p.name}は${card.name}を捨てて戦闘強化! 攻撃力+${value}(この戦闘の間)`)
      }
    }
    proceedToDefenderReaction(d, battle)
  })
}

/** ②防御側のリアクション(罠1枚 or 戦闘強化のどちらか一方) */
function proceedToDefenderReaction(d: D, battle: BattleContext) {
  const me = d.turnPlayer
  const defender = other(me)
  const trigger: TrapTrigger = { type: 'attack', attackerZone: battle.attackerZone, target: battle.target }
  const trapZones = usableTrapZones(d, defender, trigger)
  // 防御側の強化は戦闘するモンスターがいる時のみ(直接攻撃には強化できない)
  const boostOptions =
    battle.target !== 'direct'
      ? d.players[defender].hand
          .map((c, i) => ({ c, i }))
          .filter(({ c }) => c.type === 'monster')
          .map(({ i }) => i)
      : []

  if (trapZones.length > 0 || boostOptions.length > 0) {
    d.pending = { kind: 'defenderReaction', forPlayer: defender, trapZones, boostOptions, battle }
  } else {
    resolveBattle(d, battle)
  }
}

export type DefenderReactionChoice =
  | { type: 'trap'; zone: number }
  | { type: 'boost'; handIdx: number }
  | null

/** 防御側リアクションの応答 */
export function respondReaction(s: GameState, choice: DefenderReactionChoice): GameState {
  return produce(s, (d) => {
    const pend = d.pending
    if (!pend || pend.kind !== 'defenderReaction') return
    d.pending = undefined
    const battle = { ...pend.battle }
    const defenderIdx = pend.forPlayer
    const attackerIdx = other(defenderIdx)
    const p = d.players[defenderIdx]

    if (choice === null) {
      resolveBattle(d, battle)
      return
    }

    if (choice.type === 'boost') {
      if (!pend.boostOptions.includes(choice.handIdx)) {
        resolveBattle(d, battle)
        return
      }
      const card = p.hand[choice.handIdx]
      const defMonster = battle.target !== 'direct' ? p.monsters[battle.target] : null
      if (card && card.type === 'monster' && defMonster) {
        p.hand.splice(choice.handIdx, 1)
        p.grave.push(card)
        const value = boostValue(card, 'defender', defMonster.position, p.reinforceDoubledThisTurn)
        battle.defenderBoost = value
        log(
          d,
          `${p.name}は${card.name}を捨てて戦闘強化! ${defMonster.position === 'attack' ? '攻撃力' : '守備力'}+${value}(この戦闘の間)`,
        )
      }
      resolveBattle(d, battle)
      return
    }

    // 罠発動
    const slot = pend.trapZones.includes(choice.zone) ? p.traps[choice.zone] : null
    if (!slot) {
      resolveBattle(d, battle)
      return
    }
    p.traps[choice.zone] = null
    p.grave.push(slot.card)
    log(d, `${p.name}は罠「${slot.card.name}」を発動!`)

    switch (slot.card.id) {
      case 'N24': {
        // 金縛り: 攻撃無効
        log(d, '攻撃は無効化された')
        return
      }
      case 'R14': {
        // 神隠し: 攻撃モンスターを手札に戻す
        const m = d.players[attackerIdx].monsters[battle.attackerZone]
        if (m) {
          d.players[attackerIdx].hand.push(m.card)
          d.players[attackerIdx].monsters[battle.attackerZone] = null
          log(d, `${m.card.name}は手札に戻された`)
        }
        return
      }
      case 'UR5': {
        // アイギスの盾: 攻撃側の攻撃表示モンスターを全破壊
        for (let z = 0; z < MONSTER_ZONES; z++) {
          const m = d.players[attackerIdx].monsters[z]
          if (m && m.position === 'attack') destroyMonster(d, attackerIdx, z, 'アイギスの盾')
        }
        return
      }
      case 'N28': {
        // 砂かけ婆: 攻撃モンスター-600(ターン終了時まで)。戦闘は続行
        const m = d.players[attackerIdx].monsters[battle.attackerZone]
        if (m) {
          m.buffs.push({ amount: -600, expiresAfterTurn: d.turnCount })
          log(d, `${m.card.name}の攻撃力-600(ターン終了時まで)`)
        }
        resolveBattle(d, battle)
        return
      }
      case 'R12': {
        // 背水の陣: 手札からレベル以下のモンスターを選んで守備表示で出す(必須選択)
        const options = p.hand
          .map((c, i) => ({ card: c, i }))
          .filter(({ card }) => card.type === 'monster' && (card.stars ?? 99) <= p.level)
          .map(({ i }) => ({ area: 'hand' as const, index: i }))
        if (options.length === 0) {
          resolveBattle(d, battle)
          return
        }
        d.pending = {
          kind: 'effectTarget',
          forPlayer: defenderIdx,
          sourceId: 'R12',
          optional: false,
          options,
          ctx: { attackerZone: battle.attackerZone, attackerBoost: battle.attackerBoost },
        }
        return
      }
    }
  })
}

/** ③ダメージ計算 */
function resolveBattle(d: D, battle: BattleContext) {
  const me = d.turnPlayer
  const oppIdx = other(me)
  const attacker = d.players[me].monsters[battle.attackerZone]
  if (!attacker) return // 罠で除去された場合など

  const atk = effectiveAtk(attacker) + battle.attackerBoost
  const meName = d.players[me].name
  const oppName = d.players[oppIdx].name
  // 強化込みの値の内訳表記(例: 攻1300+強化300)
  const atkLabel = battle.attackerBoost > 0 ? `攻${atk - battle.attackerBoost}+強化${battle.attackerBoost}` : `攻${atk}`

  if (battle.target === 'direct') {
    d.players[oppIdx].life -= atk
    log(
      d,
      `${meName}の${attacker.card.name}(${atkLabel})が直接攻撃! ${oppName}に${atk}ダメージ(残り${Math.max(0, d.players[oppIdx].life)})`,
    )
    checkLifeWinner(d)
    return
  }

  const defender = d.players[oppIdx].monsters[battle.target]
  if (!defender) return

  const attackerIsMedusa = attacker.card.id === 'R08'
  const defenderIsMedusa = defender.card.id === 'R08'
  const defLabel = (base: number, kind: '攻' | '守') =>
    battle.defenderBoost > 0 ? `${kind}${base - battle.defenderBoost}+強化${battle.defenderBoost}` : `${kind}${base}`

  if (defender.position === 'attack') {
    const dAtk = effectiveAtk(defender) + battle.defenderBoost
    log(
      d,
      `戦闘: ${meName}の${attacker.card.name}(${atkLabel}) × ${oppName}の${defender.card.name}(${defLabel(dAtk, '攻')})`,
    )
    if (atk > dAtk) {
      const diff = atk - dAtk
      destroyMonster(d, oppIdx, battle.target, '戦闘')
      d.players[oppIdx].life -= diff
      log(d, `${d.players[oppIdx].name}に${diff}ダメージ(残り${Math.max(0, d.players[oppIdx].life)})`)
      if (defenderIsMedusa) attacker.destroyAtEndOfTurn = true
    } else if (atk === dAtk) {
      // v1.6: 同値はどちらも破壊されない(攻vs守と同じ扱い)
      log(d, '攻撃力同値。どちらも破壊されない')
      if (attackerIsMedusa) defender.destroyAtEndOfTurn = true
      if (defenderIsMedusa) attacker.destroyAtEndOfTurn = true
    } else {
      // v1.6: 攻撃表示への攻撃で負けても攻撃側は破壊されない(差分ダメージのみ)
      const diff = dAtk - atk
      d.players[me].life -= diff
      log(d, `攻撃は跳ね返された! ${d.players[me].name}に${diff}ダメージ(残り${Math.max(0, d.players[me].life)})`)
      if (attackerIsMedusa) defender.destroyAtEndOfTurn = true
      if (defenderIsMedusa) attacker.destroyAtEndOfTurn = true
    }
  } else {
    const dDef = effectiveDef(defender) + battle.defenderBoost
    log(
      d,
      `戦闘: ${meName}の${attacker.card.name}(${atkLabel}) × ${oppName}の${defender.card.name}(${defLabel(dDef, '守')})`,
    )
    if (atk > dDef) {
      destroyMonster(d, oppIdx, battle.target, '戦闘')
      if (defenderIsMedusa) attacker.destroyAtEndOfTurn = true
    } else if (atk < dDef) {
      // v1.6: 守備の反撃 — 守備力を下回ると攻撃側が破壊される
      const diff = dDef - atk
      destroyMonster(d, me, battle.attackerZone, '守備の反撃')
      d.players[me].life -= diff
      log(d, `${d.players[me].name}に${diff}ダメージ(残り${Math.max(0, d.players[me].life)})`)
      if (attackerIsMedusa) defender.destroyAtEndOfTurn = true
    } else {
      log(d, '攻守同値。どちらも破壊されない')
      if (attackerIsMedusa) defender.destroyAtEndOfTurn = true
      if (defenderIsMedusa) attacker.destroyAtEndOfTurn = true
    }
  }
  checkLifeWinner(d)
}
