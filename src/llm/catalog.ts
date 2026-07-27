/** What OVERSTORY can talk to.
 *
 * One declaration, read by the settings panel in `overstory serve`, by `overstory providers`,
 * and by the README table. A supported-models list that lives in three hand-maintained places
 * is a supported-models list that is wrong in at least two of them. */

export interface CatalogModel {
  id: string;
  label: string;
  note?: string;
}

export interface CatalogProvider {
  id: string;
  label: string;
  /** One line, plain words, for someone deciding which to pick. */
  summary: string;
  /** Does source text leave the machine when this provider is used? */
  sendsCodeOffMachine: boolean;
  /** Whether this provider takes an API key at all. */
  needsKey: boolean;
  /** Environment variable that also supplies the key, when there is one. */
  envVar?: string;
  /** Where to get a key, for the panel's help link. */
  keyUrl?: string;
  /** Rough shape of a valid key, used for a friendly pre-flight check only. */
  keyPrefix?: string;
  /** Editable endpoint, for OpenAI-compatible services. */
  baseUrlDefault?: string;
  models: CatalogModel[];
  /** Live-detected rather than fixed (Ollama lists whatever you have pulled). */
  modelsAreDynamic?: boolean;
}

export const PROVIDER_CATALOG: CatalogProvider[] = [
  {
    id: 'none',
    label: 'Built-in (no model)',
    summary:
      'Deterministic. Claims come from your code\'s own doc comments and signatures. Instant, offline, and the only mode with reproducible output.',
    sendsCodeOffMachine: false,
    needsKey: false,
    models: [],
  },
  {
    id: 'ollama',
    label: 'Ollama (local models)',
    summary:
      'Runs a model on your machine. Prose summaries with nothing leaving the computer. Slower: expect 20-60s per file.',
    sendsCodeOffMachine: false,
    needsKey: false,
    baseUrlDefault: 'http://localhost:11434',
    modelsAreDynamic: true,
    models: [
      { id: 'qwen2.5:14b', label: 'qwen2.5:14b', note: 'good default; solid JSON adherence' },
      { id: 'qwen2.5-coder:7b', label: 'qwen2.5-coder:7b', note: 'faster, code-tuned' },
      { id: 'llama3.1:8b', label: 'llama3.1:8b', note: 'fastest of these; shallower summaries' },
    ],
  },
  {
    id: 'anthropic',
    label: 'Anthropic',
    summary: 'Claude models via the Anthropic API. Fast and high quality; your source text is sent to Anthropic.',
    sendsCodeOffMachine: true,
    needsKey: true,
    envVar: 'ANTHROPIC_API_KEY',
    keyUrl: 'https://console.anthropic.com/settings/keys',
    keyPrefix: 'sk-ant-',
    models: [
      { id: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5', note: 'default; cheapest per file' },
      { id: 'claude-sonnet-5', label: 'Claude Sonnet 5', note: 'better summaries, higher cost' },
      { id: 'claude-opus-5', label: 'Claude Opus 5', note: 'best quality, slowest and priciest' },
    ],
  },
  {
    id: 'openai',
    label: 'OpenAI',
    summary: 'GPT models via the OpenAI API. Your source text is sent to OpenAI.',
    sendsCodeOffMachine: true,
    needsKey: true,
    envVar: 'OPENAI_API_KEY',
    keyUrl: 'https://platform.openai.com/api-keys',
    keyPrefix: 'sk-',
    baseUrlDefault: 'https://api.openai.com/v1',
    models: [
      { id: 'gpt-5-mini', label: 'GPT-5 mini', note: 'default; cheapest per file' },
      { id: 'gpt-5', label: 'GPT-5', note: 'better summaries, higher cost' },
    ],
  },
  {
    id: 'openai-compatible',
    label: 'Other OpenAI-compatible endpoint',
    summary:
      'Anything serving /chat/completions: OpenRouter, Groq, Together, Fireworks, DeepInfra, LM Studio, llama.cpp, vLLM. Set the base URL and, if the service wants one, a key.',
    sendsCodeOffMachine: true,
    needsKey: false,
    keyUrl: 'https://openrouter.ai/keys',
    baseUrlDefault: 'https://openrouter.ai/api/v1',
    models: [],
    modelsAreDynamic: true,
  },
];

export const findProvider = (id: string): CatalogProvider | undefined =>
  PROVIDER_CATALOG.find((p) => p.id === id);

/** A friendly pre-flight check. Deliberately weak: the only authority on whether a key works
 * is the API, so this catches fumbled pastes without ever rejecting a key the service would
 * have accepted. */
export const looksLikeKey = (providerId: string, key: string): { ok: boolean; reason?: string } => {
  const trimmed = key.trim();
  if (trimmed.length === 0) return { ok: false, reason: 'the key is empty' };
  if (/\s/u.test(trimmed)) return { ok: false, reason: 'the key contains a space — check for a truncated paste' };
  if (trimmed.length < 16) return { ok: false, reason: 'that looks too short to be an API key' };
  const prefix = findProvider(providerId)?.keyPrefix;
  if (prefix && !trimmed.startsWith(prefix)) {
    return { ok: false, reason: `${providerId} keys normally start with "${prefix}"` };
  }
  return { ok: true };
};
