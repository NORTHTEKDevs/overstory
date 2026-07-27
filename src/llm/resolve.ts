import { anthropicProvider } from './anthropic.js';
import { ollamaProvider, ollamaReachable } from './ollama.js';
import type { ChatProvider } from './provider.js';

export interface ResolveOptions {
  /** 'auto' | 'ollama' | 'anthropic' | 'none' */
  provider?: string;
  model?: string;
  onNotice?: (message: string) => void;
}

export interface ResolvedProviders {
  provider: ChatProvider | null;
  critic: ChatProvider | null;
}

/** Shared provider resolution for CLI + serve: explicit choice wins; auto prefers the
 * Anthropic key, then local Ollama, then honest extractive. */
export const resolveProviders = async (opts: ResolveOptions = {}): Promise<ResolvedProviders> => {
  const wanted = opts.provider ?? 'auto';
  if (wanted === 'none') return { provider: null, critic: null };
  if (wanted === 'anthropic' || (wanted === 'auto' && process.env.ANTHROPIC_API_KEY)) {
    const provider = anthropicProvider({ model: opts.model });
    const critic = anthropicProvider({ model: process.env.OVERSTORY_CRITIC_MODEL ?? 'claude-sonnet-5' });
    return { provider, critic };
  }
  if (wanted === 'ollama' || wanted === 'auto') {
    if (await ollamaReachable()) {
      const provider = ollamaProvider({ model: opts.model });
      return { provider, critic: provider };
    }
    if (wanted === 'ollama') throw new Error('Ollama is not reachable at localhost:11434. Start it, or use --provider none.');
    opts.onNotice?.(
      'No LLM configured — building from your code\'s own structure and doc comments.\n' +
        '  This mode is deterministic and offline: claims are your comments and signatures, cited to the line.\n' +
        '  For prose summaries of what code does, start Ollama (ollama pull qwen2.5:14b) or set ANTHROPIC_API_KEY.',
    );
  }
  return { provider: null, critic: null };
};
