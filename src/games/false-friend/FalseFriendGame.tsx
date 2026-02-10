import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import './FalseFriendGame.css'

type Phase = 'start' | 'countdown' | 'ruleCard' | 'playing' | 'dead'

type Orb = {
  id: string
  isFriend: boolean
  dotCount: number
  notchStep: number
  hue: number
  size: number
  x: number
  y: number
  spawnedAt: number
}

type Rule = {
  id: string
  title: string
  sentence: string
  example: string
  friendDotCount: number
  friendNotchStep: number
  friendHue: number
}

const OBJECTS_PER_ROUND = 20
const FRIENDS_PER_ROUND = 4
const ON_SCREEN_MS = 2000
const RULE_CARD_MS = 3000
const FALSE_EXPIRE_POINTS = 10

const RULES: Rule[] = [
  {
    id: 'north-notch',
    title: 'North Notch',
    sentence: 'Click only circles with the notch at the top.',
    example: 'Friend: notch at 12 o’clock. False friend: notch one step off.',
    friendDotCount: 1,
    friendNotchStep: 0,
    friendHue: 205,
  },
  {
    id: 'double-dot',
    title: 'Double Dot',
    sentence: 'Click only circles that show exactly two dots.',
    example: 'Friend: two dots. False friend: one or three dots.',
    friendDotCount: 2,
    friendNotchStep: 2,
    friendHue: 182,
  },
  {
    id: 'west-notch-dots',
    title: 'West Marker',
    sentence: 'Click circles with a left notch and three dots.',
    example: 'Friend: notch at 9 o’clock + three dots.',
    friendDotCount: 3,
    friendNotchStep: 6,
    friendHue: 36,
  },
]

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function getRule(roundNumber: number) {
  return RULES[(roundNumber - 1) % RULES.length]
}

function getSpawnGap(roundNumber: number) {
  return Math.max(280, 780 - (roundNumber - 1) * 45)
}

function getNearMissWeight(roundNumber: number) {
  return clamp(0.35 + (roundNumber - 1) * 0.08, 0.35, 0.92)
}

function makeFalsePreview(rule: Rule, roundNumber: number) {
  const mode = roundNumber % 3
  if (mode === 0) {
    return {
      dotCount: rule.friendDotCount,
      notchStep: (rule.friendNotchStep + 1) % 8,
      hue: rule.friendHue,
    }
  }

  if (mode === 1) {
    return {
      dotCount: clamp(rule.friendDotCount + 1, 0, 4),
      notchStep: rule.friendNotchStep,
      hue: rule.friendHue,
    }
  }

  return {
    dotCount: rule.friendDotCount,
    notchStep: rule.friendNotchStep,
    hue: rule.friendHue + 12,
  }
}

function makeOrb(roundNumber: number, rule: Rule, isFriend: boolean, index: number): Orb {
  const nearMissWeight = getNearMissWeight(roundNumber)
  const baseSize = clamp(86 - roundNumber * 1.5, 56, 90)
  const sizeWobble = (Math.random() - 0.5) * 8
  const size = baseSize + sizeWobble

  let dotCount = rule.friendDotCount
  let notchStep = rule.friendNotchStep
  let hue = rule.friendHue

  if (!isFriend) {
    const buildNearMiss = Math.random() < nearMissWeight

    if (buildNearMiss) {
      const mutation = Math.floor(Math.random() * 3)
      if (mutation === 0) {
        dotCount = clamp(rule.friendDotCount + (Math.random() < 0.5 ? -1 : 1), 0, 4)
      } else if (mutation === 1) {
        notchStep = (rule.friendNotchStep + (Math.random() < 0.5 ? -1 : 1) + 8) % 8
      } else {
        hue = rule.friendHue + (Math.random() < 0.5 ? -12 : 12)
      }
    } else {
      dotCount = clamp(Math.floor(Math.random() * 5), 0, 4)
      if (dotCount === rule.friendDotCount) {
        dotCount = (dotCount + 2) % 5
      }
      notchStep = Math.floor(Math.random() * 8)
      if (notchStep === rule.friendNotchStep) {
        notchStep = (notchStep + 3) % 8
      }
      hue = rule.friendHue + (Math.random() < 0.5 ? -26 : 26)
    }
  }

  return {
    id: `${roundNumber}-${index}-${Math.random().toString(36).slice(2, 7)}`,
    isFriend,
    dotCount,
    notchStep,
    hue,
    size,
    x: Math.random() * 86 + 3,
    y: Math.random() * 70 + 8,
    spawnedAt: 0,
  }
}

