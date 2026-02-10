import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import './FalseFriendGame.css'

type Phase = 'start' | 'countdown' | 'ruleCard' | 'playing' | 'dead'
type ShapeType = 'circle' | 'square' | 'diamond'

type Orb = {
  id: string
  isFriend: boolean
  shape: ShapeType
  dotCount: number
  notchStep: number
  hue: number
  size: number
  x: number
  y: number
  spawnedAt: number
}

type LevelRule = {
  levelNumber: number
  title: string
  sentence: string
  example: string
  requiredTraits: {
    shape: boolean
    color: boolean
    notch: boolean
    dot: boolean
  }
  friend: {
    shape: ShapeType
    hue: number
    notchStep: number
    dotCount: number
  }
}

const OBJECTS_PER_ROUND = 20
const FRIENDS_PER_ROUND = 4
const ON_SCREEN_MS = 2000
const RULE_CARD_MS = 3000
const FALSE_EXPIRE_POINTS = 10

const SHAPES: ShapeType[] = ['circle', 'square', 'diamond']
const HUES = [22, 48, 88, 142, 195, 232, 285, 334]

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function getLevelNumber(roundNumber: number) {
  return ((roundNumber - 1) % 6) + 1
}

function getSpeedMultiplier(roundNumber: number) {
  return roundNumber >= 7 ? 2 : 1
}

function getSpawnGap(roundNumber: number) {
  const level = getLevelNumber(roundNumber)
  const speedMultiplier = getSpeedMultiplier(roundNumber)
  const baseGap = 820 - (level - 1) * 55
  return Math.max(180, Math.floor(baseGap / speedMultiplier))
}

function getNearMissWeight(roundNumber: number) {
  return clamp(0.38 + (roundNumber - 1) * 0.06, 0.38, 0.95)
}

function buildRule(roundNumber: number): LevelRule {
  const levelNumber = getLevelNumber(roundNumber)
  const shape = SHAPES[(roundNumber - 1) % SHAPES.length]
  const hue = HUES[(roundNumber - 1) % HUES.length]
  const notchStep = ((roundNumber - 1) * 2) % 8
  const dotCount = ((roundNumber + 1) % 4) + 1

  if (levelNumber === 1) {
    return {
      levelNumber,
      title: 'Level 1 · Shape Only',
      sentence: `Click only the ${shape} shape. Ignore color, notch, and dots.`,
      example: `Friend = ${shape}. Wrong shape = instant death.`,
      requiredTraits: { shape: true, color: false, notch: false, dot: false },
      friend: { shape, hue, notchStep, dotCount },
    }
  }

  if (levelNumber === 2) {
    return {
      levelNumber,
      title: 'Level 2 · Shape + Color',
      sentence: `Click only ${shape} with the target color.`,
      example: 'Both shape and color must match.',
      requiredTraits: { shape: true, color: true, notch: false, dot: false },
      friend: { shape, hue, notchStep, dotCount },
    }
  }

  if (levelNumber === 3) {
    return {
      levelNumber,
      title: 'Level 3 · Shape + Notch',
      sentence: `Click only ${shape} with the target notch location.`,
      example: 'Shape and notch must match.',
      requiredTraits: { shape: true, color: false, notch: true, dot: false },
      friend: { shape, hue, notchStep, dotCount },
    }
  }

  if (levelNumber === 4) {
    return {
      levelNumber,
      title: 'Level 4 · Shape + Color + Notch',
      sentence: `Click only ${shape} with the correct color and notch.`,
      example: 'Three-trait matching starts here.',
      requiredTraits: { shape: true, color: true, notch: true, dot: false },
      friend: { shape, hue, notchStep, dotCount },
    }
  }

  if (levelNumber === 5) {
    return {
      levelNumber,
      title: 'Level 5 · Shape + Notch + Dot',
      sentence: `Click only ${shape} with correct notch and ${dotCount} dots.`,
      example: 'Color can lie. Trust shape + notch + dots.',
      requiredTraits: { shape: true, color: false, notch: true, dot: true },
      friend: { shape, hue, notchStep, dotCount },
    }
  }

  return {
    levelNumber,
    title: 'Level 6 · Shape + Color + Notch + Dot',
    sentence: `Click only ${shape} that matches all four traits.`,
    example: 'Everything must match to be a friend.',
    requiredTraits: { shape: true, color: true, notch: true, dot: true },
    friend: { shape, hue, notchStep, dotCount },
  }
}

function getRandomShape(exclude?: ShapeType) {
  const choices = exclude ? SHAPES.filter((shape) => shape !== exclude) : SHAPES
  return choices[Math.floor(Math.random() * choices.length)]
}

