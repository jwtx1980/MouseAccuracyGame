import type { FormEvent } from 'react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { getSupabaseClient } from './lib/supabase'
import './App.css'

type Screen = 'start' | 'game' | 'results' | 'scores'

const DURATION_OPTIONS = [10, 20, 30, 60] as const
type DurationOption = (typeof DURATION_OPTIONS)[number]

type TargetSizePreset = {
  id: string
  label: string
  size: number
}

type DifficultyPreset = {
  id: string
  label: string
  description: string
  spawnRateMs: number
  maxTargets: number
  lifetimeMs: number
}

type Settings = {
  duration: DurationOption
  targetSizeId: string
  difficultyId: string
}

type Target = {
  id: string
  x: number
  y: number
  createdAt: number
  expiresAt: number
}

type PopEffect = {
  id: string
  x: number
  y: number
  size: number
}

type ScoreEntry = {
  name: string
  score: number
  accuracy: number
  cps: number
  date: string
}


const TARGET_SIZE_PRESETS: TargetSizePreset[] = [
  { id: 'precision', label: 'Precision (26px)', size: 26 },
  { id: 'balanced', label: 'Balanced (34px)', size: 34 },
  { id: 'steady', label: 'Steady (44px)', size: 44 },
  { id: 'comfort', label: 'Comfort (54px)', size: 54 },
]

const DIFFICULTY_PRESETS: DifficultyPreset[] = [
  {
    id: 'calm',
    label: 'Calm',
    description: 'Slow spawns with longer target life.',
    spawnRateMs: 900,
    maxTargets: 3,
    lifetimeMs: 1800,
  },
  {
    id: 'focused',
    label: 'Focused',
    description: 'Balanced spawn cadence and target life.',
    spawnRateMs: 650,
    maxTargets: 4,
    lifetimeMs: 1800,
  },
  {
    id: 'rapid',
    label: 'Rapid',
    description: 'Fast spawns with quick reactions required.',
    spawnRateMs: 420,
    maxTargets: 5,
    lifetimeMs: 1100,
  },
  {
    id: 'blitz',
    label: 'Blitz',
    description: 'Maximum chaos with tight lifetimes.',
    spawnRateMs: 300,
    maxTargets: 6,
    lifetimeMs: 900,
  },
]

const getDefaultSettings = (): Settings => ({
  duration: 30,
  targetSizeId: 'balanced',
  difficultyId: 'focused',
})

const buildScoreKey = (settings: Settings) =>
  `${settings.duration}s|${settings.targetSizeId}|${settings.difficultyId}`

const formatPercent = (value: number) => `${value.toFixed(1)}%`

const formatNumber = (value: number, digits = 1) => value.toFixed(digits)

