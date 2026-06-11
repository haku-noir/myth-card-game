/**
 * ブースタードラフト疎通テスト: 2クライアントでドラフト全体
 * (ルーム作成→参加→4ラウンド×10ピック→40枚→デッキ提出→ゲーム開始)を検証。
 * 実行: npx tsx scripts/draft-smoke.ts (backendが:4000で起動していること)
 */
import { io, type Socket } from 'socket.io-client'
import type { Card } from '../src/types/card'

const URL = 'http://localhost:4000'

const fail = (msg: string): never => {
  console.error('NG:', msg)
  process.exit(1)
}

function connect(): Promise<Socket> {
  return new Promise((resolve, reject) => {
    const s = io(URL, { path: '/socket.io', timeout: 3000 })
    s.on('connect', () => resolve(s))
    s.on('connect_error', reject)
  })
}

interface ClientState {
  socket: Socket
  name: string
  packCount: number[] // 受け取ったパックの枚数履歴
  picks: string[]
  completed: boolean
  rounds: Set<number>
}

function setupDraftClient(socket: Socket, name: string): ClientState {
  const state: ClientState = { socket, name, packCount: [], picks: [], completed: false, rounds: new Set() }
  socket.on('draft:pack', ({ round, cards }: { round: number; cards: Card[] }) => {
    state.packCount.push(cards.length)
    state.rounds.add(round)
    // 常に先頭をピックする
    setTimeout(() => socket.emit('draft:pick', { cardIndex: 0 }), 10)
  })
  socket.on('draft:complete', ({ cardIds }: { cardIds: string[] }) => {
    state.picks = cardIds
    state.completed = true
  })
  return state
}

async function main() {
  const host = await connect()
  const guest = await connect()

  const created = await new Promise<{ ok: boolean; roomId?: string; mode?: string }>((r) =>
    host.emit('pvp:create_room', { playerName: 'A', mode: 'booster' }, r),
  )
  if (!created.ok || created.mode !== 'booster') fail('boosterルーム作成失敗')
  console.log('OK: boosterルーム作成', created.roomId)

  const hostState = setupDraftClient(host, 'A')
  const guestState = setupDraftClient(guest, 'B')

  const joined = await new Promise<{ ok: boolean }>((r) =>
    guest.emit('pvp:join_room', { roomId: created.roomId, playerName: 'B' }, r),
  )
  if (!joined.ok) fail('参加失敗')
  console.log('OK: 参加→ドラフト自動開始')

  // ドラフト完了を待つ(4ラウンド×10ピック×2人、最大15秒)
  const deadline = Date.now() + 15000
  while (!(hostState.completed && guestState.completed)) {
    if (Date.now() > deadline) {
      fail(`タイムアウト: host=${hostState.picks.length}/${hostState.completed}, guest=${guestState.picks.length}/${guestState.completed}`)
    }
    await new Promise((r) => setTimeout(r, 200))
  }

  if (hostState.picks.length !== 40) fail(`hostのピック数が40でない: ${hostState.picks.length}`)
  if (guestState.picks.length !== 40) fail(`guestのピック数が40でない: ${guestState.picks.length}`)
  if (hostState.rounds.size !== 4) fail(`ラウンド数が4でない: ${[...hostState.rounds]}`)
  console.log('OK: 4ラウンド完了、両者40枚ずつ獲得')

  // パック枚数が10,9,8...と減っていたか(各ラウンドの先頭は10枚)
  const tens = hostState.packCount.filter((n) => n === 10).length
  if (tens !== 4) fail(`各ラウンド先頭のパックが10枚でない (10枚の回数=${tens})`)
  console.log('OK: パック枚数の推移正常')

  // デッキ提出→ゲーム開始(start_as_hostがホストに届くか)
  const startPromise = new Promise<{ decks: string[][] }>((resolve) =>
    host.on('pvp:start_as_host', resolve),
  )
  host.emit('pvp:deck_ready', { cardIds: hostState.picks.slice(0, 20) }, () => {})
  guest.emit('pvp:deck_ready', { cardIds: guestState.picks.slice(0, 20) }, () => {})
  const start = await Promise.race([
    startPromise,
    new Promise<never>((_, rej) => setTimeout(() => rej(new Error('start_as_hostが届かない')), 5000)),
  ])
  if (start.decks[0].length !== 20 || start.decks[1].length !== 20) fail('デッキが20枚でない')
  console.log('OK: 両者デッキ提出→ゲーム開始イベント受信')

  host.disconnect()
  guest.disconnect()
  console.log('\nブースタードラフト疎通テスト全件成功')
  process.exit(0)
}

main().catch((e) => fail(String(e)))
