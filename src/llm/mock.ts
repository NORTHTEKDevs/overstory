import { ChatOptions, ChatProvider } from './provider.js';

/** Test double: answers from a queue or a handler. Records every prompt. */
export const mockProvider = (
  responses: string[] | ((prompt: string, opts?: ChatOptions) => string),
): ChatProvider & { prompts: string[] } => {
  const queue = Array.isArray(responses) ? [...responses] : null;
  const prompts: string[] = [];
  return {
    name: 'mock',
    concurrency: 8,
    prompts,
    async chat(prompt: string, opts?: ChatOptions): Promise<string> {
      prompts.push(prompt);
      if (queue) {
        const next = queue.shift();
        if (next === undefined) throw new Error('mockProvider: response queue exhausted');
        return next;
      }
      return (responses as (p: string, o?: ChatOptions) => string)(prompt, opts);
    },
  };
};
