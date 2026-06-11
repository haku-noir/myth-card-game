import { useState } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { openPacks } from '../../api/packs'
import { cardById } from '../../data/cards'
import { usePvpStore } from '../../store/pvpStore'
import type { Card } from '../../types/card'
import Board from '../../components/game/Board'
import CardFace from '../../components/card/CardFace'
import PoolDeckBuilder from '../../components/draft/PoolDeckBuilder'

// ============================================================
// モード選択 + ロビー
// ============================================================

function DraftLobby({ initialMode }: { initialMode: 'sealed' | 'booster' }) {
  const navigate = useNavigate()
  const pvp = usePvpStore()
  const [mode, setMode] = useState<'sealed' | 'booster'>(initialMode)
  const [name, setName] = useState('')
  const [joinCode, setJoinCode] = useState('')

  if (pvp.status !== 'idle') return null

  return (
    <div className="mx-auto flex min-h-screen max-w-lg flex-col justify-center gap-6 p-6">
      <div className="flex items-center gap-4">
        <Link to="/" className="text-slate-400 hover:text-white">← ホーム</Link>
        <h1 className="text-2xl font-bold">ドラフト</h1>
      </div>

      {pvp.error && <p className="rounded bg-red-900/50 p-3 text-sm text-red-300">{pvp.error}</p>}

      <section>
        <h2 className="mb-2 font-semibold">形式</h2>
        <div className="flex flex-col gap-2">
          <button
            onClick={() => setMode('sealed')}
            className={`rounded-lg p-4 text-left ${mode === 'sealed' ? 'bg-indigo-900/60 ring-1 ring-indigo-400' : 'bg-slate-800 hover:bg-slate-700'}`}
          >
            <span className="block font-bold">シールド戦</span>
            <span className="text-sm text-slate-400">各自パック4個を開封し、40枚から20枚のデッキを構築して対戦</span>
          </button>
          <button
            onClick={() => setMode('booster')}
            className={`rounded-lg p-4 text-left ${mode === 'booster' ? 'bg-indigo-900/60 ring-1 ring-indigo-400' : 'bg-slate-800 hover:bg-slate-700'}`}
          >
            <span className="block font-bold">ブースタードラフト</span>
            <span className="text-sm text-slate-400">パックから1枚選んで隣へ回す×4ラウンド。40枚から20枚を構築して対戦</span>
          </button>
        </div>
      </section>

      <input
        className="rounded bg-slate-800 px-4 py-3"
        placeholder="プレイヤー名"
        value={name}
        maxLength={20}
        onChange={(e) => setName(e.target.value)}
      />

      <div className="rounded-lg bg-slate-800 p-4">
        <h2 className="mb-3 font-semibold">ルームを作る</h2>
        <button
          onClick={() => pvp.createRoom(name.trim() || 'プレイヤー1', mode)}
          className="w-full rounded bg-indigo-600 py-3 font-semibold hover:bg-indigo-500"
        >
          {mode === 'sealed' ? 'シールド戦' : 'ブースタードラフト'}のルーム作成
        </button>
      </div>

      <div className="rounded-lg bg-slate-800 p-4">
        <h2 className="mb-3 font-semibold">ルームに参加する</h2>
        <p className="mb-2 text-xs text-slate-400">形式はルーム作成者の設定に従います</p>
        <div className="flex gap-2">
          <input
            className="flex-1 rounded bg-slate-700 px-4 py-3 font-mono uppercase tracking-widest"
            placeholder="コード"
            value={joinCode}
            maxLength={4}
            onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
          />
          <button
            onClick={() => pvp.joinRoom(joinCode.trim(), name.trim() || 'プレイヤー2')}
            disabled={joinCode.length !== 4}
            className="rounded bg-emerald-700 px-6 font-semibold hover:bg-emerald-600 disabled:opacity-40"
          >
            参加
          </button>
        </div>
      </div>

      <button onClick={() => navigate('/')} className="text-sm text-slate-500 underline hover:text-white">
        戻る
      </button>
    </div>
  )
}

// ============================================================
// シールド戦: パック開封 → 構築
// ============================================================

function SealedBuild() {
  const pvp = usePvpStore()
  const [pool, setPool] = useState<Card[] | null>(null)
  const [opening, setOpening] = useState(false)
  const [error, setError] = useState('')

  const handleOpen = async () => {
    setOpening(true)
    setError('')
    try {
      const packs = await openPacks(4)
      setPool(packs.flatMap((p) => p.cards))
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setOpening(false)
    }
  }

  if (!pool) {
    return (
      <div className="flex flex-col items-center gap-6 py-10">
        {error && <p className="rounded bg-red-900/50 p-3 text-sm text-red-300">{error}</p>}
        <button
          onClick={handleOpen}
          disabled={opening}
          className="flex h-72 w-52 flex-col items-center justify-center gap-3 rounded-xl border-4 border-amber-500/60 bg-gradient-to-b from-indigo-800 to-slate-900 shadow-xl transition hover:scale-105 disabled:opacity-50"
        >
          <span className="text-5xl">🎴</span>
          <span className="text-lg font-bold">{opening ? '開封中...' : 'パック4個を開封'}</span>
        </button>
      </div>
    )
  }

  return (
    <div className="py-4">
      <h2 className="mb-3 text-lg font-bold">開封結果から20枚を構築</h2>
      {pvp.myDeckReady ? (
        <p className="animate-pulse py-10 text-center text-slate-300">相手の準備を待っています...</p>
      ) : (
        <PoolDeckBuilder pool={pool} confirmLabel="このデッキで対戦" onConfirm={pvp.submitDeck} />
      )}
    </div>
  )
}

