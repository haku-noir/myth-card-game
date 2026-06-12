import type { Card } from '../types/card'

// カードマスタデータ(docs/カードリスト_v1.6.md 準拠・全53種)
export const CARDS: Card[] = [
  // ノーマル(N) モンスター 19種
  { id: 'N01', name: '一寸法師', type: 'monster', rarity: 'N', stars: 1, atk: 500, def: 300, effectText: '' },
  { id: 'N02', name: 'コロポックル', type: 'monster', rarity: 'N', stars: 1, atk: 400, def: 400, effectText: '' },
  { id: 'N03', name: '鬼火', type: 'monster', rarity: 'N', stars: 1, atk: 600, def: 100, effectText: '戦闘強化として攻撃側が捨てる場合、+100ではなく+1000として扱う。' },
  { id: 'N04', name: '豆狸', type: 'monster', rarity: 'N', stars: 1, atk: 200, def: 600, effectText: 'ブースト召喚のリリースとして、手札からリリースできる。', handReleasable: true },
  { id: 'N05', name: '座敷童子', type: 'monster', rarity: 'N', stars: 1, atk: 300, def: 200, effectText: '召喚時、カードを1枚ドローする。' },
  { id: 'N06', name: '河童', type: 'monster', rarity: 'N', stars: 2, atk: 700, def: 700, effectText: '' },
  { id: 'N07', name: '金太郎', type: 'monster', rarity: 'N', stars: 2, atk: 900, def: 500, effectText: '' },
  { id: 'N08', name: '人魚姫', type: 'monster', rarity: 'N', stars: 2, atk: 700, def: 800, effectText: 'ブースト召喚のリリースとして、手札からリリースできる。', handReleasable: true },
  { id: 'N09', name: 'ろくろ首', type: 'monster', rarity: 'N', stars: 2, atk: 500, def: 900, effectText: '' },
  { id: 'N10', name: 'ぬりかべ', type: 'monster', rarity: 'N', stars: 2, atk: 100, def: 1200, effectText: '戦闘強化として守備表示の自分モンスターのために捨てる場合、+800として扱う。' },
  { id: 'N11', name: '雪女', type: 'monster', rarity: 'N', stars: 2, atk: 500, def: 700, effectText: '召喚時、相手モンスター1体を守備表示にできる。' },
  { id: 'N26', name: '化け狸', type: 'monster', rarity: 'N', stars: 2, atk: 500, def: 500, effectText: 'リリースする場合、星1〜3の好きな値として扱える。', releaseStarRange: { min: 1, max: 3 } },
  { id: 'N12', name: '桃太郎', type: 'monster', rarity: 'N', stars: 3, atk: 1300, def: 800, effectText: '' },
  { id: 'N13', name: '天狗', type: 'monster', rarity: 'N', stars: 3, atk: 1200, def: 900, effectText: '' },
  { id: 'N14', name: '一つ目小僧', type: 'monster', rarity: 'N', stars: 3, atk: 1100, def: 1000, effectText: '' },
  { id: 'N15', name: 'ケンタウロス', type: 'monster', rarity: 'N', stars: 3, atk: 1200, def: 1100, effectText: '' },
  { id: 'N16', name: '一反木綿', type: 'monster', rarity: 'N', stars: 3, atk: 1100, def: 600, effectText: 'ブースト召喚のリリースとして、手札からリリースできる。', handReleasable: true },
  { id: 'N17', name: '卑弥呼', type: 'monster', rarity: 'N', stars: 3, atk: 800, def: 800, effectText: '召喚時、相手の伏せカード1枚を確認できる。' },
  { id: 'N18', name: '浦島太郎', type: 'monster', rarity: 'N', stars: 3, atk: 800, def: 800, effectText: '召喚時、自分の墓地のカード1枚を手札に戻せる。' },
  // ノーマル(N) 魔法・罠 8種
  { id: 'N20', name: '草薙剣', type: 'magic', rarity: 'N', effectText: '自分のモンスター1体の攻撃力と守備力を、次の相手ターンの終了時まで+500する。' },
  { id: 'N21', name: '払い清め', type: 'magic', rarity: 'N', effectText: '相手の伏せカード1枚を破壊する。' },
  { id: 'N22', name: '死者の声', type: 'magic', rarity: 'N', effectText: '自分の場にモンスターがいない場合のみ発動可能。自分の墓地からモンスター1体を守備表示で場に出す。' },
  { id: 'N23', name: '軍配', type: 'magic', rarity: 'N', effectText: '自分の場の全モンスターの攻撃力をターン終了時まで+500する。' },
  { id: 'N27', name: '神便鬼毒酒', type: 'magic', rarity: 'N', effectText: '相手モンスター1体の攻撃力と守備力を、次の相手ターンの終了時まで-700する。' },
  { id: 'N29', name: 'お焚き上げ', type: 'magic', rarity: 'N', effectText: 'このターン、自分の戦闘強化で加算される値は2倍になる。' },
  { id: 'N24', name: '金縛り', type: 'trap', rarity: 'N', effectText: '相手の攻撃宣言時に発動。その攻撃を無効にする。' },
  { id: 'N28', name: '砂かけ婆', type: 'trap', rarity: 'N', effectText: '相手の攻撃宣言時に発動。攻撃モンスターの攻撃力をターン終了時まで-600する。' },
  // レア(R) モンスター 9種
  { id: 'R01', name: 'ミノタウロス', type: 'monster', rarity: 'R', stars: 4, atk: 1700, def: 1200, effectText: '' },
  { id: 'R02', name: '源義経', type: 'monster', rarity: 'R', stars: 4, atk: 1700, def: 900, effectText: '' },
  { id: 'R03', name: 'グリフォン', type: 'monster', rarity: 'R', stars: 4, atk: 1600, def: 1400, effectText: '' },
  { id: 'R04', name: '安倍晴明', type: 'monster', rarity: 'R', stars: 4, atk: 1300, def: 1000, effectText: '召喚時、自分のデッキから魔法・罠カード1枚を手札に加えられる。' },
  { id: 'R13', name: '鵺', type: 'monster', rarity: 'R', stars: 4, atk: 1200, def: 1000, effectText: 'リリースする場合、星1〜5の好きな値として扱える。', releaseStarRange: { min: 1, max: 5 } },
  { id: 'R05', name: '宮本武蔵', type: 'monster', rarity: 'R', stars: 5, atk: 1900, def: 1300, effectText: '' },
  { id: 'R06', name: '武蔵坊弁慶', type: 'monster', rarity: 'R', stars: 5, atk: 1500, def: 1900, effectText: '' },
  { id: 'R07', name: '九尾の狐', type: 'monster', rarity: 'R', stars: 5, atk: 1500, def: 1200, effectText: '召喚時、相手モンスター1体を守備表示にできる。' },
  { id: 'R08', name: 'メデューサ', type: 'monster', rarity: 'R', stars: 5, atk: 1300, def: 1400, effectText: 'このカードと戦闘を行ったモンスターは、ターン終了時に破壊される。' },
  // レア(R) 魔法・罠 4種
  { id: 'R09', name: '強制送還', type: 'magic', rarity: 'R', effectText: '相手モンスター1体を持ち主の手札に戻す。' },
  { id: 'R10', name: '人魚の肉', type: 'magic', rarity: 'R', effectText: '自分のライフを2500回復する。' },
  { id: 'R14', name: '神隠し', type: 'trap', rarity: 'R', effectText: '相手の攻撃宣言時に発動。攻撃モンスター1体を持ち主の手札に戻す。' },
  { id: 'R12', name: '背水の陣', type: 'trap', rarity: 'R', effectText: '自分の場が空の時、相手の攻撃宣言時に発動。手札から自分のレベル以下のモンスター1体を守備表示で場に出し、攻撃はそのモンスターに向かう。' },
  // スーパーレア(SR) モンスター 5種
  { id: 'SR1', name: 'サイクロプス', type: 'monster', rarity: 'SR', stars: 6, atk: 2300, def: 1300, effectText: '' },
  { id: 'SR2', name: 'ケルベロス', type: 'monster', rarity: 'SR', stars: 6, atk: 2100, def: 1700, effectText: '' },
  { id: 'SR3', name: '織田信長', type: 'monster', rarity: 'SR', stars: 6, atk: 2000, def: 1500, effectText: '召喚時、相手の伏せカード1枚を破壊できる。' },
  { id: 'SR4', name: 'アマテラス', type: 'monster', rarity: 'SR', stars: 7, atk: 2500, def: 2100, effectText: '' },
  { id: 'SR5', name: 'ヴァルキリー', type: 'monster', rarity: 'SR', stars: 7, atk: 2200, def: 1800, effectText: '召喚時、自分の墓地の★3以下のモンスター1体を場に出せる。' },
  // スーパーレア(SR) 魔法・罠 3種
  { id: 'SR9', name: '鬼退治', type: 'magic', rarity: 'SR', effectText: '相手モンスター1体を破壊する。' },
  { id: 'SR7', name: '黄泉返り', type: 'magic', rarity: 'SR', effectText: '自分の墓地からモンスター1体をレベルを無視して場に出す。' },
  { id: 'SR10', name: '落とし穴', type: 'trap', rarity: 'SR', effectText: '相手がモンスターを召喚した時に発動。そのモンスターを破壊する。' },
  // ウルトラレア(UR) 神 3種
  { id: 'UR1', name: 'ゼウス', type: 'monster', rarity: 'UR', stars: 8, atk: 3000, def: 2500, effectText: '' },
  { id: 'UR2', name: 'オーディン', type: 'monster', rarity: 'UR', stars: 8, atk: 2900, def: 2700, effectText: '' },
  { id: 'UR3', name: 'ヤマタノオロチ', type: 'monster', rarity: 'UR', stars: 8, atk: 2800, def: 2800, effectText: '' },
  // ウルトラレア(UR) 神の御業 2種(答え確定枠から1/16で出現)
  { id: 'UR4', name: '天罰', type: 'magic', rarity: 'UR', effectText: 'お互いの場のモンスターを全て破壊する。' },
  { id: 'UR5', name: 'アイギスの盾', type: 'trap', rarity: 'UR', effectText: '自分の場にモンスターがいない場合のみ発動可能。相手の攻撃宣言時に発動。相手の場の攻撃表示モンスターを全て破壊する。' },
]

export const cardById = (id: string): Card | undefined => CARDS.find((c) => c.id === id)
