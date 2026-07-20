export interface ChatOptions {
  /** Ask the provider to emit strict JSON (native JSON mode where supported). */
  json?: boolean;
  system?: string;
  maxTokens?: number;
}

export interface ChatProvider {
  name: string;
  /** How many concurrent requests this provider handles well. */
  concurrency: number;
  chat(prompt: string, opts?: ChatOptions): Promise<string>;
}

export class ProviderError extends Error {
  constructor(provider: string, message: string, readonly cause?: unknown) {
    super(`[${provider}] ${message}`);
  }
}
