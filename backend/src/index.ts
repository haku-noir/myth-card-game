import express from 'express'
import cors from 'cors'
import { createServer } from 'node:http'
import { Server } from 'socket.io'
import cardsRouter from './routes/cards.js'
import decksRouter from './routes/decks.js'
import packsRouter from './routes/packs.js'

const app = express()
app.use(cors())
app.use(express.json())

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' })
})

app.use('/api/cards', cardsRouter)
app.use('/api/decks', decksRouter)
app.use('/api/packs', packsRouter)

const httpServer = createServer(app)

// PvP・ドラフト用のSocket.io(ハンドラは後続フェーズで実装)
export const io = new Server(httpServer, {
  cors: { origin: '*' },
})

const PORT = Number(process.env.PORT ?? 4000)
httpServer.listen(PORT, () => {
  console.log(`backend listening on :${PORT}`)
})
