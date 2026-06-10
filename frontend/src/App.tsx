import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Home from './pages/Home'

function Placeholder({ title }: { title: string }) {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <p className="text-2xl text-slate-400">{title}(実装予定)</p>
    </div>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/cards" element={<Placeholder title="カード一覧" />} />
        <Route path="/my-decks" element={<Placeholder title="マイデッキ" />} />
        <Route path="/pack-opening" element={<Placeholder title="パック開封" />} />
        <Route path="/deck-builder" element={<Placeholder title="デッキ構築" />} />
        <Route path="/draft/sealed" element={<Placeholder title="シールド戦" />} />
        <Route path="/draft/booster" element={<Placeholder title="ブースタードラフト" />} />
        <Route path="/game" element={<Placeholder title="ゲーム" />} />
        <Route path="/result" element={<Placeholder title="結果" />} />
      </Routes>
    </BrowserRouter>
  )
}
