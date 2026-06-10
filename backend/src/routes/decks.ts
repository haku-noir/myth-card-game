import { Router } from 'express'
import { PrismaClient } from '@prisma/client'
import cards from '../data/cards.json' with { type: 'json' }

const prisma = new PrismaClient()
const router = Router()

const DECK_SIZE = 20
const MAX_DECKS = 10
const validIds = new Set(cards.map((c) => c.id))

function validateDeck(name: unknown, cardIds: unknown): string | null {
  if (typeof name !== 'string' || name.trim() === '') return 'デッキ名を指定してください'
  if (!Array.isArray(cardIds) || cardIds.length !== DECK_SIZE)
    return `デッキはちょうど${DECK_SIZE}枚である必要があります`
  if (!cardIds.every((id) => typeof id === 'string' && validIds.has(id)))
    return '不正なカードIDが含まれています'
  return null
}

function toResponse(deck: { id: number; name: string; cardIds: string; createdAt: Date; updatedAt: Date }) {
  return { ...deck, cardIds: JSON.parse(deck.cardIds) as string[] }
}

// 一覧
router.get('/', async (_req, res) => {
  const decks = await prisma.savedDeck.findMany({ orderBy: { updatedAt: 'desc' } })
  res.json(decks.map(toResponse))
})

// 新規保存
router.post('/', async (req, res) => {
  const { name, cardIds } = req.body
  const error = validateDeck(name, cardIds)
  if (error) {
    res.status(400).json({ error })
    return
  }
  const count = await prisma.savedDeck.count()
  if (count >= MAX_DECKS) {
    res.status(400).json({ error: `保存できるデッキは${MAX_DECKS}個までです` })
    return
  }
  const deck = await prisma.savedDeck.create({
    data: { name: (name as string).trim(), cardIds: JSON.stringify(cardIds) },
  })
  res.status(201).json(toResponse(deck))
})

// 更新
router.put('/:id', async (req, res) => {
  const id = Number(req.params.id)
  const { name, cardIds } = req.body
  const error = validateDeck(name, cardIds)
  if (error) {
    res.status(400).json({ error })
    return
  }
  const existing = await prisma.savedDeck.findUnique({ where: { id } })
  if (!existing) {
    res.status(404).json({ error: 'デッキが見つかりません' })
    return
  }
  const deck = await prisma.savedDeck.update({
    where: { id },
    data: { name: (name as string).trim(), cardIds: JSON.stringify(cardIds) },
  })
  res.json(toResponse(deck))
})

// 削除
router.delete('/:id', async (req, res) => {
  const id = Number(req.params.id)
  const existing = await prisma.savedDeck.findUnique({ where: { id } })
  if (!existing) {
    res.status(404).json({ error: 'デッキが見つかりません' })
    return
  }
  await prisma.savedDeck.delete({ where: { id } })
  res.status(204).end()
})

export default router
