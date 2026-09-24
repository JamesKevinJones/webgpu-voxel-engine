import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { FRAME_BYTES, FRAME_FLOATS, FRAME_LAYOUT } from '../src/core/uniforms';
import { SHADER_CONSTANTS, shaderPrelude, withPrelude } from '../src/gpu/shader-prelude';
import commonSource from '../src/shaders/common.wgsl';
import gatherSource from '../src/shaders/gather.wgsl';
import meshSource from '../src/shaders/mesh.wgsl';
import noiseSource from '../src/shaders/noise.wgsl';
import skySource from '../src/shaders/sky.wgsl';
import terrainSource from '../src/shaders/terrain.wgsl';
import worldgenSource from '../src/shaders/worldgen.wgsl';
import { resolveWgslIncludes } from '../tools/wgsl-loader';

const root = join(__dirname, '..');
const read = (p: string): string => readFileSync(join(root, p), 'utf8');

const modules: Record<string, { source: string; entryPoints: string[] }> = {
  'worldgen.wgsl': { source: worldgenSource, entryPoints: ['@compute @workgroup_size(64)\nfn main'] },
  'gather.wgsl': { source: gatherSource, entryPoints: ['@compute @workgroup_size(64)\nfn main'] },
  'mesh.wgsl': { source: meshSource, entryPoints: ['@compute @workgroup_size(32)\nfn main'] },
  'terrain.wgsl': { source: terrainSource, entryPoints: ['@vertex\nfn vs_main', '@fragment\nfn fs_opaque', '@fragment\nfn fs_water'] },
  'sky.wgsl': { source: skySource, entryPoints: ['@vertex\nfn vs_main', '@fragment\nfn fs_main'] },
};

function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
}

