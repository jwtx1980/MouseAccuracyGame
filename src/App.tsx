import ClickCadenceGame from './games/click-cadence/ClickCadenceGame'
import FalseFriendGame from './games/false-friend/FalseFriendGame'

const getSelectedGame = () => {
  if (typeof window === 'undefined') return 'click-cadence'
  const params = new URLSearchParams(window.location.search)
  return params.get('game') === 'false-friend' ? 'false-friend' : 'click-cadence'
}

function App() {
  const selectedGame = getSelectedGame()

  if (selectedGame === 'false-friend') {
    return <FalseFriendGame />
  }

  return <ClickCadenceGame />
}

export default App
