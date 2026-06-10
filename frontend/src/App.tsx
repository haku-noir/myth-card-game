import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Home from './pages/Home'
import CardList from './pages/CardList'
import MyDecks from './pages/MyDecks'
import PackOpening from './pages/PackOpening'
import DeckBuilder from './pages/DeckBuilder'

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
        <Route path="/cards" element={<CardList />} />
        <Route path="/my-decks" element={<MyDecks />} />
        <Route path="/pack-opening" element={<PackOpening />} />
        <Route path="/deck-builder" element={<DeckBuilder />} />
        <Route path="/draft/sealed" element={<Placeholder title="シールド戦" />} />
        <Route path="/draft/booster" element={<Placeholder title="ブースタードラフト" />} />
        <Route path="/game" element={<Placeholder title="ゲーム" />} />
        <Route path="/result" element={<Placeholder title="結果" />} />
      </Routes>
    </BrowserRouter>
  )
}
