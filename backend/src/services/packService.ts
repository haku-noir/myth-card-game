import cards from '../data/cards.json' with { type: 'json' }

type Card = (typeof cards)[number]

const N_MONSTERS = cards.filter((c) => c.rarity === 'N' && c.type === 'monster')
// 「答え」確定枠: 鬼退治/払い清め/死者の声/金縛り/神隠し(ルールブック2章)
const ANSWER_IDS = ['N19', 'N21', 'N22', 'N24', 'N25']
const ANSWERS = cards.filter((c) => ANSWER_IDS.includes(c.id))
// 自由枠はN魔法・罠全7種からランダム(答えカードが2枚入るパックもありうる)
const N_SPELLS_TRAPS = cards.filter((c) => c.rarity === 'N' && c.type !== 'monster')
const R_CARDS = cards.filter((c) => c.rarity === 'R')
const SR_CARDS = cards.filter((c) => c.rarity === 'SR')
const UR_CARDS = cards.filter((c) => c.rarity === 'UR')

const UR_RATE = 0.25 // SR/UR枠がURに置換される確率(ルールブック: 1/4)

const pick = <T,>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)]

/** ルールブック準拠の1パック(10枚)を生成する */
export function openPack(): Card[] {
  return [
    // スロット1〜5: Nモンスター
    ...Array.from({ length: 5 }, () => pick(N_MONSTERS)),
    // スロット6: N魔法・罠(自由枠)
    pick(N_SPELLS_TRAPS),
    // スロット7: 「答え」確定枠
    pick(ANSWERS),
    // スロット8〜9: R
    pick(R_CARDS),
    pick(R_CARDS),
    // スロット10: SR(1/4でUR)
    Math.random() < UR_RATE ? pick(UR_CARDS) : pick(SR_CARDS),
  ]
}

export function openPacks(count: number) {
  return Array.from({ length: count }, (_, packIndex) => ({
    packIndex,
    cards: openPack(),
  }))
}
