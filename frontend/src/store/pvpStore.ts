import { create } from 'zustand'
import { io, type Socket } from 'socket.io-client'
import { cardById } from '../data/cards'
import { applyAction } from '../engine/applyAction'
import { createGame } from '../engine/gameEngine'
import type { Card } from '../types/card'
import type { GameAction } from '../types/actions'
import type { GameState, PlayerIdx } from '../types/game'

export type RoomMode = 'pvp' | 'sealed' | 'booster'

type PvpStatus =
  | 'idle'
  | 'waiting' // 相手の参加待ち
  | 'deckSelect' // デッキ準備(PvP=保存デッキ選択 / sealed=開封構築)
  | 'drafting' // ブースタードラフト中
  | 'building' // ドラフト後の構築
  | 'playing'
  | 'opponentLeft'

interface Ack {
  ok: boolean
  error?: string
  roomId?: string
  seat?: number
  mode?: RoomMode
}

interface DraftView {
  round: number
  totalRounds: number
  pack: Card[]
  pickedCount: number
  waiting: boolean
}

interface PvpStore {
  socket: Socket | null
  status: PvpStatus
  mode: RoomMode
  roomId: string
  mySeat: PlayerIdx
  names: string[]
  readyStates: boolean[]
  myDeckReady: boolean
  game: GameState | null
  draft: DraftView | null
  draftedCardIds: string[]
  error: string

  createRoom: (playerName: string, mode: RoomMode) => void
  joinRoom: (roomId: string, playerName: string) => void
  pickCard: (cardIndex: number) => void
  submitDeck: (cardIds: string[]) => void
  act: (action: GameAction) => void
  leave: () => void
}

export const usePvpStore = create<PvpStore>((set, get) => {
  function ensureSocket(): Socket {
    const existing = get().socket
    if (existing) return existing
    const socket = io({ path: '/socket.io' })

    socket.on('pvp:players', ({ names }: { names: string[] }) => {
      const { mode, status } = get()
      // ドラフトはdraft:packイベント側で遷移するため、ここではPvP/シールドのみ
      if (status === 'playing' || status === 'drafting' || status === 'building') {
        set({ names })
        return
      }
      const full = names.length >= 2
      set({ names, status: full ? (mode === 'booster' ? 'drafting' : 'deckSelect') : 'waiting' })
    })

    socket.on('pvp:ready_status', ({ ready }: { ready: boolean[] }) => {
      set({ readyStates: ready })
    })

    socket.on(
      'draft:pack',
      ({ round, totalRounds, cards, pickedCount }: { round: number; totalRounds: number; cards: Card[]; pickedCount: number }) => {
        set({
          status: 'drafting',
          draft: { round, totalRounds, pack: cards, pickedCount, waiting: false },
        })
      },
    )

    socket.on('draft:wait', ({ pickedCount }: { pickedCount: number }) => {
      const d = get().draft
      if (d) set({ draft: { ...d, pickedCount, waiting: true } })
    })

    socket.on('draft:complete', ({ cardIds }: { cardIds: string[] }) => {
      set({ status: 'building', draftedCardIds: cardIds, draft: null })
    })

    // ホストのみ受信: 全員準備完了→ゲーム生成して配信
    socket.on(
      'pvp:start_as_host',
      ({ firstPlayer, names, decks }: { firstPlayer: number; names: string[]; decks: string[][] }) => {
        const toCards = (ids: string[]): Card[] =>
          ids.map((id) => cardById(id)).filter((c): c is Card => !!c)
        const game = createGame(
          [toCards(decks[0]), toCards(decks[1])],
          [names[0], names[1]],
          firstPlayer as PlayerIdx,
        )
        set({ game, status: 'playing' })
        socket.emit('pvp:state', { state: game })
      },
    )

    // ゲスト→ホスト: アクション中継を受けてエンジン適用
    socket.on('pvp:action', ({ seat, action }: { seat: number; action: GameAction }) => {
      const { game, mySeat } = get()
      if (!game || mySeat !== 0) return
      const next = applyAction(game, seat as PlayerIdx, action)
      if (next !== game) {
        set({ game: next })
        socket.emit('pvp:state', { state: next })
      }
    })

    // ホスト→ゲスト: 状態受信
    socket.on('pvp:state', ({ state }: { state: GameState }) => {
      if (get().mySeat !== 0) set({ game: state, status: 'playing' })
    })

    socket.on('pvp:opponent_left', () => {
      set({ status: 'opponentLeft' })
    })

    set({ socket })
    return socket
  }

  return {
    socket: null,
    status: 'idle',
    mode: 'pvp',
    roomId: '',
    mySeat: 0,
    names: [],
    readyStates: [],
    myDeckReady: false,
    game: null,
    draft: null,
    draftedCardIds: [],
    error: '',

    createRoom: (playerName, mode) => {
      const socket = ensureSocket()
      socket.emit('pvp:create_room', { playerName, mode }, (ack: Ack) => {
        if (ack.ok && ack.roomId !== undefined) {
          set({
            roomId: ack.roomId,
            mySeat: 0,
            mode: ack.mode ?? mode,
            status: 'waiting',
            names: [playerName],
            error: '',
          })
        } else {
          set({ error: ack.error ?? 'ルーム作成に失敗しました' })
        }
      })
    },

    joinRoom: (roomId, playerName) => {
      const socket = ensureSocket()
      socket.emit('pvp:join_room', { roomId, playerName }, (ack: Ack) => {
        if (ack.ok && ack.roomId !== undefined) {
          set({
            roomId: ack.roomId,
            mySeat: (ack.seat ?? 1) as PlayerIdx,
            mode: ack.mode ?? 'pvp',
            error: '',
          })
        } else {
          set({ error: ack.error ?? '参加に失敗しました' })
        }
      })
    },

    pickCard: (cardIndex) => {
      get().socket?.emit('draft:pick', { cardIndex })
    },

    submitDeck: (cardIds) => {
      const socket = get().socket
      if (!socket) return
      socket.emit('pvp:deck_ready', { cardIds }, (ack: Ack) => {
        if (ack.ok) set({ myDeckReady: true, error: '' })
        else set({ error: ack.error ?? 'デッキ送信に失敗しました' })
      })
    },

    act: (action) => {
      const { socket, game, mySeat } = get()
      if (!socket || !game) return
      if (mySeat === 0) {
        // ホスト: ローカルで適用して配信
        const next = applyAction(game, 0, action)
        if (next !== game) {
          set({ game: next })
          socket.emit('pvp:state', { state: next })
        }
      } else {
        // ゲスト: ホストへ送信(状態はホストから返ってくる)
        socket.emit('pvp:action', { action })
      }
    },

    leave: () => {
      const socket = get().socket
      socket?.emit('pvp:leave')
      socket?.disconnect()
      set({
        socket: null,
        status: 'idle',
        mode: 'pvp',
        roomId: '',
        mySeat: 0,
        names: [],
        readyStates: [],
        myDeckReady: false,
        game: null,
        draft: null,
        draftedCardIds: [],
        error: '',
      })
    },
  }
})
