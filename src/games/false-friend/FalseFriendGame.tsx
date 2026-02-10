import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  createVisualSpec,
  ruleForRound,
  spawnIntervalMsForRound,
  type FriendVisualSpec,
  type RuleDefinition
} from './engine/rules'
import {
  FALSE_FRIEND_EXPIRE_BONUS,
  roundClearBonus,
  scoreFriendClick,
  TTL_MS
} from './engine/scoring'
import './styles/false-friend.css'

type GamePhase = 'start' | 'countdown' | 'rule-card' | 'round' | 'dead'

type ActiveObject = {
  id: string
  roundNumber: number
  isFriend: boolean
  spawnAt: number
  expireAt: number
  x: number
  y: number
  size: number
  visual: FriendVisualSpec
}

type PointsPopup = {
  id: string
  x: number
  y: number
  points: number
}

type RunStats = {
  friendsClicked: number
  reactionTotalMs: number
  roundsCleared: number
}

const OBJECTS_PER_ROUND = 20
const FRIENDS_PER_ROUND = 4
const COUNTDOWN_START = 3
const RULE_CARD_MS = 2000

function createSeededRandom(seed: number): () => number {
  let value = seed >>> 0
  return () => {
    value = (value * 1664525 + 1013904223) >>> 0
    return value / 4294967296
  }
}

function shuffledIndexes(total: number, random: () => number): number[] {
  const indexes = Array.from({ length: total }, (_, i) => i)
  for (let i = indexes.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1))
    ;[indexes[i], indexes[j]] = [indexes[j], indexes[i]]
  }
  return indexes
}

function buildRoundPlan(roundNumber: number): { rule: RuleDefinition; plan: boolean[] } {
  const random = createSeededRandom(roundNumber * 941 + 77)
  const picks = shuffledIndexes(OBJECTS_PER_ROUND, random).slice(0, FRIENDS_PER_ROUND)
  const friendSet = new Set(picks)
  const plan = Array.from({ length: OBJECTS_PER_ROUND }, (_, idx) => friendSet.has(idx))
  return { rule: ruleForRound(roundNumber), plan }
}

function symbolStyle(object: ActiveObject): React.CSSProperties {
  return {
    left: `${object.x * 100}%`,
    top: `${object.y * 100}%`,
    width: `${object.size}px`,
    height: `${object.size}px`,
    '--ff-hue': `${object.visual.hue}`,
    '--ff-notch': `${object.visual.notchOffsetDeg}deg`
  } as React.CSSProperties
}

function round2(value: number): number {
  return Math.round(value * 100) / 100
}

