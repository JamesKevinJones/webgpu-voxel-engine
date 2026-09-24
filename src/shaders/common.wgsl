// Per-frame uniforms and shared atmosphere / output helpers.
// Layout must match src/core/uniforms.ts (FRAME_LAYOUT).

struct Frame {
  viewProj: mat4x4<f32>,
  invViewProj: mat4x4<f32>,
  cameraPos: vec4<f32>,   // xyz = eye position, w = time in seconds
  sunDir: vec4<f32>,      // xyz = unit vector towards the sun, w = sun intensity
  sunColor: vec4<f32>,    // rgb = linear sun colour
  skyZenith: vec4<f32>,   // rgb = linear zenith colour
  skyHorizon: vec4<f32>,  // rgb = linear horizon colour
  fog: vec4<f32>,         // x = fog end distance, y = density, z = height falloff, w = fog base height
  viewport: vec4<f32>,    // xy = size in pixels, zw = 1 / size
}

@group(0) @binding(0) var<uniform> frame: Frame;

const PI: f32 = 3.14159265359;

// Analytic sky: zenith/horizon gradient plus forward-scattering glow around the sun.
fn skyColor(dir: vec3<f32>) -> vec3<f32> {
  let up = clamp(dir.y, -1.0, 1.0);
  let t = pow(clamp(up, 0.0, 1.0), 0.5);
  var col = mix(frame.skyHorizon.rgb, frame.skyZenith.rgb, t);
  col = mix(col, frame.skyHorizon.rgb * 0.7, clamp(-up * 2.5, 0.0, 1.0));
  let mu = max(dot(dir, frame.sunDir.xyz), 0.0);
  col += frame.sunColor.rgb * (pow(mu, 8.0) * 0.18 + pow(mu, 96.0) * 0.6);
  return col;
}

// Exponential-squared distance fog, denser close to the base height, forced to 1 at the
// streaming edge so chunk boundaries dissolve into the sky. Returns the fog amount in [0,1].
fn fogAmount(world: vec3<f32>) -> f32 {
  let dist = distance(world, frame.cameraPos.xyz);
  let heightTerm = exp(-max(world.y - frame.fog.w, 0.0) * frame.fog.z);
  let d = dist * frame.fog.y * (0.55 + 0.45 * heightTerm);
  let f = 1.0 - exp(-d * d);
  return max(f, smoothstep(frame.fog.x * 0.8, frame.fog.x, dist));
}

// ACES filmic approximation (Narkowicz 2015).
fn tonemap(x: vec3<f32>) -> vec3<f32> {
  let a = 2.51;
  let b = 0.03;
  let c = 2.43;
  let d = 0.59;
  let e = 0.14;
  return clamp((x * (a * x + b)) / (x * (c * x + d) + e), vec3<f32>(0.0), vec3<f32>(1.0));
}

// Linear HDR → display: tonemap then gamma encode (the swap chain format is not sRGB).
fn toDisplay(linear: vec3<f32>) -> vec3<f32> {
  return pow(tonemap(linear), vec3<f32>(1.0 / 2.2));
}
