import { useEffect, useRef, useState } from 'react'
import { cardById } from '../../data/cards'
import {
  attackTargets,
  boostValue,
  canAttackWith,
  canCastMagic,
  canChangePosition,
  canEnterBattle,
  canSetTrap,
  canSummon,
  magicTargets,
  other,
  releaseOptionsFor,
} from '../../engine/gameEngine'
import type { Card } from '../../types/card'
import type { GameAction } from '../../types/actions'
import type { BattleContext, FieldMonster, GameState, PlayerIdx, TargetOption } from '../../types/game'
import CardFace from '../card/CardFace'
import CardBack from '../card/CardBack'
import Modal from '../common/Modal'

type Sel =
  | { mode: 'idle' }
  | { mode: 'handMenu'; handIdx: number }
  | { mode: 'fieldMenu'; zone: number }
  | { mode: 'selectRelease'; handIdx: number; position: 'attack' | 'defense' }
  | { mode: 'magicTarget'; handIdx: number; options: TargetOption[] }
  | { mode: 'attackTarget'; attackerZone: number }

interface Props {
  game: GameState
  mySeat: PlayerIdx
  act: (a: GameAction) => void
  busy?: boolean
  busyLabel?: string
  onExit: () => void
  onRematch?: () => void
  rematchLabel?: string
}

