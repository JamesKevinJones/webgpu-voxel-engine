// Depth-only shadow pass: renders the opaque chunk geometry into one cascade layer of the
// depth32float shadow map array, using the same vertex pulling as the terrain pipeline.
#include "common.wgsl"

@group(0) @binding(1) var<storage, read> vertices: array<u32>;
@group(0) @binding(2) var<storage, read> chunkOrigins: array<vec4<i32>>;

override VERTEX_CAPACITY: u32 = 24576u;
override CASCADE: u32 = 0u;

@vertex
fn vs_shadow(@builtin(vertex_index) vi: u32) -> @builtin(position) vec4<f32> {
  let packed = vertices[vi];
  let origin = vec3<f32>(chunkOrigins[vi / VERTEX_CAPACITY].xyz);
  let local = vec3<f32>(f32(packed & 63u), f32((packed >> 6u) & 63u), f32((packed >> 12u) & 63u));
  let world = vec4<f32>(origin + local, 1.0);
  if (CASCADE == 0u) {
    return frame.shadowViewProj0 * world;
  }
  return frame.shadowViewProj1 * world;
}
