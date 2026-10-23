/**
 * Pure side of the Stockfish integration: difficulty levels, the UCI commands they map to,
 * and parsing of the engine's answer. The worker plumbing lives in stockfish.ts.
 */

export type BotLevelId = "novice" | "easy" | "intermediate" | "advanced" | "expert" | "master";

export interface BotLevel {
  id: BotLevelId;
  label: string;
  /** Shown next to the label in the selector. */
  detail: string;
  /**
   * Below 1320 Elo Stockfish cannot limit itself by rating, so the two weakest levels use
   * Skill Level (0-20) plus a shallow search instead.
   */
  strength: { skill: number } | { elo: number } | "full";
  search: { depth: number } | { movetime: number };
}

export const BOT_LEVELS: readonly BotLevel[] = [
  { id: "novice", label: "Novato", detail: "regala piezas", strength: { skill: 0 }, search: { depth: 1 } },
  { id: "easy", label: "Fácil", detail: "comete errores", strength: { skill: 3 }, search: { depth: 3 } },
  { id: "intermediate", label: "Intermedio", detail: "1500 Elo", strength: { elo: 1500 }, search: { movetime: 500 } },
  { id: "advanced", label: "Avanzado", detail: "1900 Elo", strength: { elo: 1900 }, search: { movetime: 800 } },
  { id: "expert", label: "Experto", detail: "2400 Elo", strength: { elo: 2400 }, search: { movetime: 1000 } },
  { id: "master", label: "Maestro", detail: "sin límite", strength: "full", search: { movetime: 1500 } },
];

export function findBotLevel(id: string): BotLevel {
  return BOT_LEVELS.find((l) => l.id === id) ?? BOT_LEVELS[2];
}

/** Every option is set on each move so switching level mid-game never leaves stale settings. */
export function strengthCommands({ strength }: BotLevel): string[] {
  const skill = typeof strength === "object" && "skill" in strength ? strength.skill : 20;
  const elo = typeof strength === "object" && "elo" in strength ? strength.elo : null;
  return [
    `setoption name Skill Level value ${skill}`,
    `setoption name UCI_LimitStrength value ${elo !== null}`,
    ...(elo !== null ? [`setoption name UCI_Elo value ${elo}`] : []),
  ];
}

export function goCommand({ search }: BotLevel): string {
  return "depth" in search ? `go depth ${search.depth}` : `go movetime ${search.movetime}`;
}

export interface UciMove {
  from: string;
  to: string;
  promotion?: string;
}

/**
 * Parse a `bestmove e7e8q ponder ...` line. Returns null for any other line and for
 * `bestmove (none)`, which the engine sends when the side to move has no legal move.
 */
export function parseBestMove(line: string): UciMove | null {
  const match = /^bestmove ([a-h][1-8])([a-h][1-8])([qrbn])?\b/.exec(line);
  if (!match) return null;
  const [, from, to, promotion] = match;
  return promotion ? { from, to, promotion } : { from, to };
}
