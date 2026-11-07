/** Discord REST calls and request-signature verification.
 *
 * In HTTP mode Discord signs every request it sends you with Ed25519. You
 * MUST reject bad signatures with 401 — Discord sends deliberately invalid
 * requests when you save the endpoint URL and refuses it if you accept them.
 */

import { createPublicKey, verify } from "node:crypto";

import { config } from "./config";

const API = "https://discord.com/api/v10";

/** Ed25519 public keys in SPKI DER form are this prefix plus the 32 raw bytes. */
const SPKI_PREFIX = Buffer.from("302a300506032b6570032100", "hex");

export function verifySignature(
  rawBody: string,
  signature: string | null,
  timestamp: string | null,
): boolean {
  if (!signature || !timestamp) return false;
  try {
    const key = createPublicKey({
      key: Buffer.concat([SPKI_PREFIX, Buffer.from(config.discord.publicKey(), "hex")]),
      format: "der",
      type: "spki",
    });
    return verify(
      null,
      Buffer.from(timestamp + rawBody),
      key,
      Buffer.from(signature, "hex"),
    );
  } catch {
    return false;
  }
}

async function call(method: string, path: string, body?: unknown): Promise<any> {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      Authorization: `Bot ${config.discord.token()}`,
      "Content-Type": "application/json",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`Discord ${method} ${path} -> ${res.status}: ${await res.text()}`);
  }
  return res.status === 204 ? null : res.json();
}

export function postMessage(channelId: string, payload: unknown) {
  return call("POST", `/channels/${channelId}/messages`, payload);
}

export function getMessage(channelId: string, messageId: string) {
  return call("GET", `/channels/${channelId}/messages/${messageId}`);
}

/** Upload files. Multipart, so it can't go through `call`. */
export async function postFiles(
  channelId: string,
  content: string,
  files: { name: string; data: ArrayBuffer }[],
): Promise<any> {
  const form = new FormData();
  form.append(
    "payload_json",
    JSON.stringify({
      content,
      attachments: files.map((f, i) => ({ id: i, filename: f.name })),
    }),
  );
  files.forEach((f, i) => {
    form.append(`files[${i}]`, new Blob([f.data]), f.name);
  });

  const res = await fetch(`${API}/channels/${channelId}/messages`, {
    method: "POST",
    headers: { Authorization: `Bot ${config.discord.token()}` },
    body: form,
  });
  if (!res.ok) {
    throw new Error(`Discord upload -> ${res.status}: ${await res.text()}`);
  }
  return res.json();
}

export function editMessage(channelId: string, messageId: string, payload: unknown) {
  return call("PATCH", `/channels/${channelId}/messages/${messageId}`, payload);
}

/** Replace the "thinking..." placeholder after a deferred slash-command reply. */
export function editInteractionResponse(interactionToken: string, payload: unknown) {
  return call(
    "PATCH",
    `/webhooks/${config.discord.appId()}/${interactionToken}/messages/@original`,
    payload,
  );
}

// --- interaction + component type constants -----------------------------
export const InteractionType = {
  PING: 1,
  APPLICATION_COMMAND: 2,
  MESSAGE_COMPONENT: 3,
  MODAL_SUBMIT: 5,
} as const;

export const InteractionResponseType = {
  PONG: 1,
  CHANNEL_MESSAGE_WITH_SOURCE: 4,
  DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE: 5,
  MODAL: 9,
} as const;

export const EPHEMERAL = 1 << 6;

export const TextInputStyle = { SHORT: 1, PARAGRAPH: 2 } as const;