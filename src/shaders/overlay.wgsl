// Target-block overlays: wireframe selection box and the mining crack stages.
#include "common.wgsl"

struct Overlay {
  block: vec4<f32>,  // xyz = minimum corner of the targeted voxel, w = 1 when visible
  params: vec4<f32>, // x = crack stage 0..9 (negative = none)
}

@group(0) @binding(1) var<uniform> overlay: Overlay;
@group(0) @binding(2) var blockTextures: texture_2d_array<f32>;
@group(0) @binding(3) var blockSampler: sampler;

fn cubeCorner(i: u32) -> vec3<f32> {
  return vec3<f32>(f32(i & 1u), f32((i >> 1u) & 1u), f32((i >> 2u) & 1u));
}

// 12 edges × 2 endpoints (line list).
@vertex
fn vs_box(@builtin(vertex_index) vi: u32) -> @builtin(position) vec4<f32> {
  var edges = array<u32, 24>(0u, 1u, 2u, 3u, 4u, 5u, 6u, 7u, 0u, 2u, 1u, 3u, 4u, 6u, 5u, 7u, 0u, 4u, 1u, 5u, 2u, 6u, 3u, 7u);
  if (overlay.block.w < 0.5) {
    return vec4<f32>(2.0, 2.0, 2.0, 1.0);
  }
  let p = overlay.block.xyz - vec3<f32>(0.002) + cubeCorner(edges[vi]) * 1.004;
  return frame.viewProj * vec4<f32>(p, 1.0);
}

@fragment
fn fs_box() -> @location(0) vec4<f32> {
  return vec4<f32>(0.02, 0.02, 0.02, 0.75);
}

struct CrackOut {
  @builtin(position) clip: vec4<f32>,
  @location(0) uv: vec2<f32>,
}

@vertex
fn vs_crack(@builtin(vertex_index) vi: u32) -> CrackOut {
  var out: CrackOut;
  if (overlay.block.w < 0.5 || overlay.params.x < 0.0) {
    out.clip = vec4<f32>(2.0, 2.0, 2.0, 1.0);
    return out;
  }
  let face = vi / 6u;
  var quad = array<vec2<f32>, 6>(vec2<f32>(0.0, 0.0), vec2<f32>(1.0, 0.0), vec2<f32>(1.0, 1.0),
                                 vec2<f32>(0.0, 0.0), vec2<f32>(1.0, 1.0), vec2<f32>(0.0, 1.0));
  let c = quad[vi % 6u];
  let axis = face >> 1u;
  let negative = (face & 1u) == 1u;
  let u = (axis + 1u) % 3u;
  let v = (axis + 2u) % 3u;
  var local = vec3<f32>(0.0);
  local[axis] = select(1.0, 0.0, negative);
  local[u] = select(c.x, c.y, negative);
  local[v] = select(c.y, c.x, negative);
  // Slightly larger than the block so the overlay wins the depth test without z-fighting.
  let p = overlay.block.xyz - vec3<f32>(0.003) + local * 1.006;
  out.clip = frame.viewProj * vec4<f32>(p, 1.0);
  out.uv = c;
  return out;
}

@fragment
fn fs_crack(in: CrackOut) -> @location(0) vec4<f32> {
  let stage = i32(overlay.params.x);
  let texel = textureSampleLevel(blockTextures, blockSampler, in.uv, TEX_CRACK_0 + stage, 0.0);
  if (texel.a < 0.5) {
    discard;
  }
  return vec4<f32>(texel.rgb, 0.8);
}
