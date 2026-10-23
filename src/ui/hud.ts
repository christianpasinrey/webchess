import type { Color } from "chess.js";
import { LEVELS, findLevel, type Level } from "../ai/levels";
import type { Credentials } from "../ai/client";
import { BOT_LEVELS, findBotLevel, type BotLevel } from "../engine/uci";
import { loadCredentials, loadPreference, saveCredentials, savePreference } from "./storage";

export type Opponent = "claude" | "bot";

const TEMPLATE = /* html */ `
  <div id="stage" class="stage">
    <div id="loading" class="loading">Cargando tablero…</div>
  </div>
  <div class="hud">
    <header>
      <h1>WebChess</h1>
      <div id="status" class="status" role="status" aria-live="polite"></div>
    </header>
    <div class="toolbar">
      <div class="panel opponent" role="group" aria-label="Rival">
        <button type="button" data-opponent="claude">vs Claude</button>
        <button type="button" data-opponent="bot">vs BOT</button>
      </div>
      <details id="settings" class="panel settings">
        <summary title="Ajustes">⚙ <span id="settingsSummary"></span> <span id="keyState" class="key-state" aria-hidden="true">●</span></summary>
        <div class="settings-body">
          <label data-for="claude">API key
            <input id="apiKey" type="password" placeholder="sk-ant-..." autocomplete="off" spellcheck="false" />
          </label>
          <label data-for="claude"><span>Workspace ID <span class="hint">(opcional)</span></span>
            <input id="workspaceId" type="text" placeholder="wrkspc_..." autocomplete="off" spellcheck="false" />
          </label>
          <label data-for="claude">Nivel
            <select id="level">${LEVELS.map((l) => `<option value="${l.id}">${l.label} · ${l.model.replace("claude-", "")} (${l.effort})</option>`).join("")}</select>
          </label>
          <label data-for="bot">Dificultad
            <select id="botLevel">${BOT_LEVELS.map((l) => `<option value="${l.id}">${l.label} · ${l.detail}</option>`).join("")}</select>
          </label>
          <label>Juegas con
            <select id="color"><option value="w">Blancas (elfos)</option><option value="b">Negras (orcos)</option></select>
          </label>
          <label data-for="claude" class="check"><input id="remember" type="checkbox" /> Recordar la key en este navegador</label>
          <p data-for="claude" class="note">La key solo se envía a api.anthropic.com desde tu navegador.</p>
          <p data-for="bot" class="note">El BOT es Stockfish y juega en tu navegador: sin key y sin coste.</p>
        </div>
      </details>
      <button id="undo" class="icon-btn" title="Deshacer jugada" aria-label="Deshacer jugada">↶</button>
      <button id="newGame" class="icon-btn accent" title="Nueva partida" aria-label="Nueva partida">＋</button>
    </div>
    <aside class="panel side" aria-label="Partida">
      <div id="comment" class="comment"></div>
      <ol id="history" class="history"></ol>
      <div id="cost" class="cost"></div>
    </aside>
  </div>
`;

export interface HudHandlers {
  onNewGame: () => void;
  onUndo: () => void;
  onSettingsChange: () => void;
}

/** DOM side of the game: settings, status, move list and cost. Holds no game state. */
export class Hud {
  readonly stage: HTMLElement;
  private currentOpponent: Opponent;
  private els: {
    status: HTMLElement;
    comment: HTMLElement;
    history: HTMLOListElement;
    cost: HTMLElement;
    loading: HTMLElement;
    settings: HTMLDetailsElement;
    summary: HTMLElement;
    keyState: HTMLElement;
    apiKey: HTMLInputElement;
    workspaceId: HTMLInputElement;
    level: HTMLSelectElement;
    botLevel: HTMLSelectElement;
    color: HTMLSelectElement;
    remember: HTMLInputElement;
    opponentButtons: HTMLButtonElement[];
    perOpponent: HTMLElement[];
  };

