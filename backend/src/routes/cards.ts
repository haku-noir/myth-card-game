import { Router } from 'express'
import cards from '../data/cards.json' with { type: 'json' }

const router = Router()

router.get('/', (_req, res) => {
  res.json(cards)
})

router.get('/:id', (req, res) => {
  const card = cards.find((c) => c.id === req.params.id)
  if (!card) {
    res.status(404).json({ error: 'card not found' })
    return
  }
  res.json(card)
})

export default router
