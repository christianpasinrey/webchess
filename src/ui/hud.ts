import type { Color } from "chess.js";
import { LEVELS, findLevel, type Level } from "../ai/levels";
import type { Credentials } from "../ai/client";
import { loadCredentials, saveCredentials } from "./storage";

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
      <details id="settings" class="panel settings">
        <summary title="Ajustes">⚙ <span id="settingsSummary"></span> <span id="keyState" class="key-state" aria-hidden="true">●</span></summary>
        <div class="settings-body">
          <label>API key
            <input id="apiKey" type="password" placeholder="sk-ant-..." autocomplete="off" spellcheck="false" />
          </label>
          <label><span>Workspace ID <span class="hint">(opcional)</span></span>
            <input id="workspaceId" type="text" placeholder="wrkspc_..." autocomplete="off" spellcheck="false" />
          </label>
          <label>Nivel
            <select id="level">${LEVELS.map((l) => `<option value="${l.id}">${l.label} · ${l.model.replace("claude-", "")} (${l.effort})</option>`).join("")}</select>
          </label>
          <label>Juegas con
            <select id="color"><option value="w">Blancas (elfos)</option><option value="b">Negras (orcos)</option></select>
          </label>
          <label class="check"><input id="remember" type="checkbox" /> Recordar la key en este navegador</label>
          <p class="note">La key solo se envía a api.anthropic.com desde tu navegador.</p>
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
  onCredentialsChange: () => void;
}

/** DOM side of the game: settings, status, move list and cost. Holds no game state. */
export class Hud {
  readonly stage: HTMLElement;
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
    color: HTMLSelectElement;
    remember: HTMLInputElement;
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
      color: get("color"),
      remember: get("remember"),
    };

    const stored = loadCredentials();
    this.els.apiKey.value = stored.apiKey;
    this.els.workspaceId.value = stored.workspaceId;
    this.els.remember.checked = stored.remember;
    // Settings stay folded into a small pill once a key is available.
    this.els.settings.open = stored.apiKey === "";
    this.updateSummary();

    for (const el of [this.els.apiKey, this.els.level, this.els.color]) {
      el.addEventListener("input", () => this.updateSummary());
    }
    for (const el of [this.els.apiKey, this.els.workspaceId, this.els.remember]) {
      el.addEventListener("change", () => {
        this.persistCredentials();
        handlers.onCredentialsChange();
      });
    }
    get("newGame").addEventListener("click", handlers.onNewGame);
    get("undo").addEventListener("click", handlers.onUndo);
  }

  get level(): Level {
    return findLevel(this.els.level.value);
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

  private updateSummary() {
    const hasKey = this.els.apiKey.value.trim() !== "";
    this.els.keyState.title = hasKey ? "API key configurada" : "Falta la API key";
    this.els.keyState.classList.toggle("ok", hasKey);
    const color = this.playerColor === "w" ? "Blancas" : "Negras";
    this.els.summary.textContent = `${this.level.label} · ${color}`;
  }
}
