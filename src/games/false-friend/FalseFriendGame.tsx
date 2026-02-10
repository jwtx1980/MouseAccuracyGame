import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { getSupabaseClient } from '../../lib/supabase'
import {
  FALSE_EXPIRE_BONUS,
  FRIENDS_PER_ROUND,
  OBJECT_VISIBLE_MS,
  ROUND_OBJECT_COUNT,
  roundClearBonus,
  scoreFriendClick,
} from './engine/scoring'
import { getRuleForRound, spawnDelayForRound, type RuleDefinition, type TokenVisual } from './engine/rules'
import './styles/false-friend.css'

type Phase = 'start' | 'countdown' | 'rule-card' | 'playing' | 'dead'

type SpawnedObject = {
  id: string
  isFriend: boolean
  visual: TokenVisual
  x: number
  y: number
  spawnedAt: number
  expiresAt: number
  scored: boolean
}

type PopScore = {
  id: string
  x: number
  y: number
  amount: number
}

type LeaderboardRow = {
  run_id: string
  user_id: string
  name: string
  total_score: number
  rounds_cleared: number
  created_at: string
}

type RunStats = {
  friendsClicked: number
  reactionTimes: number[]
  falseExpired: number
}

const USER_ID_STORAGE_KEY = 'false-friend-user-id-v1'

const getStableUserId = () => {
  if (typeof window === 'undefined') return 'server-user'
  const existingId = window.localStorage.getItem(USER_ID_STORAGE_KEY)
  if (existingId) return existingId
  const newId = crypto.randomUUID()
  window.localStorage.setItem(USER_ID_STORAGE_KEY, newId)
  return newId
}

const shuffle = <T,>(items: T[]) => {
  const clone = [...items]
  for (let i = clone.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[clone[i], clone[j]] = [clone[j], clone[i]]
  }
  return clone
}

function pickFriendIndices() {
  const slots = Array.from({ length: ROUND_OBJECT_COUNT }, (_, i) => i)
  return new Set(shuffle(slots).slice(0, FRIENDS_PER_ROUND))
}

