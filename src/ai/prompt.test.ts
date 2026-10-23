import { Chess } from "chess.js";
import { describe, expect, it } from "vitest";
import { boardMatrix, buildPrompt, parseReply, resolveMove } from "./prompt";

describe("boardMatrix", () => {
  it("renders the start position with rank 8 on top", () => {
    const rows = boardMatrix(new Chess()).split("\n");
    expect(rows[0]).toBe("8 r n b q k b n r");
    expect(rows[4]).toBe("4 . . . . . . . .");
    expect(rows[7]).toBe("1 R N B Q K B N R");
    expect(rows[8]).toBe("  a b c d e f g h");
  });
});

describe("buildPrompt", () => {
  it("includes side, FEN, last move and legal moves", () => {
    const game = new Chess();
    game.move("e4");
    const prompt = buildPrompt(game, game.moves(), "e4", null);
    expect(prompt).toContain("You play Black");
    expect(prompt).toContain(`FEN: ${game.fen()}`);
    expect(prompt).toContain("Opponent's last move: e4");
    expect(prompt).toContain("Legal moves: ");
    expect(prompt).not.toContain("invalid");
  });

  it("tells the model why the previous answer was rejected", () => {
    const game = new Chess();
    expect(buildPrompt(game, game.moves(), null, '"Ke5" is not a legal move')).toContain(
      'Your previous answer was invalid ("Ke5" is not a legal move)',
    );
  });
});

describe("parseReply", () => {
  it("accepts a reply matching the schema", () => {
    expect(parseReply('{"move":"Nf3","comment":"Desarrollo."}')).toEqual({ move: "Nf3", comment: "Desarrollo." });
  });

  it("rejects malformed JSON and wrong shapes", () => {
    expect(() => parseReply("Nf3")).toThrow();
    expect(() => parseReply('{"move":3,"comment":"x"}')).toThrow();
    expect(() => parseReply("null")).toThrow();
  });
});

describe("resolveMove", () => {
  const legal = ["e4", "Nf3", "Qxf7#", "exd8=Q+"];

  it("matches exact SAN", () => {
    expect(resolveMove(legal, "Nf3")).toBe("Nf3");
  });

  it("tolerates whitespace, annotations and missing check marks", () => {
    expect(resolveMove(legal, " Nf3! ")).toBe("Nf3");
    expect(resolveMove(legal, "Qxf7")).toBe("Qxf7#");
    expect(resolveMove(legal, "exd8=Q")).toBe("exd8=Q+");
  });

  it("returns undefined for illegal moves", () => {
    expect(resolveMove(legal, "Ke2")).toBeUndefined();
  });
});