function buildRound(roundNumber: number) {
  const rule = getRule(roundNumber)
  const friendSlots = new Set<number>()

  while (friendSlots.size < FRIENDS_PER_ROUND) {
    friendSlots.add(Math.floor(Math.random() * OBJECTS_PER_ROUND))
  }

  const objects: Orb[] = []
  for (let i = 0; i < OBJECTS_PER_ROUND; i += 1) {
    objects.push(makeOrb(roundNumber, rule, friendSlots.has(i), i))
  }

  return { rule, objects }
}

function OrbitGlyph({ dotCount, notchStep, hue }: { dotCount: number; notchStep: number; hue: number }) {
  const notchAngle = notchStep * 45
  const notchRadians = (notchAngle * Math.PI) / 180
  const radius = 34
  const notchDistance = radius - 4

  return (
    <span className="orb orb--preview" style={{ background: `hsl(${hue} 86% 58%)` }}>
      <span
        className="orb__notch"
        style={{
          left: `calc(50% + ${Math.cos(notchRadians) * notchDistance}px)`,
          top: `calc(50% + ${Math.sin(notchRadians) * notchDistance}px)`,
          transform: 'translate(-50%, -50%)',
        }}
      />
      <span className="orb__dots">
        {Array.from({ length: dotCount }).map((_, dotIndex) => (
          <span key={`preview-dot-${dotIndex}`} className="orb__dot" />
        ))}
      </span>
    </span>
  )
}

