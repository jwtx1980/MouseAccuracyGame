import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import './FalseFriendGame.css'

type Phase = 'start' | 'countdown' | 'ruleCard' | 'playing' | 'dead'
type Attribute = 'shape' | 'color' | 'dots' | 'notch'
type ShapeType = 'circle' | 'square' | 'diamond' | 'triangle' | 'pentagon' | 'hexagon'

type Orb = {
  id: string
  isFriend: boolean
  shape: ShapeType
  dotCount: number
  notchAngle: number
  hue: number
  size: number
  x: number
  y: number
  spawnedAt: number
}

type LevelConfig = {
  tier: 1 | 2
  attributes: [Attribute] | [Attribute, Attribute]
  paletteSize: number
  shapeCount: number
  maxDots: number
  notchPositions: number
  spawnDelayMs: number
  friendCount: 4
  objectCount: 20
  objectVisibleMs: 2000
}

type Rule = {
  levelNumber: number
  title: string
  sentence: string
  example: string
  config: LevelConfig
  friend: {
    shape: ShapeType
    hue: number
    dotCount: number
    notchAngle: number
  }
}

const RULE_CARD_MS = 3000
const FALSE_EXPIRE_POINTS = 10
const ROUND_BONUS_BASE = 500
const SHAPES: ShapeType[] = ['circle', 'square', 'diamond', 'triangle', 'pentagon', 'hexagon']
const FULL_PALETTE = Array.from({ length: 24 }, (_, i) => Math.round((360 / 24) * i))

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function getNotchAngle(index: number, notchPositions: number) {
  if (notchPositions <= 0) {
    return 0
  }
  return (360 / notchPositions) * index
}

function getMinimumHits(levelNumber: number) {
  if (levelNumber <= 2) {
    return 1
  }
  if (levelNumber <= 6) {
    return 2
  }
  return 3
}

export function getLevelConfig(levelNumber: number): LevelConfig {
  // A) Levels 1–2: Shape only
  if (levelNumber <= 2) {
    return {
      tier: 1,
      attributes: ['shape'],
      shapeCount: 2,
      paletteSize: 1,
      maxDots: 0,
      notchPositions: 0,
      spawnDelayMs: 650,
      friendCount: 4,
      objectCount: 20,
      objectVisibleMs: 2000,
    }
  }

  // B) Levels 3–6: Shape + Color (small sets)
  if (levelNumber <= 6) {
    const levelMap: Record<number, { shapeCount: number; paletteSize: number }> = {
      3: { shapeCount: 2, paletteSize: 2 },
      4: { shapeCount: 2, paletteSize: 2 },
      5: { shapeCount: 3, paletteSize: 2 },
      6: { shapeCount: 2, paletteSize: 3 },
    }

    return {
      tier: 2,
      attributes: ['shape', 'color'],
      shapeCount: levelMap[levelNumber].shapeCount,
      paletteSize: levelMap[levelNumber].paletteSize,
      maxDots: 0,
      notchPositions: 0,
      spawnDelayMs: 620,
      friendCount: 4,
      objectCount: 20,
      objectVisibleMs: 2000,
    }
  }

  // C) Levels 7–10: Shape + Color harder (bigger sets + speed ramp)
  if (levelNumber <= 10) {
    const phaseLevel = levelNumber - 7
    const shapeCount = [3, 4, 5, 5][phaseLevel]
    const paletteSize = [3, 5, 6, 7][phaseLevel]
    const spawnDelayMs = [550, 520, 490, 460][phaseLevel]

    return {
      tier: 2,
      attributes: ['shape', 'color'],
      shapeCount,
      paletteSize,
      maxDots: 0,
      notchPositions: 0,
      spawnDelayMs,
      friendCount: 4,
      objectCount: 20,
      objectVisibleMs: 2000,
    }
  }

  // D) Levels 11–14: dots-only or notch-only (single new attribute at a time)
  if (levelNumber <= 14) {
    const sequence = [
      { attributes: ['dots'] as [Attribute], maxDots: 3, notchPositions: 0 },
      { attributes: ['notch'] as [Attribute], maxDots: 0, notchPositions: 2 },
      { attributes: ['dots'] as [Attribute], maxDots: 4, notchPositions: 0 },
      { attributes: ['notch'] as [Attribute], maxDots: 0, notchPositions: 4 },
    ]

    const pick = sequence[levelNumber - 11]

    return {
      tier: 1,
      attributes: pick.attributes,
      shapeCount: 1,
      paletteSize: 1,
      maxDots: pick.maxDots,
      notchPositions: pick.notchPositions,
      spawnDelayMs: 500,
      friendCount: 4,
      objectCount: 20,
      objectVisibleMs: 2000,
    }
  }

  // E) Level 15+: exactly two attributes combined, with ramped similarity and speed.
  const pairCycle: Array<[Attribute, Attribute]> = [
    ['shape', 'dots'],
    ['shape', 'notch'],
    ['color', 'dots'],
    ['color', 'notch'],
    ['shape', 'color'],
    ['dots', 'notch'],
  ]

  const pair = pairCycle[(levelNumber - 15) % pairCycle.length]
  const depth = levelNumber - 15

  let shapeCount = 1
  let paletteSize = 1
  let maxDots = 0
  let notchPositions = 0

  if (pair.includes('shape')) {
    shapeCount = clamp(3 + Math.floor(depth / 3), 3, 6)
  }
  if (pair.includes('color')) {
    paletteSize = clamp(3 + Math.floor(depth / 2), 3, 9)
  }
  if (pair.includes('dots')) {
    maxDots = clamp(3 + Math.floor(depth / 3), 3, 8)
  }
  if (pair.includes('notch')) {
    notchPositions = clamp(2 + Math.floor(depth / 3) * 2, 2, 8)
    if (notchPositions % 2 === 1) {
      notchPositions += 1
    }
  }

  // Fairness reduction for color+shape conjunction.
  if (pair.includes('shape') && pair.includes('color')) {
    shapeCount = Math.max(2, Math.floor(shapeCount * 0.7))
    paletteSize = Math.max(2, Math.floor(paletteSize * 0.7))
  }

  const spawnDelayMs = Math.max(300, 460 - depth * 12)

  return {
    tier: 2,
    attributes: pair,
    shapeCount,
    paletteSize,
    maxDots,
    notchPositions,
    spawnDelayMs,
    friendCount: 4,
    objectCount: 20,
    objectVisibleMs: 2000,
  }
}