// ============================================================
// ブースタードラフト: ピック画面
// ============================================================

function DraftPick() {
  const pvp = usePvpStore()
  const d = pvp.draft
  if (!d) return <p className="animate-pulse py-10 text-center text-slate-300">パックを待っています...</p>

  return (
    <div className="py-4">
      <div className="mb-4 flex items-center gap-4">
        <h2 className="text-lg font-bold">ブースタードラフト</h2>
        <span className="text-sm text-slate-300">
          ラウンド {d.round}/{d.totalRounds} | ピック済み {d.pickedCount}枚 | パック残り {d.pack.length}枚
        </span>
        <span className="text-xs text-slate-500">
          {d.round % 2 === 1 ? '→ 左隣へ回す' : '← 右隣へ回す'}
        </span>
      </div>

      {d.waiting ? (
        <p className="animate-pulse py-10 text-center text-slate-300">相手のピックを待っています...</p>
      ) : (
        <>
          <p className="mb-3 text-sm text-amber-300">1枚選んでください</p>
          <div className="flex flex-wrap gap-3">
            {d.pack.map((card, i) => (
              <div key={`${card.id}-${i}`} className="animate-card-reveal" style={{ animationDelay: `${i * 60}ms` }}>
                <CardFace card={card} onClick={() => pvp.pickCard(i)} />
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

function BoosterBuild() {
  const pvp = usePvpStore()
  const pool = pvp.draftedCardIds.map((id) => cardById(id)).filter((c): c is Card => !!c)

  return (
    <div className="py-4">
      <h2 className="mb-3 text-lg font-bold">ドラフトした{pool.length}枚から20枚を構築</h2>
      {pvp.myDeckReady ? (
        <p className="animate-pulse py-10 text-center text-slate-300">相手の準備を待っています...</p>
      ) : (
        <PoolDeckBuilder pool={pool} confirmLabel="このデッキで対戦" onConfirm={pvp.submitDeck} />
      )}
    </div>
  )
}

// ============================================================
// エントリ
// ============================================================

export default function Draft() {
  const navigate = useNavigate()
  const location = useLocation()
  const pvp = usePvpStore()
  const initialMode = location.pathname.includes('sealed') ? 'sealed' : 'booster'

  // 通常PvPルームに参加した場合はPvP画面へ
  if (pvp.status !== 'idle' && pvp.mode === 'pvp') return <Navigate to="/game?mode=pvp" replace />

  if (pvp.status === 'idle') return <DraftLobby initialMode={initialMode} />

  if (pvp.status === 'opponentLeft') {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4">
        <p className="text-xl text-slate-300">相手が退出しました</p>
        <button
          onClick={() => { pvp.leave(); navigate('/') }}
          className="rounded bg-slate-700 px-6 py-2.5 hover:bg-slate-600"
        >
          ホームへ
        </button>
      </div>
    )
  }

  if (pvp.status === 'playing' && pvp.game) {
    return (
      <Board
        game={pvp.game}
        mySeat={pvp.mySeat}
        act={pvp.act}
        busy={
          pvp.game.winner === undefined &&
          !(pvp.game.pending ? pvp.game.pending.forPlayer === pvp.mySeat : pvp.game.turnPlayer === pvp.mySeat)
        }
        busyLabel="相手の操作待ち..."
        onExit={() => { pvp.leave(); navigate('/') }}
      />
    )
  }

  // ルーム内(待機/構築/ドラフト)
  return (
    <div className="mx-auto min-h-screen max-w-5xl p-6">
      <div className="mb-4 flex items-center gap-4">
        <h1 className="text-xl font-bold">{pvp.mode === 'sealed' ? 'シールド戦' : 'ブースタードラフト'}</h1>
        <span className="rounded bg-indigo-900 px-4 py-1 font-mono text-lg tracking-widest text-indigo-200">
          {pvp.roomId}
        </span>
        <span className="text-sm text-slate-400">参加者: {pvp.names.join(' / ') || '...'}</span>
        <button
          onClick={() => { pvp.leave(); navigate('/') }}
          className="ml-auto text-sm text-slate-500 underline hover:text-white"
        >
          退出
        </button>
      </div>

      {pvp.status === 'waiting' && (
        <p className="animate-pulse py-10 text-center text-slate-300">
          相手の参加を待っています... 上のコードを相手に伝えてください
        </p>
      )}
      {pvp.status === 'deckSelect' && pvp.mode === 'sealed' && <SealedBuild />}
      {pvp.status === 'drafting' && <DraftPick />}
      {pvp.status === 'building' && <BoosterBuild />}
    </div>
  )
}
