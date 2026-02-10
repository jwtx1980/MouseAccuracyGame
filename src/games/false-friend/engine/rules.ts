export type RuleId = 'circle-color' | 'notch-position' | 'dot-count'

export type RuleDefinition = {
  id: RuleId
  title: string
  description: string
  example: string
}

export type FriendVisualSpec = {
  hue: number
  notchOffsetDeg: number
  dotCount: number
}

export const RULES: RuleDefinition[] = [
  {
    id: 'circle-color',
    title: 'Rule: Blue Friend',
    description: 'Click only circles that are true blue.',
    example: 'Example: blue = friend, nearly-blue cyan = false friend.'
  },
  {
    id: 'notch-position',
    title: 'Rule: Top Notch',
    description: 'Click only circles with the notch centered at the top.',
    example: 'Example: top notch = friend, slightly off-center notch = false friend.'
  },
  {
    id: 'dot-count',
    title: 'Rule: Three Dots',
    description: 'Click only circles that contain exactly 3 inner dots.',
    example: 'Example: 3 dots = friend, 2 or 4 dots = false friend.'
  }
]

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function roundDifficulty(roundNumber: number): number {
  return clamp((roundNumber - 1) / 9, 0, 1)
}

export function ruleForRound(roundNumber: number): RuleDefinition {
  return RULES[(roundNumber - 1) % RULES.length]
}

export function createVisualSpec(
  rule: RuleDefinition,
  isFriend: boolean,
  roundNumber: number,
  random: () => number
): FriendVisualSpec {
  const diff = roundDifficulty(roundNumber)

  if (rule.id === 'circle-color') {
    const friendHue = 218 + (random() * 8 - 4)
    const falseOffset = 90 - diff * 65
    const falseSign = random() > 0.5 ? 1 : -1
    const falseHue = friendHue + falseSign * (falseOffset + random() * 14)

    return {
      hue: isFriend ? friendHue : falseHue,
      notchOffsetDeg: random() * 24 - 12,
      dotCount: 3
    }
  }

  if (rule.id === 'notch-position') {
    const friendNotch = random() * 8 - 4
    const falseOffset = 95 - diff * 80
    const falseSign = random() > 0.5 ? 1 : -1

    return {
      hue: 210 + random() * 24 - 12,
      notchOffsetDeg: isFriend ? friendNotch : friendNotch + falseSign * (falseOffset + random() * 8),
      dotCount: 3
    }
  }

  const friendDots = 3
  const closeFalseChance = 0.15 + diff * 0.7
  const falseDots = random() < closeFalseChance ? (random() > 0.5 ? 2 : 4) : (random() > 0.5 ? 1 : 5)

  return {
    hue: 210 + random() * 22 - 11,
    notchOffsetDeg: random() * 26 - 13,
    dotCount: isFriend ? friendDots : falseDots
  }
}

export function spawnIntervalMsForRound(roundNumber: number): number {
  const raw = 760 - (roundNumber - 1) * 52
  return clamp(raw, 260, 760)
}
