import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/** The shipped package version, read from package.json rather than duplicated in source.
 * Both the CLI (`--version`) and the MCP server's handshake report this, so a release bump
 * cannot leave one of them advertising a stale number. Resolved relative to this module, so
 * it is correct whether running from dist/ or straight from source. */
export const packageVersion = (): string => {
  for (const up of ['../../package.json', '../../../package.json']) {
    try {
      const path = fileURLToPath(new URL(up, import.meta.url));
      const parsed: unknown = JSON.parse(readFileSync(path, 'utf8'));
      if (parsed !== null && typeof parsed === 'object' && 'version' in parsed) {
        return String((parsed as { version: unknown }).version);
      }
    } catch {
      // try the next candidate
    }
  }
  return 'unknown';
};