function getRandomHue(exclude?: number) {
  const delta = Math.random() < 0.5 ? -1 : 1
  let next = HUES[Math.floor(Math.random() * HUES.length)]
  if (exclude !== undefined && Math.abs(next - exclude) < 8) {
    next = exclude + delta * 24
  }
  return next
}

function getRandomDotCount(exclude?: number) {
  let next = Math.floor(Math.random() * 5)
  if (exclude !== undefined && next === exclude) {
    next = (next + 2) % 5
  }
  return next
}

function getRandomNotch(exclude?: number) {
  let next = Math.floor(Math.random() * 8)
  if (exclude !== undefined && next === exclude) {
    next = (next + 3) % 8
  }
  return next
}

function makeOrb(roundNumber: number, rule: LevelRule, isFriend: boolean, index: number): Orb {
  const nearMissWeight = getNearMissWeight(roundNumber)
  const speedMultiplier = getSpeedMultiplier(roundNumber)
  const baseSize = clamp(86 - (speedMultiplier - 1) * 8 - (rule.levelNumber - 1) * 2, 48, 90)
  const size = baseSize + (Math.random() - 0.5) * 8

  let shape = rule.friend.shape
  let hue = rule.friend.hue
  let notchStep = rule.friend.notchStep
  let dotCount = rule.friend.dotCount

  if (!isFriend) {
    const nearMiss = Math.random() < nearMissWeight

    const mutableTraits = [
      rule.requiredTraits.shape ? 'shape' : null,
      rule.requiredTraits.color ? 'color' : null,
      rule.requiredTraits.notch ? 'notch' : null,
      rule.requiredTraits.dot ? 'dot' : null,
    ].filter(Boolean) as Array<'shape' | 'color' | 'notch' | 'dot'>

    const mustMutate = mutableTraits[Math.floor(Math.random() * mutableTraits.length)]

    const mutate = (trait: 'shape' | 'color' | 'notch' | 'dot') => {
      if (trait === 'shape') shape = getRandomShape(rule.friend.shape)
      if (trait === 'color') hue = nearMiss ? rule.friend.hue + (Math.random() < 0.5 ? -10 : 10) : getRandomHue(rule.friend.hue)
      if (trait === 'notch') notchStep = nearMiss ? (rule.friend.notchStep + (Math.random() < 0.5 ? -1 : 1) + 8) % 8 : getRandomNotch(rule.friend.notchStep)
      if (trait === 'dot') dotCount = nearMiss ? clamp(rule.friend.dotCount + (Math.random() < 0.5 ? -1 : 1), 0, 4) : getRandomDotCount(rule.friend.dotCount)
    }

    mutate(mustMutate)

    if (!nearMiss && Math.random() < 0.45) {
      const secondary = mutableTraits.filter((trait) => trait !== mustMutate)
      if (secondary.length > 0) {
        mutate(secondary[Math.floor(Math.random() * secondary.length)])
      }
    }

    if (!rule.requiredTraits.color && Math.random() < 0.65) {
      hue = getRandomHue()
    }
    if (!rule.requiredTraits.dot && Math.random() < 0.65) {
      dotCount = getRandomDotCount()
    }
    if (!rule.requiredTraits.notch && Math.random() < 0.65) {
      notchStep = getRandomNotch()
    }
  }

  return {
    id: `${roundNumber}-${index}-${Math.random().toString(36).slice(2, 8)}`,
    isFriend,
    shape,
    hue,
    notchStep,
    dotCount,
    size,
    x: Math.random() * 86 + 3,
    y: Math.random() * 70 + 8,
    spawnedAt: 0,
  }
}

function buildRound(roundNumber: number) {
  const rule = buildRule(roundNumber)
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

function OrbitGlyph({ shape, dotCount, notchStep, hue }: { shape: ShapeType; dotCount: number; notchStep: number; hue: number }) {
  const notchAngle = notchStep * 45
  const notchRadians = (notchAngle * Math.PI) / 180
  const radius = 34
  const notchDistance = radius - 4

  return (
    <span className={`orb orb--preview orb--${shape}`} style={{ background: `hsl(${hue} 86% 58%)` }}>
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
  const [currentRule, setCurrentRule] = useState<LevelRule>(buildRule(1))
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
      setCurrentRule(buildRule(nextRound))
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
    setCurrentRule(buildRule(1))
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
          <span>
            Round {roundNumber} · L{currentRule.levelNumber} · {getSpeedMultiplier(roundNumber)}x speed
          </span>
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
              className={`orb orb--${orb.shape}`}
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
                shape={currentRule.friend.shape}
                dotCount={currentRule.friend.dotCount}
                notchStep={currentRule.friend.notchStep}
                hue={currentRule.friend.hue}
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
