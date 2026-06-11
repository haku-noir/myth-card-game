import cards from '../data/cards.json' with { type: 'json' }

type Card = (typeof cards)[number]

const N_MONSTERS = cards.filter((c) => c.rarity === 'N' && c.type === 'monster')
// 「答え」確定枠(v1.4): 払い清め/金縛り/死者の声/神便鬼毒酒/砂かけ婆
const ANSWER_IDS = ['N21', 'N24', 'N22', 'N27', 'N28']
const ANSWERS = cards.filter((c) => ANSWER_IDS.includes(c.id))
// 神の御業(答え枠から1/16で出現): 天罰/アイギスの盾
const MIRACLE_IDS = ['UR4', 'UR5']
const MIRACLES = cards.filter((c) => MIRACLE_IDS.includes(c.id))
// 自由枠はN魔法・罠全8種からランダム
const N_SPELLS_TRAPS = cards.filter((c) => c.rarity === 'N' && c.type !== 'monster')
const R_CARDS = cards.filter((c) => c.rarity === 'R')
const SR_CARDS = cards.filter((c) => c.rarity === 'SR')
// SR/UR枠のURは神モンスター3種のみ(御業は答え枠からのみ出る)
const UR_GODS = cards.filter((c) => c.rarity === 'UR' && c.type === 'monster')

const UR_RATE = 0.25 // SR/UR枠がUR(神)に置換される確率(1/4)
const MIRACLE_RATE = 1 / 16 // 答え枠が神の御業に置換される確率

const pick = <T,>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)]

/** ルールブックv1.4準拠の1パック(10枚)を生成する */
export function openPack(): Card[] {
  return [
    // スロット1〜5: Nモンスター
    ...Array.from({ length: 5 }, () => pick(N_MONSTERS)),
    // スロット6: N魔法・罠(自由枠)
    pick(N_SPELLS_TRAPS),
    // スロット7: 「答え」確定枠(1/16で神の御業に置換)
    Math.random() < MIRACLE_RATE ? pick(MIRACLES) : pick(ANSWERS),
    // スロット8〜9: R
    pick(R_CARDS),
    pick(R_CARDS),
    // スロット10: SR(1/4で神)
    Math.random() < UR_RATE ? pick(UR_GODS) : pick(SR_CARDS),
  ]
}

export function openPacks(count: number) {
  return Array.from({ length: count }, (_, packIndex) => ({
    packIndex,
    cards: openPack(),
  }))
}
