// Full-screen sky pass drawn before the terrain: gradient dome, sun and moon discs, stars.
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
  let above = smoothstep(-0.02, 0.02, dir.y);

  // Sun disc.
  let mu = dot(dir, frame.sunDir.xyz);
  col += frame.sunColor.rgb * 24.0 * frame.sunDir.w * smoothstep(0.99955, 0.99975, mu);

  // Moon disc with a little shading.
  let moonMu = dot(dir, -frame.sunDir.xyz);
  let moon = smoothstep(0.99965, 0.9998, moonMu) * frame.sunColor.w;
  col += MOON_COLOR * 1.6 * moon * (0.8 + 0.2 * hash31(floor(dir * 900.0)));

  // Stars: sparse hashed cells on the direction sphere, twinkling slightly.
  let cell = floor(dir * 220.0);
  let h = hash31(cell);
  let twinkle = 0.7 + 0.3 * sin(frame.cameraPos.w * (1.5 + h * 3.0) + h * 40.0);
  let star = step(0.9965, h) * twinkle * above;
  col += vec3<f32>(0.9, 0.95, 1.0) * star * frame.skyZenith.w * 1.5;

  return vec4<f32>(toDisplay(col), 1.0);
}
