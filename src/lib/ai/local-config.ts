import "server-only";

// An explicit loopback address prevents DNS resolution, remote configuration,
// browser-controlled endpoints and hosted generative API access.
export const OLLAMA_ORIGIN = "http://127.0.0.1:11434";
export const LOCAL_MODEL = Object.freeze({
  name: "qwen3:4b-instruct",
  // SHA-256 of the official Ollama manifest reviewed for Phase 10.
  digest: "0edcdef34593eac1aa2be9c7d06c432dcf81945adca5eca2f27662c18f168ba0",
});

export class LocalLlmError extends Error {
  status: number;
  constructor(message: string, status = 503) {
    super(message);
    this.status = status;
  }
}

export function getLocalModelName() {
  const name = process.env.OLLAMA_MODEL?.trim() || LOCAL_MODEL.name;
  if (name !== LOCAL_MODEL.name)
    throw new LocalLlmError(
      `Only the reviewed local ${LOCAL_MODEL.name} model is enabled. Cloud models and other model names are blocked.`,
    );
  return name;
}

export function getLocalOrigin() {
  const configured = process.env.OLLAMA_BASE_URL?.trim() || OLLAMA_ORIGIN;
  try {
    const url = new URL(configured);
    if (url.protocol !== "http:" || !["localhost", "127.0.0.1"].includes(url.hostname) ||
        url.port !== "11434" || url.pathname !== "/" || url.search || url.hash ||
        url.username || url.password) throw new Error("Not the local endpoint");
  } catch {
    throw new LocalLlmError("OLLAMA_BASE_URL must be http://localhost:11434 or http://127.0.0.1:11434. Remote endpoints are blocked.");
  }
  // Canonical IP avoids DNS lookup even when configuration says localhost.
  return OLLAMA_ORIGIN;
}
