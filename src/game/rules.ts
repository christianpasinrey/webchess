import type { Chess, Color, Move, Square } from "chess.js";

export type ClickResult = { kind: "move"; move: Move } | { kind: "select"; square: Square | null };

/**
 * Decide what a click on `square` means for the player, given the current selection.
 * Clicking the own rook while the king is selected castles to that side.
 */
export function resolveClick(game: Chess, player: Color, selected: Square | null, square: Square): ClickResult {
  const piece = game.get(square);
  if (selected) {
    const moves = game.moves({ square: selected, verbose: true });
    const castleFlag = piece?.type === "r" && piece.color === player ? (square[0] === "h" ? "k" : "q") : null;
    const move = moves.find(
      (m) => m.to === square || (castleFlag !== null && m.piece === "k" && m.flags.includes(castleFlag)),
    );
    // Several promotion moves share a target; prefer the queen.
    if (move) return { kind: "move", move: moves.find((m) => m.to === move.to && m.promotion === "q") ?? move };
  }
  return { kind: "select", square: piece && piece.color === player ? square : null };
}

export function kingInCheck(game: Chess): Square | null {
  if (!game.isCheck()) return null;
  for (const row of game.board()) {
    for (const sq of row) if (sq?.type === "k" && sq.color === game.turn()) return sq.square;
  }
  return null;
}

export function statusText(game: Chess, player: Color, thinking: boolean): string {
  if (game.isCheckmate()) return game.turn() === player ? "Jaque mate. Gana Claude." : "¡Jaque mate! Ganas tú.";
  if (game.isDraw()) return "Tablas.";
  if (thinking) return "Claude está pensando…";
  const check = game.isCheck() ? " (jaque)" : "";
  return (game.turn() === player ? "Tu turno" : "Turno de Claude") + check;
}

/** SAN history grouped into numbered move pairs: ["e4  e5", "Nf3  Nc6", ...]. */
export function movePairs(history: readonly string[]): string[] {
  const pairs: string[] = [];
  for (let i = 0; i < history.length; i += 2) {
    pairs.push(history[i + 1] ? `${history[i]}  ${history[i + 1]}` : history[i]);
  }
  return pairs;
}
