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
const ATTR_CYCLE: Attribute[] = ['shape', 'color', 'dots', 'notch']
const SHAPES: ShapeType[] = ['circle', 'square', 'diamond', 'triangle', 'pentagon', 'hexagon']
const FULL_PALETTE = Array.from({ length: 24 }, (_, i) => Math.round((360 / 24) * i))

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function getShapeCount(index: number) {
  return Math.min(6, index + 1)
}

function getPaletteSize(index: number) {
  return Math.min(21, 3 + (index - 1) * 2)
}

function getMaxDots(index: number) {
  return Math.min(8, 2 + index)
}

function getNotchPositions(index: number) {
  if (index <= 1) return 2
  if (index === 2) return 4
  if (index === 3) return 6
  return 8
}

function getTier(levelNumber: number): 1 | 2 {
  if (levelNumber <= 8) {
    return 1
  }

  const frequency = levelNumber >= 17 ? 3 : 4
  return levelNumber % frequency === 0 ? 2 : 1
}

function getPrimaryAttribute(levelNumber: number) {
  return ATTR_CYCLE[(levelNumber - 1) % ATTR_CYCLE.length]
}

function getTierTwoAttributes(levelNumber: number, primary: Attribute): [Attribute, Attribute] {
  const candidates = ATTR_CYCLE.filter((item) => item !== primary)
  const partner = candidates[Math.floor(levelNumber / 2) % candidates.length]
  return [primary, partner]
}

function getAttributesForLevel(levelNumber: number): [Attribute] | [Attribute, Attribute] {
  const primary = getPrimaryAttribute(levelNumber)
  if (getTier(levelNumber) === 1) {
    return [primary]
  }

  return getTierTwoAttributes(levelNumber, primary)
}

function getAttributeUsageCounts(levelNumber: number) {
  const counts: Record<Attribute, number> = {
    shape: 0,
    color: 0,
    dots: 0,
    notch: 0,
  }

  for (let level = 1; level <= levelNumber; level += 1) {
    const attrs = getAttributesForLevel(level)
    attrs.forEach((attr) => {
      counts[attr] += 1
    })
  }

  return counts
}

