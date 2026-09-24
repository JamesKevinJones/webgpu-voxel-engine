// Full-screen sky pass drawn before the terrain.
#include "common.wgsl"

struct SkyOut {
  @builtin(position) position: vec4<f32>,
  @location(0) ndc: vec2<f32>,
}

@vertex
fn vs_main(@builtin(vertex_index) vi: u32) -> SkyOut {
  // Single oversized triangle covering the viewport.
  let uv = vec2<f32>(f32((vi << 1u) & 2u), f32(vi & 2u));
  let ndc = uv * 2.0 - 1.0;
  var out: SkyOut;
  out.position = vec4<f32>(ndc, 1.0, 1.0);
  out.ndc = ndc;
  return out;
}

@fragment
fn fs_main(in: SkyOut) -> @location(0) vec4<f32> {
  let farPoint = frame.invViewProj * vec4<f32>(in.ndc, 1.0, 1.0);
  let dir = normalize(farPoint.xyz / farPoint.w - frame.cameraPos.xyz);
  var col = skyColor(dir);
  let mu = dot(dir, frame.sunDir.xyz);
  col += frame.sunColor.rgb * 24.0 * smoothstep(0.99955, 0.99975, mu);
  return vec4<f32>(toDisplay(col), 1.0);
}
