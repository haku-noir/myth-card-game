import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { fetchDecks } from '../../api/decks'
import { openPacks } from '../../api/packs'
import { cardById } from '../../data/cards'
import { buildCpuDeck } from '../../engine/cpuDeck'
import {
  attackTargets,
  canAttackWith,
  canCastMagic,
  canChangePosition,
  canEnterBattle,
  canSetTrap,
  canSummon,
  magicTargets,
  releaseOptionsFor,
} from '../../engine/gameEngine'
import { CPU, HUMAN, useGameStore } from '../../store/gameStore'
import type { Card } from '../../types/card'
import type { Difficulty, TargetOption } from '../../types/game'
import type { SavedDeck } from '../../types/deck'
import CardFace from '../../components/card/CardFace'
import CardBack from '../../components/card/CardBack'
import Modal from '../../components/common/Modal'

// ============================================================
// セットアップ画面
// ============================================================

function GameSetup() {
  const [params] = useSearchParams()
  const preselect = params.get('deckId') ? Number(params.get('deckId')) : null
  const [decks, setDecks] = useState<SavedDeck[]>([])
  const [deckId, setDeckId] = useState<number | null>(preselect)
  const [difficulty, setDifficulty] = useState<Difficulty>('normal')
  const [loading, setLoading] = useState(true)
  const [starting, setStarting] = useState(false)
  const [error, setError] = useState('')
  const startCpuGame = useGameStore((s) => s.startCpuGame)

  useEffect(() => {
    fetchDecks()
      .then((d) => {
        setDecks(d)
        if (preselect === null && d.length > 0) setDeckId(d[0].id)
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false))
  }, [preselect])

  const handleStart = async () => {
    const deck = decks.find((d) => d.id === deckId)
    if (!deck) return
    setStarting(true)
    setError('')
    try {
      const playerDeck = deck.cardIds.map((id) => cardById(id)).filter((c): c is Card => !!c)
      // CPUのデッキもパック開封から自動構築する
      const packs = await openPacks(4)
      const cpuDeck = buildCpuDeck(packs.flatMap((p) => p.cards))
      startCpuGame(playerDeck, deck.name, cpuDeck, difficulty)
    } catch (e) {
      setError((e as Error).message)
      setStarting(false)
    }
  }

  const diffLabel: Record<Difficulty, string> = { easy: '易しい', normal: '普通', hard: '難しい' }

  return (
    <div className="mx-auto flex min-h-screen max-w-lg flex-col justify-center gap-6 p-6">
      <div className="flex items-center gap-4">
        <Link to="/" className="text-slate-400 hover:text-white">← ホーム</Link>
        <h1 className="text-2xl font-bold">CPU戦</h1>
      </div>

      {error && <p className="rounded bg-red-900/50 p-3 text-sm text-red-300">{error}</p>}

      <section>
        <h2 className="mb-2 font-semibold">使用デッキ</h2>
        {loading && <p className="text-slate-400">読み込み中...</p>}
        {!loading && decks.length === 0 && (
          <div className="rounded bg-slate-800 p-4 text-sm text-slate-400">
            保存されたデッキがありません。
            <Link to="/pack-opening" className="ml-2 text-indigo-400 underline">パックを開封して作成する</Link>
          </div>
        )}
        <div className="space-y-2">
          {decks.map((d) => (
            <label
              key={d.id}
              className={`flex cursor-pointer items-center gap-3 rounded-lg p-3 ${deckId === d.id ? 'bg-indigo-900/60 ring-1 ring-indigo-400' : 'bg-slate-800'}`}
            >
              <input
                type="radio"
                checked={deckId === d.id}
                onChange={() => setDeckId(d.id)}
              />
              <span className="font-semibold">{d.name}</span>
            </label>
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-2 font-semibold">CPUの強さ</h2>
        <div className="flex gap-2">
          {(['easy', 'normal', 'hard'] as const).map((diff) => (
            <button
              key={diff}
              onClick={() => setDifficulty(diff)}
              className={`flex-1 rounded-lg px-4 py-3 font-semibold ${difficulty === diff ? 'bg-indigo-600' : 'bg-slate-800 hover:bg-slate-700'}`}
            >
              {diffLabel[diff]}
            </button>
          ))}
        </div>
      </section>

      <button
        onClick={handleStart}
        disabled={deckId === null || starting}
        className="rounded-lg bg-emerald-700 py-4 text-lg font-bold hover:bg-emerald-600 disabled:opacity-40"
      >
        {starting ? '準備中...' : '対戦開始'}
      </button>
    </div>
  )
}

// ============================================================
// 盤面
// ============================================================

type Sel =
  | { mode: 'idle' }
  | { mode: 'handMenu'; handIdx: number }
  | { mode: 'fieldMenu'; zone: number }
  | { mode: 'selectRelease'; handIdx: number; position: 'attack' | 'defense' }
  | { mode: 'magicTarget'; handIdx: number; options: TargetOption[] }
  | { mode: 'attackTarget'; attackerZone: number }

function Board() {
  const navigate = useNavigate()
  const game = useGameStore((s) => s.game)!
  const cpuThinking = useGameStore((s) => s.cpuThinking)
  const store = useGameStore()
  const [sel, setSel] = useState<Sel>({ mode: 'idle' })
  const [detail, setDetail] = useState<Card | null>(null)
  const [graveView, setGraveView] = useState<0 | 1 | null>(null)
  const logRef = useRef<HTMLDivElement>(null)

  const me = game.players[HUMAN]
  const opp = game.players[CPU]
  const myTurn = game.turnPlayer === HUMAN && game.winner === undefined
  const pending = game.pending

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight })
  }, [game.log.length])

  // pendingが立ったら選択モードを解除
  useEffect(() => {
    if (pending) setSel({ mode: 'idle' })
  }, [pending])

  const idle = () => setSel({ mode: 'idle' })

  // ---- 手札メニューの内容 ----
  const handCard = sel.mode === 'handMenu' ? me.hand[sel.handIdx] : null
  const handMenuItems: { label: string; onClick: () => void }[] = []
  if (sel.mode === 'handMenu' && handCard && myTurn && !pending) {
    const i = sel.handIdx
    if (handCard.type === 'monster') {
      if (canSummon(game, i)) {
        handMenuItems.push(
          { label: '攻撃表示で召喚', onClick: () => { store.doSummon(i, 'attack'); idle() } },
          { label: '守備表示で召喚', onClick: () => { store.doSummon(i, 'defense'); idle() } },
        )
      } else if (releaseOptionsFor(game, i).length > 0) {
        handMenuItems.push(
          { label: 'リリース召喚(攻撃表示)', onClick: () => setSel({ mode: 'selectRelease', handIdx: i, position: 'attack' }) },
          { label: 'リリース召喚(守備表示)', onClick: () => setSel({ mode: 'selectRelease', handIdx: i, position: 'defense' }) },
        )
      }
    } else if (handCard.type === 'magic' && canCastMagic(game, i)) {
      handMenuItems.push({
        label: '発動',
        onClick: () => {
          const targets = magicTargets(game, i)
          if (targets === null) {
            store.doCastMagic(i)
            idle()
          } else {
            setSel({ mode: 'magicTarget', handIdx: i, options: targets })
          }
        },
      })
    } else if (handCard.type === 'trap' && canSetTrap(game, i)) {
      handMenuItems.push({ label: 'セット', onClick: () => { store.doSetTrap(i); idle() } })
    }
    handMenuItems.push({ label: '詳細', onClick: () => { setDetail(handCard); idle() } })
  }

  // ---- クリックハンドラ ----
  const releaseZones = sel.mode === 'selectRelease' ? releaseOptionsFor(game, sel.handIdx) : []

  const onMyMonsterClick = (zone: number) => {
    if (pending || game.winner !== undefined) return
    if (sel.mode === 'selectRelease') {
      if (releaseZones.includes(zone)) {
        store.doSummon(sel.handIdx, sel.position, zone)
        idle()
      }
      return
    }
    if (sel.mode === 'magicTarget') {
      const opt = sel.options.find((o) => o.area === 'ownMonster' && o.index === zone)
      if (opt) {
        store.doCastMagic(sel.handIdx, opt)
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
    // 効果対象の選択(雪女・九尾など)
    if (pending?.kind === 'effectTarget' && pending.forPlayer === HUMAN) {
      const opt = pending.options.find((o) => o.area === 'oppMonster' && o.index === zone)
      if (opt) store.doRespondTarget(opt)
      return
    }
    if (pending) return
    if (sel.mode === 'magicTarget') {
      const opt = sel.options.find((o) => o.area === 'oppMonster' && o.index === zone)
      if (opt) {
        store.doCastMagic(sel.handIdx, opt)
        idle()
      }
      return
    }
    if (sel.mode === 'attackTarget') {
      store.doAttack(sel.attackerZone, zone)
      idle()
      return
    }
    const m = opp.monsters[zone]
    if (m) setDetail(m.card)
  }

  const onOppTrapClick = (zone: number) => {
    if (game.winner !== undefined) return
    if (pending?.kind === 'effectTarget' && pending.forPlayer === HUMAN) {
      const opt = pending.options.find((o) => o.area === 'oppTrap' && o.index === zone)
      if (opt) store.doRespondTarget(opt)
      return
    }
    if (pending) return
    if (sel.mode === 'magicTarget') {
      const opt = sel.options.find((o) => o.area === 'oppTrap' && o.index === zone)
      if (opt) {
        store.doCastMagic(sel.handIdx, opt)
        idle()
      }
    }
  }

  // 効果対象がモーダル系(墓地・デッキ・手札)か
  const modalTargetPending =
    pending?.kind === 'effectTarget' &&
    pending.forPlayer === HUMAN &&
    ['grave', 'deck', 'hand'].includes(pending.options[0]?.area)

  const magicModalTargets =
    sel.mode === 'magicTarget' && ['grave'].includes(sel.options[0]?.area) ? sel.options : null

  const targetCardOf = (opt: TargetOption): Card | undefined => {
    if (opt.area === 'grave') return me.grave[opt.index]
    if (opt.area === 'deck') return me.deck[opt.index]
    if (opt.area === 'hand') return me.hand[opt.index]
    return undefined
  }

  const canDirectAttack = sel.mode === 'attackTarget' && attackTargets(game)[0] === 'direct'

  // ============ レンダリング ============
  return (
    <div className="mx-auto flex min-h-screen max-w-5xl flex-col gap-2 p-3">
      {/* 相手情報 */}
      <div className="flex items-center gap-4 rounded-lg bg-slate-800 px-4 py-2 text-sm">
        <span className="font-bold">CPU</span>
        <span className="text-red-300">LP {Math.max(0, opp.life)}</span>
        <span className="text-amber-300">Lv {opp.level}</span>
        <span>手札 {opp.hand.length}</span>
        <span>デッキ {opp.deck.length}</span>
        <button onClick={() => setGraveView(CPU)} className="text-slate-400 underline">
          墓地 {opp.grave.length}
        </button>
        {cpuThinking && <span className="ml-auto animate-pulse text-indigo-300">CPU思考中...</span>}
      </div>

      {/* 相手の場 */}
      <div className="flex justify-center gap-2">
        {opp.monsters.map((m, z) => (
          <div
            key={z}
            onClick={() => onOppMonsterClick(z)}
            className={`flex h-32 w-24 items-center justify-center rounded-lg ${m ? 'cursor-pointer' : 'border border-dashed border-slate-700'} ${
              (sel.mode === 'attackTarget' && m) ||
              (pending?.kind === 'effectTarget' && pending.forPlayer === HUMAN && pending.options.some((o) => o.area === 'oppMonster' && o.index === z)) ||
              (sel.mode === 'magicTarget' && sel.options.some((o) => o.area === 'oppMonster' && o.index === z))
                ? 'ring-2 ring-red-400'
                : ''
            }`}
          >
            {m && (
              <div className={m.position === 'defense' ? 'rotate-90' : ''}>
                <CardFace card={m.card} size="xs" />
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
              (pending?.kind === 'effectTarget' && pending.forPlayer === HUMAN && pending.options.some((o) => o.area === 'oppTrap' && o.index === z)) ||
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
          ターン{game.turnCount} | {myTurn ? 'あなた' : 'CPU'}のターン |{' '}
          {game.phase === 'main' ? 'メインフェイズ' : game.phase === 'battle' ? 'バトルフェイズ' : '終了'}
        </span>
        {myTurn && !pending && game.phase === 'main' && (
          <button
            onClick={() => { store.doToBattle(); idle() }}
            disabled={!canEnterBattle(game)}
            className="rounded bg-red-800 px-4 py-1 text-sm font-semibold hover:bg-red-700 disabled:opacity-40"
          >
            バトルフェイズへ
          </button>
        )}
        {myTurn && !pending && (
          <button
            onClick={() => { store.doEndTurn(); idle() }}
            className="rounded bg-slate-600 px-4 py-1 text-sm font-semibold hover:bg-slate-500"
          >
            ターン終了
          </button>
        )}
        {canDirectAttack && (
          <button
            onClick={() => { store.doAttack((sel as { attackerZone: number }).attackerZone, 'direct'); idle() }}
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
        <p className="text-center text-sm text-amber-300">リリースするモンスターを選択してください</p>
      )}
      {sel.mode === 'magicTarget' && !magicModalTargets && (
        <p className="text-center text-sm text-amber-300">対象を選択してください</p>
      )}
      {sel.mode === 'attackTarget' && !canDirectAttack && (
        <p className="text-center text-sm text-red-300">攻撃対象を選択してください</p>
      )}

      {/* 自分の伏せ */}
      <div className="flex justify-center gap-2">
        {me.traps.map((t, z) => (
          <div key={z} className={`flex h-16 w-24 items-center justify-center rounded ${t ? '' : 'border border-dashed border-slate-800'}`}>
            {t && (
              <div className="relative" title={t.card.name}>
                <CardBack size="xs" />
                <span className="absolute -bottom-1 left-0 right-0 rounded bg-black/80 text-center text-[9px] text-slate-300">
                  {t.card.name}
                </span>
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
              sel.mode === 'selectRelease' && releaseZones.includes(z)
                ? 'ring-2 ring-amber-400'
                : sel.mode === 'magicTarget' && sel.options.some((o) => o.area === 'ownMonster' && o.index === z)
                  ? 'ring-2 ring-emerald-400'
                  : game.phase === 'battle' && myTurn && canAttackWith(game, z)
                    ? 'ring-2 ring-red-500/60'
                    : ''
            }`}
          >
            {m && (
              <div className={`relative ${m.position === 'defense' ? 'rotate-90' : ''}`}>
                <CardFace card={m.card} size="xs" />
                {m.atkBuff > 0 && (
                  <span className="absolute -top-1 right-0 rounded bg-emerald-600 px-1 text-[9px] font-bold">
                    +{m.atkBuff}
                  </span>
                )}
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
          {canChangePosition(game, sel.zone) && (
            <button
              onClick={() => { store.doChangePosition(sel.zone); idle() }}
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
        <button onClick={() => setGraveView(HUMAN)} className="text-slate-400 underline">
          墓地 {me.grave.length}
        </button>
      </div>

      {/* 手札 */}
      <div className="flex justify-center gap-2 overflow-x-auto pb-1">
        {me.hand.map((card, i) => (
          <div
            key={i}
            className={sel.mode === 'handMenu' && sel.handIdx === i ? 'rounded ring-2 ring-indigo-400' : ''}
          >
            <CardFace
              card={card}
              size="sm"
              onClick={() => {
                if (pending || game.winner !== undefined) return
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

      {/* カード詳細 */}
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

      {/* 墓地 */}
      <Modal open={graveView !== null} onClose={() => setGraveView(null)}>
        <h2 className="mb-3 font-bold">{graveView === HUMAN ? 'あなた' : 'CPU'}の墓地</h2>
        <div className="flex max-w-2xl flex-wrap gap-2">
          {graveView !== null && game.players[graveView].grave.map((c, i) => <CardFace key={i} card={c} size="xs" />)}
          {graveView !== null && game.players[graveView].grave.length === 0 && (
            <p className="text-sm text-slate-400">墓地は空です</p>
          )}
        </div>
      </Modal>

      {/* 罠発動確認(自分の罠) */}
      <Modal open={pending?.kind === 'trapPrompt' && pending.forPlayer === HUMAN} onClose={() => {}}>
        {pending?.kind === 'trapPrompt' && pending.forPlayer === HUMAN && (
          <div>
            <p className="mb-3 font-semibold">
              {pending.trigger.type === 'summon' ? 'CPUがモンスターを召喚しました' : 'CPUが攻撃を宣言しました'}
              。罠を発動しますか?
            </p>
            <div className="mb-4 flex gap-3">
              {pending.zones.map((z) => {
                const t = me.traps[z]
                return t ? (
                  <div key={z} className="flex flex-col items-center gap-2">
                    <CardFace card={t.card} size="sm" />
                    <button
                      onClick={() => store.doRespondTrap(z)}
                      className="rounded bg-red-700 px-4 py-1.5 text-sm font-bold hover:bg-red-600"
                    >
                      発動!
                    </button>
                  </div>
                ) : null
              })}
            </div>
            <button
              onClick={() => store.doRespondTrap(null)}
              className="rounded bg-slate-700 px-5 py-2 text-sm hover:bg-slate-600"
            >
              発動しない
            </button>
          </div>
        )}
      </Modal>

      {/* 効果対象選択(墓地・デッキ・手札のモーダル系) */}
      <Modal open={!!modalTargetPending} onClose={() => {}}>
        {pending?.kind === 'effectTarget' && pending.forPlayer === HUMAN && (
          <div>
            <p className="mb-3 font-semibold">
              {cardById(pending.sourceId)?.name ?? ''}の効果: 対象を選択してください
            </p>
            <div className="mb-4 flex max-w-2xl flex-wrap gap-2">
              {pending.options.map((opt, i) => {
                const c = targetCardOf(opt)
                return c ? (
                  <CardFace key={i} card={c} size="sm" onClick={() => store.doRespondTarget(opt)} />
                ) : null
              })}
            </div>
            {pending.optional && (
              <button
                onClick={() => store.doRespondTarget(null)}
                className="rounded bg-slate-700 px-5 py-2 text-sm hover:bg-slate-600"
              >
                発動しない
              </button>
            )}
          </div>
        )}
      </Modal>

      {/* 効果対象が盤面系(相手モンスター・伏せ)の場合のスキップバー */}
      {pending?.kind === 'effectTarget' && pending.forPlayer === HUMAN && !modalTargetPending && (
        <div className="fixed bottom-4 left-1/2 flex -translate-x-1/2 items-center gap-3 rounded-lg bg-slate-800 px-5 py-3 shadow-xl ring-1 ring-indigo-400">
          <span className="text-sm font-semibold">
            {cardById(pending.sourceId)?.name}の効果: 対象をクリック
          </span>
          {pending.optional && (
            <button
              onClick={() => store.doRespondTarget(null)}
              className="rounded bg-slate-600 px-3 py-1 text-sm"
            >
              発動しない
            </button>
          )}
        </div>
      )}

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
                      store.doCastMagic(sel.handIdx, opt)
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
            <h2 className={`text-5xl font-black ${game.winner === HUMAN ? 'text-amber-400' : 'text-slate-400'}`}>
              {game.winner === 'draw' ? 'DRAW' : game.winner === HUMAN ? 'WIN!' : 'LOSE...'}
            </h2>
            <p className="text-slate-300">{game.winReason}</p>
            <p className="text-sm text-slate-400">
              経過ターン: {game.turnCount} | あなたLP {Math.max(0, me.life)} / CPU LP {Math.max(0, opp.life)}
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => store.reset()}
                className="rounded-lg bg-indigo-600 px-6 py-2.5 font-semibold hover:bg-indigo-500"
              >
                もう一度
              </button>
              <button
                onClick={() => { store.reset(); navigate('/') }}
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

// ============================================================
// エントリ
// ============================================================

export default function Game() {
  const [params] = useSearchParams()
  const mode = params.get('mode') ?? 'cpu'
  const game = useGameStore((s) => s.game)

  if (mode === 'pvp') {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4">
        <p className="text-xl text-slate-400">PvPモードはPhase 5で実装予定です</p>
        <Link to="/" className="text-indigo-400 underline">ホームへ戻る</Link>
      </div>
    )
  }

  return game ? <Board /> : <GameSetup />
}
