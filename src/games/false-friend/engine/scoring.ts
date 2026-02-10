export const TTL_MS = 2000
export const FALSE_FRIEND_EXPIRE_BONUS = 10

export function scoreFriendClick(reactionMs: number): number {
  return Math.max(0, TTL_MS - reactionMs)
}

export function roundClearBonus(roundNumber: number): number {
  return Math.floor(500 * Math.pow(roundNumber, 1.2))
}
