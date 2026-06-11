import type { Server, Socket } from 'socket.io'
import { openPack } from '../services/packService.js'

/**
 * 対戦ルーム管理(中継方式)。PvP・シールド戦・ブースタードラフトで共通。
 * - ホスト(ルーム作成者・seat0)のクライアントがゲームエンジンを実行する
 * - ゲストの操作は action としてホストへ中継し、ホストが state を全員に配信する
 * - ブースタードラフトのピック&パスのみサーバーが権威的に管理する
 *   (パック内容を相手クライアントに知られないため)
 * - 将来の4〜8人対応を見据えて seats は配列で管理する(現状は2人で開始)
 */

type RoomMode = 'pvp' | 'sealed' | 'booster'

interface CardJson {
  id: string
  [key: string]: unknown
}

interface Seat {
  socketId: string
  name: string
  deckCardIds?: string[]
}

interface DraftState {
  round: number // 1〜4
  packs: CardJson[][] // 席ごとの手元パック
  picks: string[][] // 席ごとの獲得カードID
  pickedThisStep: boolean[]
}

interface Room {
  id: string
  mode: RoomMode
  seats: Seat[]
  capacity: number
  started: boolean
  draft?: DraftState
}

const DRAFT_ROUNDS = 4
const rooms = new Map<string, Room>()

// 紛らわしい文字(0/O, 1/I)を除いたコード用文字
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

function generateRoomId(): string {
  for (;;) {
    let id = ''
    for (let i = 0; i < 4; i++) id += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]
    if (!rooms.has(id)) return id
  }
}

function roomOf(socket: Socket): Room | undefined {
  for (const room of rooms.values()) {
    if (room.seats.some((s) => s.socketId === socket.id)) return room
  }
  return undefined
}

// ============================================================
// ブースタードラフト進行
// ============================================================

function startDraftRound(io: Server, room: Room, round: number) {
  const n = room.seats.length
  room.draft = {
    round,
    packs: Array.from({ length: n }, () => openPack() as CardJson[]),
    picks: room.draft?.picks ?? Array.from({ length: n }, () => []),
    pickedThisStep: Array(n).fill(false),
  }
  emitDraftPacks(io, room)
}

function emitDraftPacks(io: Server, room: Room) {
  const d = room.draft!
  room.seats.forEach((seat, i) => {
    io.to(seat.socketId).emit('draft:pack', {
      round: d.round,
      totalRounds: DRAFT_ROUNDS,
      cards: d.packs[i],
      pickedCount: d.picks[i].length,
    })
  })
}

function handleDraftPick(io: Server, room: Room, seatIdx: number, cardIndex: number) {
  const d = room.draft
  if (!d || d.pickedThisStep[seatIdx]) return
  const pack = d.packs[seatIdx]
  if (cardIndex < 0 || cardIndex >= pack.length) return

  const [card] = pack.splice(cardIndex, 1)
  d.picks[seatIdx].push(card.id)
  d.pickedThisStep[seatIdx] = true
  io.to(room.seats[seatIdx].socketId).emit('draft:wait', { pickedCount: d.picks[seatIdx].length })

  if (!d.pickedThisStep.every(Boolean)) return

  // 全員ピック完了
  if (d.packs[0].length === 0) {
    // パックが空: 次のラウンドへ、または完了
    if (d.round < DRAFT_ROUNDS) {
      startDraftRound(io, room, d.round + 1)
    } else {
      room.seats.forEach((seat, i) => {
        io.to(seat.socketId).emit('draft:complete', { cardIds: d.picks[i] })
      })
    }
    return
  }

  // パス: 奇数ラウンドは左へ、偶数ラウンドは右へ回す
  const n = room.seats.length
  const dir = d.round % 2 === 1 ? 1 : n - 1
  const newPacks: CardJson[][] = Array(n)
  for (let i = 0; i < n; i++) newPacks[(i + dir) % n] = d.packs[i]
  d.packs = newPacks
  d.pickedThisStep = Array(n).fill(false)
  emitDraftPacks(io, room)
}

// ============================================================
// イベント登録
// ============================================================