export function getLevelConfig(levelNumber: number): LevelConfig {
  const attributes = getAttributesForLevel(levelNumber)
  const tier = getTier(levelNumber)
  const usage = getAttributeUsageCounts(levelNumber)

  let shapeCount = getShapeCount(usage.shape)
  let paletteSize = getPaletteSize(usage.color)
  let maxDots = getMaxDots(usage.dots)
  let notchPositions = getNotchPositions(usage.notch)

  if (tier === 2 && attributes.includes('shape') && attributes.includes('color')) {
    shapeCount = Math.max(2, Math.floor(shapeCount * 0.7))
    paletteSize = Math.max(3, Math.floor(paletteSize * 0.7))
  }

  if (tier === 2 && attributes.includes('notch') && levelNumber < 18) {
    notchPositions = Math.min(notchPositions, 6)
  }

  let spawnDelayMs = 650
  if (levelNumber >= 12) {
    spawnDelayMs = Math.max(250, 650 - (levelNumber - 12) * 15)
  }

  const capInfo: Record<Attribute, { value: number; cap: number; capReachedAt: number }> = {
    shape: { value: shapeCount, cap: 6, capReachedAt: 5 },
    color: { value: paletteSize, cap: 21, capReachedAt: 10 },
    dots: { value: maxDots, cap: 8, capReachedAt: 6 },
    notch: { value: notchPositions, cap: 8, capReachedAt: 4 },
  }

  let cappedPenalty = 0
  attributes.forEach((attr) => {
    const info = capInfo[attr]
    if (info.value >= info.cap) {
      const repeatsAtCap = Math.max(1, usage[attr] - info.capReachedAt + 1)
      cappedPenalty += repeatsAtCap * 20
    }
  })

  spawnDelayMs = Math.max(250, spawnDelayMs - cappedPenalty)

  return {
    tier,
    attributes,
    paletteSize,
    shapeCount,
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

function getNotchAngle(index: number, notchPositions: number) {
  return (360 / notchPositions) * index
}

function buildRule(levelNumber: number): Rule {
  const config = getLevelConfig(levelNumber)
  const shapeChoices = SHAPES.slice(0, config.shapeCount)
  const colorChoices = FULL_PALETTE.slice(0, config.paletteSize)
  const dotChoices = Array.from({ length: config.maxDots }, (_, i) => i + 1)

  const primaryLabel = config.attributes.join(' + ')
  const friend = {
    shape: pickFrom(shapeChoices, levelNumber * 3),
    hue: pickFrom(colorChoices, levelNumber * 5),
    dotCount: pickFrom(dotChoices, levelNumber * 7),
    notchAngle: getNotchAngle(levelNumber % config.notchPositions, config.notchPositions),
  }

  const title = `Level ${levelNumber} · Tier ${config.tier} · ${primaryLabel}`
  const sentence = `Click objects matching: ${config.attributes.join(' AND ')}.`
  const example = `Choice space: ${config.shapeCount} shapes, ${config.paletteSize} colors, 1..${config.maxDots} dots, ${config.notchPositions} notch positions.`

  return { levelNumber, title, sentence, example, config, friend }
}

function nearHue(base: number, palette: number[]) {
  const step = palette.length > 0 ? 360 / palette.length : 20
  return base + (Math.random() < 0.5 ? -step : step)
}

function randomNotchAngle(notchPositions: number, exclude?: number) {
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
  const shapes = SHAPES.slice(0, rule.config.shapeCount)
  const palette = FULL_PALETTE.slice(0, rule.config.paletteSize)

  const draft = {
    shape: pickFrom(shapes, Math.floor(Math.random() * 1000)),
    hue: pickFrom(palette, Math.floor(Math.random() * 1000)),
    dotCount: Math.floor(Math.random() * rule.config.maxDots) + 1,
    notchAngle: randomNotchAngle(rule.config.notchPositions),
  }

  const attrs = rule.config.attributes

  const applyNearMiss = (matchFirstOnly: boolean) => {
    const first = attrs[0]
    const second = attrs[1]!

    const mutate = (attr: Attribute, match: boolean) => {
      if (attr === 'shape') {
        draft.shape = match ? rule.friend.shape : SHAPES.slice(0, rule.config.shapeCount).find((s) => s !== rule.friend.shape) ?? rule.friend.shape
      } else if (attr === 'color') {
        draft.hue = match ? rule.friend.hue : nearHue(rule.friend.hue, palette)
      } else if (attr === 'dots') {
        draft.dotCount = match ? rule.friend.dotCount : ((rule.friend.dotCount % rule.config.maxDots) + 1)
      } else {
        draft.notchAngle = match ? rule.friend.notchAngle : randomNotchAngle(rule.config.notchPositions, rule.friend.notchAngle)
      }
    }

    mutate(first, matchFirstOnly)
    mutate(second, !matchFirstOnly)
  }

  if (rule.config.tier === 2) {
    const roll = Math.random()
    if (roll < 0.4) {
      applyNearMiss(true)
    } else if (roll < 0.8) {
      applyNearMiss(false)
    } else {
      rule.config.attributes.forEach((attr) => {
        if (attr === 'shape') {
          draft.shape = SHAPES.slice(0, rule.config.shapeCount).find((s) => s !== rule.friend.shape) ?? draft.shape
        } else if (attr === 'color') {
          draft.hue = nearHue(rule.friend.hue, palette)
        } else if (attr === 'dots') {
          draft.dotCount = ((rule.friend.dotCount + 1) % rule.config.maxDots) + 1
        } else {
          draft.notchAngle = randomNotchAngle(rule.config.notchPositions, rule.friend.notchAngle)
        }
      })
    }
  } else {
    const attr = rule.config.attributes[0]
    if (attr === 'shape') {
      draft.shape = SHAPES.slice(0, rule.config.shapeCount).find((s) => s !== rule.friend.shape) ?? draft.shape
    } else if (attr === 'color') {
      draft.hue = nearHue(rule.friend.hue, palette)
    } else if (attr === 'dots') {
      draft.dotCount = ((rule.friend.dotCount + 1) % rule.config.maxDots) + 1
    } else {
      draft.notchAngle = randomNotchAngle(rule.config.notchPositions, rule.friend.notchAngle)
    }
  }

  if (matchesRule(draft, rule)) {
    draft.notchAngle = randomNotchAngle(rule.config.notchPositions, rule.friend.notchAngle)
  }

  return draft
}

function buildRound(levelNumber: number) {
  const rule = buildRule(levelNumber)
  const friendSlots = new Set<number>()

  while (friendSlots.size < rule.config.friendCount) {
    friendSlots.add(Math.floor(Math.random() * rule.config.objectCount))
  }

  const baseSize = clamp(88 - levelNumber * 1.3, 52, 90)
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
  const [currentRule, setCurrentRule] = useState<Rule>(buildRule(1))
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

  useEffect(() => () => clearAllTimers(), [clearAllTimers])

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
    const clickPoints = Math.max(0, 2000 - reactionMs)
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
            Round {roundNumber} · Tier {currentRule.config.tier} · {currentRule.config.attributes.join(' + ')}
          </span>
          <span>Score {score.toLocaleString()}</span>
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
