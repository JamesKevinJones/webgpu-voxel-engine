// Block-break debris: compute simulation + instanced cube rendering. Layout in src/fx/particles.ts.
#include "common.wgsl"

struct SimParams {
  dt: f32,
  gravity: f32,
  count: u32,
  pad: u32,
}

@group(0) @binding(1) var<storage, read_write> particles: array<vec4<f32>>;
@group(0) @binding(2) var<uniform> sim: SimParams;

// Mirrors stepParticle() in src/fx/particles.ts.
@compute @workgroup_size(64)
fn simulate(@builtin(global_invocation_id) gid: vec3<u32>) {
  let i = gid.x;
  if (i >= sim.count) {
    return;
  }
  var p0 = particles[i * 3u];      // position, life
  var p1 = particles[i * 3u + 1u]; // velocity, size
  let p2 = particles[i * 3u + 2u]; // floor, block, seed, total life
  if (p0.w <= 0.0) {
    return;
  }
  p1.y -= sim.gravity * sim.dt;
  p0 = vec4<f32>(p0.xyz + p1.xyz * sim.dt, p0.w);
  let half = p1.w * 0.5;
  if (p0.y - half < p2.x) {
    p0.y = p2.x + half;
    if (p1.y < 0.0) {
      p1.y = -p1.y * PARTICLE_RESTITUTION;
      p1.x *= PARTICLE_FRICTION;
      p1.z *= PARTICLE_FRICTION;
    }
  }
  p0.w -= sim.dt;
  particles[i * 3u] = p0;
  particles[i * 3u + 1u] = p1;
}

@group(0) @binding(3) var blockTextures: texture_2d_array<f32>;
@group(0) @binding(4) var blockSampler: sampler;
@group(0) @binding(5) var<storage, read> renderParticles: array<vec4<f32>>;

struct ParticleOut {
  @builtin(position) clip: vec4<f32>,
  @location(0) uv: vec2<f32>,
  @location(1) @interpolate(flat) layer: i32,
  @location(2) light: f32,
  @location(3) world: vec3<f32>,
}

@vertex
fn vs_particle(@builtin(vertex_index) vi: u32, @builtin(instance_index) ii: u32) -> ParticleOut {
  var out: ParticleOut;
  let p0 = renderParticles[ii * 3u];
  let p1 = renderParticles[ii * 3u + 1u];
  let p2 = renderParticles[ii * 3u + 2u];
  if (p0.w <= 0.0) {
    out.clip = vec4<f32>(2.0, 2.0, 2.0, 1.0); // dead: outside the clip volume
    return out;
  }
  // 36 vertices: 6 faces × 2 triangles, CCW seen from outside.
  let face = vi / 6u;
  var quad = array<vec2<f32>, 6>(vec2<f32>(0.0, 0.0), vec2<f32>(1.0, 0.0), vec2<f32>(1.0, 1.0),
                                 vec2<f32>(0.0, 0.0), vec2<f32>(1.0, 1.0), vec2<f32>(0.0, 1.0));
  let c = quad[vi % 6u];
  let axis = face >> 1u;
  let negative = (face & 1u) == 1u;
  let u = (axis + 1u) % 3u;
  let v = (axis + 2u) % 3u;
  var local = vec3<f32>(0.0);
  local[axis] = select(0.5, -0.5, negative);
  local[u] = select(c.x, c.y, negative) - 0.5;
  local[v] = select(c.y, c.x, negative) - 0.5;
  // Shrink during the last 0.3 s of life.
  let size = p1.w * clamp(p0.w / 0.3, 0.0, 1.0);
  let world = p0.xyz + local * size;
  out.clip = frame.viewProj * vec4<f32>(world, 1.0);
  out.world = world;
  // A random quarter of the block texture, so each fragment shows a piece of the broken block.
  out.uv = vec2<f32>(fract(p2.z * 7.13), fract(p2.z * 3.71)) * 0.75 + c * 0.25;
  out.layer = textureLayer(u32(p2.y), face);
  var n = vec3<f32>(0.0);
  n[axis] = select(1.0, -1.0, negative);
  out.light = max(dot(n, frame.lightDir.xyz), 0.0);
  return out;
}

@fragment
fn fs_particle(in: ParticleOut) -> @location(0) vec4<f32> {
  let texel = textureSampleLevel(blockTextures, blockSampler, in.uv, in.layer, 0.0);
  if (texel.a < 0.5) {
    discard;
  }
  var albedo = texel.rgb;
  if (tintMode(in.layer) != 0u) {
    albedo *= pow(vec3<f32>(0.42, 0.7, 0.28), vec3<f32>(2.2)) * 1.75; // generic foliage green for grass/leaf debris
  }
  let direct = frame.lightColor.rgb * frame.lightDir.w * in.light / PI;
  let ambient = frame.skyZenith.rgb * 0.7 + frame.skyHorizon.rgb * 0.3 + vec3<f32>(0.02);
  let color = albedo * (direct + ambient);
  let dir = normalize(in.world - frame.cameraPos.xyz);
  return vec4<f32>(toDisplay(mix(color, skyColor(dir), fogAmount(in.world))), 1.0);
}
