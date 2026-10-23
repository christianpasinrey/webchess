import { Chess, type Color, type Move, type Square } from "chess.js";
import { describeError, requestMove } from "../ai/client";
import type { Board3D } from "../scene/board3d";
import type { Hud } from "../ui/hud";
import { kingInCheck, movePairs, resolveClick, statusText } from "./rules";

/** Owns the game state and wires player input, the AI and the views together. */
export class GameController {
  private game = new Chess();
  private player: Color = "w";
  private selected: Square | null = null;
  private lastMove: { from: string; to: string } | null = null;
  private thinking = false;
  /** Bumped on every new game so a reply that arrives for an abandoned game is dropped. */
  private gameId = 0;
  private totalCost = 0;
  private totalTokens = 0;
  private board: Board3D;
  private hud: Hud;

  constructor(board: Board3D, hud: Hud) {
    this.board = board;
    this.hud = hud;
  }

  start() {
    this.board.setPosition(this.game);
    this.render();
  }

  newGame() {
    this.game.reset();
    this.gameId++;
    this.thinking = false;
    this.player = this.hud.playerColor;
    this.selected = null;
    this.lastMove = null;
    this.hud.setComment("");
    this.board.setOrientation(this.player);
    this.board.setPosition(this.game);
    this.render();
    void this.maybeAiMove();
  }

  undo() {
    if (this.thinking) return;
    this.game.undo();
    if (this.game.turn() !== this.player) this.game.undo();
    const prev = this.game.history({ verbose: true }).at(-1);
    this.lastMove = prev ? { from: prev.from, to: prev.to } : null;
    this.selected = null;
    this.board.setPosition(this.game);
    this.render();
  }

  onCredentialsChange() {
    if (!this.thinking) void this.maybeAiMove();
  }

  onSquareClick(square: Square) {
    if (this.thinking || this.game.isGameOver() || this.game.turn() !== this.player) return;
    const result = resolveClick(this.game, this.player, this.selected, square);
    if (result.kind === "move") {
      this.play(this.game.move({ from: result.move.from, to: result.move.to, promotion: result.move.promotion }));
      this.selected = null;
      this.render();
      void this.maybeAiMove();
      return;
    }
    this.selected = result.square;
    this.render();
  }

  private play(move: Move) {
    this.lastMove = { from: move.from, to: move.to };
    this.board.animateMove(move);
  }

  private async maybeAiMove() {
    if (this.game.isGameOver() || this.game.turn() === this.player) return;
    const credentials = this.hud.credentials;
    if (!credentials) {
      this.hud.setStatus("Pon tu API key para que juegue la IA.", false);
      this.hud.requestCredentials();
      return;
    }
    this.thinking = true;
    this.render();
    const level = this.hud.level;
    const gameId = this.gameId;
    try {
      const result = await requestMove(credentials, level, this.game, this.game.history().at(-1) ?? null);
      // The tokens were spent even if the game was abandoned meanwhile.
      this.totalCost += result.cost;
      this.totalTokens += result.inputTokens + result.outputTokens;
      if (gameId !== this.gameId) return;
      this.play(this.game.move(result.move));
      this.hud.setComment(`${level.label}: ${result.comment}`);
    } catch (err) {
      if (gameId === this.gameId) this.hud.setComment(`Error: ${describeError(err)}`);
    } finally {
      if (gameId === this.gameId) this.thinking = false;
      this.render();
    }
  }

  private render() {
    this.board.setHighlights({
      selected: this.selected,
      targets: this.selected ? this.game.moves({ square: this.selected, verbose: true }).map((m) => m.to) : [],
      lastMove: this.lastMove,
      check: kingInCheck(this.game),
      thinking: this.thinking,
    });
    this.hud.setStatus(statusText(this.game, this.player, this.thinking), this.thinking);
    this.hud.setHistory(movePairs(this.game.history()));
    this.hud.setCost(this.totalTokens, this.totalCost);
  }
}
