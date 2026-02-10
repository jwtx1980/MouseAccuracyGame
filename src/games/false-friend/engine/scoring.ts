export const OBJECT_VISIBLE_MS = 2000
export const ROUND_OBJECT_COUNT = 20
export const FRIENDS_PER_ROUND = 4
export const FALSE_EXPIRE_BONUS = 10

export function scoreFriendClick(reactionMs: number): number {
  return Math.max(0, OBJECT_VISIBLE_MS - reactionMs)
}

export function roundClearBonus(roundNumber: number): number {
  return Math.floor(500 * Math.pow(roundNumber, 1.2))
}