describe('WGSL loader', () => {
  const files: Record<string, string> = {
    '/s/a.wgsl': '#include "b.wgsl"\n#include "lib/c.wgsl"\nfn a() {}',
    '/s/b.wgsl': '#include "lib/c.wgsl"\nfn b() {}',
    '/s/lib/c.wgsl': 'fn c() {}',
  };
  const readFile = (p: string): string => {
    const f = files[p];
    if (f === undefined) throw new Error(`missing ${p}`);
    return f;
  };

  it('expands nested includes relative to the including file, once each', () => {
    const out = resolveWgslIncludes(files['/s/a.wgsl']!, '/s/a.wgsl', readFile);
    expect(out.match(/fn c\(\)/g)).toHaveLength(1);
    expect(out.indexOf('fn c()')).toBeLessThan(out.indexOf('fn b()'));
    expect(out).toContain('fn a() {}');
    expect(out).not.toMatch(/^#include/m);
  });

  it('reports dependencies for hot reload', () => {
    const deps: string[] = [];
    resolveWgslIncludes(files['/s/a.wgsl']!, '/s/a.wgsl', readFile, undefined, (d) => deps.push(d));
    expect(deps.sort()).toEqual(['/s/b.wgsl', '/s/lib/c.wgsl']);
  });

  it('is applied to imported shader modules', () => {
    expect(worldgenSource).toContain('fn simplex3(');
    expect(worldgenSource.match(/fn simplex3\(/g)).toHaveLength(1);
    expect(terrainSource).toContain('struct Frame');
    expect(skySource).toContain('fn skyColor(');
    for (const { source } of Object.values(modules)) expect(source).not.toMatch(/^\s*#include/m);
  });
});

describe('shader prelude', () => {
  it('emits one typed const per constant with valid literals', () => {
    const prelude = shaderPrelude();
    const names = SHADER_CONSTANTS.map(([n]) => n);
    expect(new Set(names).size).toBe(names.length);
    for (const [name, value, type] of SHADER_CONSTANTS) {
      const line = prelude.split('\n').find((l) => l.startsWith(`const ${name}:`));
      expect(line).toBeDefined();
      expect(line).toMatch(new RegExp(`^const ${name}: ${type} = \\(?-?\\d+(\\.\\d+)?[ui]?\\)?;$`));
      expect(Number.parseFloat(line!.split('=')[1]!.replace(/[()ui;]/g, ''))).toBe(value);
    }
  });

  it('declares every upper-case constant the shaders use', () => {
    const declared = new Set(SHADER_CONSTANTS.map(([n]) => n));
    for (const [file, { source }] of Object.entries(modules)) {
      const code = stripComments(source);
      const local = new Set([...code.matchAll(/\b(?:const|override)\s+([A-Z][A-Z0-9_]*)\b/g)].map((m) => m[1]!));
      const used = new Set([...code.matchAll(/\b([A-Z][A-Z0-9_]{2,})\b/g)].map((m) => m[1]!));
      for (const name of used) {
        expect(declared.has(name) || local.has(name), `${file} uses undeclared ${name}`).toBe(true);
      }
    }
  });

  it('prepends the constants to module sources', () => {
    const code = withPrelude('fn f() {}');
    expect(code.startsWith('// ---- generated')).toBe(true);
    expect(code.endsWith('fn f() {}')).toBe(true);
  });
});

// WGSL reserved words (spec §15.3) that are plausible identifier names.
const WGSL_RESERVED = new Set(('NULL Self abstract active alignas alignof as asm asm_fragment async attribute auto await become ' +
  'cast catch class co_await co_return co_yield coherent column_major common compile compile_fragment concept const_cast ' +
  'consteval constexpr constinit crate debugger decltype delete demote demote_to_helper do dynamic_cast enum explicit export ' +
  'extends extern external fallthrough filter final finally friend from fxgroup get goto groupshared highp impl implements ' +
  'import inline instanceof interface layout lowp macro macro_rules match mediump meta mod module move mut mutable namespace ' +
  'new nil noexcept noinline nointerpolation noperspective null nullptr of operator package packoffset partition pass patch ' +
  'pixelfragment precise precision premerge priv protected pub public readonly ref regardless register reinterpret_cast ' +
  'require resource restrict self set shared sizeof smooth snorm static static_assert static_cast std subroutine super target ' +
  'template this thread_local throw trait try type typedef typeid typename typeof union unless unorm unsafe unsized use using ' +
  'varying virtual volatile wgsl where with writeonly yield').split(' '));

describe('shader modules', () => {
  it('do not use reserved words as identifiers', () => {
    for (const [file, { source }] of Object.entries(modules)) {
      const code = stripComments(source);
      const names = [
        ...[...code.matchAll(/\b(?:let|var|const|fn|struct|override)\s+(\w+)/g)].map((m) => m[1]!),
        ...[...code.matchAll(/[(,]\s*(\w+)\s*:/g)].map((m) => m[1]!), // parameters and struct members
        ...[...code.matchAll(/^\s*(\w+)\s*:/gm)].map((m) => m[1]!),
      ];
      const bad = names.filter((n) => WGSL_RESERVED.has(n));
      expect(bad, file).toEqual([]);
    }
  });

  it('expose the entry points the pipelines reference', () => {
    for (const [file, { source, entryPoints }] of Object.entries(modules)) {
      for (const ep of entryPoints) expect(source.replace(/\r/g, ''), `${file}: ${ep}`).toContain(ep);
    }
  });

  it('stay within default binding and workgroup memory limits', () => {
    for (const [file, { source }] of Object.entries(modules)) {
      const storage = (stripComments(source).match(/var<storage/g) ?? []).length;
      expect(storage, file).toBeLessThanOrEqual(8); // maxStorageBuffersPerShaderStage
    }
    // mesh.wgsl: array<u32, 1024> in workgroup memory = 4 KiB (limit 16 KiB).
    expect(meshSource).toMatch(/var<workgroup> runs: array<u32, 1024>/);
  });

  it('declare the Frame uniform with the layout FrameUniforms writes', () => {
    const struct = commonSource.match(/struct Frame \{([\s\S]*?)\n\}/)![1]!;
    const fields = [...struct.matchAll(/^\s*(\w+):\s*([\w<>, ]+),/gm)].map((m) => [m[1]!, m[2]!.trim()] as const);
    const sizes: Record<string, number> = { 'mat4x4<f32>': 16, 'vec4<f32>': 4 };
    let offset = 0;
    for (const [name, type] of fields) {
      expect(sizes[type], `unsupported uniform type ${type}`).toBeDefined();
      expect(FRAME_LAYOUT[name as keyof typeof FRAME_LAYOUT], name).toBe(offset);
      offset += sizes[type]!;
    }
    expect(fields.map(([n]) => n)).toEqual(Object.keys(FRAME_LAYOUT));
    expect(offset).toBe(FRAME_FLOATS);
    expect(FRAME_BYTES % 16).toBe(0);
  });
});

describe('CPU mirrors of GPU code', () => {
  const numbers = (src: string): number[] =>
    [...stripComments(src).replace(/array<(?:[^<>]|<[^<>]*>)*>/g, 'array').replace(/\[\s*\d+\s*\]/g, '[]').matchAll(/(?<![\w.])(\d+\.\d+|\d+)(?:u|i)?(?![\w.])/g)]
      .map((m) => Number.parseFloat(m[1]!))
      .filter((n) => n !== 0)
      .sort((a, b) => a - b);

  it('uses identical hash constants in noise.ts and noise.wgsl', () => {
    const hex = (src: string) => [...src.matchAll(/0x[0-9a-f]{8}/gi)].map((m) => m[0].toLowerCase()).sort();
    const ts = read('src/world/noise.ts');
    expect(hex(noiseSource)).toEqual(hex(ts.slice(ts.indexOf('export function hash3'), ts.indexOf('function grad3'))));
  });

  it('uses identical climate and terrain parameters in terrain.ts and climate/worldgen.wgsl', () => {
    const ts = read('src/world/terrain.ts');
    const tsBody = ts.slice(ts.indexOf('export function temperatureAt'), ts.indexOf('/** Generates a dense chunk'));
    const climate = read('src/shaders/climate.wgsl');
    const wgsl = read('src/shaders/worldgen.wgsl');
    const wgslBody = climate.slice(climate.indexOf('fn temperatureAt')) +
      wgsl.slice(wgsl.indexOf('fn continentalHeight'), wgsl.indexOf('@compute'));
    expect(numbers(wgslBody)).toEqual(numbers(tsBody));
  });
});