  constructor(root: HTMLElement, handlers: HudHandlers) {
    root.innerHTML = TEMPLATE;
    const get = <T extends HTMLElement>(id: string) => {
      const el = root.querySelector<T>(`#${id}`);
      if (!el) throw new Error(`Missing #${id}`);
      return el;
    };
    this.stage = get("stage");
    this.els = {
      status: get("status"),
      comment: get("comment"),
      history: get("history"),
      cost: get("cost"),
      loading: get("loading"),
      settings: get("settings"),
      summary: get("settingsSummary"),
      keyState: get("keyState"),
      apiKey: get("apiKey"),
      workspaceId: get("workspaceId"),
      level: get("level"),
      botLevel: get("botLevel"),
      color: get("color"),
      remember: get("remember"),
      opponentButtons: [...root.querySelectorAll<HTMLButtonElement>("[data-opponent]")],
      perOpponent: [...root.querySelectorAll<HTMLElement>(".settings-body [data-for]")],
    };

    const stored = loadCredentials();
    this.els.apiKey.value = stored.apiKey;
    this.els.workspaceId.value = stored.workspaceId;
    this.els.remember.checked = stored.remember;
    // The BOT needs no key, so it is the default for a first visit.
    this.currentOpponent = loadPreference("opponent") === "claude" ? "claude" : "bot";
    this.els.botLevel.value = findBotLevel(loadPreference("botLevel") ?? "").id;
    // Settings stay folded into a small pill unless Claude is chosen and still needs a key.
    this.els.settings.open = this.currentOpponent === "claude" && stored.apiKey === "";
    this.updateOpponent();

    for (const el of [this.els.apiKey, this.els.level, this.els.botLevel, this.els.color]) {
      el.addEventListener("input", () => this.updateSummary());
    }
    this.els.botLevel.addEventListener("change", () => savePreference("botLevel", this.els.botLevel.value));
    for (const el of [this.els.apiKey, this.els.workspaceId, this.els.remember]) {
      el.addEventListener("change", () => {
        this.persistCredentials();
        handlers.onSettingsChange();
      });
    }
    for (const button of this.els.opponentButtons) {
      button.addEventListener("click", () => {
        const opponent: Opponent = button.dataset.opponent === "claude" ? "claude" : "bot";
        if (opponent === this.currentOpponent) return;
        this.currentOpponent = opponent;
        savePreference("opponent", opponent);
        this.updateOpponent();
        if (opponent === "claude" && !this.credentials) this.requestCredentials();
        handlers.onSettingsChange();
      });
    }
    get("newGame").addEventListener("click", handlers.onNewGame);
    get("undo").addEventListener("click", handlers.onUndo);
  }

  get opponent(): Opponent {
    return this.currentOpponent;
  }

  get level(): Level {
    return findLevel(this.els.level.value);
  }

  get botLevel(): BotLevel {
    return findBotLevel(this.els.botLevel.value);
  }

  get playerColor(): Color {
    return this.els.color.value === "b" ? "b" : "w";
  }

  get credentials(): Credentials | null {
    const apiKey = this.els.apiKey.value.trim();
    if (!apiKey) return null;
    return { apiKey, workspaceId: this.els.workspaceId.value.trim() || undefined };
  }

  requestCredentials() {
    this.els.settings.open = true;
    this.els.apiKey.focus();
  }

  setStatus(text: string, busy: boolean) {
    this.els.status.textContent = text;
    this.els.status.classList.toggle("busy", busy);
  }

  setComment(text: string) {
    this.els.comment.textContent = text;
  }

  setHistory(pairs: readonly string[]) {
    this.els.history.replaceChildren(
      ...pairs.map((pair) => {
        const li = document.createElement("li");
        li.textContent = pair;
        return li;
      }),
    );
    this.els.history.scrollTop = this.els.history.scrollHeight;
  }

  setCost(tokens: number, cost: number) {
    this.els.cost.textContent = tokens
      ? `Consumo de la sesión: ${tokens.toLocaleString("es-ES")} tokens · ~$${cost.toFixed(4)}`
      : "";
  }

  finishLoading(error?: string) {
    if (error) this.els.loading.textContent = error;
    else this.els.loading.remove();
  }

  private persistCredentials() {
    saveCredentials({
      apiKey: this.els.apiKey.value.trim(),
      workspaceId: this.els.workspaceId.value.trim(),
      remember: this.els.remember.checked,
    });
  }

  /** Show only the settings that apply to the chosen opponent. */
  private updateOpponent() {
    for (const button of this.els.opponentButtons) {
      button.setAttribute("aria-pressed", String(button.dataset.opponent === this.currentOpponent));
    }
    for (const el of this.els.perOpponent) el.hidden = el.dataset.for !== this.currentOpponent;
    this.els.keyState.hidden = this.currentOpponent !== "claude";
    this.updateSummary();
  }

  private updateSummary() {
    const hasKey = this.els.apiKey.value.trim() !== "";
    this.els.keyState.title = hasKey ? "API key configurada" : "Falta la API key";
    this.els.keyState.classList.toggle("ok", hasKey);
    const color = this.playerColor === "w" ? "Blancas" : "Negras";
    const level = this.currentOpponent === "bot" ? this.botLevel.label : this.level.label;
    this.els.summary.textContent = `${level} · ${color}`;
  }
}