function pickFrom<T>(items: T[], seed: number) {
  return items[seed % items.length]
}

function buildRule(levelNumber: number): Rule {
  const config = getLevelConfig(levelNumber)
  const shapeChoices = SHAPES.slice(0, config.shapeCount)
  const colorChoices = FULL_PALETTE.slice(0, config.paletteSize)
  const dotChoices = config.maxDots > 0 ? Array.from({ length: config.maxDots }, (_, i) => i + 1) : [0]

  const friend = {
    shape: pickFrom(shapeChoices, levelNumber * 3),
    hue: pickFrom(colorChoices, levelNumber * 5),
    dotCount: pickFrom(dotChoices, levelNumber * 7),
    notchAngle: getNotchAngle(levelNumber % Math.max(1, config.notchPositions), config.notchPositions),
  }

  let sentence = `Click objects matching: ${config.attributes.join(' AND ')}.`
  if (levelNumber <= 2) {
    sentence = `Click the ${friend.shape.toUpperCase()} shape.`
  } else if (levelNumber >= 3 && levelNumber <= 10) {
    sentence = `Click ${friend.shape.toUpperCase()} + target color.`
  }

  const example = `Space: ${config.shapeCount} shape(s), ${config.paletteSize} color(s), dots 1..${Math.max(0, config.maxDots)}, notch slots ${Math.max(0, config.notchPositions)}.`

  return {
    levelNumber,
    title: `Level ${levelNumber} · Tier ${config.tier}`,
    sentence,
    example,
    config,
    friend,
  }
}

function nearHue(base: number, paletteSize: number) {
  const step = paletteSize > 0 ? 360 / paletteSize : 20
  return base + (Math.random() < 0.5 ? -step : step)
}

function randomNotchAngle(notchPositions: number, exclude?: number) {
  if (notchPositions <= 0) {
    return 0
  }

  let angle = getNotchAngle(Math.floor(Math.random() * notchPositions), notchPositions)
  if (exclude !== undefined && angle === exclude) {
    angle = getNotchAngle((Math.floor(Math.random() * notchPositions) + 1) % notchPositions, notchPositions)
  }
  return angle
}

function matchesRule(orb: Omit<Orb, 'id' | 'isFriend' | 'size' | 'x' | 'y' | 'spawnedAt'>, rule: Rule) {
  return rule.config.attributes.every((attr) => {
    if (attr === 'shape') return orb.shape === rule.friend.shape
    if (attr === 'color') return orb.hue === rule.friend.hue
    if (attr === 'dots') return orb.dotCount === rule.friend.dotCount
    return orb.notchAngle === rule.friend.notchAngle
  })
}

