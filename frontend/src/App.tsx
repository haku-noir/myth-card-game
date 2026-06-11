import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Home from './pages/Home'
import CardList from './pages/CardList'
import MyDecks from './pages/MyDecks'
import PackOpening from './pages/PackOpening'
import DeckBuilder from './pages/DeckBuilder'
import Game from './pages/Game'
import Draft from './pages/Draft'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/cards" element={<CardList />} />
        <Route path="/my-decks" element={<MyDecks />} />
        <Route path="/pack-opening" element={<PackOpening />} />
        <Route path="/deck-builder" element={<DeckBuilder />} />
        <Route path="/draft" element={<Draft />} />
        <Route path="/draft/sealed" element={<Draft />} />
        <Route path="/draft/booster" element={<Draft />} />
        <Route path="/game" element={<Game />} />
      </Routes>
    </BrowserRouter>
  )
}
