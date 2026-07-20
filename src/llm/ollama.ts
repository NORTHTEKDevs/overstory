import { ChatOptions, ChatProvider, ProviderError } from './provider.js';

export interface OllamaConfig {
  baseUrl?: string;
  model?: string;
  /** Single-GPU hosts queue anyway; 2 keeps the pipe full without thrash. */
  concurrency?: number;
  timeoutMs?: number;
  numCtx?: number;
}

export const ollamaProvider = (config: OllamaConfig = {}): ChatProvider => {
  const baseUrl = config.baseUrl ?? process.env.OVERSTORY_OLLAMA_URL ?? 'http://localhost:11434';
  const model = config.model ?? process.env.OVERSTORY_OLLAMA_MODEL ?? 'qwen2.5:14b';
  const timeoutMs = config.timeoutMs ?? 240_000;
  return {
    name: `ollama:${model}`,
    concurrency: config.concurrency ?? 2,
    async chat(prompt: string, opts: ChatOptions = {}): Promise<string> {
      const messages = [] as Array<{ role: string; content: string }>;
      if (opts.system) messages.push({ role: 'system', content: opts.system });
      messages.push({ role: 'user', content: prompt });
      let res: Response;
      try {
        res = await fetch(`${baseUrl}/api/chat`, {
          method: 'POST',
          signal: AbortSignal.timeout(timeoutMs),
          body: JSON.stringify({
            model,
            stream: false,
            ...(opts.json ? { format: 'json' } : {}),
            options: { num_ctx: config.numCtx ?? 8192, temperature: 0.2 },
            messages,
          }),
        });
      } catch (cause) {
        throw new ProviderError(`ollama:${model}`, 'request failed (is Ollama running?)', cause);
      }
      if (!res.ok) throw new ProviderError(`ollama:${model}`, `HTTP ${res.status}`);
      const body = (await res.json()) as { message?: { content?: string } };
      const content = body.message?.content;
      if (typeof content !== 'string') throw new ProviderError(`ollama:${model}`, 'empty response');
      return content;
    },
  };
};

export const ollamaReachable = async (baseUrl = 'http://localhost:11434'): Promise<boolean> => {
  try {
    const res = await fetch(`${baseUrl}/api/tags`, { signal: AbortSignal.timeout(3_000) });
    return res.ok;
  } catch {
    return false;
  }
};
