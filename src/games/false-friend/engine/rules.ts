export type RuleId = 'odd-one-out'

export type RuleDefinition = {
  id: RuleId
  title: string
  description: string
}

export const RULES: RuleDefinition[] = [
  { id: 'odd-one-out', title: 'Odd one out', description: 'Click the one that is different from the others.' }
]