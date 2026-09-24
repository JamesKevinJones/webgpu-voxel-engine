// Terrain render pipeline: vertex pulling from the compute-generated vertex pools, drawn with
// drawIndexedIndirect. The chunk slot is recovered from vertex_index because each indirect record's
// baseVertex is slot * VERTEX_CAPACITY.
#include "common.wgsl"

@group(0) @binding(1) var<storage, read> vertices: array<u32>;
@group(0) @binding(2) var<storage, read> chunkOrigins: array<vec4<i32>>;

// Vertex capacity of one chunk slot in the bound pool (opaque or water pipeline).
override VERTEX_CAPACITY: u32 = 24576u;

struct VertexOut {
  @builtin(position) clip: vec4<f32>,
  @location(0) world: vec3<f32>,
  @location(1) ao: f32,
  @location(2) @interpolate(flat) face: u32,
  @location(3) @interpolate(flat) block: u32,
}

@vertex
fn vs_main(@builtin(vertex_index) vi: u32) -> VertexOut {
  let packed = vertices[vi];
  let slot = vi / VERTEX_CAPACITY;
  let origin = vec3<f32>(chunkOrigins[slot].xyz);
  let local = vec3<f32>(f32(packed & 63u), f32((packed >> 6u) & 63u), f32((packed >> 12u) & 63u));
  let face = (packed >> 18u) & 7u;
  let ao = (packed >> 21u) & 3u;
  let block = (packed >> 23u) & 15u;
  var world = origin + local;
  if (block == BLOCK_WATER && face == 2u) {
    world.y -= 0.12; // water surface sits slightly below the block top
  }
  var out: VertexOut;
  out.clip = frame.viewProj * vec4<f32>(world, 1.0);
  out.world = world;
  // AO levels 0..3 → light factor, slightly curved for contrast.
  let aoLinear = f32(ao) / 3.0;
  out.ao = mix(0.28, 1.0, aoLinear * aoLinear * 0.35 + aoLinear * 0.65);
  out.face = face;
  out.block = block;
  return out;
}

fn faceNormal(face: u32) -> vec3<f32> {
  var n = vec3<f32>(0.0, 0.0, 0.0);
  n[face >> 1u] = select(1.0, -1.0, (face & 1u) == 1u);
  return n;
}

// In-plane coordinates of a face, in voxel units.
fn faceUV(world: vec3<f32>, face: u32) -> vec2<f32> {
  let axis = face >> 1u;
  if (axis == 0u) {
    return world.zy;
  }
  if (axis == 1u) {
    return world.xz;
  }
  return world.xy;
}

fn hash31(p: vec3<f32>) -> f32 {
  var q = fract(p * 0.1031);
  q += dot(q, q.zyx + 31.32);
  return fract((q.x + q.y) * q.z);
}

fn srgbToLinear(c: vec3<f32>) -> vec3<f32> {
  return pow(c, vec3<f32>(2.2));
}

struct Material {
  albedo: vec3<f32>,
  roughness: f32,
}

fn material(block: u32, face: u32, world: vec3<f32>) -> Material {
  let n = faceNormal(face);
  let cell = floor(world - n * 0.5);
  let uv = faceUV(world, face);
  let texel = floor(fract(uv) * 16.0);
  let grain = hash31(cell * 7.31 + vec3<f32>(texel, f32(face) * 3.7));
  let blockTone = hash31(cell + vec3<f32>(0.37, 11.1, 5.3));
  var base = vec3<f32>(1.0, 0.0, 1.0);
  var roughness = 0.9;
  switch block {
    case BLOCK_STONE: {
      base = vec3<f32>(0.50, 0.50, 0.52);
      roughness = 0.82;
    }
    case BLOCK_DIRT: {
      base = vec3<f32>(0.46, 0.32, 0.20);
      roughness = 0.95;
    }
    case BLOCK_GRASS: {
      let grass = vec3<f32>(0.34, 0.58, 0.20);
      let dirt = vec3<f32>(0.46, 0.32, 0.20);
      if (face == 2u) {
        base = grass;
      } else if (face == 3u) {
        base = dirt;
      } else {
        // Grass overhang on the upper part of side faces, with a ragged edge.
        let edge = 0.80 - grain * 0.14;
        base = select(dirt, grass, fract(world.y) > edge);
      }
      roughness = 0.85;
    }
    case BLOCK_SAND: {
      base = vec3<f32>(0.86, 0.79, 0.57);
      roughness = 0.92;
    }
    case BLOCK_WATER: {
      base = vec3<f32>(0.10, 0.32, 0.46);
      roughness = 0.06;
    }
    case BLOCK_BASALT: {
      base = vec3<f32>(0.19, 0.19, 0.22);
      roughness = 0.55;
    }
    default: {}
  }
  let variation = 0.86 + 0.18 * grain + 0.08 * (blockTone - 0.5);
  return Material(srgbToLinear(clamp(base * variation, vec3<f32>(0.0), vec3<f32>(1.0))), roughness);
}

