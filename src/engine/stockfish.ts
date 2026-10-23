import { ENGINE_DIR, ENGINE_SCRIPT } from "./files";
import { goCommand, parseBestMove, strengthCommands, type BotLevel, type UciMove } from "./uci";

const ENGINE_URL = `${import.meta.env.BASE_URL}${ENGINE_DIR}/${ENGINE_SCRIPT}`;

/** Longest a single engine answer may take before the worker is considered stuck. */
const TIMEOUT_MS = 20_000;

/**
 * Stockfish running in a Web Worker, spoken to over UCI. The worker starts on first use and
 * requests run one at a time, since UCI allows a single search per engine.
 */
export class Stockfish {
  private worker: Worker | null = null;
  private ready: Promise<Worker> | null = null;
  private queue: Promise<unknown> = Promise.resolve();
  private onLine: ((line: string) => void) | null = null;
  private onFail: ((err: Error) => void) | null = null;

  /** Best move for the position, or null when the side to move has none. */
  bestMove(fen: string, level: BotLevel): Promise<UciMove | null> {
    return this.enqueue(async () => {
      const worker = await this.start();
      for (const command of strengthCommands(level)) worker.postMessage(command);
      worker.postMessage(`position fen ${fen}`);
      return parseBestMove(await this.send(worker, goCommand(level), (line) => line.startsWith("bestmove")));
    });
  }

  /** Cut short a running search and clear the engine's memory of the previous game. */
  newGame() {
    this.worker?.postMessage("stop");
    void this.enqueue(async () => {
      if (!this.ready) return;
      const worker = await this.ready;
      worker.postMessage("ucinewgame");
      await this.send(worker, "isready", (line) => line === "readyok");
    }).catch(() => undefined);
  }

  private enqueue<T>(task: () => Promise<T>): Promise<T> {
    const run = this.queue.then(task);
    this.queue = run.catch(() => undefined);
    return run;
  }

  private start(): Promise<Worker> {
    this.ready ??= (async () => {
      const worker = new Worker(ENGINE_URL);
      this.worker = worker;
      worker.onmessage = (event: MessageEvent) => this.onLine?.(String(event.data));
      worker.onerror = (event) => {
        event.preventDefault();
        this.fail(new Error(event.message || "No se pudo cargar el motor."));
      };
      await this.send(worker, "uci", (line) => line === "uciok");
      await this.send(worker, "isready", (line) => line === "readyok");
      return worker;
    })();
    return this.ready;
  }

  /** Post a command and resolve with the first output line that `done` accepts. */
  private send(worker: Worker, command: string, done: (line: string) => boolean): Promise<string> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => this.fail(new Error("El motor no ha respondido.")), TIMEOUT_MS);
      const settle = () => {
        clearTimeout(timer);
        this.onLine = null;
        this.onFail = null;
      };
      this.onLine = (line) => {
        if (!done(line)) return;
        settle();
        resolve(line);
      };
      this.onFail = (err) => {
        settle();
        reject(err);
      };
      worker.postMessage(command);
    });
  }

  /** Reject the pending command and drop the worker; the next request starts a fresh one. */
  private fail(err: Error) {
    this.onFail?.(err);
    this.worker?.terminate();
    this.worker = null;
    this.ready = null;
  }
}