function FalseFriendGame() {
  const [phase, setPhase] = useState<Phase>('start')
  const [roundNumber, setRoundNumber] = useState(1)
  const [score, setScore] = useState(0)
  const [objects, setObjects] = useState<SpawnedObject[]>([])
  const [countdown, setCountdown] = useState(3)
  const [roundRule, setRoundRule] = useState<RuleDefinition>(() => getRuleForRound(1))
  const [roundSpawnCount, setRoundSpawnCount] = useState(0)
  const [runStats, setRunStats] = useState<RunStats>({ friendsClicked: 0, reactionTimes: [], falseExpired: 0 })
  const [scorePops, setScorePops] = useState<PopScore[]>([])

  const [leaderboard, setLeaderboard] = useState<LeaderboardRow[]>([])
  const [leaderboardLoading, setLeaderboardLoading] = useState(false)
  const [leaderboardError, setLeaderboardError] = useState<string | null>(null)
  const [isQualified, setIsQualified] = useState(false)
  const [pendingName, setPendingName] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const spawnTimerRef = useRef<number | null>(null)
  const expiryTimerRef = useRef<number | null>(null)
  const roundTransitionRef = useRef<number | null>(null)
  const friendSlotsRef = useRef<Set<number>>(new Set())

  const supabase = useMemo(() => getSupabaseClient(), [])
  const userId = useMemo(() => getStableUserId(), [])

  const roundsCleared = Math.max(0, roundNumber - 1)
  const avgReaction =
    runStats.reactionTimes.length > 0
      ? Math.round(runStats.reactionTimes.reduce((sum, value) => sum + value, 0) / runStats.reactionTimes.length)
      : 0

  useEffect(() => {
    return () => {
      if (spawnTimerRef.current) window.clearTimeout(spawnTimerRef.current)
      if (expiryTimerRef.current) window.clearInterval(expiryTimerRef.current)
      if (roundTransitionRef.current) window.clearTimeout(roundTransitionRef.current)
    }
  }, [])

  useEffect(() => {
    if (phase !== 'countdown') return
    if (countdown === 0) {
      setPhase('rule-card')
      return
    }
    const timer = window.setTimeout(() => setCountdown((value) => value - 1), 900)
    return () => window.clearTimeout(timer)
  }, [countdown, phase])

  useEffect(() => {
    if (phase !== 'rule-card') return
    const timer = window.setTimeout(() => {
      startRound(roundNumber)
    }, 2000)
    return () => window.clearTimeout(timer)
  }, [phase, roundNumber])

  useEffect(() => {
    if (phase !== 'playing') return
    expiryTimerRef.current = window.setInterval(() => {
      const now = Date.now()
      const expiredNow: SpawnedObject[] = []
      setObjects((current) => {
        const remaining = current.filter((item) => {
          const expired = !item.scored && now >= item.expiresAt
          if (expired) expiredNow.push(item)
          return !expired
        })
        return remaining
      })

      if (expiredNow.length > 0) {
        const falseExpired = expiredNow.filter((item) => !item.isFriend).length
        if (falseExpired > 0) {
          setRunStats((prev) => ({ ...prev, falseExpired: prev.falseExpired + falseExpired }))
          setScore((prev) => prev + falseExpired * FALSE_EXPIRE_BONUS)
        }
      }
    }, 100)

    return () => {
      if (expiryTimerRef.current) window.clearInterval(expiryTimerRef.current)
      expiryTimerRef.current = null
    }
  }, [phase])

  useEffect(() => {
    if (phase !== 'playing') return
    if (roundSpawnCount < ROUND_OBJECT_COUNT) return
    if (objects.length > 0) return

    const bonus = roundClearBonus(roundNumber)
    setScore((prev) => prev + bonus)
    roundTransitionRef.current = window.setTimeout(() => {
      setRoundNumber((prev) => prev + 1)
      setPhase('rule-card')
    }, 800)
  }, [objects.length, phase, roundNumber, roundSpawnCount])

  useEffect(() => {
    setRoundRule(getRuleForRound(roundNumber))
  }, [roundNumber])

  useEffect(() => {
    if (phase === 'dead') {
      void loadLeaderboard()
    }
  }, [phase])

  useEffect(() => {
    if (phase !== 'dead') return
    if (leaderboard.length < 10) {
      setIsQualified(true)
      return
    }
    setIsQualified(leaderboard.some((entry) => score > entry.total_score))
  }, [leaderboard, phase, score])

  const loadLeaderboard = async () => {
    if (!supabase) {
      setLeaderboardError('Leaderboard unavailable. Add Supabase env vars.')
      return
    }

    try {
      setLeaderboardLoading(true)
      setLeaderboardError(null)
      const { data, error } = await supabase
        .from('false_friend_scores')
        .select('run_id,user_id,name,total_score,rounds_cleared,created_at')
        .order('total_score', { ascending: false })
        .order('created_at', { ascending: true })
        .limit(10)

      if (error) throw error
      setLeaderboard(data ?? [])
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to load leaderboard.'
      setLeaderboardError(message)
    } finally {
      setLeaderboardLoading(false)
    }
  }

  const resetRun = () => {
    if (spawnTimerRef.current) window.clearTimeout(spawnTimerRef.current)
    if (roundTransitionRef.current) window.clearTimeout(roundTransitionRef.current)

    setRoundNumber(1)
    setScore(0)
    setObjects([])
    setRunStats({ friendsClicked: 0, reactionTimes: [], falseExpired: 0 })
    setRoundSpawnCount(0)
    setScorePops([])
    setCountdown(3)
    setRoundRule(getRuleForRound(1))
    setLeaderboard([])
    setLeaderboardError(null)
    setPendingName('')
    setIsQualified(false)
    setPhase('countdown')
  }

  const endRun = () => {
    if (spawnTimerRef.current) window.clearTimeout(spawnTimerRef.current)
    if (roundTransitionRef.current) window.clearTimeout(roundTransitionRef.current)
    setObjects([])
    setPhase('dead')
  }

  const spawnNext = (rule: RuleDefinition, spawnIndex: number) => {
    const isFriend = friendSlotsRef.current.has(spawnIndex)
    const margin = 8
    const x = margin + Math.random() * (100 - margin * 2)
    const y = margin + Math.random() * (100 - margin * 2)
    const now = Date.now()

    const object: SpawnedObject = {
      id: `${roundNumber}-${spawnIndex}-${crypto.randomUUID()}`,
      isFriend,
      visual: isFriend ? rule.createFriend(roundNumber, spawnIndex + 1) : rule.createFalseFriend(roundNumber, spawnIndex + 1),
      x,
      y,
      spawnedAt: now,
      expiresAt: now + OBJECT_VISIBLE_MS,
      scored: false,
    }

    setObjects((prev) => [...prev, object])
    setRoundSpawnCount(spawnIndex + 1)

    if (spawnIndex + 1 < ROUND_OBJECT_COUNT) {
      spawnTimerRef.current = window.setTimeout(() => {
        spawnNext(rule, spawnIndex + 1)
      }, spawnDelayForRound(roundNumber))
    }
  }

  const startRound = (targetRoundNumber: number) => {
    if (spawnTimerRef.current) window.clearTimeout(spawnTimerRef.current)
    setObjects([])
    setRoundSpawnCount(0)

    const rule = getRuleForRound(targetRoundNumber)
    setRoundRule(rule)
    friendSlotsRef.current = pickFriendIndices()

    setPhase('playing')
    spawnNext(rule, 0)
  }

  const onObjectPress = (id: string) => {
    if (phase !== 'playing') return

    setObjects((current) => {
      const clicked = current.find((item) => item.id === id)
      if (!clicked || clicked.scored) return current

      const reaction = Date.now() - clicked.spawnedAt
      if (!clicked.isFriend) {
        endRun()
        return current
      }

      const points = scoreFriendClick(reaction)
      setScore((prev) => prev + points)
      setRunStats((prev) => ({
        ...prev,
        friendsClicked: prev.friendsClicked + 1,
        reactionTimes: [...prev.reactionTimes, reaction],
      }))
      setScorePops((prev) => [
        ...prev,
        {
          id: `${id}-pop`,
          x: clicked.x,
          y: clicked.y,
          amount: points,
        },
      ])

      window.setTimeout(() => {
        setScorePops((prev) => prev.filter((pop) => pop.id !== `${id}-pop`))
      }, 500)

      return current.filter((item) => item.id !== id)
    })
  }

  const submitScore = async (event: FormEvent) => {
    event.preventDefault()
    if (!supabase || !pendingName.trim()) return

    try {
      setIsSubmitting(true)
      const { error } = await supabase.from('false_friend_scores').insert({
        run_id: crypto.randomUUID(),
        user_id: userId,
        name: pendingName.trim().slice(0, 20),
        total_score: score,
        rounds_cleared: roundsCleared,
      })

      if (error) throw error
      setPendingName('')
      setIsQualified(false)
      await loadLeaderboard()
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to submit score.'
      setLeaderboardError(message)
    } finally {
      setIsSubmitting(false)
    }
  }

  const examplePair = roundRule.createExample(roundNumber)

  return (
    <div className="ff-root">
      <div className="ff-hud">
        <span>Round {roundNumber}</span>
        <span>Score {score.toLocaleString()}</span>
      </div>

      {phase === 'start' && (
        <div className="ff-overlay ff-overlay--solid">
          <h1>False Friend</h1>
          <p>Tap only the friend object that matches the current round rule.</p>
          <button type="button" className="ff-cta" onClick={resetRun}>
            Start
          </button>
        </div>
      )}

      {phase === 'countdown' && (
        <div className="ff-overlay">
          <div className="ff-count">{countdown === 0 ? 'GO' : countdown}</div>
        </div>
      )}

      {phase === 'rule-card' && (
        <div className="ff-overlay ff-overlay--card">
          <p className="ff-round-label">Round {roundNumber}</p>
          <h2>{roundRule.sentence}</h2>
          <div className="ff-example-row">
            <div>
              <span>Friend</span>
              <Token token={examplePair.friend} />
            </div>
            <div>
              <span>False friend</span>
              <Token token={examplePair.falseFriend} />
            </div>
          </div>
        </div>
      )}

      {phase === 'dead' && (
        <div className="ff-overlay ff-overlay--solid ff-overlay--results">
          <h2>You clicked a false friend.</h2>
          <p>Total score: {score.toLocaleString()}</p>
          <p>Rounds cleared: {roundsCleared}</p>
          <p>Friends clicked: {runStats.friendsClicked}</p>
          <p>Average reaction: {avgReaction}ms</p>
          <button type="button" className="ff-cta" onClick={resetRun}>
            Play again
          </button>

          {isQualified && supabase && (
            <form className="ff-name-form" onSubmit={submitScore}>
              <label htmlFor="name">Leaderboard name</label>
              <div>
                <input
                  id="name"
                  maxLength={20}
                  value={pendingName}
                  onChange={(event) => setPendingName(event.target.value)}
                  placeholder="You"
                />
                <button type="submit" disabled={isSubmitting || !pendingName.trim()}>
                  {isSubmitting ? 'Saving...' : 'Submit'}
                </button>
              </div>
            </form>
          )}

          <section className="ff-leaderboard">
            <h3>Global leaderboard</h3>
            {leaderboardLoading && <p>Loading...</p>}
            {leaderboardError && <p className="ff-error">{leaderboardError}</p>}
            {!leaderboardLoading && leaderboard.length === 0 && !leaderboardError && <p>No runs yet.</p>}
            <ol>
              {leaderboard.map((entry) => (
                <li key={entry.run_id}>
                  <span>{entry.name}</span>
                  <span>{entry.total_score.toLocaleString()}</span>
                </li>
              ))}
            </ol>
          </section>
        </div>
      )}

      <div className="ff-playfield" role="application" aria-label="False Friend playfield">
        {objects.map((item) => (
          <button
            key={item.id}
            type="button"
            className="ff-object"
            style={{ left: `${item.x}%`, top: `${item.y}%` }}
            onPointerDown={() => onObjectPress(item.id)}
          >
            <Token token={item.visual} />
          </button>
        ))}

        {scorePops.map((pop) => (
          <span key={pop.id} className="ff-pop" style={{ left: `${pop.x}%`, top: `${pop.y}%` }}>
            +{pop.amount}
          </span>
        ))}
      </div>
    </div>
  )
}

function Token({ token }: { token: TokenVisual }) {
  const color = `hsl(${token.hue} ${token.saturation}% ${token.lightness}%)`

  if (token.type === 'shape') {
    return (
      <span
        className={`ff-token ff-token--${token.shape}`}
        style={{
          backgroundColor: color,
          borderColor: `hsl(${token.hue} ${token.saturation}% ${token.lightness - 14}%)`,
          color,
        }}
      />
    )
  }

  if (token.type === 'notch') {
    return (
      <span className="ff-token ff-token--notch" style={{ backgroundColor: color }}>
        {token.hasNotch && <span className="ff-notch-cut" style={{ left: `${50 + token.notchOffset}%` }} />}
      </span>
    )
  }

  return (
    <span className="ff-token ff-token--dots" style={{ backgroundColor: color }}>
      {Array.from({ length: token.dotCount }).map((_, index) => (
        <span
          key={`${token.dotCount}-${index}`}
          className="ff-dot"
          style={{ transform: `translateX(${(index - (token.dotCount - 1) / 2) * token.spacing}px)` }}
        />
      ))}
    </span>
  )
}

export default FalseFriendGame