export function registerPvpHandlers(io: Server, socket: Socket) {
  socket.on(
    'pvp:create_room',
    ({ playerName, mode }: { playerName: string; mode?: RoomMode }, ack) => {
      const id = generateRoomId()
      const roomMode: RoomMode = mode === 'sealed' || mode === 'booster' ? mode : 'pvp'
      const room: Room = {
        id,
        mode: roomMode,
        seats: [{ socketId: socket.id, name: String(playerName || 'プレイヤー1').slice(0, 20) }],
        capacity: 2,
        started: false,
      }
      rooms.set(id, room)
      socket.join(`pvp:${id}`)
      ack?.({ ok: true, roomId: id, seat: 0, mode: roomMode })
    },
  )

  socket.on('pvp:join_room', ({ roomId, playerName }: { roomId: string; playerName: string }, ack) => {
    const room = rooms.get(String(roomId).toUpperCase())
    if (!room) {
      ack?.({ ok: false, error: 'ルームが見つかりません' })
      return
    }
    if (room.started || room.seats.length >= room.capacity) {
      ack?.({ ok: false, error: 'このルームには参加できません' })
      return
    }
    const seat = room.seats.length
    room.seats.push({ socketId: socket.id, name: String(playerName || `プレイヤー${seat + 1}`).slice(0, 20) })
    socket.join(`pvp:${room.id}`)
    ack?.({ ok: true, roomId: room.id, seat, mode: room.mode })
    io.to(`pvp:${room.id}`).emit('pvp:players', { names: room.seats.map((s) => s.name) })

    // ブースタードラフトは全員揃ったら即ドラフト開始
    if (room.mode === 'booster' && room.seats.length === room.capacity) {
      startDraftRound(io, room, 1)
    }
  })

  socket.on('draft:pick', ({ cardIndex }: { cardIndex: number }) => {
    const room = roomOf(socket)
    if (!room || room.mode !== 'booster' || !room.draft) return
    const seat = room.seats.findIndex((s) => s.socketId === socket.id)
    if (seat < 0) return
    handleDraftPick(io, room, seat, cardIndex)
  })

  socket.on('pvp:deck_ready', ({ cardIds }: { cardIds: string[] }, ack) => {
    const room = roomOf(socket)
    if (!room) {
      ack?.({ ok: false, error: 'ルームに参加していません' })
      return
    }
    const seat = room.seats.findIndex((s) => s.socketId === socket.id)
    room.seats[seat].deckCardIds = cardIds
    ack?.({ ok: true })
    io.to(`pvp:${room.id}`).emit('pvp:ready_status', {
      ready: room.seats.map((s) => !!s.deckCardIds),
    })

    // 全員のデッキが揃ったら開始。先攻はサーバーが抽選し、ホストがゲームを生成する
    if (room.seats.length === room.capacity && room.seats.every((s) => s.deckCardIds)) {
      room.started = true
      const firstPlayer = Math.floor(Math.random() * room.capacity)
      io.to(room.seats[0].socketId).emit('pvp:start_as_host', {
        firstPlayer,
        names: room.seats.map((s) => s.name),
        decks: room.seats.map((s) => s.deckCardIds),
      })
    }
  })

  // ゲスト→ホストへの操作中継
  socket.on('pvp:action', ({ action }: { action: unknown }) => {
    const room = roomOf(socket)
    if (!room || !room.started) return
    const seat = room.seats.findIndex((s) => s.socketId === socket.id)
    if (seat <= 0) return // ホスト自身の操作は中継不要
    io.to(room.seats[0].socketId).emit('pvp:action', { seat, action })
  })

  // ホスト→全員への状態配信
  socket.on('pvp:state', ({ state }: { state: unknown }) => {
    const room = roomOf(socket)
    if (!room) return
    const seat = room.seats.findIndex((s) => s.socketId === socket.id)
    if (seat !== 0) return // 状態配信はホストのみ
    socket.to(`pvp:${room.id}`).emit('pvp:state', { state })
  })

  socket.on('disconnect', () => {
    const room = roomOf(socket)
    if (!room) return
    socket.to(`pvp:${room.id}`).emit('pvp:opponent_left', {})
    rooms.delete(room.id)
  })

  socket.on('pvp:leave', () => {
    const room = roomOf(socket)
    if (!room) return
    socket.leave(`pvp:${room.id}`)
    socket.to(`pvp:${room.id}`).emit('pvp:opponent_left', {})
    rooms.delete(room.id)
  })
}
