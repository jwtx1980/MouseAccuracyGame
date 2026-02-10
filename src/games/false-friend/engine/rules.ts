export type RuleId = 'circle' | 'notch' | 'dots'

export type TokenVisual =
  | {
      type: 'shape'
      shape: 'circle' | 'rounded-square' | 'triangle'
      hue: number
      saturation: number
      lightness: number
    }
  | {
      type: 'notch'
      hasNotch: boolean
      notchOffset: number
      hue: number
      saturation: number
      lightness: number
    }
  | {
      type: 'dots'
      dotCount: 2 | 3 | 4
      spacing: number
      hue: number
      saturation: number
      lightness: number
    }

export type RuleDefinition = {
  id: RuleId
  sentence: string
  title: string
  createFriend: (roundNumber: number, seed: number) => TokenVisual
  createFalseFriend: (roundNumber: number, seed: number) => TokenVisual
  createExample: (roundNumber: number) => { friend: TokenVisual; falseFriend: TokenVisual }
}

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max)

function seededNoise(seed: number): number {
  const x = Math.sin(seed * 999.133) * 10000
  return x - Math.floor(x)
}

function similarity(roundNumber: number): number {
  return clamp(0.35 + roundNumber * 0.09, 0.35, 0.9)
}

const circleRule: RuleDefinition = {
  id: 'circle',
  title: 'Round rule',
  sentence: 'Click the only circle.',
  createFriend: (_roundNumber, seed) => ({
    type: 'shape',
    shape: 'circle',
    hue: 190 + seededNoise(seed) * 20,
    saturation: 72,
    lightness: 58,
  }),
  createFalseFriend: (roundNumber, seed) => {
    const near = similarity(roundNumber)
    const pick = seededNoise(seed)
    return {
      type: 'shape',
      shape: pick > 0.5 ? 'rounded-square' : 'triangle',
      hue: 190 + seededNoise(seed + 1) * (35 * (1 - near) + 10),
      saturation: 65,
      lightness: 58 + seededNoise(seed + 2) * 4,
    }
  },
  createExample: (roundNumber) => ({
    friend: circleRule.createFriend(roundNumber, 11),
    falseFriend: circleRule.createFalseFriend(roundNumber, 17),
  }),
}

const notchRule: RuleDefinition = {
  id: 'notch',
  title: 'Round rule',
  sentence: 'Click the one with a top notch.',
  createFriend: (_roundNumber, seed) => ({
    type: 'notch',
    hasNotch: true,
    notchOffset: 0,
    hue: 312,
    saturation: 68,
    lightness: 60 + seededNoise(seed) * 3,
  }),
  createFalseFriend: (roundNumber, seed) => {
    const near = similarity(roundNumber)
    const withWrongNotch = seededNoise(seed) > 0.45
    return {
      type: 'notch',
      hasNotch: withWrongNotch,
      notchOffset: withWrongNotch ? (seededNoise(seed + 1) - 0.5) * 120 * near : 0,
      hue: 312 + seededNoise(seed + 2) * 12,
      saturation: 63,
      lightness: 58,
    }
  },
  createExample: (roundNumber) => ({
    friend: notchRule.createFriend(roundNumber, 23),
    falseFriend: notchRule.createFalseFriend(roundNumber, 25),
  }),
}

const dotsRule: RuleDefinition = {
  id: 'dots',
  title: 'Round rule',
  sentence: 'Click the one with exactly 3 dots.',
  createFriend: (_roundNumber, seed) => ({
    type: 'dots',
    dotCount: 3,
    spacing: 17,
    hue: 46,
    saturation: 82,
    lightness: 58 + seededNoise(seed) * 3,
  }),
  createFalseFriend: (roundNumber, seed) => {
    const near = similarity(roundNumber)
    const fourDots = seededNoise(seed) > 0.5
    return {
      type: 'dots',
      dotCount: fourDots ? 4 : 2,
      spacing: clamp(18 - roundNumber * 0.6 * near, 12, 18),
      hue: 46 + seededNoise(seed + 1) * 10,
      saturation: 78,
      lightness: 57,
    }
  },
  createExample: (roundNumber) => ({
    friend: dotsRule.createFriend(roundNumber, 31),
    falseFriend: dotsRule.createFalseFriend(roundNumber, 37),
  }),
}

export const RULES: RuleDefinition[] = [circleRule, notchRule, dotsRule]

export function getRuleForRound(roundNumber: number): RuleDefinition {
  return RULES[(roundNumber - 1) % RULES.length]
}

export function spawnDelayForRound(roundNumber: number): number {
  return clamp(760 - roundNumber * 45, 270, 760)
}
