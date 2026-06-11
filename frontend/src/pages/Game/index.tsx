import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { fetchDecks } from '../../api/decks'
import { openPacks } from '../../api/packs'
import { cardById } from '../../data/cards'
import { buildCpuDeck } from '../../engine/cpuDeck'
import { CPU, HUMAN, useGameStore } from '../../store/gameStore'
import { usePvpStore } from '../../store/pvpStore'
import type { Card } from '../../types/card'
import type { Difficulty } from '../../types/game'
import type { SavedDeck } from '../../types/deck'
import Board from '../../components/game/Board'

// ============================================================
// 共通: デッキ選択リスト
// ============================================================

function DeckPicker({
  decks,
  loading,
  deckId,
  onSelect,
}: {
  decks: SavedDeck[]
  loading: boolean
  deckId: number | null
  onSelect: (id: number) => void
}) {
  return (
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
            <input type="radio" checked={deckId === d.id} onChange={() => onSelect(d.id)} />
            <span className="font-semibold">{d.name}</span>
          </label>
        ))}
      </div>
    </section>
  )
}

function useSavedDecks(preselect: number | null) {
  const [decks, setDecks] = useState<SavedDeck[]>([])
  const [deckId, setDeckId] = useState<number | null>(preselect)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  useEffect(() => {
    fetchDecks()
      .then((d) => {
        setDecks(d)
        if (preselect === null && d.length > 0) setDeckId(d[0].id)
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false))
  }, [preselect])
  return { decks, deckId, setDeckId, loading, error }
}

// ============================================================
// CPU戦
// ============================================================

function CpuSetup() {
  const [params] = useSearchParams()
  const preselect = params.get('deckId') ? Number(params.get('deckId')) : null
  const { decks, deckId, setDeckId, loading, error: deckError } = useSavedDecks(preselect)
  const [difficulty, setDifficulty] = useState<Difficulty>('normal')
  const [starting, setStarting] = useState(false)
  const [error, setError] = useState('')
  const startCpuGame = useGameStore((s) => s.startCpuGame)

  const handleStart = async () => {
    const deck = decks.find((d) => d.id === deckId)
    if (!deck) return
    setStarting(true)
    setError('')
    try {
      const playerDeck = deck.cardIds.map((id) => cardById(id)).filter((c): c is Card => !!c)
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

      {(error || deckError) && (
        <p className="rounded bg-red-900/50 p-3 text-sm text-red-300">{error || deckError}</p>
      )}

      <DeckPicker decks={decks} loading={loading} deckId={deckId} onSelect={setDeckId} />

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

function CpuGame() {
  const navigate = useNavigate()
  const game = useGameStore((s) => s.game)
  const cpuThinking = useGameStore((s) => s.cpuThinking)
  const act = useGameStore((s) => s.act)
  const reset = useGameStore((s) => s.reset)

  if (!game) return <CpuSetup />
  return (
    <Board
      game={game}
      mySeat={HUMAN}
      act={act}
      busy={cpuThinking && game.turnPlayer === CPU}
      busyLabel="CPU思考中..."
      onExit={() => { reset(); navigate('/') }}
      onRematch={() => reset()}
      rematchLabel="もう一度"
    />
  )
}

// ============================================================
// PvP
// ============================================================

function PvpLobby() {
  const navigate = useNavigate()
  const pvp = usePvpStore()
  const { decks, deckId, setDeckId, loading } = useSavedDecks(null)
  const [name, setName] = useState('')
  const [joinCode, setJoinCode] = useState('')

  // ロビー画面(ルーム作成/参加)
  if (pvp.status === 'idle') {
    return (
      <div className="mx-auto flex min-h-screen max-w-lg flex-col justify-center gap-6 p-6">
        <div className="flex items-center gap-4">
          <Link to="/" className="text-slate-400 hover:text-white">← ホーム</Link>
          <h1 className="text-2xl font-bold">PvP対戦</h1>
        </div>

        {pvp.error && <p className="rounded bg-red-900/50 p-3 text-sm text-red-300">{pvp.error}</p>}

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
            onClick={() => pvp.createRoom(name.trim() || 'プレイヤー1')}
            className="w-full rounded bg-indigo-600 py-3 font-semibold hover:bg-indigo-500"
          >
            ルーム作成
          </button>
        </div>

        <div className="rounded-lg bg-slate-800 p-4">
          <h2 className="mb-3 font-semibold">ルームに参加する</h2>
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
      </div>
    )
  }

  // 相手切断
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

  // 待機・デッキ選択
  return (
    <div className="mx-auto flex min-h-screen max-w-lg flex-col justify-center gap-6 p-6">
      <div className="flex items-center gap-4">
        <h1 className="text-2xl font-bold">PvPルーム</h1>
        <span className="rounded bg-indigo-900 px-4 py-1 font-mono text-xl tracking-widest text-indigo-200">
          {pvp.roomId}
        </span>
      </div>
      <p className="text-sm text-slate-400">
        このコードを相手に伝えてください。参加者: {pvp.names.join(' / ') || '...'}
      </p>

      {pvp.status === 'waiting' && <p className="animate-pulse text-slate-300">相手の参加を待っています...</p>}

      {pvp.status === 'deckSelect' && (
        <>
          {pvp.error && <p className="rounded bg-red-900/50 p-3 text-sm text-red-300">{pvp.error}</p>}
          <DeckPicker decks={decks} loading={loading} deckId={deckId} onSelect={setDeckId} />
          {!pvp.myDeckReady ? (
            <button
              onClick={() => {
                const deck = decks.find((d) => d.id === deckId)
                if (deck) pvp.submitDeck(deck.cardIds)
              }}
              disabled={deckId === null}
              className="rounded-lg bg-emerald-700 py-4 text-lg font-bold hover:bg-emerald-600 disabled:opacity-40"
            >
              このデッキで準備完了
            </button>
          ) : (
            <p className="animate-pulse text-center text-slate-300">相手の準備を待っています...</p>
          )}
        </>
      )}

      <button
        onClick={() => { pvp.leave(); navigate('/') }}
        className="text-sm text-slate-500 underline hover:text-white"
      >
        退出する
      </button>
    </div>
  )
}

function PvpGame() {
  const navigate = useNavigate()
  const pvp = usePvpStore()

  if (pvp.status !== 'playing' || !pvp.game) return <PvpLobby />

  const myTurnOrChoice =
    pvp.game.winner === undefined &&
    (pvp.game.pending
      ? pvp.game.pending.forPlayer === pvp.mySeat
      : pvp.game.turnPlayer === pvp.mySeat)

  return (
    <Board
      game={pvp.game}
      mySeat={pvp.mySeat}
      act={pvp.act}
      busy={!myTurnOrChoice}
      busyLabel="相手の操作待ち..."
      onExit={() => { pvp.leave(); navigate('/') }}
    />
  )
}

// ============================================================
// エントリ
// ============================================================

export default function Game() {
  const [params] = useSearchParams()
  const mode = params.get('mode') ?? 'cpu'
  return mode === 'pvp' ? <PvpGame /> : <CpuGame />
}