export default function FalseFriendGame() {
  const [phase, setPhase] = useState<GamePhase>('start')
  const [countdown, setCountdown] = useState(COUNTDOWN_START)
  const [roundNumber, setRoundNumber] = useState(1)
  const [score, setScore] = useState(0)
  const [activeRule, setActiveRule] = useState<RuleDefinition>(() => ruleForRound(1))
  const [activeObjects, setActiveObjects] = useState<ActiveObject[]>([])
  const [popups, setPopups] = useState<PointsPopup[]>([])
  const [stats, setStats] = useState<RunStats>({ friendsClicked: 0, reactionTotalMs: 0, roundsCleared: 0 })

  const timersRef = useRef<number[]>([])
  const runIdRef = useRef(0)

  const clearTimers = useCallback(() => {
    timersRef.current.forEach((id) => window.clearTimeout(id))
    timersRef.current = []
  }, [])

  const schedule = useCallback((fn: () => void, delayMs: number) => {
    const id = window.setTimeout(fn, delayMs)
    timersRef.current.push(id)
  }, [])

  const addPopup = useCallback((x: number, y: number, points: number) => {
    const id = `${Date.now()}-${Math.random()}`
    setPopups((prev) => [...prev, { id, x, y, points }])
    schedule(() => {
      setPopups((prev) => prev.filter((item) => item.id !== id))
    }, 900)
  }, [schedule])

  const startRound = useCallback((nextRound: number) => {
    const runToken = runIdRef.current
    const { rule, plan } = buildRoundPlan(nextRound)
    setRoundNumber(nextRound)
    setActiveRule(rule)
    setPhase('rule-card')
    setActiveObjects([])

    schedule(() => {
      if (runIdRef.current !== runToken) {
        return
      }
      setPhase('round')
      const intervalMs = spawnIntervalMsForRound(nextRound)

      for (let index = 0; index < plan.length; index += 1) {
        schedule(() => {
          if (runIdRef.current !== runToken) {
            return
          }
          const random = createSeededRandom(nextRound * 5003 + index * 97 + 13)
          const isFriend = plan[index]
          const objectId = `${nextRound}-${index}`
          const object: ActiveObject = {
            id: objectId,
            roundNumber: nextRound,
            isFriend,
            spawnAt: performance.now(),
            expireAt: performance.now() + TTL_MS,
            x: 0.12 + random() * 0.76,
            y: 0.2 + random() * 0.66,
            size: 52 + random() * 26,
            visual: createVisualSpec(rule, isFriend, nextRound, random)
          }

          setActiveObjects((prev) => [...prev, object])

          schedule(() => {
            setActiveObjects((prev) => {
              const exists = prev.some((item) => item.id === objectId)
              if (!exists) {
                return prev
              }

              if (!isFriend) {
                setScore((currentScore) => currentScore + FALSE_FRIEND_EXPIRE_BONUS)
                addPopup(object.x, object.y, FALSE_FRIEND_EXPIRE_BONUS)
              }

              return prev.filter((item) => item.id !== objectId)
            })
          }, TTL_MS)
        }, intervalMs * index)
      }

      const roundDuration = intervalMs * plan.length + TTL_MS
      schedule(() => {
        if (runIdRef.current !== runToken) {
          return
        }
        const bonus = roundClearBonus(nextRound)
        setScore((currentScore) => currentScore + bonus)
        setStats((current) => ({ ...current, roundsCleared: current.roundsCleared + 1 }))
        addPopup(0.5, 0.15, bonus)
        startRound(nextRound + 1)
      }, roundDuration)
    }, RULE_CARD_MS)
  }, [addPopup, schedule])

  const startRun = useCallback(() => {
    clearTimers()
    runIdRef.current += 1
    setScore(0)
    setStats({ friendsClicked: 0, reactionTotalMs: 0, roundsCleared: 0 })
    setActiveObjects([])
    setPopups([])
    setCountdown(COUNTDOWN_START)
    setRoundNumber(1)
    setPhase('countdown')

    const runToken = runIdRef.current
    for (let step = COUNTDOWN_START; step >= 1; step -= 1) {
      schedule(() => {
        if (runIdRef.current === runToken) {
          setCountdown(step)
        }
      }, (COUNTDOWN_START - step) * 1000)
    }

    schedule(() => {
      if (runIdRef.current === runToken) {
        startRound(1)
      }
    }, COUNTDOWN_START * 1000)
  }, [clearTimers, schedule, startRound])

  const killRun = useCallback(() => {
    clearTimers()
    runIdRef.current += 1
    setActiveObjects([])
    setPhase('dead')
  }, [clearTimers])

  const handleObjectPress = useCallback((objectId: string) => {
    if (phase !== 'round') {
      return
    }

    const now = performance.now()
    let target: ActiveObject | undefined

    setActiveObjects((prev) => {
      target = prev.find((item) => item.id === objectId)
      if (!target) {
        return prev
      }
      return prev.filter((item) => item.id !== objectId)
    })

    if (!target) {
      return
    }

    if (!target.isFriend) {
      killRun()
      return
    }

    const reactionMs = now - target.spawnAt
    const points = scoreFriendClick(reactionMs)
    setScore((currentScore) => currentScore + points)
    setStats((current) => ({
      ...current,
      friendsClicked: current.friendsClicked + 1,
      reactionTotalMs: current.reactionTotalMs + reactionMs
    }))
    addPopup(target.x, target.y, points)
  }, [addPopup, killRun, phase])

  useEffect(() => () => clearTimers(), [clearTimers])

  const avgReaction = useMemo(() => {
    if (stats.friendsClicked === 0) {
      return 0
    }
    return round2(stats.reactionTotalMs / stats.friendsClicked)
  }, [stats.friendsClicked, stats.reactionTotalMs])

  return (
    <div className="ff-root">
      {phase === 'start' && (
        <div className="ff-center-card">
          <h1 className="ff-title">False Friend</h1>
          <p className="ff-subtitle">Click only objects that match the current rule. One false click ends the run.</p>
          <button className="ff-start" type="button" onClick={startRun}>Start</button>
        </div>
      )}

      {phase === 'countdown' && (
        <div className="ff-countdown" aria-live="polite">{countdown}</div>
      )}

      {(phase === 'rule-card' || phase === 'round') && (
        <>
          <header className="ff-hud">
            <span>Round {roundNumber}</span>
            <span>Score {score}</span>
          </header>

          {phase === 'rule-card' && (
            <div className="ff-rule-card">
              <p className="ff-rule-round">Round {roundNumber}</p>
              <h2>{activeRule.title}</h2>
              <p>{activeRule.description}</p>
              <p className="ff-rule-example">{activeRule.example}</p>
            </div>
          )}

          <main className="ff-arena" role="application" aria-label="False Friend playfield">
            {activeObjects.map((object) => (
              <button
                key={object.id}
                type="button"
                className="ff-object"
                style={symbolStyle(object)}
                onPointerDown={() => handleObjectPress(object.id)}
                aria-label="game object"
              >
                <span className="ff-notch" />
                <span className="ff-ring" />
                <span className="ff-dots" data-count={object.visual.dotCount}>
                  {Array.from({ length: object.visual.dotCount }).map((_, dotIndex) => (
                    <span key={`${object.id}-dot-${dotIndex}`} className="ff-dot" />
                  ))}
                </span>
              </button>
            ))}

            {popups.map((popup) => (
              <div
                key={popup.id}
                className="ff-popup"
                style={{ left: `${popup.x * 100}%`, top: `${popup.y * 100}%` }}
              >
                +{popup.points}
              </div>
            ))}
          </main>
        </>
      )}

      {phase === 'dead' && (
        <div className="ff-center-card ff-death-card">
          <h2>Run Over</h2>
          <p className="ff-death-score">Total Score: {score}</p>
          <div className="ff-stats-grid">
            <div>
              <strong>Rounds cleared</strong>
              <span>{stats.roundsCleared}</span>
            </div>
            <div>
              <strong>Friends clicked</strong>
              <span>{stats.friendsClicked}</span>
            </div>
            <div>
              <strong>Avg reaction</strong>
              <span>{avgReaction} ms</span>
            </div>
          </div>
          <aside className="ff-leaderboard-stub">
            <h3>Leaderboard coming next</h3>
            <p>Online score saving will be added in a follow-up step.</p>
          </aside>
          <button className="ff-start" type="button" onClick={startRun}>Play Again</button>
        </div>
      )}
    </div>
  )
}
