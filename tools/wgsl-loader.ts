import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import type { Plugin } from 'vite';

const INCLUDE_RE = /^[ \t]*#include\s+"([^"]+)"[ \t]*$/gm;

/**
 * Resolves `#include "file.wgsl"` directives (relative to the including file).
 * Every file is inlined at most once per root shader, so shared modules such as
 * the noise library can be included from several places without redefinition errors.
 */
export function resolveWgslIncludes(
  source: string,
  filePath: string,
  readFile: (path: string) => string = (p) => readFileSync(p, 'utf8'),
  seen: Set<string> = new Set([resolve(filePath)]),
  onDependency?: (path: string) => void,
): string {
  return source.replace(INCLUDE_RE, (_match, rel: string) => {
    const target = resolve(dirname(filePath), rel);
    if (seen.has(target)) return `// #include "${rel}" (already included)`;
    seen.add(target);
    onDependency?.(target);
    const body = resolveWgslIncludes(readFile(target), target, readFile, seen, onDependency);
    return `// ---- begin ${rel} ----\n${body}\n// ---- end ${rel} ----`;
  });
}

/**
 * Minimal Vite loader that turns `*.wgsl` imports into default-exported strings
 * with `#include` directives expanded at build time.
 */
export function wgslLoader(): Plugin {
  return {
    name: 'wgsl-loader',
    enforce: 'pre',
    transform(code, id) {
      const [path] = id.split('?');
      if (!path || !path.endsWith('.wgsl')) return null;
      const expanded = resolveWgslIncludes(code, path, undefined, undefined, (dep) => this.addWatchFile(dep));
      return { code: `export default ${JSON.stringify(expanded)};`, map: null };
    },
  };
}
