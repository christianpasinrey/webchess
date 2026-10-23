export type LevelId = "beginner" | "intermediate" | "advanced" | "master";

export type Effort = "low" | "medium" | "high";

export interface Level {
  id: LevelId;
  label: string;
  model: string;
  effort: Effort;
  style: string;
  /** USD per 1M tokens, used for the session cost estimate. */
  price: { input: number; output: number };
  /** Server-side refusal fallbacks (not available for Haiku). */
  fallbacks: boolean;
}

export const LEVELS: readonly Level[] = [
  {
    id: "beginner",
    label: "Principiante",
    model: "claude-haiku-5-5",
    effort: "low",
    style:
      "You are a casual beginner club player. Play natural-looking but imperfect moves; you sometimes miss tactics.",
    price: { input: 0.1, output: 0.5 },
    fallbacks: false,
  },
  {
    id: "intermediate",
    label: "Intermedio",
    model: "claude-sonnet-5-5",
    effort: "low",
    style: "You are a solid intermediate player. Avoid hanging pieces and look for simple tactics.",
    price: { input: 2, output: 10 },
    fallbacks: true,
  },
  {
    id: "advanced",
    label: "Avanzado",
    model: "claude-opus-5-5",
    effort: "medium",
    style: "You are a strong tournament player. Calculate forcing lines and play principled chess.",
    price: { input: 4, output: 20 },
    fallbacks: true,
  },
  {
    id: "master",
    label: "Maestro",
    model: "claude-opus-5-5",
    effort: "high",
    style: "You are a chess master. Calculate concrete variations carefully and choose the objectively best move.",
    price: { input: 4, output: 20 },
    fallbacks: true,
  },
];

export function findLevel(id: string): Level {
  return LEVELS.find((l) => l.id === id) ?? LEVELS[0];
}

export function estimateCost(level: Level, inputTokens: number, outputTokens: number): number {
  return (inputTokens * level.price.input + outputTokens * level.price.output) / 1_000_000;
}
