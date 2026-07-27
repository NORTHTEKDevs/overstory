import { ChatOptions, ChatProvider, ProviderError } from './provider.js';

export interface OpenAICompatibleConfig {
  apiKey?: string;
  model?: string;
  /** Anything speaking `POST {baseUrl}/chat/completions`. Defaults to OpenAI. */
  baseUrl?: string;
  /** Shown in the provider name and error messages, e.g. "openrouter". */
  label?: string;
  concurrency?: number;
  timeoutMs?: number;
}

/** The `/v1/chat/completions` shape, which is the closest thing the field has to a standard.
 *
 * One implementation reaches OpenAI, OpenRouter, Groq, Together, Fireworks, DeepInfra, and
 * every local runtime that emulates the same route — LM Studio, llama.cpp's server, vLLM,
 * Ollama's compatibility endpoint. Users arrive holding a key for *something*; this is what
 * lets them use it instead of being told to go get a different one.
 *
 * Local endpoints frequently want no key at all, so an empty key is allowed when the base URL
 * is not a public host. */
export const openAICompatibleProvider = (config: OpenAICompatibleConfig = {}): ChatProvider => {
  const baseUrl = (config.baseUrl ?? process.env.OVERSTORY_OPENAI_BASE_URL ?? 'https://api.openai.com/v1').replace(/\/+$/u, '');
  const apiKey = config.apiKey ?? process.env.OPENAI_API_KEY;
  const model = config.model ?? process.env.OVERSTORY_OPENAI_MODEL ?? 'gpt-5-mini';
  const label = config.label ?? 'openai';
  const isLocal = /^https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])/u.test(baseUrl);
  if (!apiKey && !isLocal) throw new ProviderError(label, 'no API key set for this endpoint');
  const name = `${label}:${model}`;
  return {
    name,
    concurrency: config.concurrency ?? 6,
    async chat(prompt: string, opts: ChatOptions = {}): Promise<string> {
      let res: Response;
      try {
        res = await fetch(`${baseUrl}/chat/completions`, {
          method: 'POST',
          signal: AbortSignal.timeout(config.timeoutMs ?? 120_000),
          headers: {
            'content-type': 'application/json',
            ...(apiKey ? { authorization: `Bearer ${apiKey}` } : {}),
          },
          body: JSON.stringify({
            model,
            max_tokens: opts.maxTokens ?? 2000,
            messages: [
              ...(opts.system ? [{ role: 'system', content: opts.system }] : []),
              { role: 'user', content: prompt },
            ],
            // Only ask for JSON mode when the caller wants it; endpoints that do not support
            // response_format generally ignore it, and those that reject it do so loudly.
            ...(opts.json ? { response_format: { type: 'json_object' } } : {}),
          }),
        });
      } catch (cause) {
        throw new ProviderError(name, `request to ${baseUrl} failed`, cause);
      }
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new ProviderError(name, `HTTP ${res.status}: ${text.slice(0, 300)}`);
      }
      const body = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
      const text = body.choices?.[0]?.message?.content;
      if (typeof text !== 'string' || text.length === 0) throw new ProviderError(name, 'empty response');
      return text;
    },
  };
};
