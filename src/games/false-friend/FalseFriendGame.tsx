import type { FormEvent } from 'react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { getSupabaseClient } from '../../lib/supabase'
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

type ScoreEntry = {
  name: string
  totalScore: number
  roundsCleared: number
  date: string
}

type LevelConfig = {
  tier: 1 | 2
  attributes: Attribute[]
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
  colorChoices: number[]
}

const RULE_CARD_MS = 3000
const FALSE_EXPIRE_POINTS = 10
const ROUND_BONUS_BASE = 500
const SHAPES: ShapeType[] = ['circle', 'square', 'diamond', 'triangle', 'pentagon', 'hexagon']
const FULL_PALETTE = Array.from({ length: 24 }, (_, i) => Math.round((360 / 24) * i))
const FALSE_FRIEND_USER_ID_KEY = 'false-friend-user-id-v1'

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function getStableUserId() {
  if (typeof window === 'undefined') return 'server'

  const existing = window.localStorage.getItem(FALSE_FRIEND_USER_ID_KEY)
  if (existing) return existing

  const newId =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`

  window.localStorage.setItem(FALSE_FRIEND_USER_ID_KEY, newId)
  return newId
}

function getNotchAngle(index: number, notchPositions: number) {
  if (notchPositions <= 0) {
    return 0
  }
  return (360 / notchPositions) * index
}

function getMinimumHits(levelNumber: number) {
  if (levelNumber <= 3) return 1
  if (levelNumber <= 6) return 2
  return 3
}

export function getLevelConfig(levelNumber: number): LevelConfig {
  const speedRamp = [440, Math.floor(440 / 1.1), Math.floor(440 / (1.1 * 1.1)), Math.floor(440 / (1.1 * 1.1 * 1.1))]

  if (levelNumber === 1) {
    return {
      tier: 2,
      attributes: ['shape', 'color'],
      shapeCount: 2,
      paletteSize: 2,
      maxDots: 0,
      notchPositions: 0,
      spawnDelayMs: 650,
      friendCount: 4,
      objectCount: 20,
      objectVisibleMs: 2000,
    }
  }

  if (levelNumber === 2) {
    return {
      tier: 2,
      attributes: ['shape', 'color'],
      shapeCount: 3,
      paletteSize: 3,
      maxDots: 0,
      notchPositions: 0,
      spawnDelayMs: 620,
      friendCount: 4,
      objectCount: 20,
      objectVisibleMs: 2000,
    }
  }

  if (levelNumber === 3) {
    return {
      tier: 2,
      attributes: ['shape', 'color'],
      shapeCount: 4,
      paletteSize: 4,
      maxDots: 0,
      notchPositions: 0,
      spawnDelayMs: 590,
      friendCount: 4,
      objectCount: 20,
      objectVisibleMs: 2000,
    }
  }

  if (levelNumber === 4) {
    return {
      tier: 2,
      attributes: ['shape', 'color', 'dots'],
      shapeCount: 4,
      paletteSize: 4,
      maxDots: 3,
      notchPositions: 0,
      spawnDelayMs: 560,
      friendCount: 4,
      objectCount: 20,
      objectVisibleMs: 2000,
    }
  }

  if (levelNumber === 5) {
    return {
      tier: 2,
      attributes: ['shape', 'color', 'dots'],
      shapeCount: 4,
      paletteSize: 5,
      maxDots: 4,
      notchPositions: 0,
      spawnDelayMs: 530,
      friendCount: 4,
      objectCount: 20,
      objectVisibleMs: 2000,
    }
  }

  if (levelNumber === 6) {
    return {
      tier: 2,
      attributes: ['shape', 'color', 'dots'],
      shapeCount: 5,
      paletteSize: 6,
      maxDots: 5,
      notchPositions: 0,
      spawnDelayMs: 500,
      friendCount: 4,
      objectCount: 20,
      objectVisibleMs: 2000,
    }
  }

  if (levelNumber === 7) {
    return {
      tier: 2,
      attributes: ['shape', 'color', 'dots', 'notch'],
      shapeCount: 5,
      paletteSize: 6,
      maxDots: 5,
      notchPositions: 2,
      spawnDelayMs: 470,
      friendCount: 4,
      objectCount: 20,
      objectVisibleMs: 2000,
    }
  }

  if (levelNumber === 8) {
    return {
      tier: 2,
      attributes: ['shape', 'color', 'dots', 'notch'],
      shapeCount: 5,
      paletteSize: 7,
      maxDots: 5,
      notchPositions: 4,
      spawnDelayMs: speedRamp[0],
      friendCount: 4,
      objectCount: 20,
      objectVisibleMs: 2000,
    }
  }

  if (levelNumber === 9) {
    return {
      tier: 2,
      attributes: ['shape', 'color', 'dots', 'notch'],
      shapeCount: 5,
      paletteSize: 7,
      maxDots: 5,
      notchPositions: 4,
      spawnDelayMs: speedRamp[1],
      friendCount: 4,
      objectCount: 20,
      objectVisibleMs: 2000,
    }
  }

  if (levelNumber === 10) {
    return {
      tier: 2,
      attributes: ['shape', 'color', 'dots', 'notch'],
      shapeCount: 6,
      paletteSize: 8,
      maxDots: 5,
      notchPositions: 4,
      spawnDelayMs: speedRamp[2],
      friendCount: 4,
      objectCount: 20,
      objectVisibleMs: 2000,
    }
  }

  if (levelNumber === 11) {
    return {
      tier: 2,
      attributes: ['shape', 'color', 'dots', 'notch'],
      shapeCount: 6,
      paletteSize: 8,
      maxDots: 5,
      notchPositions: 4,
      spawnDelayMs: speedRamp[3],
      friendCount: 4,
      objectCount: 20,
      objectVisibleMs: 2000,
    }
  }

  const depth = levelNumber - 12
  return {
    tier: 2,
    attributes: ['shape', 'color', 'dots', 'notch'],
    shapeCount: 6,
    paletteSize: clamp(8 + Math.floor(depth / 2), 8, 12),
    maxDots: clamp(5 + Math.floor(depth / 3), 5, 8),
    notchPositions: 8,
    spawnDelayMs: Math.max(250, speedRamp[3] - depth * 10),
    friendCount: 4,
    objectCount: 20,
    objectVisibleMs: 2000,
  }
}

function getColorChoices(levelNumber: number, paletteSize: number) {
  if (paletteSize <= 1) {
    return [210]
  }

  if (levelNumber < 12) {
    return FULL_PALETTE.slice(0, paletteSize)
  }

  const center = (200 + levelNumber * 9) % 360
  const step = Math.max(4, 18 - (levelNumber - 12))
  const start = center - ((paletteSize - 1) / 2) * step
  return Array.from({ length: paletteSize }, (_, idx) => Math.round((start + idx * step + 360) % 360))
}

function pickFrom<T>(items: T[], seed: number) {
  return items[seed % items.length]
}

function buildRule(levelNumber: number): Rule {
  const config = getLevelConfig(levelNumber)
  const shapeChoices = SHAPES.slice(0, config.shapeCount)
  const colorChoices = getColorChoices(levelNumber, config.paletteSize)
  const dotChoices = config.maxDots > 0 ? Array.from({ length: config.maxDots }, (_, i) => i + 1) : [0]

  const friend = {
    shape: pickFrom(shapeChoices, levelNumber * 3),
    hue: pickFrom(colorChoices, levelNumber * 5),
    dotCount: pickFrom(dotChoices, levelNumber * 7),
    notchAngle: getNotchAngle(levelNumber % Math.max(1, config.notchPositions), config.notchPositions),
  }

  return {
    levelNumber,
    title: `Level ${levelNumber}`,
    sentence: `Click objects matching ${config.attributes.join(' + ')}.`,
    example: `Need ${getMinimumHits(levelNumber)} friend hit(s) to advance.`,
    config,
    friend,
    colorChoices,
  }
}

function nearHue(base: number, choices: number[]) {
  if (choices.length <= 1) {
    return base + 10
  }

  const index = choices.indexOf(base)
  if (index === -1) {
    return choices[0]
  }

  const direction = Math.random() < 0.5 ? -1 : 1
  const nextIndex = clamp(index + direction, 0, choices.length - 1)
  if (nextIndex === index) {
    return choices[(index + 1) % choices.length]
  }
  return choices[nextIndex]
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

  const draft = {
    shape: pickFrom(shapeChoices, Math.floor(Math.random() * 1000)),
    hue: pickFrom(rule.colorChoices, Math.floor(Math.random() * 1000)),
    dotCount: rule.config.maxDots > 0 ? Math.floor(Math.random() * rule.config.maxDots) + 1 : 0,
    notchAngle: randomNotchAngle(rule.config.notchPositions),
  }

  const mutate = (attr: Attribute, shouldMatch: boolean) => {
    if (attr === 'shape') {
      draft.shape = shouldMatch ? rule.friend.shape : shapeChoices.find((shape) => shape !== rule.friend.shape) ?? rule.friend.shape
    } else if (attr === 'color') {
      draft.hue = shouldMatch ? rule.friend.hue : nearHue(rule.friend.hue, rule.colorChoices)
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

  const activeAttrs = rule.config.attributes

  if (activeAttrs.length >= 2) {
    const nearMiss = Math.random() < 0.78
    if (nearMiss) {
      const mismatchIndex = Math.floor(Math.random() * activeAttrs.length)
      activeAttrs.forEach((attr, idx) => mutate(attr, idx !== mismatchIndex))
    } else {
      activeAttrs.forEach((attr) => mutate(attr, false))
    }
  } else {
    mutate(activeAttrs[0], false)
  }

  if (matchesRule(draft, rule)) {
    const fallbackAttr = activeAttrs[activeAttrs.length - 1]
    mutate(fallbackAttr, false)
  }

  return draft
}

function buildRound(levelNumber: number) {
  const rule = buildRule(levelNumber)
  const friendSlots = new Set<number>()

  while (friendSlots.size < rule.config.friendCount) {
    friendSlots.add(Math.floor(Math.random() * rule.config.objectCount))
  }

  const baseSize = clamp(88 - levelNumber * 1.1, 52, 90)
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

  const [leaderboard, setLeaderboard] = useState<ScoreEntry[]>([])
  const [leaderboardError, setLeaderboardError] = useState<string | null>(null)
  const [isLeaderboardLoading, setIsLeaderboardLoading] = useState(false)
  const [pendingName, setPendingName] = useState('')
  const [hasSubmittedScore, setHasSubmittedScore] = useState(false)

  const deathScoreRef = useRef(0)
  const roundFriendHitsRef = useRef(0)
  const runIdRef = useRef<string>('')
  const timersRef = useRef<number[]>([])
  const expiryTimersRef = useRef(new Map<string, number>())
  const audioContextRef = useRef<AudioContext | null>(null)

  const supabase = useMemo(() => getSupabaseClient(), [])

  const clearAllTimers = useCallback(() => {
    timersRef.current.forEach((timerId) => window.clearTimeout(timerId))
    timersRef.current = []
    expiryTimersRef.current.forEach((timerId) => window.clearTimeout(timerId))
    expiryTimersRef.current.clear()
  }, [])

  useEffect(() => () => clearAllTimers(), [clearAllTimers])

  useEffect(() => {
    if (phase !== 'dead') {
      return
    }

    if (!supabase) {
      setLeaderboardError('Leaderboard unavailable: missing Supabase configuration.')
      return
    }

    let active = true
    setIsLeaderboardLoading(true)
    setLeaderboardError(null)

    const load = async () => {
      try {
        const { data, error } = await supabase
          .from('false_friend_scores')
          .select('name, total_score, rounds_cleared, created_at')
          .order('total_score', { ascending: false })
          .order('created_at', { ascending: true })
          .limit(10)

        if (!active) return

        if (error) {
          setLeaderboardError('Unable to load leaderboard right now.')
          return
        }

        const entries: ScoreEntry[] =
          data?.map((entry) => ({
            name: entry.name,
            totalScore: entry.total_score,
            roundsCleared: entry.rounds_cleared,
            date: entry.created_at,
          })) ?? []

        setLeaderboard(entries)
      } catch {
        if (!active) return
        setLeaderboardError('Unable to load leaderboard right now.')
      } finally {
        if (!active) return
        setIsLeaderboardLoading(false)
      }
    }

    void load()

    return () => {
      active = false
    }
  }, [phase, supabase])

  const getAudioContext = () => {
    if (typeof window === 'undefined') return null
    const AudioContextClass = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!AudioContextClass) return null
    const audioContext = audioContextRef.current ?? (audioContextRef.current = new AudioContextClass())
    if (audioContext.state === 'suspended') {
      audioContext.resume().catch(() => undefined)
    }
    return audioContext
  }

  const playTone = (audioContext: AudioContext, { frequency, start, duration, gain, type }: { frequency: number; start: number; duration: number; gain: number; type: OscillatorType }) => {
    const oscillator = audioContext.createOscillator()
    const gainNode = audioContext.createGain()

    oscillator.type = type
    oscillator.frequency.setValueAtTime(frequency, start)
    gainNode.gain.setValueAtTime(0.0001, start)
    gainNode.gain.exponentialRampToValueAtTime(gain, start + duration * 0.2)
    gainNode.gain.exponentialRampToValueAtTime(0.0001, start + duration)

    oscillator.connect(gainNode)
    gainNode.connect(audioContext.destination)
    oscillator.start(start)
    oscillator.stop(start + duration)
  }

  const playFriendClickSound = () => {
    const audioContext = getAudioContext()
    if (!audioContext) return
    const now = audioContext.currentTime
    playTone(audioContext, { frequency: 660, start: now, duration: 0.12, gain: 0.1, type: 'triangle' })
    playTone(audioContext, { frequency: 880, start: now + 0.11, duration: 0.17, gain: 0.12, type: 'sine' })
  }

  const playMissSound = () => {
    const audioContext = getAudioContext()
    if (!audioContext) return
    const now = audioContext.currentTime
    playTone(audioContext, { frequency: 220, start: now, duration: 0.13, gain: 0.14, type: 'square' })
  }

  const triggerDeath = useCallback(() => {
    clearAllTimers()
    setActiveObjects([])
    setPhase('dead')
    deathScoreRef.current = score

    const audioContext = getAudioContext()
    if (!audioContext) return

    const now = audioContext.currentTime
    playTone(audioContext, { frequency: 240, start: now, duration: 0.1, gain: 0.15, type: 'sawtooth' })
    playTone(audioContext, { frequency: 170, start: now + 0.09, duration: 0.11, gain: 0.15, type: 'sawtooth' })
    playTone(audioContext, { frequency: 130, start: now + 0.18, duration: 0.12, gain: 0.16, type: 'sawtooth' })
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
    if (phase !== 'playing') return

    const expiryTimer = expiryTimersRef.current.get(orb.id)
    if (expiryTimer) {
      window.clearTimeout(expiryTimer)
      expiryTimersRef.current.delete(orb.id)
    }

    setActiveObjects((current) => current.filter((item) => item.id !== orb.id))

    if (!orb.isFriend) {
      playMissSound()
      triggerDeath()
      return
    }

    const reactionMs = Math.max(0, Math.floor(performance.now() - orb.spawnedAt))
    const clickPoints = Math.max(0, 2000 - reactionMs)
    setScore((prev) => prev + clickPoints)
    setFriendsClicked((prev) => prev + 1)
    setReactionTotal((prev) => prev + reactionMs)
    playFriendClickSound()

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
    setLeaderboard([])
    setLeaderboardError(null)
    setPendingName('')
    setHasSubmittedScore(false)
    runIdRef.current =
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(16).slice(2)}`
    deathScoreRef.current = 0
    setCountdown(3)
    setPhase('countdown')

    for (let second = 3; second >= 1; second -= 1) {
      const timer = window.setTimeout(() => {
        setCountdown(second)
      }, (3 - second) * 1000)
      timersRef.current.push(timer)
    }

    const startTimer = window.setTimeout(() => showRuleThenStart(1), 3000)
    timersRef.current.push(startTimer)
  }

  const averageReaction = useMemo(() => {
    if (friendsClicked === 0) return 0
    return Math.round(reactionTotal / friendsClicked)
  }, [friendsClicked, reactionTotal])

  const qualifiesForLeaderboard = useMemo(() => {
    if (phase !== 'dead' || hasSubmittedScore || !supabase) return false
    if (leaderboard.length < 10) return true
    return leaderboard.some((entry) => deathScoreRef.current > entry.totalScore)
  }, [phase, hasSubmittedScore, leaderboard, supabase])

  const handleSubmitScore = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    if (!supabase || hasSubmittedScore || !pendingName.trim()) {
      return
    }

    const payload = {
      run_id: runIdRef.current,
      user_id: getStableUserId(),
      name: pendingName.trim().slice(0, 24),
      total_score: deathScoreRef.current,
      rounds_cleared: roundsCleared,
    }

    const { error } = await supabase.from('false_friend_scores').insert(payload)

    if (error) {
      setLeaderboardError('Unable to submit score right now.')
      return
    }

    setHasSubmittedScore(true)
    setPendingName('')
    setLeaderboard((current) =>
      [
        ...current,
        {
          name: payload.name,
          totalScore: payload.total_score,
          roundsCleared: payload.rounds_cleared,
          date: new Date().toISOString(),
        },
      ]
        .sort((a, b) => b.totalScore - a.totalScore || a.date.localeCompare(b.date))
        .slice(0, 10),
    )
  }

  return (
    <div className="false-friend">
      {(phase === 'playing' || phase === 'ruleCard') && (
        <header className="false-friend__hud">
          <span>
            Round {roundNumber} · {currentRule.config.attributes.join(' + ')} · {currentRule.config.spawnDelayMs}ms spawn
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

            {qualifiesForLeaderboard && (
              <form className="false-friend-submit" onSubmit={(event) => void handleSubmitScore(event)}>
                <label htmlFor="false-friend-name">You qualified for top 10. Enter your name:</label>
                <div className="false-friend-submit__row">
                  <input
                    id="false-friend-name"
                    type="text"
                    maxLength={24}
                    value={pendingName}
                    onChange={(event) => setPendingName(event.target.value)}
                    placeholder="Player name"
                    required
                  />
                  <button type="submit">Submit</button>
                </div>
              </form>
            )}

            <div className="false-friend-board">
              <p className="false-friend-board__title">Global leaderboard</p>
              {isLeaderboardLoading && <p>Loading leaderboard...</p>}
              {leaderboardError && <p>{leaderboardError}</p>}
              {!isLeaderboardLoading && !leaderboardError && (
                <ol>
                  {leaderboard.length === 0 && <li>No scores yet. Be the first.</li>}
                  {leaderboard.map((entry, index) => (
                    <li key={`${entry.name}-${entry.date}-${index}`}>
                      <span>#{index + 1}</span>
                      <span>{entry.name}</span>
                      <span>{entry.totalScore.toLocaleString()} pts</span>
                    </li>
                  ))}
                </ol>
              )}
            </div>

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
