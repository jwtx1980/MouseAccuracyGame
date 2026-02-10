import { useState } from 'react'
import ClickCadenceGame from './games/click-cadence/ClickCadenceGame'
import FalseFriendGame from './games/false-friend/FalseFriendGame'
import './GameHub.css'

type GameId = 'click-cadence' | 'false-friend'

const GAME_OPTIONS: { id: GameId; name: string; description: string }[] = [
  {
    id: 'click-cadence',
    name: 'Click Cadence',
    description: 'Hit targets quickly, keep accuracy high, and climb the leaderboard.',
  },
  {
    id: 'false-friend',
    name: 'False Friend',
    description: 'Spot the matching friend shape before one mistake ends your run.',
  },
]

const getSelectedGameFromQuery = (): GameId | null => {
  if (typeof window === 'undefined') return null
  const params = new URLSearchParams(window.location.search)
  const value = params.get('game')
  return value === 'click-cadence' || value === 'false-friend' ? value : null
}

function App() {
  const [selectedGame, setSelectedGame] = useState<GameId | null>(() => getSelectedGameFromQuery())

  const handleSelectGame = (gameId: GameId) => {
    setSelectedGame(gameId)
    if (typeof window !== 'undefined') {
      const nextUrl = new URL(window.location.href)
      nextUrl.searchParams.set('game', gameId)
      window.history.replaceState(null, '', nextUrl)
    }
  }

  const handleBackToLanding = () => {
    setSelectedGame(null)
    if (typeof window !== 'undefined') {
      const nextUrl = new URL(window.location.href)
      nextUrl.searchParams.delete('game')
      window.history.replaceState(null, '', nextUrl)
    }
  }

  if (!selectedGame) {
    return (
      <main className="game-hub">
        <section className="game-hub__panel">
          <p className="game-hub__eyebrow">Mouse Accuracy Lab</p>
          <h1>Choose your game</h1>
          <p className="game-hub__subtitle">Pick a mode to start practicing your speed and precision.</p>
          <div className="game-hub__grid">
            {GAME_OPTIONS.map((game) => (
              <button key={game.id} type="button" className="game-hub__card" onClick={() => handleSelectGame(game.id)}>
                <span>{game.name}</span>
                <small>{game.description}</small>
              </button>
            ))}
          </div>
        </section>
      </main>
    )
  }

  return (
    <>
      <button type="button" className="hub-back-button" onClick={handleBackToLanding}>
        ← Back to game select
      </button>
      {selectedGame === 'false-friend' ? <FalseFriendGame /> : <ClickCadenceGame />}
    </>
  )
}

export default App
