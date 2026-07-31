import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/** Injected at bundle time by `bun build --define`. A compiled single-file binary has no
 * package.json on disk to read, so without this the standalone builds report "unknown". The
 * `typeof` guard is deliberate: referencing an undeclared identifier directly would throw,
 * but `typeof` on one is safe and simply yields "undefined" under Node. */
declare const __OVERSTORY_VERSION__: string | undefined;

/** The shipped package version, read from package.json rather than duplicated in source.
 * Both the CLI (`--version`) and the MCP server's handshake report this, so a release bump
 * cannot leave one of them advertising a stale number. Resolved relative to this module, so
 * it is correct whether running from dist/ or straight from source. */
export const packageVersion = (): string => {
  if (typeof __OVERSTORY_VERSION__ === 'string' && __OVERSTORY_VERSION__.length > 0) {
    return __OVERSTORY_VERSION__;
  }
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