// Directional sun (GGX / Smith / Schlick) plus hemispherical sky ambient with baked AO.
fn shade(albedo: vec3<f32>, n: vec3<f32>, world: vec3<f32>, ao: f32, roughness: f32, f0: f32) -> vec3<f32> {
  let l = frame.sunDir.xyz;
  let v = normalize(frame.cameraPos.xyz - world);
  let h = normalize(l + v);
  let nDotL = max(dot(n, l), 0.0);
  let nDotV = max(dot(n, v), 1e-3);
  let nDotH = max(dot(n, h), 0.0);
  let vDotH = max(dot(v, h), 0.0);
  let a = roughness * roughness;
  let a2 = a * a;
  let denom = nDotH * nDotH * (a2 - 1.0) + 1.0;
  let distribution = a2 / (PI * denom * denom);
  let k = (roughness + 1.0) * (roughness + 1.0) / 8.0;
  let geometry = (nDotV / (nDotV * (1.0 - k) + k)) * (nDotL / (nDotL * (1.0 - k) + k));
  let fresnel = f0 + (1.0 - f0) * pow(1.0 - vDotH, 5.0);
  let specular = distribution * geometry * fresnel / max(4.0 * nDotV * nDotL, 1e-3);
  let radiance = frame.sunColor.rgb * frame.sunDir.w;
  let direct = ((1.0 - fresnel) * albedo / PI + specular) * radiance * nDotL;
  // Hemispherical sky light: horizon-tinted from below, zenith-tinted from above.
  let skyAmbient = mix(frame.skyHorizon.rgb * 0.5, frame.skyZenith.rgb * 0.7 + frame.skyHorizon.rgb * 0.35, n.y * 0.5 + 0.5);
  let bounce = vec3<f32>(0.12, 0.10, 0.08) * max(-n.y, 0.0);
  let ambient = albedo * (skyAmbient + bounce) * ao;
  return direct * mix(0.5, 1.0, ao) + ambient;
}

@fragment
fn fs_opaque(in: VertexOut) -> @location(0) vec4<f32> {
  let n = faceNormal(in.face);
  let m = material(in.block, in.face, in.world);
  var color = shade(m.albedo, n, in.world, in.ao, m.roughness, 0.04);
  let dir = normalize(in.world - frame.cameraPos.xyz);
  color = mix(color, skyColor(dir), fogAmount(in.world));
  return vec4<f32>(toDisplay(color), 1.0);
}

@fragment
fn fs_water(in: VertexOut) -> @location(0) vec4<f32> {
  var n = faceNormal(in.face);
  if (in.face == 2u) {
    // Animated ripples: analytic derivatives of a few travelling sine waves.
    let t = frame.cameraPos.w;
    let p = in.world.xz;
    let dx = cos(p.x * 1.1 + t * 1.3) * 0.6 + cos((p.x + p.y) * 0.7 + t * 0.9) * 0.4;
    let dz = cos(p.y * 1.3 - t * 1.1) * 0.6 + cos((p.x - p.y) * 0.8 + t * 1.7) * 0.4;
    n = normalize(vec3<f32>(dx * 0.05, 1.0, dz * 0.05));
  }
  let m = material(in.block, in.face, in.world);
  let v = normalize(frame.cameraPos.xyz - in.world);
  let cosTheta = abs(dot(n, v));
  let fresnel = 0.02 + 0.98 * pow(1.0 - cosTheta, 5.0);
  let lit = shade(m.albedo, n, in.world, in.ao, m.roughness, 0.02);
  let reflection = skyColor(reflect(-v, n));
  var color = mix(lit, reflection, fresnel);
  var alpha = mix(0.62, 0.95, fresnel);
  let fog = fogAmount(in.world);
  color = mix(color, skyColor(-v), fog);
  alpha = mix(alpha, 1.0, fog);
  return vec4<f32>(toDisplay(color), alpha);
}
