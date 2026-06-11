import type { Server, Socket } from 'socket.io'

/**
 * PvPルーム管理(中継方式)。
 * - ホスト(ルーム作成者・seat0)のクライアントがゲームエンジンを実行する
 * - ゲストの操作は action としてホストへ中継し、ホストが state を全員に配信する
 * - 将来の4〜8人対応を見据えて seats は配列で管理する(現状は2人で開始)
 */

interface Seat {
  socketId: string
  name: string
  deckCardIds?: string[]
}

interface Room {
  id: string
  seats: Seat[]
  capacity: number
  started: boolean
}

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

export function registerPvpHandlers(io: Server, socket: Socket) {
  socket.on('pvp:create_room', ({ playerName }: { playerName: string }, ack) => {
    const id = generateRoomId()
    const room: Room = {
      id,
      seats: [{ socketId: socket.id, name: String(playerName || 'プレイヤー1').slice(0, 20) }],
      capacity: 2,
      started: false,
    }
    rooms.set(id, room)
    socket.join(`pvp:${id}`)
    ack?.({ ok: true, roomId: id, seat: 0 })
  })

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
    ack?.({ ok: true, roomId: room.id, seat })
    io.to(`pvp:${room.id}`).emit('pvp:players', { names: room.seats.map((s) => s.name) })
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
