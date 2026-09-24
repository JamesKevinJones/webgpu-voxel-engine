// Per-frame uniforms and shared atmosphere / output helpers.
// Layout must match src/core/uniforms.ts (FRAME_LAYOUT).

struct Frame {
  viewProj: mat4x4<f32>,
  invViewProj: mat4x4<f32>,
  shadowViewProj0: mat4x4<f32>, // world → light clip space, cascade 0 (near)
  shadowViewProj1: mat4x4<f32>, // cascade 1 (far)
  cameraPos: vec4<f32>,   // xyz = eye position, w = time in seconds
  cameraDir: vec4<f32>,   // xyz = view direction, w = world seed (u32 bits)
  lightDir: vec4<f32>,    // xyz = unit vector towards the key light (sun or moon), w = intensity
  lightColor: vec4<f32>,  // rgb = key light colour, w = daylight factor (0 night .. 1 day)
  sunDir: vec4<f32>,      // xyz = unit vector towards the sun, w = sun visibility
  sunColor: vec4<f32>,    // rgb = sun colour, w = moon visibility
  skyZenith: vec4<f32>,   // rgb = linear zenith colour, w = star visibility
  skyHorizon: vec4<f32>,  // rgb = linear horizon colour
  fog: vec4<f32>,         // x = fog end distance, y = density, z = height falloff, w = fog base height
  viewport: vec4<f32>,    // xy = size in pixels, zw = 1 / size
  clip: vec4<f32>,        // x = near plane, y = far plane
  shadowSplits: vec4<f32>, // x = cascade 0 far depth, y = shadow distance, z/w = texel size of cascade 0/1
  shadowParams: vec4<f32>, // x = enabled, y = cascade blend fraction, z = 1 / shadow map resolution
}

@group(0) @binding(0) var<uniform> frame: Frame;

const PI: f32 = 3.14159265359;
const MOON_COLOR: vec3<f32> = vec3<f32>(0.55, 0.65, 1.0);

fn worldSeed() -> u32 {
  return bitcast<u32>(frame.cameraDir.w);
}

fn hash31(p: vec3<f32>) -> f32 {
  var q = fract(p * 0.1031);
  q += dot(q, q.zyx + 31.32);
  return fract((q.x + q.y) * q.z);
}

// Two-colour sky gradient (zenith ↔ horizon, both driven by the sun angle) plus forward-scattering
// glow around the sun and a faint halo around the moon.
fn skyColor(dir: vec3<f32>) -> vec3<f32> {
  let up = clamp(dir.y, -1.0, 1.0);
  let t = pow(clamp(up, 0.0, 1.0), 0.5);
  var col = mix(frame.skyHorizon.rgb, frame.skyZenith.rgb, t);
  col = mix(col, frame.skyHorizon.rgb * 0.7, clamp(-up * 2.5, 0.0, 1.0));
  let mu = max(dot(dir, frame.sunDir.xyz), 0.0);
  col += frame.sunColor.rgb * frame.sunDir.w * (pow(mu, 8.0) * 0.18 + pow(mu, 96.0) * 0.6);
  let moonMu = max(dot(dir, -frame.sunDir.xyz), 0.0);
  col += MOON_COLOR * frame.sunColor.w * pow(moonMu, 48.0) * 0.05;
  return col;
}

// Exponential-squared distance fog, denser close to the base height, forced to 1 at the
// streaming edge so chunk boundaries dissolve into the sky. Returns the fog amount in [0,1].
fn fogAmount(world: vec3<f32>) -> f32 {
  let dist = distance(world, frame.cameraPos.xyz);
  let heightTerm = exp(-max(world.y - frame.fog.w, 0.0) * frame.fog.z);
  let d = dist * frame.fog.y * (0.55 + 0.45 * heightTerm);
  let f = 1.0 - exp(-d * d);
  return max(f, smoothstep(frame.fog.x * 0.75, frame.fog.x, dist));
}

// Distance from the eye for a depth-buffer value of the WebGPU (z in [0,1]) perspective projection.
fn linearDepth(depth: f32) -> f32 {
  let n = frame.clip.x;
  let f = frame.clip.y;
  return n * f / (f - depth * (f - n));
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

const EXPOSURE: f32 = 1.15;

// Linear HDR → display: exposure, tonemap, then gamma encode (the swap chain format is not sRGB).
fn toDisplay(linear: vec3<f32>) -> vec3<f32> {
  return pow(tonemap(linear * EXPOSURE), vec3<f32>(1.0 / 2.2));
}