function makeFalseOrb(rule: Rule) {
  const shapeChoices = SHAPES.slice(0, rule.config.shapeCount)
  const colorChoices = FULL_PALETTE.slice(0, rule.config.paletteSize)

  const draft = {
    shape: pickFrom(shapeChoices, Math.floor(Math.random() * 1000)),
    hue: pickFrom(colorChoices, Math.floor(Math.random() * 1000)),
    dotCount: rule.config.maxDots > 0 ? Math.floor(Math.random() * rule.config.maxDots) + 1 : 0,
    notchAngle: randomNotchAngle(rule.config.notchPositions),
  }

  const mutate = (attr: Attribute, shouldMatch: boolean) => {
    if (attr === 'shape') {
      draft.shape = shouldMatch ? rule.friend.shape : shapeChoices.find((shape) => shape !== rule.friend.shape) ?? rule.friend.shape
    } else if (attr === 'color') {
      draft.hue = shouldMatch ? rule.friend.hue : nearHue(rule.friend.hue, rule.config.paletteSize)
    } else if (attr === 'dots') {
      if (rule.config.maxDots <= 0) {
        draft.dotCount = 0
      } else {
        draft.dotCount = shouldMatch ? rule.friend.dotCount : ((rule.friend.dotCount % rule.config.maxDots) + 1)
      }
    } else {
      draft.notchAngle = shouldMatch
        ? rule.friend.notchAngle
        : randomNotchAngle(rule.config.notchPositions, rule.friend.notchAngle)
    }
  }

  if (rule.config.tier === 2) {
    const first = rule.config.attributes[0]
    const second = rule.config.attributes[1]!
    const roll = Math.random()

    if (roll < 0.42) {
      mutate(first, true)
      mutate(second, false)
    } else if (roll < 0.84) {
      mutate(first, false)
      mutate(second, true)
    } else {
      mutate(first, false)
      mutate(second, false)
    }
  } else {
    mutate(rule.config.attributes[0], false)
  }

  if (matchesRule(draft, rule)) {
    if (rule.config.attributes.includes('notch')) {
      draft.notchAngle = randomNotchAngle(rule.config.notchPositions, rule.friend.notchAngle)
    } else if (rule.config.attributes.includes('dots') && rule.config.maxDots > 0) {
      draft.dotCount = ((rule.friend.dotCount + 1) % rule.config.maxDots) + 1
    } else if (rule.config.attributes.includes('color')) {
      draft.hue = nearHue(rule.friend.hue, rule.config.paletteSize)
    } else {
      draft.shape = shapeChoices.find((shape) => shape !== rule.friend.shape) ?? draft.shape
    }
  }

  return draft
}

function buildRound(levelNumber: number) {
  const rule = buildRule(levelNumber)
  const friendSlots = new Set<number>()

  while (friendSlots.size < rule.config.friendCount) {
    friendSlots.add(Math.floor(Math.random() * rule.config.objectCount))
  }

  const baseSize = clamp(88 - levelNumber * 1.2, 52, 90)
  const objects: Orb[] = []

  for (let i = 0; i < rule.config.objectCount; i += 1) {
    const isFriend = friendSlots.has(i)
    const core = isFriend ? rule.friend : makeFalseOrb(rule)

    objects.push({
      id: `${levelNumber}-${i}-${Math.random().toString(36).slice(2, 8)}`,
      isFriend,
      shape: core.shape,
      hue: core.hue,
      dotCount: core.dotCount,
      notchAngle: core.notchAngle,
      size: baseSize + (Math.random() - 0.5) * 8,
      x: Math.random() * 86 + 3,
      y: Math.random() * 70 + 8,
      spawnedAt: 0,
    })
  }

  return { rule, objects }
}

function OrbitGlyph({ shape, dotCount, notchAngle, hue }: { shape: ShapeType; dotCount: number; notchAngle: number; hue: number }) {
  const notchRadians = (notchAngle * Math.PI) / 180
  const radius = 34
  const notchDistance = radius - 4

  return (
    <span className={`orb orb--preview orb--${shape}`} style={{ background: `hsl(${hue} 86% 58%)` }}>
      {dotCount > 0 && (
        <span className="orb__dots">
          {Array.from({ length: dotCount }).map((_, dotIndex) => (
            <span key={`preview-dot-${dotIndex}`} className="orb__dot" />
          ))}
        </span>
      )}
      {notchAngle !== 0 && (
        <span
          className="orb__notch"
          style={{
            left: `calc(50% + ${Math.cos(notchRadians) * notchDistance}px)`,
            top: `calc(50% + ${Math.sin(notchRadians) * notchDistance}px)`,
            transform: 'translate(-50%, -50%)',
          }}
        />
      )}
    </span>
  )
}

