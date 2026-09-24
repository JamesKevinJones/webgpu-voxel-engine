// Climate model shared by world generation and terrain shading. Mirrors src/world/terrain.ts.
#include "noise.wgsl"

const BIOME_PLAINS: u32 = 0u;
const BIOME_DESERT: u32 = 1u;
const BIOME_SNOWY: u32 = 2u;
const BIOME_FOREST: u32 = 3u;

fn temperatureAt(x: f32, z: f32, seed: u32) -> f32 {
  return fbm2(x * 0.0011, z * 0.0011, 3u, seed + 501u);
}

fn humidityAt(x: f32, z: f32, seed: u32) -> f32 {
  return fbm2(x * 0.0013, z * 0.0013, 3u, seed + 502u);
}

// Smooth biome weights (plains, desert, snowy, forest); non-negative and summing to 1.
fn biomeWeights(temperature: f32, humidity: f32) -> vec4<f32> {
  let cold = 1.0 - smoothstep(-0.28, -0.12, temperature);
  let hot = smoothstep(0.1, 0.26, temperature);
  let dry = 1.0 - smoothstep(-0.08, 0.06, humidity);
  let wet = smoothstep(0.06, 0.2, humidity);
  let desert = hot * dry * (1.0 - cold);
  let snowy = cold;
  let forest = (1.0 - cold) * (1.0 - desert) * wet;
  let plains = max(0.0, 1.0 - desert - snowy - forest);
  return vec4<f32>(plains, desert, snowy, forest);
}

fn dominantBiome(w: vec4<f32>) -> u32 {
  var best = 0u;
  var bestWeight = w.x;
  if (w.y > bestWeight) { best = 1u; bestWeight = w.y; }
  if (w.z > bestWeight) { best = 2u; bestWeight = w.z; }
  if (w.w > bestWeight) { best = 3u; }
  return best;
}

// Procedural grass/foliage palette: bilinear over (temperature, humidity), darker in forests.
fn grassTint(temperature: f32, humidity: f32) -> vec3<f32> {
  let t = clamp(temperature * 1.6 + 0.5, 0.0, 1.0);
  let h = clamp(humidity * 1.6 + 0.5, 0.0, 1.0);
  let cold = mix(vec3<f32>(0.46, 0.6, 0.42), vec3<f32>(0.3, 0.5, 0.36), h);
  let hot = mix(vec3<f32>(0.72, 0.66, 0.3), vec3<f32>(0.28, 0.62, 0.14), h);
  let forest = biomeWeights(temperature, humidity).w;
  let shade = 1.0 - 0.3 * forest;
  return mix(cold, hot, t) * shade;
}