function App() {
  const [screen, setScreen] = useState<Screen>('start')
  const [settings, setSettings] = useState<Settings>(getDefaultSettings)
  const [targets, setTargets] = useState<Target[]>([])
  const [timeLeft, setTimeLeft] = useState<number>(settings.duration)
  const [hits, setHits] = useState(0)
  const [misses, setMisses] = useState(0)
  const [totalClicks, setTotalClicks] = useState(0)
  const [reactionTimes, setReactionTimes] = useState<number[]>([])
  const [pendingName, setPendingName] = useState('')
  const [scores, setScores] = useState<Record<string, ScoreEntry[]>>({})
  const [scoresError, setScoresError] = useState<string | null>(null)
  const [isScoresLoading, setIsScoresLoading] = useState(false)
  const [qualifiedForScore, setQualifiedForScore] = useState(false)
  const [popEffects, setPopEffects] = useState<PopEffect[]>([])

  const boardRef = useRef<HTMLDivElement | null>(null)
  const spawnTimeout = useRef<number | null>(null)
  const lifetimeInterval = useRef<number | null>(null)
  const timerInterval = useRef<number | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const supabase = useMemo(() => getSupabaseClient(), [])

  const targetSize = useMemo(
    () => TARGET_SIZE_PRESETS.find((preset) => preset.id === settings.targetSizeId),
    [settings.targetSizeId]
  )

  const difficulty = useMemo(
    () => DIFFICULTY_PRESETS.find((preset) => preset.id === settings.difficultyId),
    [settings.difficultyId]
  )

  useEffect(() => {
    setTimeLeft(settings.duration)
  }, [settings.duration])

  useEffect(() => {
    return () => {
      if (spawnTimeout.current) window.clearTimeout(spawnTimeout.current)
      if (lifetimeInterval.current) window.clearInterval(lifetimeInterval.current)
      if (timerInterval.current) window.clearInterval(timerInterval.current)
    }
  }, [])

  const resetGameState = () => {
    setTargets([])
    setHits(0)
    setMisses(0)
    setTotalClicks(0)
    setReactionTimes([])
    setTimeLeft(settings.duration)
    setQualifiedForScore(false)
    setPendingName('')
  }

  const score = Math.max(0, hits * 10 - misses * 2)
  const accuracy = totalClicks ? (hits / totalClicks) * 100 : 0
  const clicksPerSecond = settings.duration ? totalClicks / settings.duration : 0
  const avgReactionTime = reactionTimes.length
    ? reactionTimes.reduce((sum, value) => sum + value, 0) / reactionTimes.length
    : 0

  const activeScoreKey = buildScoreKey(settings)
  const activeScores = scores[activeScoreKey] ?? []

  const checkQualification = (nextScore: number) => {
    const currentScores = scores[activeScoreKey] ?? []
    if (currentScores.length < 10) return true
    return currentScores.some((entry) => nextScore > entry.score)
  }

  useEffect(() => {
    if (!supabase) {
      setScoresError('Leaderboard unavailable: missing Supabase configuration.')
      return
    }
    let isActive = true
    setIsScoresLoading(true)
    setScoresError(null)
    supabase
      .from('leaderboard')
      .select('name, score, accuracy, cps, created_at')
      .eq('settings_key', activeScoreKey)
      .order('score', { ascending: false })
      .limit(10)
      .then(({ data, error }) => {
        if (!isActive) return
        if (error) {
          setScoresError('Unable to load leaderboard right now.')
          return
        }
        const entries =
          data?.map((row) => ({
            name: row.name,
            score: row.score,
            accuracy: row.accuracy,
            cps: row.cps,
            date: row.created_at,
          })) ?? []
        setScores((current) => ({ ...current, [activeScoreKey]: entries }))
      })
      .catch(() => {
        if (!isActive) return
        setScoresError('Unable to load leaderboard right now.')
      })
      .finally(() => {
        if (!isActive) return
        setIsScoresLoading(false)
      })

    return () => {
      isActive = false
    }
  }, [activeScoreKey, supabase])

  const handleStartGame = () => {
    resetGameState()
    setScreen('game')
    window.setTimeout(() => {
      startTimer()
      startTargetLoop()
      startLifetimeCleanup()
    }, 0)
  }

  const handleExitGame = () => {
    stopAllLoops()
    setScreen('start')
  }

  const stopAllLoops = () => {
    if (spawnTimeout.current) window.clearTimeout(spawnTimeout.current)
    if (lifetimeInterval.current) window.clearInterval(lifetimeInterval.current)
    if (timerInterval.current) window.clearInterval(timerInterval.current)
  }

  const endGame = () => {
    stopAllLoops()
    const qualified = checkQualification(score)
    setQualifiedForScore(qualified)
    setScreen('results')
  }

  const startTimer = () => {
    setTimeLeft(settings.duration)
    const startedAt = Date.now()
    timerInterval.current = window.setInterval(() => {
      const elapsed = (Date.now() - startedAt) / 1000
      const remaining = Math.max(0, settings.duration - Math.floor(elapsed))
      setTimeLeft(remaining)
      if (remaining <= 0) {
        endGame()
      }
    }, 200)
  }

  const startTargetLoop = () => {
    if (!difficulty || !targetSize) return
    const spawn = () => {
      setTargets((current) => {
        if (!boardRef.current) return current
        if (current.length >= difficulty.maxTargets) return current
        const board = boardRef.current.getBoundingClientRect()
        const padding = 12
        const maxX = board.width - targetSize.size - padding
        const maxY = board.height - targetSize.size - padding
        const x = Math.max(padding, Math.random() * maxX)
        const y = Math.max(padding, Math.random() * maxY)
        const now = Date.now()
        return [
          ...current,
          {
            id: `${now}-${Math.random().toString(16).slice(2)}`,
            x,
            y,
            createdAt: now,
            expiresAt: now + difficulty.lifetimeMs,
          },
        ]
      })

      spawnTimeout.current = window.setTimeout(spawn, difficulty.spawnRateMs)
    }

    spawn()
  }

  const startLifetimeCleanup = () => {
    if (!difficulty) return
    lifetimeInterval.current = window.setInterval(() => {
      const now = Date.now()
      setTargets((current) => {
        const expired = current.filter((target) => target.expiresAt <= now)
        if (expired.length) {
          setMisses((prev) => prev + expired.length)
          setTotalClicks((prev) => prev + expired.length)
        }
        return current.filter((target) => target.expiresAt > now)
      })
    }, 120)
  }

  const handleBoardClick = () => {
    setMisses((prev) => prev + 1)
    setTotalClicks((prev) => prev + 1)
  }

  const handleTargetClick = (targetId: string, createdAt: number) => {
    const hitTarget = targets.find((target) => target.id === targetId)
    setTargets((current) => current.filter((target) => target.id !== targetId))
    setHits((prev) => prev + 1)
    setTotalClicks((prev) => prev + 1)
    setReactionTimes((prev) => [...prev, Date.now() - createdAt])
    if (hitTarget && targetSize) {
      triggerPopEffect(hitTarget.x, hitTarget.y, targetSize.size)
    }
    playPopSound()
  }

  const triggerPopEffect = (x: number, y: number, size: number) => {
    const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`
    const effect: PopEffect = { id, x, y, size }
    setPopEffects((current) => [...current, effect])
    window.setTimeout(() => {
      setPopEffects((current) => current.filter((item) => item.id !== id))
    }, 280)
  }

  const playPopSound = () => {
    if (typeof window === 'undefined') return
    const AudioContextClass = window.AudioContext || (window as typeof window & {
      webkitAudioContext?: typeof AudioContext
    }).webkitAudioContext
    if (!AudioContextClass) return
    const audioContext =
      audioContextRef.current ?? (audioContextRef.current = new AudioContextClass())
    if (audioContext.state === 'suspended') {
      audioContext.resume().catch(() => undefined)
    }
    const oscillator = audioContext.createOscillator()
    const gainNode = audioContext.createGain()
    oscillator.type = 'triangle'
    oscillator.frequency.value = 520
    gainNode.gain.value = 0.0001
    oscillator.connect(gainNode)
    gainNode.connect(audioContext.destination)
    const now = audioContext.currentTime
    gainNode.gain.exponentialRampToValueAtTime(0.12, now + 0.015)
    gainNode.gain.exponentialRampToValueAtTime(0.0001, now + 0.18)
    oscillator.start(now)
    oscillator.stop(now + 0.2)
  }

  const handleSubmitScore = (event: FormEvent) => {
    event.preventDefault()
    const trimmedName = pendingName.trim()
    if (!trimmedName) return
    if (!supabase) {
      setScoresError('Leaderboard unavailable: missing Supabase configuration.')
      return
    }
    const entry: ScoreEntry = {
      name: trimmedName,
      score,
      accuracy,
      cps: clicksPerSecond,
      date: new Date().toISOString(),
    }
    supabase
      .from('leaderboard')
      .insert({
        settings_key: activeScoreKey,
        name: entry.name,
        score: entry.score,
        accuracy: entry.accuracy,
        cps: entry.cps,
      })
      .then(({ error }) => {
        if (error) {
          setScoresError('Unable to save your score right now.')
          return
        }
        setScores((current) => ({
          ...current,
          [activeScoreKey]: [...(current[activeScoreKey] ?? []), entry]
            .sort((a, b) => b.score - a.score)
            .slice(0, 10),
        }))
        setQualifiedForScore(false)
        setPendingName('')
      })
      .catch(() => {
        setScoresError('Unable to save your score right now.')
      })
  }

  const selectedDurationLabel = `${settings.duration}s`
  const selectedTargetLabel = targetSize?.label ?? 'Target'
  const selectedDifficultyLabel = difficulty?.label ?? 'Difficulty'

  const formatDate = (isoDate: string) =>
    new Date(isoDate).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    })

  return (
    <div className="app">
      <header className="app__header">
        <div>
          <p className="app__eyebrow">Mouse Accuracy Lab</p>
          <h1>Click Cadence</h1>
          <p className="app__subtitle">
            Tune your aim, pace, and focus. Hit the targets before they fade.
          </p>
        </div>
        <div className="app__header-actions">
          <button
            type="button"
            className={`ghost-button ${screen === 'start' ? 'is-active' : ''}`}
            onClick={() => setScreen('start')}
          >
            Start
          </button>
          <button
            type="button"
            className={`ghost-button ${screen === 'scores' ? 'is-active' : ''}`}
            onClick={() => setScreen('scores')}
          >
            High Scores
          </button>
        </div>
      </header>

      {screen === 'start' && (
        <section className="panel">
          <div className="panel__content">
            <div className="settings">
              <div className="settings__group">
                <h2>Session length</h2>
                <div className="settings__options">
                  {DURATION_OPTIONS.map((option) => (
                    <button
                      key={option}
                      type="button"
                      className={`chip ${settings.duration === option ? 'is-selected' : ''}`}
                      onClick={() =>
                        setSettings((current) => ({ ...current, duration: option }))
                      }
                    >
                      {option}s
                    </button>
                  ))}
                </div>
              </div>
              <div className="settings__group">
                <h2>Target size</h2>
                <div className="settings__options">
                  {TARGET_SIZE_PRESETS.map((preset) => (
                    <button
                      key={preset.id}
                      type="button"
                      className={`chip ${settings.targetSizeId === preset.id ? 'is-selected' : ''}`}
                      onClick={() =>
                        setSettings((current) => ({ ...current, targetSizeId: preset.id }))
                      }
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="settings__group">
                <h2>Difficulty</h2>
                <div className="settings__options settings__options--cards">
                  {DIFFICULTY_PRESETS.map((preset) => (
                    <button
                      key={preset.id}
                      type="button"
                      className={`card-option ${
                        settings.difficultyId === preset.id ? 'is-selected' : ''
                      }`}
                      onClick={() =>
                        setSettings((current) => ({ ...current, difficultyId: preset.id }))
                      }
                    >
                      <span className="card-option__title">{preset.label}</span>
                      <span className="card-option__desc">{preset.description}</span>
                      <span className="card-option__meta">
                        {preset.spawnRateMs}ms spawn · max {preset.maxTargets} ·{' '}
                        {preset.lifetimeMs}ms life
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div className="panel__actions">
              <div className="panel__summary">
                <h3>Ready to play?</h3>
                <p>
                  {selectedDurationLabel} · {selectedTargetLabel} ·{' '}
                  {selectedDifficultyLabel}
                </p>
              </div>
              <button type="button" className="primary-button" onClick={handleStartGame}>
                Start round
              </button>
            </div>
          </div>
        </section>
      )}

      {screen === 'game' && (
        <section className="game">
          <div className="game__hud">
            <div className="hud-card">
              <span>Time</span>
              <strong>{timeLeft}s</strong>
            </div>
            <div className="hud-card">
              <span>Score</span>
              <strong>{score}</strong>
            </div>
            <div className="hud-card">
              <span>Hits</span>
              <strong>{hits}</strong>
            </div>
            <div className="hud-card">
              <span>Misses</span>
              <strong>{misses}</strong>
            </div>
          </div>
          <div className="game__board" ref={boardRef} onClick={handleBoardClick}>
            {targets.map((target) => (
              <button
                key={target.id}
                type="button"
                className="target"
                style={{
                  width: targetSize?.size,
                  height: targetSize?.size,
                  left: target.x,
                  top: target.y,
                  animationDuration: `${difficulty?.lifetimeMs ?? 1000}ms`,
                }}
                onClick={(event) => {
                  event.stopPropagation()
                  handleTargetClick(target.id, target.createdAt)
                }}
                aria-label="Hit target"
              />
            ))}
            {popEffects.map((effect) => (
              <span
                key={effect.id}
                className="target-pop"
                style={{
                  width: effect.size,
                  height: effect.size,
                  left: effect.x,
                  top: effect.y,
                }}
                aria-hidden="true"
              />
            ))}
          </div>
          <div className="game__footer">
            <div className="game__summary">
              <span>Clicks/sec: {formatNumber(clicksPerSecond)}</span>
              <span>Accuracy: {formatPercent(accuracy)}</span>
              <span>
                Avg reaction: {avgReactionTime ? `${formatNumber(avgReactionTime, 0)}ms` : '--'}
              </span>
            </div>
            <button type="button" className="ghost-button" onClick={handleExitGame}>
              End round
            </button>
          </div>
        </section>
      )}

      {screen === 'results' && (
        <section className="panel">
          <div className="panel__content">
            <div className="results">
              <div className="results__header">
                <h2>Round results</h2>
                <p>
                  {selectedDurationLabel} · {selectedTargetLabel} ·{' '}
                  {selectedDifficultyLabel}
                </p>
              </div>
              <div className="results__stats">
                <div className="stat-card">
                  <span>Score</span>
                  <strong>{score}</strong>
                </div>
                <div className="stat-card">
                  <span>Hits</span>
                  <strong>{hits}</strong>
                </div>
                <div className="stat-card">
                  <span>Misses</span>
                  <strong>{misses}</strong>
                </div>
                <div className="stat-card">
                  <span>Accuracy</span>
                  <strong>{formatPercent(accuracy)}</strong>
                </div>
                <div className="stat-card">
                  <span>Clicks/sec</span>
                  <strong>{formatNumber(clicksPerSecond)}</strong>
                </div>
                <div className="stat-card">
                  <span>Avg reaction</span>
                  <strong>
                    {avgReactionTime ? `${formatNumber(avgReactionTime, 0)}ms` : '--'}
                  </strong>
                </div>
              </div>
            </div>
            {qualifiedForScore && (
              <form className="score-form" onSubmit={handleSubmitScore}>
                <div>
                  <h3>New high score!</h3>
                  <p>Enter your name to save it to this setting combo.</p>
                </div>
                <div className="score-form__fields">
                  <input
                    type="text"
                    placeholder="Name"
                    value={pendingName}
                    onChange={(event) => setPendingName(event.target.value)}
                    maxLength={16}
                  />
                  <button type="submit" className="primary-button">
                    Save score
                  </button>
                </div>
              </form>
            )}
            {scoresError && <p className="scores__error">{scoresError}</p>}
            <div className="panel__actions">
              <button type="button" className="ghost-button" onClick={handleStartGame}>
                Play again
              </button>
              <button type="button" className="ghost-button" onClick={() => setScreen('scores')}>
                View high scores
              </button>
              <button type="button" className="primary-button" onClick={() => setScreen('start')}>
                Change settings
              </button>
            </div>
          </div>
        </section>
      )}

      {screen === 'scores' && (
        <section className="panel">
          <div className="panel__content">
            <div className="scores">
              <div className="scores__header">
                <h2>High scores</h2>
                <p>
                  Showing top 10 for {selectedDurationLabel} · {selectedTargetLabel} ·{' '}
                  {selectedDifficultyLabel}
                </p>
              </div>
              <div className="scores__table">
                <div className="scores__row scores__row--head">
                  <span>Name</span>
                  <span>Score</span>
                  <span>Accuracy</span>
                  <span>Clicks/sec</span>
                  <span>Date</span>
                </div>
                {isScoresLoading && (
                  <div className="scores__row scores__row--empty">
                    <span>Loading leaderboard...</span>
                  </div>
                )}
                {!isScoresLoading && activeScores.length === 0 && (
                  <div className="scores__row scores__row--empty">
                    <span>No scores yet. Be the first!</span>
                  </div>
                )}
                {activeScores.map((entry, index) => (
                  <div key={`${entry.name}-${entry.date}-${index}`} className="scores__row">
                    <span>{entry.name}</span>
                    <span>{entry.score}</span>
                    <span>{formatPercent(entry.accuracy)}</span>
                    <span>{formatNumber(entry.cps)}</span>
                    <span>{formatDate(entry.date)}</span>
                  </div>
                ))}
              </div>
              <div className="scores__footer">
                <button type="button" className="primary-button" onClick={() => setScreen('start')}>
                  Back to settings
                </button>
              </div>
            </div>
          </div>
        </section>
      )}
    </div>
  )
}

export default App
