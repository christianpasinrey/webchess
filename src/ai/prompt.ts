import type { Chess } from "chess.js";

/** JSON schema the model must answer with (structured outputs). */
export const MOVE_SCHEMA = {
  type: "object",
  properties: {
    move: { type: "string", description: "Your move in SAN, copied exactly from the legal moves list" },
    comment: { type: "string", description: "One short sentence about the idea behind the move, in Spanish" },
  },
  required: ["move", "comment"],
  additionalProperties: false,
} as const;

export interface MoveReply {
  move: string;
  comment: string;
}

/** 8x8 matrix, rank 8 first. Uppercase = white, lowercase = black, "." = empty. */
export function boardMatrix(game: Chess): string {
  const rows = game.board().map((row, i) => {
    const cells = row.map((sq) => (sq ? (sq.color === "w" ? sq.type.toUpperCase() : sq.type) : "."));
    return `${8 - i} ${cells.join(" ")}`;
  });
  return [...rows, "  a b c d e f g h"].join("\n");
}

/**
 * Stateless prompt: only the current position is sent each turn, never the game history,
 * which keeps every move cheap.
 */
export function buildPrompt(
  game: Chess,
  legal: readonly string[],
  lastMove: string | null,
  error: string | null,
): string {
  const side = game.turn() === "w" ? "White" : "Black";
  return [
    `You play ${side}. Board (rank 8 at top; uppercase = White, lowercase = Black, "." = empty):`,
    boardMatrix(game),
    `FEN: ${game.fen()}`,
    lastMove ? `Opponent's last move: ${lastMove}` : "",
    `Legal moves: ${legal.join(" ")}`,
    error ? `Your previous answer was invalid (${error}). Pick a move from the legal moves list.` : "",
    "Choose your move.",
  ]
    .filter(Boolean)
    .join("\n");
}

/** Parse the model's JSON reply; throws on malformed output. */
export function parseReply(text: string): MoveReply {
  const data: unknown = JSON.parse(text);
  if (
    typeof data !== "object" ||
    data === null ||
    typeof (data as MoveReply).move !== "string" ||
    typeof (data as MoveReply).comment !== "string"
  ) {
    throw new Error("reply does not match the schema");
  }
  return data as MoveReply;
}

/** Find the legal SAN the model meant, tolerating missing check marks or annotations like "Nf3!". */
export function resolveMove(legal: readonly string[], move: string): string | undefined {
  const exact = move.trim();
  if (legal.includes(exact)) return exact;
  const strip = (m: string) => m.replace(/[+#!?]/g, "").trim();
  const target = strip(exact);
  return legal.find((m) => strip(m) === target);
}
