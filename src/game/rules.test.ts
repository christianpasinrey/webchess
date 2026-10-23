import { Chess } from "chess.js";
import { describe, expect, it } from "vitest";
import { kingInCheck, movePairs, resolveClick, statusText } from "./rules";

describe("resolveClick", () => {
  it("selects own pieces and ignores empty or enemy squares", () => {
    const game = new Chess();
    expect(resolveClick(game, "w", null, "e2")).toEqual({ kind: "select", square: "e2" });
    expect(resolveClick(game, "w", null, "e4")).toEqual({ kind: "select", square: null });
    expect(resolveClick(game, "w", null, "e7")).toEqual({ kind: "select", square: null });
  });

  it("moves the selected piece to a legal target", () => {
    const result = resolveClick(new Chess(), "w", "e2", "e4");
    expect(result.kind).toBe("move");
    if (result.kind === "move") expect(result.move.san).toBe("e4");
  });

  it("castles when the king is selected and the own rook is clicked", () => {
    const game = new Chess("r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1");
    const kingside = resolveClick(game, "w", "e1", "h1");
    const queenside = resolveClick(game, "w", "e1", "a1");
    expect(kingside.kind === "move" && kingside.move.san).toBe("O-O");
    expect(queenside.kind === "move" && queenside.move.san).toBe("O-O-O");
  });

  it("promotes to a queen", () => {
    const game = new Chess("8/P6k/8/8/8/8/8/K7 w - - 0 1");
    const result = resolveClick(game, "w", "a7", "a8");
    expect(result.kind === "move" && result.move.promotion).toBe("q");
  });
});

describe("kingInCheck", () => {
  it("finds the checked king", () => {
    const game = new Chess("4k3/8/8/8/8/8/8/4R1K1 b - - 0 1");
    expect(kingInCheck(game)).toBe("e8");
    expect(kingInCheck(new Chess())).toBeNull();
  });
});

describe("statusText", () => {
  it("reports turns, thinking and mate", () => {
    const game = new Chess();
    expect(statusText(game, "w", false, "Claude")).toBe("Tu turno");
    expect(statusText(game, "b", true, "Claude")).toBe("Claude está pensando…");
    const mated = new Chess("7k/6Q1/6K1/8/8/8/8/8 b - - 0 1");
    expect(statusText(mated, "w", false, "Claude")).toBe("¡Jaque mate! Ganas tú.");
  });

  it("names the opponent that is playing", () => {
    expect(statusText(new Chess(), "b", false, "Stockfish")).toBe("Turno de Stockfish");
    const mated = new Chess("7k/6Q1/6K1/8/8/8/8/8 b - - 0 1");
    expect(statusText(mated, "b", false, "Stockfish")).toBe("Jaque mate. Gana Stockfish.");
  });
});

describe("movePairs", () => {
  it("groups plies into numbered pairs", () => {
    expect(movePairs(["e4", "e5", "Nf3"])).toEqual(["e4  e5", "Nf3"]);
  });
});
