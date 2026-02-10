import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import './FalseFriendGame.css'

type Phase = 'start' | 'countdown' | 'ruleCard' | 'playing' | 'dead'

type RuleMode = 'color' | 'shape' | 'color-shape' | 'full'

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
  mode: RuleMode
  title: string
  sentence: string
  example: string
  friendDotCount: number
  friendNotchStep: number
  friendHue: number
}

const BASE_OBJECTS_PER_ROUND = 20
const FRIENDS_PER_ROUND = 4
const ON_SCREEN_MS = 2000
const RULE_CARD_MS = 3000
const FALSE_EXPIRE_POINTS = 10
const HUES = [24, 46, 78, 130, 178, 205, 242, 292, 334]

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function getSpawnGap(roundNumber: number) {
  return Math.max(220, 840 - (roundNumber - 1) * 52)
}

function getObjectsPerRound(roundNumber: number) {
  return BASE_OBJECTS_PER_ROUND + Math.min(10, Math.floor((roundNumber - 1) / 2))
}

function getNearMissWeight(roundNumber: number) {
  return clamp(0.25 + (roundNumber - 1) * 0.09, 0.25, 0.96)
}

function getRule(roundNumber: number): Rule {
  const hue = HUES[(roundNumber - 1) % HUES.length]
  const dotCount = (roundNumber + 1) % 5
  const notchStep = ((roundNumber - 1) * 2) % 8

  if (roundNumber <= 3) {
    return {
      id: `color-${roundNumber}`,
      mode: 'color',
      title: `Color Lock ${roundNumber}`,
      sentence: `Click only circles with the target color.` ,
      example: `Friend: same color. False friend: any other color, even if shape looks identical.`,
      friendDotCount: 2,
      friendNotchStep: 0,
      friendHue: hue,
    }
  }

  if (roundNumber <= 6) {
    return {
      id: `shape-${roundNumber}`,
      mode: 'shape',
      title: `Shape Lock ${roundNumber - 3}`,
      sentence: `Click only circles with exactly ${dotCount} dots.`,
      example: `Friend: ${dotCount} dots. False friend: nearby dot counts and misleading colors.`,
      friendDotCount: dotCount,
      friendNotchStep: 1,
      friendHue: 198,
    }
  }

  if (roundNumber <= 9) {
    return {
      id: `color-shape-${roundNumber}`,
      mode: 'color-shape',
      title: `Dual Lock ${roundNumber - 6}`,
      sentence: `Click only circles that match BOTH the color and ${dotCount} dots.`,
      example: `Must match both traits. One match is still false.`,
      friendDotCount: dotCount,
      friendNotchStep: 2,
      friendHue: hue,
    }
  }

  return {
    id: `full-${roundNumber}`,
    mode: 'full',
    title: `Tri-Lock ${roundNumber - 9}`,
    sentence: `Click only circles matching color, ${dotCount} dots, and notch position.`,
    example: `Late game: all three cues matter. Near misses will feel very close.`,
    friendDotCount: dotCount,
    friendNotchStep: notchStep,
    friendHue: hue,
  }
}

function makeOrb(roundNumber: number, rule: Rule, isFriend: boolean, index: number): Orb {
  const nearMissWeight = getNearMissWeight(roundNumber)
  const baseSize = clamp(86 - roundNumber * 1.8, 52, 88)
  const size = baseSize + (Math.random() - 0.5) * 10

  let dotCount = rule.friendDotCount
  let notchStep = rule.friendNotchStep
  let hue = rule.friendHue

  if (!isFriend) {
    const nearMiss = Math.random() < nearMissWeight

    const mutateHue = () => {
      const delta = nearMiss ? (Math.random() < 0.5 ? -12 : 12) : Math.random() < 0.5 ? -30 : 30
      hue = rule.friendHue + delta
    }

    const mutateDots = () => {
      if (nearMiss) {
        dotCount = clamp(rule.friendDotCount + (Math.random() < 0.5 ? -1 : 1), 0, 4)
      } else {
        dotCount = Math.floor(Math.random() * 5)
        if (dotCount === rule.friendDotCount) {
          dotCount = (dotCount + 2) % 5
        }
      }
    }

    const mutateNotch = () => {
      notchStep = nearMiss
        ? (rule.friendNotchStep + (Math.random() < 0.5 ? -1 : 1) + 8) % 8
        : (rule.friendNotchStep + 3 + Math.floor(Math.random() * 4)) % 8
    }

    if (rule.mode === 'color') {
      mutateHue()
      if (!nearMiss && Math.random() < 0.5) {
        mutateDots()
      }
    } else if (rule.mode === 'shape') {
      mutateDots()
      hue = nearMiss ? 198 + (Math.random() < 0.5 ? -8 : 8) : 198 + (Math.random() < 0.5 ? -24 : 24)
      if (!nearMiss && Math.random() < 0.4) {
        mutateNotch()
      }
    } else if (rule.mode === 'color-shape') {
      const mutationOrder = Math.random() < 0.5 ? ['color', 'shape'] : ['shape', 'color']
      mutationOrder.forEach((mutation) => {
        if (mutation === 'color') {
          mutateHue()
        } else {
          mutateDots()
        }
      })
      if (!nearMiss && Math.random() < 0.55) {
        mutateNotch()
      }
    } else {
      const mutation = Math.floor(Math.random() * 3)
      if (mutation === 0) {
        mutateHue()
      } else if (mutation === 1) {
        mutateDots()
      } else {
        mutateNotch()
      }

      if (!nearMiss && Math.random() < 0.65) {
        if (Math.random() < 0.5) {
          mutateHue()
        } else {
          mutateDots()
        }
      }
    }
  }

  return {
    id: `${roundNumber}-${index}-${Math.random().toString(36).slice(2, 8)}`,
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
  const objectsPerRound = getObjectsPerRound(roundNumber)
  const friendSlots = new Set<number>()

  while (friendSlots.size < FRIENDS_PER_ROUND) {
    friendSlots.add(Math.floor(Math.random() * objectsPerRound))
  }

  const objects: Orb[] = []
  for (let i = 0; i < objectsPerRound; i += 1) {
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
          (objects.length - 1) * spawnGap + ON_SCREEN_MS + 30,
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
              <span>Friend to click</span>
              <OrbitGlyph
                dotCount={currentRule.friendDotCount}
                notchStep={currentRule.friendNotchStep}
                hue={currentRule.friendHue}
              />
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