/** 対戦盤面(CPU戦・PvP共通)。自分視点はmySeatで指定する */
export default function Board({ game, mySeat, act, busy, busyLabel, onExit, onRematch, rematchLabel }: Props) {
  const oppSeat = other(mySeat)
  const [sel, setSel] = useState<Sel>({ mode: 'idle' })
  const [detail, setDetail] = useState<Card | null>(null)
  const [graveView, setGraveView] = useState<PlayerIdx | null>(null)
  const logRef = useRef<HTMLDivElement>(null)

  const me = game.players[mySeat]
  const opp = game.players[oppSeat]
  const myTurn = game.turnPlayer === mySeat && game.winner === undefined
  const pending = game.pending

  // 自分のターン中の操作判定。エンジンのバリデータは「turnPlayer視点」で
  // 動くため、自分のターンの時だけ使う
  const validatorsActive = myTurn && !pending

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight })
  }, [game.log.length])

  useEffect(() => {
    if (pending) setSel({ mode: 'idle' })
  }, [pending])

  const idle = () => setSel({ mode: 'idle' })

  // ---- 手札メニュー ----
  const handCard = sel.mode === 'handMenu' ? me.hand[sel.handIdx] : null
  const handMenuItems: { label: string; onClick: () => void }[] = []
  if (sel.mode === 'handMenu' && handCard) {
    const i = sel.handIdx
    if (validatorsActive) {
      if (handCard.type === 'monster') {
        if (canSummon(game, i)) {
          handMenuItems.push(
            { label: '攻撃表示で召喚', onClick: () => { act({ kind: 'summon', handIdx: i, position: 'attack' }); idle() } },
            { label: '守備表示で召喚', onClick: () => { act({ kind: 'summon', handIdx: i, position: 'defense' }); idle() } },
          )
        } else if (releaseOptionsFor(game, i).length > 0) {
          handMenuItems.push(
            { label: 'ブースト召喚(攻撃表示)', onClick: () => setSel({ mode: 'selectRelease', handIdx: i, position: 'attack' }) },
            { label: 'ブースト召喚(守備表示)', onClick: () => setSel({ mode: 'selectRelease', handIdx: i, position: 'defense' }) },
          )
        }
      } else if (handCard.type === 'magic' && canCastMagic(game, i)) {
        handMenuItems.push({
          label: '発動',
          onClick: () => {
            const targets = magicTargets(game, i)
            if (targets === null) {
              act({ kind: 'magic', handIdx: i })
              idle()
            } else {
              setSel({ mode: 'magicTarget', handIdx: i, options: targets })
            }
          },
        })
      } else if (handCard.type === 'trap' && canSetTrap(game, i)) {
        handMenuItems.push({ label: 'セット', onClick: () => { act({ kind: 'setTrap', handIdx: i }); idle() } })
      }
    }
    handMenuItems.push({ label: '詳細', onClick: () => { setDetail(handCard); idle() } })
  }

  // ---- クリックハンドラ ----
  // ぴったりブースト召喚のリリース候補(手札・場の両方)
  const releaseSpecs =
    sel.mode === 'selectRelease' && validatorsActive ? releaseOptionsFor(game, sel.handIdx) : []
  const releaseFieldZones = releaseSpecs.filter((r) => r.source === 'field').map((r) => r.index)
  const releaseHandIdxs = releaseSpecs.filter((r) => r.source === 'hand').map((r) => r.index)

  const onMyMonsterClick = (zone: number) => {
    if (pending || game.winner !== undefined) return
    if (sel.mode === 'selectRelease') {
      const spec = releaseSpecs.find((r) => r.source === 'field' && r.index === zone)
      if (spec) {
        act({ kind: 'summon', handIdx: sel.handIdx, position: sel.position, release: spec })
        idle()
      }
      return
    }
    if (sel.mode === 'magicTarget') {
      const opt = sel.options.find((o) => o.area === 'ownMonster' && o.index === zone)
      if (opt) {
        act({ kind: 'magic', handIdx: sel.handIdx, target: opt })
        idle()
      }
      return
    }
    if (!myTurn) return
    if (game.phase === 'battle' && canAttackWith(game, zone)) {
      setSel({ mode: 'attackTarget', attackerZone: zone })
      return
    }
    if (game.phase === 'main') {
      setSel({ mode: 'fieldMenu', zone })
    }
  }

  const onOppMonsterClick = (zone: number) => {
    if (game.winner !== undefined) return
    if (pending?.kind === 'effectTarget' && pending.forPlayer === mySeat) {
      const opt = pending.options.find((o) => o.area === 'oppMonster' && o.index === zone)
      if (opt) act({ kind: 'respondTarget', choice: opt })
      return
    }
    if (pending) return
    if (sel.mode === 'magicTarget') {
      const opt = sel.options.find((o) => o.area === 'oppMonster' && o.index === zone)
      if (opt) {
        act({ kind: 'magic', handIdx: sel.handIdx, target: opt })
        idle()
      }
      return
    }
    if (sel.mode === 'attackTarget') {
      act({ kind: 'attack', attackerZone: sel.attackerZone, target: zone })
      idle()
      return
    }
    const m = opp.monsters[zone]
    if (m) setDetail(m.card)
  }

  const onOppTrapClick = (zone: number) => {
    if (game.winner !== undefined) return
    if (pending?.kind === 'effectTarget' && pending.forPlayer === mySeat) {
      const opt = pending.options.find((o) => o.area === 'oppTrap' && o.index === zone)
      if (opt) act({ kind: 'respondTarget', choice: opt })
      return
    }
    if (pending) return
    if (sel.mode === 'magicTarget') {
      const opt = sel.options.find((o) => o.area === 'oppTrap' && o.index === zone)
      if (opt) {
        act({ kind: 'magic', handIdx: sel.handIdx, target: opt })
        idle()
      }
    }
  }

  const modalTargetPending =
    pending?.kind === 'effectTarget' &&
    pending.forPlayer === mySeat &&
    ['grave', 'deck', 'hand'].includes(pending.options[0]?.area)

  const magicModalTargets =
    sel.mode === 'magicTarget' && sel.options[0]?.area === 'grave' ? sel.options : null

  const targetCardOf = (opt: TargetOption): Card | undefined => {
    if (opt.area === 'grave') return me.grave[opt.index]
    if (opt.area === 'deck') return me.deck[opt.index]
    if (opt.area === 'hand') return me.hand[opt.index]
    return undefined
  }

  const canDirectAttack =
    sel.mode === 'attackTarget' && validatorsActive && attackTargets(game)[0] === 'direct'

  return (
    <div className="mx-auto flex min-h-screen max-w-5xl flex-col gap-2 p-3">
      {/* 相手情報 */}
      <div className="flex items-center gap-4 rounded-lg bg-slate-800 px-4 py-2 text-sm">
        <span className="font-bold">{opp.name}</span>
        <span className="text-red-300">LP {Math.max(0, opp.life)}</span>
        <span className="text-amber-300">Lv {opp.level}</span>
        <span>手札 {opp.hand.length}</span>
        <span>デッキ {opp.deck.length}</span>
        <button onClick={() => setGraveView(oppSeat)} className="text-slate-400 underline">
          墓地 {opp.grave.length}
        </button>
        {busy && <span className="ml-auto animate-pulse text-indigo-300">{busyLabel ?? '待機中...'}</span>}
      </div>

      {/* 相手の場 */}
      <div className="flex justify-center gap-2">
        {opp.monsters.map((m, z) => (
          <div
            key={z}
            onClick={() => onOppMonsterClick(z)}
            className={`flex h-32 w-24 items-center justify-center rounded-lg ${m ? 'cursor-pointer' : 'border border-dashed border-slate-700'} ${
              (sel.mode === 'attackTarget' && m) ||
              (pending?.kind === 'effectTarget' && pending.forPlayer === mySeat && pending.options.some((o) => o.area === 'oppMonster' && o.index === z)) ||
              (sel.mode === 'magicTarget' && sel.options.some((o) => o.area === 'oppMonster' && o.index === z))
                ? 'ring-2 ring-red-400'
                : ''
            }`}
          >
            {m && (
              <div className={`relative ${m.position === 'defense' ? 'rotate-90' : ''}`}>
                <CardFace card={m.card} size="xs" />
                <BuffBadge m={m} />
              </div>
            )}
          </div>
        ))}
      </div>

      {/* 相手の伏せ */}
      <div className="flex justify-center gap-2">
        {opp.traps.map((t, z) => (
          <div
            key={z}
            onClick={() => onOppTrapClick(z)}
            className={`flex h-16 w-24 items-center justify-center rounded ${t ? 'cursor-pointer' : 'border border-dashed border-slate-800'} ${
              (pending?.kind === 'effectTarget' && pending.forPlayer === mySeat && pending.options.some((o) => o.area === 'oppTrap' && o.index === z)) ||
              (sel.mode === 'magicTarget' && sel.options.some((o) => o.area === 'oppTrap' && o.index === z))
                ? 'ring-2 ring-red-400'
                : ''
            }`}
          >
            {t && (
              <div className="relative">
                <CardBack size="xs" />
                {t.knownToOpponent && (
                  <span className="absolute -bottom-1 left-0 right-0 rounded bg-black/80 text-center text-[9px] text-amber-300">
                    {t.card.name}
                  </span>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* フェイズ・操作バー */}
      <div className="flex items-center justify-center gap-3 rounded-lg bg-slate-800/60 px-4 py-2">
        <span className="text-sm text-slate-300">
          ターン{game.turnCount} | {myTurn ? 'あなた' : opp.name}のターン |{' '}
          {game.phase === 'main' ? 'メインフェイズ' : game.phase === 'battle' ? 'バトルフェイズ' : '終了'}
        </span>
        {myTurn && !pending && game.phase === 'main' && (
          <button
            onClick={() => { act({ kind: 'toBattle' }); idle() }}
            disabled={!canEnterBattle(game)}
            className="rounded bg-red-800 px-4 py-1 text-sm font-semibold hover:bg-red-700 disabled:opacity-40"
          >
            バトルフェイズへ
          </button>
        )}
        {myTurn && !pending && (
          <button
            onClick={() => { act({ kind: 'endTurn' }); idle() }}
            className="rounded bg-slate-600 px-4 py-1 text-sm font-semibold hover:bg-slate-500"
          >
            ターン終了
          </button>
        )}
        {canDirectAttack && sel.mode === 'attackTarget' && (
          <button
            onClick={() => { act({ kind: 'attack', attackerZone: sel.attackerZone, target: 'direct' }); idle() }}
            className="rounded bg-red-600 px-4 py-1 text-sm font-bold hover:bg-red-500"
          >
            直接攻撃!
          </button>
        )}
        {(sel.mode === 'selectRelease' || sel.mode === 'magicTarget' || sel.mode === 'attackTarget') && (
          <button onClick={idle} className="rounded bg-slate-700 px-3 py-1 text-sm">
            キャンセル
          </button>
        )}
      </div>

      {/* 選択中ガイド */}
      {sel.mode === 'selectRelease' && (
        <p className="text-center text-sm text-amber-300">
          リリースするモンスターを選択してください(光っている場のモンスター/手札のカード)
        </p>
      )}
      {sel.mode === 'magicTarget' && !magicModalTargets && (
        <p className="text-center text-sm text-amber-300">対象を選択してください</p>
      )}
      {sel.mode === 'attackTarget' && !canDirectAttack && (
        <p className="text-center text-sm text-red-300">攻撃対象を選択してください</p>
      )}

      {/* 自分の伏せ(ホバーでカード表示、クリックで詳細) */}
      <div className="flex justify-center gap-2">
        {me.traps.map((t, z) => (
          <div key={z} className={`flex h-16 w-24 items-center justify-center rounded ${t ? '' : 'border border-dashed border-slate-800'}`}>
            {t && (
              <div
                className="group relative cursor-pointer"
                onClick={() => setDetail(t.card)}
              >
                <CardBack size="xs" />
                <span className="absolute -bottom-1 left-0 right-0 rounded bg-black/80 text-center text-[9px] text-slate-300">
                  {t.card.name}
                </span>
                {/* ホバープレビュー */}
                <div className="pointer-events-none absolute bottom-full left-1/2 z-30 mb-2 hidden -translate-x-1/2 group-hover:block">
                  <CardFace card={t.card} size="sm" />
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* 自分の場 */}
      <div className="flex justify-center gap-2">
        {me.monsters.map((m, z) => (
          <div
            key={z}
            onClick={() => onMyMonsterClick(z)}
            className={`flex h-32 w-24 items-center justify-center rounded-lg ${m ? 'cursor-pointer' : 'border border-dashed border-slate-700'} ${
              sel.mode === 'selectRelease' && releaseFieldZones.includes(z)
                ? 'ring-2 ring-amber-400'
                : sel.mode === 'magicTarget' && sel.options.some((o) => o.area === 'ownMonster' && o.index === z)
                  ? 'ring-2 ring-emerald-400'
                  : game.phase === 'battle' && validatorsActive && canAttackWith(game, z)
                    ? 'ring-2 ring-red-500/60'
                    : ''
            }`}
          >
            {m && (
              <div className={`relative ${m.position === 'defense' ? 'rotate-90' : ''}`}>
                <CardFace card={m.card} size="xs" />
                <BuffBadge m={m} />
                {m.hasAttacked && (
                  <span className="absolute left-0 top-0 rounded bg-slate-900/80 px-1 text-[9px]">済</span>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* フィールドメニュー */}
      {sel.mode === 'fieldMenu' && (
        <div className="flex justify-center gap-2">
          {validatorsActive && canChangePosition(game, sel.zone) && (
            <button
              onClick={() => { act({ kind: 'changePos', zone: sel.zone }); idle() }}
              className="rounded bg-sky-800 px-4 py-1.5 text-sm hover:bg-sky-700"
            >
              表示形式を変更
            </button>
          )}
          <button
            onClick={() => { setDetail(me.monsters[sel.zone]?.card ?? null); idle() }}
            className="rounded bg-slate-700 px-4 py-1.5 text-sm"
          >
            詳細
          </button>
          <button onClick={idle} className="rounded bg-slate-700 px-4 py-1.5 text-sm">閉じる</button>
        </div>
      )}

      {/* 自分情報 */}
      <div className="flex items-center gap-4 rounded-lg bg-slate-800 px-4 py-2 text-sm">
        <span className="font-bold">{me.name}</span>
        <span className="text-emerald-300">LP {Math.max(0, me.life)}</span>
        <span className="text-amber-300">Lv {me.level}</span>
        <span>デッキ {me.deck.length}</span>
        <button onClick={() => setGraveView(mySeat)} className="text-slate-400 underline">
          墓地 {me.grave.length}
        </button>
        {myTurn && game.phase === 'main' && (
          <span className={me.summonUsedThisTurn ? 'text-slate-500' : 'text-emerald-400'}>
            召喚権: {me.summonUsedThisTurn ? '使用済み' : 'あり'}
          </span>
        )}
        {me.reinforceDoubledThisTurn && <span className="text-orange-400">お焚き上げ中(強化2倍)</span>}
      </div>

      {/* 手札 */}
      <div className="flex justify-center gap-2 overflow-x-auto pb-1">
        {me.hand.map((card, i) => (
          <div
            key={i}
            className={
              sel.mode === 'handMenu' && sel.handIdx === i
                ? 'rounded ring-2 ring-indigo-400'
                : sel.mode === 'selectRelease' && releaseHandIdxs.includes(i)
                  ? 'rounded ring-2 ring-amber-400'
                  : ''
            }
          >
            <CardFace
              card={card}
              size="sm"
              onClick={() => {
                if (pending || game.winner !== undefined) return
                // ブースト召喚のリリース選択中: 手札のカードもリリース候補
                if (sel.mode === 'selectRelease') {
                  const spec = releaseSpecs.find((r) => r.source === 'hand' && r.index === i)
                  if (spec) {
                    act({ kind: 'summon', handIdx: sel.handIdx, position: sel.position, release: spec })
                    idle()
                  }
                  return
                }
                setSel(sel.mode === 'handMenu' && sel.handIdx === i ? { mode: 'idle' } : { mode: 'handMenu', handIdx: i })
              }}
            />
          </div>
        ))}
        {me.hand.length === 0 && <p className="py-8 text-sm text-slate-500">手札なし</p>}
      </div>

      {/* 手札メニュー */}
      {sel.mode === 'handMenu' && handMenuItems.length > 0 && (
        <div className="flex justify-center gap-2">
          {handMenuItems.map((item) => (
            <button
              key={item.label}
              onClick={item.onClick}
              className="rounded bg-indigo-700 px-4 py-1.5 text-sm font-semibold hover:bg-indigo-600"
            >
              {item.label}
            </button>
          ))}
        </div>
      )}

      {/* ログ */}
      <div ref={logRef} className="h-28 overflow-y-auto rounded-lg bg-black/40 p-2 text-xs leading-relaxed text-slate-300">
        {game.log.map((entry, i) => (
          <p key={i}>{entry.message}</p>
        ))}
      </div>

      {/* ==== モーダル類 ==== */}

      <Modal open={!!detail} onClose={() => setDetail(null)}>
        {detail && (
          <div className="flex gap-5">
            <CardFace card={detail} size="md" />
            <div className="max-w-xs text-sm">
              <h2 className="mb-2 text-lg font-bold">{detail.name}</h2>
              <p>{detail.effectText || '効果なし(バニラ)'}</p>
            </div>
          </div>
        )}
      </Modal>

      <Modal open={graveView !== null} onClose={() => setGraveView(null)}>
        <h2 className="mb-3 font-bold">{graveView !== null ? game.players[graveView].name : ''}の墓地</h2>
        <div className="flex max-w-2xl flex-wrap gap-2">
          {graveView !== null && game.players[graveView].grave.map((c, i) => <CardFace key={i} card={c} size="xs" />)}
          {graveView !== null && game.players[graveView].grave.length === 0 && (
            <p className="text-sm text-slate-400">墓地は空です</p>
          )}
        </div>
      </Modal>

      {/* 罠発動確認(自分の罠) */}
      <Modal open={pending?.kind === 'trapPrompt' && pending.forPlayer === mySeat} onClose={() => {}} peekable>
        {pending?.kind === 'trapPrompt' && pending.forPlayer === mySeat && (
          <div>
            <p className="mb-3 font-semibold">{opp.name}がモンスターを召喚しました。罠を発動しますか?</p>
            <div className="mb-4 flex gap-3">
              {pending.zones.map((z) => {
                const t = me.traps[z]
                return t ? (
                  <div key={z} className="flex flex-col items-center gap-2">
                    <CardFace card={t.card} size="sm" />
                    <button
                      onClick={() => act({ kind: 'respondTrap', zone: z })}
                      className="rounded bg-red-700 px-4 py-1.5 text-sm font-bold hover:bg-red-600"
                    >
                      発動!
                    </button>
                  </div>
                ) : null
              })}
            </div>
            <button
              onClick={() => act({ kind: 'respondTrap', zone: null })}
              className="rounded bg-slate-700 px-5 py-2 text-sm hover:bg-slate-600"
            >
              発動しない
            </button>
          </div>
        )}
      </Modal>

      {/* 効果対象選択(墓地・デッキ・手札のモーダル系) */}
      <Modal open={!!modalTargetPending} onClose={() => {}} peekable>
        {pending?.kind === 'effectTarget' && pending.forPlayer === mySeat && (
          <div>
            <p className="mb-3 font-semibold">
              {cardById(pending.sourceId)?.name ?? ''}の効果: 対象を選択してください
            </p>
            <div className="mb-4 flex max-w-2xl flex-wrap gap-2">
              {pending.options.map((opt, i) => {
                const c = targetCardOf(opt)
                return c ? (
                  <CardFace key={i} card={c} size="sm" onClick={() => act({ kind: 'respondTarget', choice: opt })} />
                ) : null
              })}
            </div>
            {pending.optional && (
              <button
                onClick={() => act({ kind: 'respondTarget', choice: null })}
                className="rounded bg-slate-700 px-5 py-2 text-sm hover:bg-slate-600"
              >
                発動しない
              </button>
            )}
          </div>
        )}
      </Modal>

      {/* 効果対象が盤面系の場合のスキップバー */}
      {pending?.kind === 'effectTarget' && pending.forPlayer === mySeat && !modalTargetPending && (
        <div className="fixed bottom-4 left-1/2 flex -translate-x-1/2 items-center gap-3 rounded-lg bg-slate-800 px-5 py-3 shadow-xl ring-1 ring-indigo-400">
          <span className="text-sm font-semibold">
            {cardById(pending.sourceId)?.name}の効果: 対象をクリック
          </span>
          {pending.optional && (
            <button
              onClick={() => act({ kind: 'respondTarget', choice: null })}
              className="rounded bg-slate-600 px-3 py-1 text-sm"
            >
              発動しない
            </button>
          )}
        </div>
      )}

      {/* 攻撃側の戦闘強化(自分が攻撃側) */}
      <Modal open={pending?.kind === 'attackerBoost' && pending.forPlayer === mySeat} onClose={() => {}} peekable>
        {pending?.kind === 'attackerBoost' && pending.forPlayer === mySeat && (
          <div>
            <p className="mb-1 font-semibold">戦闘強化(任意)</p>
            <BattleInfo game={game} mySeat={mySeat} battle={pending.battle} />
            <p className="mb-3 text-sm text-slate-400">
              手札のモンスター1枚を捨てて、攻撃力を「捨てたモンスターの星×100」上げられます(この戦闘の間)
            </p>
            <div className="mb-4 flex max-w-2xl flex-wrap gap-3">
              {pending.options.map((i) => {
                const c = me.hand[i]
                if (!c) return null
                const v = boostValue(c, 'attacker', undefined, me.reinforceDoubledThisTurn)
                return (
                  <div key={i} className="flex flex-col items-center gap-1">
                    <CardFace card={c} size="sm" onClick={() => act({ kind: 'respondBoost', handIdx: i })} />
                    <span className="text-sm font-bold text-orange-400">+{v}</span>
                  </div>
                )
              })}
            </div>
            <button
              onClick={() => act({ kind: 'respondBoost', handIdx: null })}
              className="rounded bg-slate-700 px-5 py-2 text-sm hover:bg-slate-600"
            >
              強化しない
            </button>
          </div>
        )}
      </Modal>

      {/* 防御側リアクション(罠 or 戦闘強化の二者択一) */}
      <Modal open={pending?.kind === 'defenderReaction' && pending.forPlayer === mySeat} onClose={() => {}} peekable>
        {pending?.kind === 'defenderReaction' && pending.forPlayer === mySeat && (
          <div className="max-w-2xl">
            <p className="mb-1 font-semibold">{opp.name}の攻撃宣言</p>
            <BattleInfo game={game} mySeat={mySeat} battle={pending.battle} />
            <p className="mb-3 text-sm text-slate-400">
              罠の発動 または 戦闘強化(手札を捨てて星×100加算)の<b>どちらか一方</b>を行えます
            </p>
            {pending.trapZones.length > 0 && (
              <div className="mb-4">
                <p className="mb-1 text-sm font-semibold text-red-300">罠を発動</p>
                <div className="flex flex-wrap gap-3">
                  {pending.trapZones.map((z) => {
                    const t = me.traps[z]
                    return t ? (
                      <div key={z} className="flex flex-col items-center gap-1">
                        <CardFace
                          card={t.card}
                          size="sm"
                          onClick={() => act({ kind: 'respondReaction', choice: { type: 'trap', zone: z } })}
                        />
                        <span className="text-xs text-red-300">発動</span>
                      </div>
                    ) : null
                  })}
                </div>
              </div>
            )}
            {pending.boostOptions.length > 0 && pending.battle.target !== 'direct' && (
              <div className="mb-4">
                <p className="mb-1 text-sm font-semibold text-sky-300">戦闘強化(守る側のモンスターに加算)</p>
                <div className="flex flex-wrap gap-3">
                  {pending.boostOptions.map((i) => {
                    const c = me.hand[i]
                    if (!c) return null
                    const defMonster =
                      pending.battle.target !== 'direct' ? me.monsters[pending.battle.target] : null
                    const v = boostValue(c, 'defender', defMonster?.position, me.reinforceDoubledThisTurn)
                    return (
                      <div key={i} className="flex flex-col items-center gap-1">
                        <CardFace
                          card={c}
                          size="sm"
                          onClick={() => act({ kind: 'respondReaction', choice: { type: 'boost', handIdx: i } })}
                        />
                        <span className="text-sm font-bold text-sky-400">+{v}</span>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
            <button
              onClick={() => act({ kind: 'respondReaction', choice: null })}
              className="rounded bg-slate-700 px-5 py-2 text-sm hover:bg-slate-600"
            >
              何もしない
            </button>
          </div>
        )}
      </Modal>

      {/* 魔法対象(墓地モーダル) */}
      <Modal open={!!magicModalTargets} onClose={idle}>
        {magicModalTargets && sel.mode === 'magicTarget' && (
          <div>
            <p className="mb-3 font-semibold">対象を選択してください</p>
            <div className="flex max-w-2xl flex-wrap gap-2">
              {magicModalTargets.map((opt, i) => {
                const c = targetCardOf(opt)
                return c ? (
                  <CardFace
                    key={i}
                    card={c}
                    size="sm"
                    onClick={() => {
                      act({ kind: 'magic', handIdx: sel.handIdx, target: opt })
                      idle()
                    }}
                  />
                ) : null
              })}
            </div>
          </div>
        )}
      </Modal>

      {/* 勝敗オーバーレイ */}
      {game.winner !== undefined && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80">
          <div className="flex flex-col items-center gap-4 rounded-2xl bg-slate-800 p-10 shadow-2xl">
            <h2 className={`text-5xl font-black ${game.winner === mySeat ? 'text-amber-400' : 'text-slate-400'}`}>
              {game.winner === 'draw' ? 'DRAW' : game.winner === mySeat ? 'WIN!' : 'LOSE...'}
            </h2>
            <p className="text-slate-300">{game.winReason}</p>
            <p className="text-sm text-slate-400">
              経過ターン: {game.turnCount} | あなたLP {Math.max(0, me.life)} / {opp.name} LP {Math.max(0, opp.life)}
            </p>
            <div className="flex gap-3">
              {onRematch && (
                <button
                  onClick={onRematch}
                  className="rounded-lg bg-indigo-600 px-6 py-2.5 font-semibold hover:bg-indigo-500"
                >
                  {rematchLabel ?? 'もう一度'}
                </button>
              )}
              <button
                onClick={onExit}
                className="rounded-lg bg-slate-700 px-6 py-2.5 font-semibold hover:bg-slate-600"
              >
                ホームへ
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

/** 戦闘中の両モンスターと実効値(バフ・戦闘強化込み)の表示 */
function BattleInfo({ game, mySeat, battle }: { game: GameState; mySeat: PlayerIdx; battle: BattleContext }) {
  const attackerOwner = game.turnPlayer
  const defenderOwner = other(attackerOwner)
  const attacker = game.players[attackerOwner].monsters[battle.attackerZone]
  const defMon = battle.target !== 'direct' ? game.players[defenderOwner].monsters[battle.target] : null
  if (!attacker) return null

  const renderSide = (
    label: string,
    isMine: boolean,
    m: FieldMonster,
    mode: 'attack' | 'defense',
    boost: number,
  ) => {
    const base = mode === 'attack' ? (m.card.atk ?? 0) : (m.card.def ?? 0)
    const buffSum = mode === 'attack' ? m.buffs.reduce((s, b) => s + b.amount, 0) : 0
    const total = Math.max(0, base + buffSum) + boost
    return (
      <div className="flex flex-col items-center gap-1">
        <span className={`text-xs font-semibold ${isMine ? 'text-emerald-300' : 'text-red-300'}`}>
          {label}
        </span>
        <CardFace card={m.card} size="xs" />
        <span className="font-mono text-sm font-bold">
          {mode === 'attack' ? '攻' : '守'}
          {total}
        </span>
        {(buffSum !== 0 || boost > 0) && (
          <span className="text-[10px] text-slate-400">
            基礎{base}
            {buffSum !== 0 && (
              <span className={buffSum > 0 ? 'text-emerald-400' : 'text-red-400'}>
                {' '}
                バフ{buffSum > 0 ? `+${buffSum}` : buffSum}
              </span>
            )}
            {boost > 0 && <span className="text-orange-400"> 強化+{boost}</span>}
          </span>
        )}
      </div>
    )
  }

  return (
    <div className="mb-3 flex items-center justify-center gap-4 rounded-lg bg-slate-900/60 p-3">
      {renderSide(
        `攻撃側: ${game.players[attackerOwner].name}`,
        attackerOwner === mySeat,
        attacker,
        'attack',
        battle.attackerBoost,
      )}
      <span className="text-2xl text-red-400">⚔</span>
      {defMon ? (
        renderSide(
          `防御側: ${game.players[defenderOwner].name}`,
          defenderOwner === mySeat,
          defMon,
          defMon.position,
          battle.defenderBoost,
        )
      ) : (
        <div className="flex flex-col items-center gap-1">
          <span className="text-xs font-semibold text-red-300">直接攻撃!</span>
          <span className="text-3xl">💥</span>
          <span className="font-mono text-sm">{game.players[defenderOwner].name}のライフへ</span>
        </div>
      )}
    </div>
  )
}

/** 期限付きバフ/デバフの合計をバッジ表示(+は緑、-は赤) */
function BuffBadge({ m }: { m: FieldMonster }) {
  const net = m.buffs.reduce((sum, b) => sum + b.amount, 0)
  if (net === 0) return null
  return (
    <span
      className={`absolute -top-1 right-0 rounded px-1 text-[9px] font-bold ${net > 0 ? 'bg-emerald-600' : 'bg-red-700'}`}
    >
      {net > 0 ? `+${net}` : net}
    </span>
  )
}
