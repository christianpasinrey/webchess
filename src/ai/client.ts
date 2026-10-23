import Anthropic from "@anthropic-ai/sdk";
import type { Chess } from "chess.js";
import { estimateCost, type Level } from "./levels";
import { MOVE_SCHEMA, buildPrompt, parseReply, resolveMove } from "./prompt";

export interface Credentials {
  apiKey: string;
  /** Required when the key is not scoped to a single workspace. */
  workspaceId?: string;
}

export interface AiMove {
  move: string;
  comment: string;
  inputTokens: number;
  outputTokens: number;
  cost: number;
}

const MAX_ATTEMPTS = 3;

function createClient({ apiKey, workspaceId }: Credentials): Anthropic {
  return new Anthropic({
    apiKey,
    // The key is the player's own and never leaves their browser except towards the API.
    dangerouslyAllowBrowser: true,
    defaultHeaders: workspaceId ? { "anthropic-workspace-id": workspaceId } : undefined,
  });
}

export async function requestMove(
  credentials: Credentials,
  level: Level,
  game: Chess,
  lastMove: string | null,
): Promise<AiMove> {
  const client = createClient(credentials);
  const legal = game.moves();
  let error: string | null = null;
  let inputTokens = 0;
  let outputTokens = 0;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const response = await client.beta.messages.create({
      model: level.model,
      max_tokens: 16000,
      system: `${level.style} Reply only with the requested JSON.`,
      messages: [{ role: "user", content: buildPrompt(game, legal, lastMove, error) }],
      output_config: {
        effort: level.effort,
        format: { type: "json_schema", schema: MOVE_SCHEMA },
      },
      ...(level.fallbacks ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const } : {}),
    });
    inputTokens += response.usage.input_tokens;
    outputTokens += response.usage.output_tokens;

    if (response.stop_reason === "refusal") {
      error = "request was declined";
      continue;
    }
    if (response.stop_reason === "max_tokens") {
      error = "ran out of tokens before answering";
      continue;
    }
    const text = response.content.find((b) => b.type === "text");
    try {
      const reply = parseReply(text?.type === "text" ? text.text : "");
      const san = resolveMove(legal, reply.move);
      if (san) {
        return {
          move: san,
          comment: reply.comment,
          inputTokens,
          outputTokens,
          cost: estimateCost(level, inputTokens, outputTokens),
        };
      }
      error = `"${reply.move}" is not a legal move`;
    } catch {
      error = "response was not valid JSON";
    }
  }
  throw new Error(`La IA no devolvió una jugada válida (${error})`);
}

export function describeError(err: unknown): string {
  if (err instanceof Anthropic.APIError) {
    const body = err.error as { error?: { message?: string } } | undefined;
    return `${err.status ?? ""} ${body?.error?.message ?? err.message}`.trim();
  }
  return err instanceof Error ? err.message : String(err);
}
