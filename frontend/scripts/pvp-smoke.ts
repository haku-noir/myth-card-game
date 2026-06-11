/**
 * PvP疎通テスト: socket.ioクライアント2台でホスト/ゲストをシミュレートし、
 * ルーム作成→参加→デッキ提出→ゲーム開始→数ターンの同期を検証する。
 * 実行: npx tsx scripts/pvp-smoke.ts (backendが:4000で起動していること)
 */
import { io, type Socket } from 'socket.io-client'
import { CARDS, cardById } from '../src/data/cards'
import { applyAction } from '../src/engine/applyAction'
import { createGame } from '../src/engine/gameEngine'
import type { Card } from '../src/types/card'
import type { GameAction } from '../src/types/actions'
import type { GameState, PlayerIdx } from '../src/types/game'

const URL = 'http://localhost:4000'
const deckIds = CARDS.filter((c) => c.type === 'monster').slice(0, 20).map((c) => c.id)

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

async function main() {
  const host = await connect()
  const guest = await connect()
  console.log('OK: 2クライアント接続')

  // ルーム作成
  const created = await new Promise<{ ok: boolean; roomId?: string }>((r) =>
    host.emit('pvp:create_room', { playerName: 'ホスト' }, r),
  )
  if (!created.ok || !created.roomId) fail('ルーム作成失敗')
  console.log('OK: ルーム作成', created.roomId)

  // 存在しないルームへの参加は拒否されるか
  const badJoin = await new Promise<{ ok: boolean; error?: string }>((r) =>
    guest.emit('pvp:join_room', { roomId: 'XXXX', playerName: 'ゲスト' }, r),
  )
  if (badJoin.ok) fail('存在しないルームに参加できてしまった')
  console.log('OK: 不正ルーム拒否:', badJoin.error)

  // 正しい参加
  const joined = await new Promise<{ ok: boolean; seat?: number }>((r) =>
    guest.emit('pvp:join_room', { roomId: created.roomId, playerName: 'ゲスト' }, r),
  )
  if (!joined.ok || joined.seat !== 1) fail('ルーム参加失敗')
  console.log('OK: ルーム参加 seat=' + joined.seat)

  // ホスト側のゲーム状態管理
  let hostGame: GameState | null = null
  let guestGame: GameState | null = null

  const startPromise = new Promise<void>((resolve) => {
    host.on('pvp:start_as_host', ({ firstPlayer, names, decks }) => {
      const toCards = (ids: string[]): Card[] =>
        ids.map((id) => cardById(id)).filter((c): c is Card => !!c)
      hostGame = createGame(
        [toCards(decks[0]), toCards(decks[1])],
        [names[0], names[1]],
        firstPlayer as PlayerIdx,
      )
      host.emit('pvp:state', { state: hostGame })
      resolve()
    })
  })

  // ホストはゲストのアクションを適用して再配信
  host.on('pvp:action', ({ seat, action }: { seat: number; action: GameAction }) => {
    if (!hostGame) return
    const next = applyAction(hostGame, seat as PlayerIdx, action)
    if (next !== hostGame) {
      hostGame = next
      host.emit('pvp:state', { state: next })
    }
  })

  guest.on('pvp:state', ({ state }: { state: GameState }) => {
    guestGame = state
  })

  // デッキ提出
  await new Promise((r) => host.emit('pvp:deck_ready', { cardIds: deckIds }, r))
  await new Promise((r) => guest.emit('pvp:deck_ready', { cardIds: deckIds }, r))
  await startPromise
  await new Promise((r) => setTimeout(r, 300))

  if (!hostGame) fail('ホストでゲームが開始されない')
  if (!guestGame) fail('ゲストに状態が配信されない')
  console.log('OK: ゲーム開始・状態同期')

  // 5ターン分エンドターンを交互に実行して同期検証
  for (let i = 0; i < 5; i++) {
    const g: GameState = hostGame!
    if (g.winner !== undefined) break
    if (g.turnPlayer === 0) {
      // ホストのターン: ローカル適用→配信
      hostGame = applyAction(g, 0, { kind: 'endTurn' })
      host.emit('pvp:state', { state: hostGame })
    } else {
      // ゲストのターン: アクション送信→ホスト適用を待つ
      guest.emit('pvp:action', { action: { kind: 'endTurn' } })
    }
    await new Promise((r) => setTimeout(r, 250))
  }

  const hg = hostGame as GameState | null
  const gg = guestGame as GameState | null
  if (!hg || !gg) fail('状態が失われた')
  if (hg!.turnCount !== gg!.turnCount) {
    fail(`同期ずれ: host=turn${hg!.turnCount}, guest=turn${gg!.turnCount}`)
  }
  console.log(`OK: 5ターン同期 (両者turn=${hg!.turnCount})`)

  // 不正アクション: ゲストがホストのターンに操作しても無視されるか
  const before = hg!.turnCount
  if (hg!.turnPlayer === 0) {
    guest.emit('pvp:action', { action: { kind: 'endTurn' } })
    await new Promise((r) => setTimeout(r, 250))
    if ((hostGame as GameState).turnCount !== before) fail('相手ターンの不正操作が通ってしまった')
    console.log('OK: 相手ターンの不正操作は無視される')
  }

  // 退出通知
  const leftPromise = new Promise<void>((resolve) => guest.on('pvp:opponent_left', () => resolve()))
  host.emit('pvp:leave')
  await leftPromise
  console.log('OK: 退出通知')

  host.disconnect()
  guest.disconnect()
  console.log('\nPvP疎通テスト全件成功')
  process.exit(0)
}

main().catch((e) => fail(String(e)))
