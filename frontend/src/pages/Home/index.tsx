import { Link } from 'react-router-dom'

const menuItems = [
  { to: '/game?mode=cpu', label: 'CPU戦を始める', desc: 'コンピュータと対戦' },
  { to: '/game?mode=pvp', label: 'PvP対戦', desc: 'ルームコードで友達と対戦' },
  { to: '/draft', label: 'ドラフト', desc: 'シールド戦・ブースタードラフト' },
  { to: '/my-decks', label: 'マイデッキ', desc: '保存したデッキの管理' },
  { to: '/cards', label: 'カード一覧', desc: '全48種のカードを確認' },
]

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-8 p-8">
      <h1 className="text-4xl font-bold tracking-wide">星の階</h1>
      <p className="text-slate-400">ほしのきざはし ― パック開封型カードゲーム</p>
      <nav className="flex w-full max-w-md flex-col gap-3">
        {menuItems.map((item) => (
          <Link
            key={item.to}
            to={item.to}
            className="rounded-lg bg-slate-800 px-6 py-4 transition hover:bg-slate-700"
          >
            <span className="block text-lg font-semibold">{item.label}</span>
            <span className="text-sm text-slate-400">{item.desc}</span>
          </Link>
        ))}
      </nav>
    </div>
  )
}
