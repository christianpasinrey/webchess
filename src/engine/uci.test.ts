import { describe, expect, it } from "vitest";
import { BOT_LEVELS, findBotLevel, goCommand, parseBestMove, strengthCommands } from "./uci";

describe("parseBestMove", () => {
  it("reads a plain move and ignores the ponder move", () => {
    expect(parseBestMove("bestmove e2e4 ponder e7e5")).toEqual({ from: "e2", to: "e4" });
  });

  it("reads a promotion", () => {
    expect(parseBestMove("bestmove a7a8q")).toEqual({ from: "a7", to: "a8", promotion: "q" });
  });

  it("returns null when there is no move or the line is not a bestmove", () => {
    expect(parseBestMove("bestmove (none)")).toBeNull();
    expect(parseBestMove("info depth 10 score cp 35 pv e2e4")).toBeNull();
    expect(parseBestMove("readyok")).toBeNull();
  });
});

describe("strengthCommands", () => {
  it("uses Skill Level without the Elo limit for the weakest levels", () => {
    expect(strengthCommands(findBotLevel("novice"))).toEqual([
      "setoption name Skill Level value 0",
      "setoption name UCI_LimitStrength value false",
    ]);
  });

  it("limits by Elo at full skill for rated levels", () => {
    expect(strengthCommands(findBotLevel("advanced"))).toEqual([
      "setoption name Skill Level value 20",
      "setoption name UCI_LimitStrength value true",
      "setoption name UCI_Elo value 1900",
    ]);
  });

  it("removes every limit at full strength", () => {
    expect(strengthCommands(findBotLevel("master"))).toEqual([
      "setoption name Skill Level value 20",
      "setoption name UCI_LimitStrength value false",
    ]);
  });

  it("keeps every Elo inside the range Stockfish accepts", () => {
    for (const level of BOT_LEVELS) {
      if (typeof level.strength === "object" && "elo" in level.strength) {
        expect(level.strength.elo).toBeGreaterThanOrEqual(1320);
        expect(level.strength.elo).toBeLessThanOrEqual(3190);
      }
    }
  });
});

describe("goCommand", () => {
  it("searches by depth or by time", () => {
    expect(goCommand(findBotLevel("novice"))).toBe("go depth 1");
    expect(goCommand(findBotLevel("expert"))).toBe("go movetime 1000");
  });
});

describe("findBotLevel", () => {
  it("falls back to intermediate for unknown ids", () => {
    expect(findBotLevel("nope").id).toBe("intermediate");
  });
});
