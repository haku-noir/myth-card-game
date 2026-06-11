/**
 * v1.4移行: 保存済みデッキのカードIDをレアリティ移動後の新IDへ置換する。
 * 実行: npx tsx scripts/migrate-deck-ids.ts (backendディレクトリで)
 */
import { PrismaClient } from '@prisma/client'

const ID_MAP: Record<string, string> = {
  N19: 'SR9', // 鬼退治 N→SR
  R11: 'SR10', // 落とし穴 R→SR
  N25: 'R14', // 神隠し N→R
  SR6: 'UR4', // 天罰 SR→UR
  SR8: 'UR5', // アイギスの盾 SR→UR
}

const prisma = new PrismaClient()

function remap(jsonIds: string): { result: string; changed: number } {
  const ids = JSON.parse(jsonIds) as string[]
  let changed = 0
  const result = ids.map((id) => {
    if (ID_MAP[id]) {
      changed++
      return ID_MAP[id]
    }
    return id
  })
  return { result: JSON.stringify(result), changed }
}

async function main() {
  const decks = await prisma.savedDeck.findMany()
  let totalChanged = 0
  for (const deck of decks) {
    const cardRes = remap(deck.cardIds)
    const poolRes = deck.poolCardIds ? remap(deck.poolCardIds) : null
    const changed = cardRes.changed + (poolRes?.changed ?? 0)
    if (changed > 0) {
      await prisma.savedDeck.update({
        where: { id: deck.id },
        data: {
          cardIds: cardRes.result,
          ...(poolRes && { poolCardIds: poolRes.result }),
        },
      })
      console.log(`デッキ「${deck.name}」(id=${deck.id}): ${changed}件のIDを移行`)
      totalChanged += changed
    }
  }
  console.log(`完了: ${decks.length}デッキ中、計${totalChanged}件のIDを移行しました`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
