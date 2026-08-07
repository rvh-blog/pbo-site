import type { Predictions } from "./playoff-calculator-engine";

export const SCENARIO_VERSION = 2;

export type ScenarioPayload = {
  version: number;
  predictions: Predictions;
  divisionId: number;
};

function bytesToBase64Url(bytes: Uint8Array) {
  let binary = "";
  for (let index = 0; index < bytes.length; index += 1) binary += String.fromCharCode(bytes[index]);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

function base64UrlToBytes(value: string) {
  const normalized = value.replaceAll("-", "+").replaceAll("_", "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(normalized);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

export function isValidPredictions(value: unknown): value is Predictions {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  return Object.entries(value).every(([matchId, prediction]) => {
    if (!Number.isInteger(Number(matchId)) || !prediction || typeof prediction !== "object" || Array.isArray(prediction)) return false;
    const candidate = prediction as { winnerId?: unknown; differential?: unknown };
    return Number.isInteger(candidate.winnerId) && Number.isInteger(candidate.differential) && Number(candidate.differential) >= 1 && Number(candidate.differential) <= 6;
  });
}

export function isValidScenarioPayload(value: unknown): value is ScenarioPayload {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const candidate = value as { version?: unknown; predictions?: unknown; divisionId?: unknown };
  return Number.isInteger(candidate.version) && Number.isInteger(candidate.divisionId) && isValidPredictions(candidate.predictions);
}

export async function encodeScenario(payload: Omit<ScenarioPayload, "version">) {
  const bytes = new TextEncoder().encode(JSON.stringify({ ...payload, version: SCENARIO_VERSION }));
  if (typeof CompressionStream !== "undefined") {
    const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream("gzip"));
    return `v2.${bytesToBase64Url(new Uint8Array(await new Response(stream).arrayBuffer()))}`;
  }
  return `v1.${bytesToBase64Url(bytes)}`;
}

export async function decodeScenario(encoded: string): Promise<ScenarioPayload | null> {
  try {
    if (!encoded.includes(".")) {
      const legacy = JSON.parse(atob(encoded)) as { predictions?: unknown; divisionId?: unknown };
      const payload = { version: 1, predictions: legacy.predictions, divisionId: legacy.divisionId };
      return isValidScenarioPayload(payload) ? payload : null;
    }
    const [format, body] = encoded.split(".", 2);
    let bytes = base64UrlToBytes(body);
    if (format === "v2") {
      const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"));
      bytes = new Uint8Array(await new Response(stream).arrayBuffer());
    }
    const payload = JSON.parse(new TextDecoder().decode(bytes));
    return isValidScenarioPayload(payload) ? payload : null;
  } catch {
    return null;
  }
}
