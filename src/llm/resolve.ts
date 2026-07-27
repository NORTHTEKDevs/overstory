import { anthropicProvider } from './anthropic.js';
import { ollamaProvider, ollamaReachable } from './ollama.js';
import { openAICompatibleProvider } from './openai-compatible.js';
import { readCredentials, resolveKey } from '../core/credentials.js';
import type { ChatProvider } from './provider.js';

export interface ResolveOptions {
  /** 'auto' | 'none' | any provider id from the catalog. */
  provider?: string;
  model?: string;
  onNotice?: (message: string) => void;
}

export interface ResolvedProviders {
  provider: ChatProvider | null;
  critic: ChatProvider | null;
}

const NO_LLM_NOTICE =
  'No LLM configured — building from your code\'s own structure and doc comments.\n' +
  '  This mode is deterministic and offline: claims are your comments and signatures, cited to the line.\n' +
  '  For prose summaries, run `overstory providers` to see your options, or open `overstory serve` → Settings.';

/** Build a provider from the catalog id, using an explicit model, then the one stored
 * alongside the key, then the provider's own default. */
const build = (id: string, model: string | undefined): ChatProvider | null => {
  const stored = readCredentials();
  const chosen = model ?? stored.models?.[id];
  const baseUrl = stored.baseUrls?.[id];
  if (id === 'anthropic') {
    return anthropicProvider({ apiKey: resolveKey('anthropic', 'ANTHROPIC_API_KEY'), model: chosen });
  }
  if (id === 'openai') {
    return openAICompatibleProvider({ apiKey: resolveKey('openai', 'OPENAI_API_KEY'), model: chosen, baseUrl, label: 'openai' });
  }
  if (id === 'openai-compatible') {
    return openAICompatibleProvider({
      apiKey: resolveKey('openai-compatible', 'OVERSTORY_OPENAI_API_KEY'),
      model: chosen,
      baseUrl: baseUrl ?? process.env.OVERSTORY_OPENAI_BASE_URL,
      label: 'openai-compatible',
    });
  }
  if (id === 'ollama') return ollamaProvider({ model: chosen, baseUrl });
  return null;
};

/** Which hosted provider `auto` should pick, if any: whichever one actually has a key. */
const autoHosted = (): string | null => {
  for (const id of ['anthropic', 'openai', 'openai-compatible'] as const) {
    const envVar = id === 'anthropic' ? 'ANTHROPIC_API_KEY' : id === 'openai' ? 'OPENAI_API_KEY' : 'OVERSTORY_OPENAI_API_KEY';
    if (resolveKey(id, envVar)) return id;
  }
  return null;
};

/** Shared provider resolution for the CLI and the local app.
 *
 * An explicit choice always wins. `auto` prefers a configured hosted key, then a running
 * Ollama, then the deterministic engine — and says so rather than silently degrading. */
export const resolveProviders = async (opts: ResolveOptions = {}): Promise<ResolvedProviders> => {
  const wanted = opts.provider ?? 'auto';
  if (wanted === 'none') return { provider: null, critic: null };

  if (wanted !== 'auto') {
    if (wanted === 'ollama' && !(await ollamaReachable())) {
      throw new Error('Ollama is not reachable at localhost:11434. Start it, or use --provider none.');
    }
    const provider = build(wanted, opts.model);
    if (!provider) throw new Error(`unknown provider "${wanted}" — run \`overstory providers\` to see the options`);
    // Cheap to generate, dearer to judge: the critique pass gets the stronger Claude tier
    // when we are already talking to Anthropic, and otherwise reuses the same provider.
    const critic =
      wanted === 'anthropic'
        ? anthropicProvider({
            apiKey: resolveKey('anthropic', 'ANTHROPIC_API_KEY'),
            model: process.env.OVERSTORY_CRITIC_MODEL ?? 'claude-sonnet-5',
          })
        : provider;
    return { provider, critic };
  }

  const hosted = autoHosted();
  if (hosted) {
    const provider = build(hosted, opts.model);
    if (provider) {
      const critic =
        hosted === 'anthropic'
          ? anthropicProvider({
              apiKey: resolveKey('anthropic', 'ANTHROPIC_API_KEY'),
              model: process.env.OVERSTORY_CRITIC_MODEL ?? 'claude-sonnet-5',
            })
          : provider;
      return { provider, critic };
    }
  }

  if (await ollamaReachable()) {
    const provider = ollamaProvider({ model: opts.model ?? readCredentials().models?.ollama });
    return { provider, critic: provider };
  }

  opts.onNotice?.(NO_LLM_NOTICE);
  return { provider: null, critic: null };
};