function FalseFriendGame() {
  const [phase, setPhase] = useState<Phase>('start')
  const [countdown, setCountdown] = useState(3)
  const [roundNumber, setRoundNumber] = useState(1)
  const [score, setScore] = useState(0)
  const [activeObjects, setActiveObjects] = useState<Orb[]>([])
  const [currentRule, setCurrentRule] = useState<Rule>(buildRule(1))
  const [friendsClicked, setFriendsClicked] = useState(0)
  const [reactionTotal, setReactionTotal] = useState(0)
  const [roundsCleared, setRoundsCleared] = useState(0)
  const [roundFriendHits, setRoundFriendHits] = useState(0)

  const deathScoreRef = useRef(0)
  const roundFriendHitsRef = useRef(0)
  const timersRef = useRef<number[]>([])
  const expiryTimersRef = useRef(new Map<string, number>())

  const clearAllTimers = useCallback(() => {
    timersRef.current.forEach((timerId) => window.clearTimeout(timerId))
    timersRef.current = []
    expiryTimersRef.current.forEach((timerId) => window.clearTimeout(timerId))
    expiryTimersRef.current.clear()
  }, [])

  useEffect(() => () => clearAllTimers(), [clearAllTimers])

  const triggerDeath = useCallback(() => {
    clearAllTimers()
    setActiveObjects([])
    setPhase('dead')
    deathScoreRef.current = score
  }, [clearAllTimers, score])

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
        roundFriendHitsRef.current = 0
        setRoundFriendHits(0)

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
            }, rule.config.objectVisibleMs)

            expiryTimersRef.current.set(spawnedObject.id, expiryTimer)
          }, index * rule.config.spawnDelayMs)

          timersRef.current.push(timer)
        })

        const endTimer = window.setTimeout(
          () => {
            const minHits = getMinimumHits(nextRound)
            if (roundFriendHitsRef.current < minHits) {
              triggerDeath()
              return
            }

            setScore((prev) => prev + Math.floor(ROUND_BONUS_BASE * nextRound ** 1.2))
            setRoundsCleared(nextRound)
            showRuleThenStart(nextRound + 1)
          },
          (objects.length - 1) * rule.config.spawnDelayMs + rule.config.objectVisibleMs + 30,
        )

        timersRef.current.push(endTimer)
      }, RULE_CARD_MS)

      timersRef.current.push(startTimer)
    },
    [triggerDeath],
  )

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
    const clickPoints = Math.max(0, 2000 - reactionMs)
    setScore((prev) => prev + clickPoints)
    setFriendsClicked((prev) => prev + 1)
    setReactionTotal((prev) => prev + reactionMs)

    roundFriendHitsRef.current += 1
    setRoundFriendHits(roundFriendHitsRef.current)
  }

  const beginRun = () => {
    clearAllTimers()
    setScore(0)
    setRoundNumber(1)
    setRoundsCleared(0)
    setFriendsClicked(0)
    setReactionTotal(0)
    setCurrentRule(buildRule(1))
    roundFriendHitsRef.current = 0
    setRoundFriendHits(0)
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
            Round {roundNumber} · Tier {currentRule.config.tier} · {currentRule.config.attributes.join(' + ')}
          </span>
          <span>
            Hits {roundFriendHits}/{getMinimumHits(roundNumber)} · Score {score.toLocaleString()}
          </span>
        </header>
      )}

      <main className="false-friend__arena">
        {activeObjects.map((orb) => {
          const notchRadians = (orb.notchAngle * Math.PI) / 180
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
              {orb.notchAngle !== 0 && (
                <span
                  className="orb__notch"
                  style={{
                    left: `calc(50% + ${Math.cos(notchRadians) * notchDistance}px)`,
                    top: `calc(50% + ${Math.sin(notchRadians) * notchDistance}px)`,
                    transform: 'translate(-50%, -50%)',
                  }}
                />
              )}
              {orb.dotCount > 0 && (
                <span className="orb__dots">
                  {Array.from({ length: orb.dotCount }).map((_, dotIndex) => (
                    <span key={`${orb.id}-dot-${dotIndex}`} className="orb__dot" />
                  ))}
                </span>
              )}
            </button>
          )
        })}

        {phase === 'start' && (
          <section className="overlay">
            <p className="overlay__eyebrow">Mouse Accuracy Lab</p>
            <h1>False Friend</h1>
            <p>Click only true friends. One wrong click or too few hits ends the run.</p>
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
            <p className="overlay__example">Need {getMinimumHits(roundNumber)} friend hit(s) to advance.</p>
            <div className="rule-preview">
              <span>Friend to click</span>
              <OrbitGlyph
                shape={currentRule.friend.shape}
                dotCount={currentRule.friend.dotCount}
                notchAngle={currentRule.friend.notchAngle}
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
