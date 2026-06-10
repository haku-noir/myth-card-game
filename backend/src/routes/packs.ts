import { Router } from 'express'
import { openPacks } from '../services/packService.js'

const router = Router()

const MAX_PACKS = 12

router.post('/open', (req, res) => {
  const raw = req.body?.count ?? 4
  const count = Number(raw)
  if (!Number.isInteger(count) || count < 1 || count > MAX_PACKS) {
    res.status(400).json({ error: `countは1〜${MAX_PACKS}の整数で指定してください` })
    return
  }
  res.json(openPacks(count))
})

export default router