function FalseFriendGame() {
  const [phase, setPhase] = useState<Phase>('start')
  const [countdown, setCountdown] = useState(3)
  const [roundNumber, setRoundNumber] = useState(1)
  const [score, setScore] = useState(0)
  const [activeObjects, setActiveObjects] = useState<Orb[]>([])
  const [currentRule, setCurrentRule] = useState<Rule>(getRule(1))
  const [friendsClicked, setFriendsClicked] = useState(0)
  const [reactionTotal, setReactionTotal] = useState(0)
  const [roundsCleared, setRoundsCleared] = useState(0)

  const deathScoreRef = useRef(0)
  const timersRef = useRef<number[]>([])
  const expiryTimersRef = useRef(new Map<string, number>())

  const clearAllTimers = useCallback(() => {
    timersRef.current.forEach((timerId) => window.clearTimeout(timerId))
    timersRef.current = []
    expiryTimersRef.current.forEach((timerId) => window.clearTimeout(timerId))
    expiryTimersRef.current.clear()
  }, [])

  useEffect(() => {
    return () => clearAllTimers()
  }, [clearAllTimers])

  const showRuleThenStart = useCallback(
    (nextRound: number) => {
      setRoundNumber(nextRound)
      setCurrentRule(getRule(nextRound))
      setPhase('ruleCard')

      const startTimer = window.setTimeout(() => {
        setActiveObjects([])
        const { rule, objects } = buildRound(nextRound)
        setCurrentRule(rule)
        setPhase('playing')

        const spawnGap = getSpawnGap(nextRound)

        objects.forEach((object, index) => {
          const timer = window.setTimeout(() => {
            const spawnedAt = performance.now()
            const spawnedObject = { ...object, spawnedAt }
            setActiveObjects((current) => [...current, spawnedObject])

            const expiryTimer = window.setTimeout(() => {
              setActiveObjects((current) => current.filter((item) => item.id !== spawnedObject.id))
              if (!spawnedObject.isFriend) {
                setScore((prev) => prev + FALSE_EXPIRE_POINTS)
              }
              expiryTimersRef.current.delete(spawnedObject.id)
            }, ON_SCREEN_MS)

            expiryTimersRef.current.set(spawnedObject.id, expiryTimer)
          }, index * spawnGap)

          timersRef.current.push(timer)
        })

        const endTimer = window.setTimeout(
          () => {
            setScore((prev) => prev + Math.floor(500 * nextRound ** 1.2))
            setRoundsCleared(nextRound)
            showRuleThenStart(nextRound + 1)
          },
          (OBJECTS_PER_ROUND - 1) * spawnGap + ON_SCREEN_MS + 30,
        )

        timersRef.current.push(endTimer)
      }, RULE_CARD_MS)

      timersRef.current.push(startTimer)
    },
    [],
  )

  const triggerDeath = useCallback(() => {
    clearAllTimers()
    setActiveObjects([])
    setPhase('dead')
    deathScoreRef.current = score
  }, [clearAllTimers, score])

  const handleObjectClick = (orb: Orb) => {
    if (phase !== 'playing') {
      return
    }

    const expiryTimer = expiryTimersRef.current.get(orb.id)
    if (expiryTimer) {
      window.clearTimeout(expiryTimer)
      expiryTimersRef.current.delete(orb.id)
    }

    setActiveObjects((current) => current.filter((item) => item.id !== orb.id))

    if (!orb.isFriend) {
      triggerDeath()
      return
    }

    const reactionMs = Math.max(0, Math.floor(performance.now() - orb.spawnedAt))
    const clickPoints = Math.max(0, ON_SCREEN_MS - reactionMs)
    setScore((prev) => prev + clickPoints)
    setFriendsClicked((prev) => prev + 1)
    setReactionTotal((prev) => prev + reactionMs)
  }

  const beginRun = () => {
    clearAllTimers()
    setScore(0)
    setRoundNumber(1)
    setRoundsCleared(0)
    setFriendsClicked(0)
    setReactionTotal(0)
    setCurrentRule(getRule(1))
    deathScoreRef.current = 0
    setCountdown(3)
    setPhase('countdown')

    for (let second = 3; second >= 1; second -= 1) {
      const timer = window.setTimeout(() => {
        setCountdown(second)
      }, (3 - second) * 1000)
      timersRef.current.push(timer)
    }

    const startTimer = window.setTimeout(() => {
      showRuleThenStart(1)
    }, 3000)

    timersRef.current.push(startTimer)
  }

  const averageReaction = useMemo(() => {
    if (friendsClicked === 0) {
      return 0
    }
    return Math.round(reactionTotal / friendsClicked)
  }, [friendsClicked, reactionTotal])

  const previewFalse = makeFalsePreview(currentRule, roundNumber)

  return (
    <div className="false-friend">
      {(phase === 'playing' || phase === 'ruleCard') && (
        <header className="false-friend__hud">
          <span>Round {roundNumber}</span>
          <span>Score {score.toLocaleString()}</span>
        </header>
      )}

      <main className="false-friend__arena">
        {activeObjects.map((orb) => {
          const notchAngle = orb.notchStep * 45
          const notchRadians = (notchAngle * Math.PI) / 180
          const radius = orb.size / 2
          const notchDistance = radius - 4

          return (
            <button
              key={orb.id}
              type="button"
              className="orb"
              style={{
                width: orb.size,
                height: orb.size,
                left: `${orb.x}%`,
                top: `${orb.y}%`,
                background: `hsl(${orb.hue} 86% 58%)`,
                transform: 'translate(-50%, -50%)',
              }}
              onClick={() => handleObjectClick(orb)}
              aria-label="false-friend-object"
            >
              <span
                className="orb__notch"
                style={{
                  left: `calc(50% + ${Math.cos(notchRadians) * notchDistance}px)`,
                  top: `calc(50% + ${Math.sin(notchRadians) * notchDistance}px)`,
                  transform: 'translate(-50%, -50%)',
                }}
              />
              <span className="orb__dots">
                {Array.from({ length: orb.dotCount }).map((_, dotIndex) => (
                  <span key={`${orb.id}-dot-${dotIndex}`} className="orb__dot" />
                ))}
              </span>
            </button>
          )
        })}

        {phase === 'start' && (
          <section className="overlay">
            <p className="overlay__eyebrow">Mouse Accuracy Lab</p>
            <h1>False Friend</h1>
            <p>Click only true friends. One wrong click ends the run.</p>
            <button type="button" className="overlay__button" onClick={beginRun}>
              Start
            </button>
          </section>
        )}

        {phase === 'countdown' && (
          <section className="overlay">
            <p className="overlay__eyebrow">Get ready</p>
            <h2 className="overlay__countdown">{countdown}</h2>
          </section>
        )}

        {phase === 'ruleCard' && (
          <section className="overlay">
            <p className="overlay__eyebrow">Round {roundNumber}</p>
            <h2>{currentRule.title}</h2>
            <p>{currentRule.sentence}</p>
            <p className="overlay__example">{currentRule.example}</p>
            <div className="rule-preview">
              <div>
                <span>Friend</span>
                <OrbitGlyph
                  dotCount={currentRule.friendDotCount}
                  notchStep={currentRule.friendNotchStep}
                  hue={currentRule.friendHue}
                />
              </div>
              <div>
                <span>False Friend</span>
                <OrbitGlyph dotCount={previewFalse.dotCount} notchStep={previewFalse.notchStep} hue={previewFalse.hue} />
              </div>
            </div>
          </section>
        )}

        {phase === 'dead' && (
          <section className="overlay overlay--death">
            <p className="overlay__eyebrow">Run Over</p>
            <h2>{deathScoreRef.current.toLocaleString()} pts</h2>
            <div className="stats-grid">
              <div>
                <span>Rounds cleared</span>
                <strong>{roundsCleared}</strong>
              </div>
              <div>
                <span>Friends clicked</span>
                <strong>{friendsClicked}</strong>
              </div>
              <div>
                <span>Avg reaction</span>
                <strong>{averageReaction} ms</strong>
              </div>
            </div>
            <aside className="leaderboard-placeholder">Global leaderboard comes next</aside>
            <button type="button" className="overlay__button" onClick={beginRun}>
              Play Again
            </button>
          </section>
        )}
      </main>
    </div>
  )
}

export default FalseFriendGame
