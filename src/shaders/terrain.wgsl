// Terrain render pipelines: vertex pulling from the compute-generated vertex pools, drawn with
// drawIndexedIndirect. Blocks are textured from a 16×16 pixel-art texture array, tinted per biome
// (climate evaluated per vertex, so tints blend smoothly), lit by the sun/moon with cascaded
// shadow maps and by the flood-filled voxel light (skylight + torch light, smoothed per vertex by
// the mesher). The chunk slot is recovered from vertex_index because each indirect record's
// baseVertex is slot * VERTEX_CAPACITY; the quad's light word sits at LIGHT_OFFSET + vertex / 4.
#include "common.wgsl"
#include "climate.wgsl"

@group(0) @binding(1) var<storage, read> vertices: array<u32>;
@group(0) @binding(2) var<storage, read> chunkOrigins: array<vec4<i32>>;
@group(0) @binding(3) var blockTextures: texture_2d_array<f32>;
@group(0) @binding(4) var blockSampler: sampler;
@group(0) @binding(5) var shadowMap: texture_depth_2d_array;
@group(0) @binding(6) var shadowSampler: sampler_comparison;
// Scene depth after the opaque pass (water pipeline only; bound read-only).
@group(1) @binding(0) var sceneDepth: texture_depth_2d;

// Vertex capacity of one chunk slot in the bound pool (opaque, water or cutout pipeline).
override VERTEX_CAPACITY: u32 = 24576u;
// First light word of the bound pool (mesh slots × VERTEX_CAPACITY).
override LIGHT_OFFSET: u32 = 0u;

const TORCH_COLOR: vec3<f32> = vec3<f32>(1.0, 0.63, 0.32);

struct VertexOut {
  @builtin(position) clip: vec4<f32>,
  @location(0) world: vec3<f32>,
  @location(1) ao: f32,
  @location(2) @interpolate(flat) face: u32,
  @location(3) @interpolate(flat) block: u32,
  @location(4) tint: vec3<f32>,
  @location(5) viewDepth: f32,
  // Cross plants: (u, v) inside the voxel (v = 0 at the top).
  @location(6) plantUV: vec2<f32>,
  // Smoothed voxel light: x = skylight, y = block (torch) light, both 0..1.
  @location(7) light: vec2<f32>,
}

fn isWater(b: u32) -> bool {
  return b == BLOCK_WATER || (b >= BLOCK_WATER_FLOW1 && b <= BLOCK_WATER_FALLING);
}

// How far the top edge of a water cell sits below the cell top (flowing water drops per level).
fn waterDrop(b: u32) -> f32 {
  var surface = 8.0;
  if (b >= BLOCK_WATER_FLOW1 && b <= BLOCK_WATER_FLOW7) {
    surface = f32(8u - (b - BLOCK_WATER_FLOW1 + 1u));
  }
  return 1.0 - surface / 8.0 * 0.88;
}

@vertex
fn vs_main(@builtin(vertex_index) vi: u32) -> VertexOut {
  let packed = vertices[vi];
  let slot = vi / VERTEX_CAPACITY;
  let origin = vec3<f32>(chunkOrigins[slot].xyz);
  let local = vec3<f32>(f32(packed & 63u), f32((packed >> 6u) & 63u), f32((packed >> 12u) & 63u));
  let face = (packed >> 18u) & 7u;
  let ao = (packed >> 21u) & 3u;
  let block = (packed >> 23u) & 31u;
  var world = origin + local;
  let corner = vi & 3u;
  if (isWater(block) && face != 3u) {
    // Water quads are never rotated (their AO is uniform), so the corner index tells which
    // vertices are on the top edge: lower them to the water surface (sources sit 0.12 below the
    // block top, flowing water lower per level; waterfall sides stay full height).
    let c = select(corner, (4u - corner) & 3u, (face & 1u) == 1u);
    let cu = c == 1u || c == 2u;
    let cv = c >= 2u;
    let top = face == 2u || (face <= 1u && cu) || (face >= 4u && cv);
    if (top && (face == 2u || block != BLOCK_WATER_FALLING)) {
      world.y -= waterDrop(block);
    }
  }
  var out: VertexOut;
  out.plantUV = vec2<f32>(select(0.0, 1.0, corner == 1u || corner == 2u), select(1.0, 0.0, corner >= 2u));
  let lightWord = vertices[LIGHT_OFFSET + (vi >> 2u)];
  let lightByte = (lightWord >> (corner * 8u)) & 0xffu;
  out.light = vec2<f32>(f32(lightByte >> 4u), f32(lightByte & 15u)) / 15.0;
  if (face >= 6u && corner >= 2u && block != BLOCK_TORCH) {
    // Gentle wind sway on the top edge of plants.
    let t = frame.cameraPos.w;
    world.x += sin(t * 1.7 + world.z * 0.9 + world.x * 0.3) * 0.06;
    world.z += cos(t * 1.3 + world.x * 0.8) * 0.06;
  }
  out.clip = frame.viewProj * vec4<f32>(world, 1.0);
  out.world = world;
  // AO levels 0..3 → light factor, slightly curved for contrast.
  let aoLinear = f32(ao) / 3.0;
  out.ao = mix(0.28, 1.0, aoLinear * aoLinear * 0.35 + aoLinear * 0.65);
  out.face = face;
  out.block = block;
  let seed = worldSeed();
  out.tint = grassTint(temperatureAt(world.x, world.z, seed), humidityAt(world.x, world.z, seed));
  out.viewDepth = dot(world - frame.cameraPos.xyz, frame.cameraDir.xyz);
  return out;
}

fn faceNormal(face: u32) -> vec3<f32> {
  if (face >= 6u) {
    return vec3<f32>(0.0, 1.0, 0.0); // plants are lit like the ground they grow on
  }
  var n = vec3<f32>(0.0, 0.0, 0.0);
  n[face >> 1u] = select(1.0, -1.0, (face & 1u) == 1u);
  return n;
}

// Texture coordinates of a face in voxel units: top/bottom use (x, z); side faces use a
// horizontal axis and -y so the texture's top row sits at the top of the block.
fn faceUV(world: vec3<f32>, face: u32) -> vec2<f32> {
  switch face {
    case 0u: { return vec2<f32>(-world.z, -world.y); }
    case 1u: { return vec2<f32>(world.z, -world.y); }
    case 4u: { return vec2<f32>(world.x, -world.y); }
    case 5u: { return vec2<f32>(-world.x, -world.y); }
    default: { return world.xz; }
  }
}

fn roughnessOf(block: u32) -> f32 {
  switch block {
    case BLOCK_WATER, BLOCK_WATER_FALLING: { return 0.06; }
    case BLOCK_ICE, BLOCK_GLASS: { return 0.12; }
    case BLOCK_BASALT: { return 0.55; }
    case BLOCK_LEAVES, BLOCK_PINE_LEAVES: { return 0.7; }
    case BLOCK_STONE, BLOCK_BEDROCK, BLOCK_COBBLESTONE: { return 0.8; }
    default: { return 0.9; }
  }
}

// Applies the biome tint according to the layer's tint mode (see TINTED_LAYERS).
fn tinted(texel: vec4<f32>, layer: i32, tint: vec3<f32>) -> vec3<f32> {
  let mode = tintMode(layer);
  // The palette is authored in sRGB; the grey tintable textures average ≈ 0.57 linear.
  let linearTint = pow(tint, vec3<f32>(2.2)) * 1.75;
  if (mode == 1u) {
    return texel.rgb * linearTint;
  }
  if (mode == 2u) {
    return mix(texel.rgb, texel.rgb * linearTint, texel.a);
  }
  return texel.rgb;
}

// ---------------------------------------------------------------------------------- shadows

fn sampleCascade(cascade: i32, world: vec3<f32>, n: vec3<f32>, nDotL: f32) -> f32 {
  let texel = select(frame.shadowSplits.w, frame.shadowSplits.z, cascade == 0);
  // Normal offset grows with the slope to the light: prevents acne on grazing faces.
  let slope = clamp(sqrt(max(1.0 - nDotL * nDotL, 0.0)) / max(nDotL, 0.05), 0.0, 5.0);
  let p = world + n * texel * (1.0 + 1.2 * slope);
  var clipPos = frame.shadowViewProj1 * vec4<f32>(p, 1.0);
  if (cascade == 0) {
    clipPos = frame.shadowViewProj0 * vec4<f32>(p, 1.0);
  }
  let uv = vec2<f32>(clipPos.x * 0.5 + 0.5, 0.5 - clipPos.y * 0.5);
  if (any(uv < vec2<f32>(0.0)) || any(uv > vec2<f32>(1.0)) || clipPos.z > 1.0) {
    return 1.0;
  }
  let depth = clipPos.z - 0.0004;
  // 3×3 PCF; each tap is itself bilinearly filtered by the comparison sampler.
  let texelStep = frame.shadowParams.z;
  var lit = 0.0;
  for (var dy = -1; dy <= 1; dy++) {
    for (var dx = -1; dx <= 1; dx++) {
      let offset = vec2<f32>(f32(dx), f32(dy)) * texelStep;
      lit += textureSampleCompareLevel(shadowMap, shadowSampler, uv + offset, cascade, depth);
    }
  }
  return lit / 9.0;
}

// Fraction of direct light reaching `world` (1 = fully lit).
fn shadowFactor(world: vec3<f32>, n: vec3<f32>, viewDepth: f32) -> f32 {
  if (frame.shadowParams.x < 0.5) {
    return 1.0;
  }
  let nDotL = dot(n, frame.lightDir.xyz);
  if (nDotL <= 0.0) {
    return 0.0;
  }
  let split0 = frame.shadowSplits.x;
  let shadowFar = frame.shadowSplits.y;
  if (viewDepth >= shadowFar) {
    return 1.0;
  }
  let blend = frame.shadowParams.y;
  if (viewDepth < split0) {
    let near = sampleCascade(0, world, n, nDotL);
    // Cross-fade into cascade 1 over the last part of cascade 0 (no visible seam).
    let t = smoothstep(split0 * (1.0 - blend), split0, viewDepth);
    if (t <= 0.0) {
      return near;
    }
    return mix(near, sampleCascade(1, world, n, nDotL), t);
  }
  let far = sampleCascade(1, world, n, nDotL);
  return mix(far, 1.0, smoothstep(shadowFar * (1.0 - blend), shadowFar, viewDepth));
}

// ---------------------------------------------------------------------------------- lighting

// Directional key light (GGX / Smith / Schlick) with shadows, hemispherical sky ambient with baked
// AO, and warm torch light. `light` is the voxel light (sky, block): skylight gates the sun (voxels
// the flood fill says are enclosed never see it, even beyond the shadow maps) and scales the sky
// ambient quadratically, so caves fall off into darkness; block light adds a torch-coloured term.
fn shade(albedo: vec3<f32>, n: vec3<f32>, world: vec3<f32>, ao: f32, roughness: f32, f0: f32, shadow: f32, light: vec2<f32>) -> vec3<f32> {
  let l = frame.lightDir.xyz;
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
  let radiance = frame.lightColor.rgb * frame.lightDir.w;
  let sky = light.x;
  let sunVisible = smoothstep(0.2, 0.75, sky);
  let direct = ((1.0 - fresnel) * albedo / PI + specular) * radiance * nDotL * shadow * sunVisible;
  // Hemispherical sky light: horizon-tinted from below, zenith-tinted from above.
  let skyAmbient = mix(frame.skyHorizon.rgb * 0.5, frame.skyZenith.rgb * 0.7 + frame.skyHorizon.rgb * 0.35, n.y * 0.5 + 0.5);
  let bounce = vec3<f32>(0.12, 0.10, 0.08) * max(-n.y, 0.0) * frame.lightColor.w;
  let night = vec3<f32>(0.012, 0.016, 0.03);
  let skyFactor = sky * sky;
  let torch = TORCH_COLOR * (pow(light.y, 2.4) * 1.9);
  let cave = vec3<f32>(0.004, 0.005, 0.007);
  let ambient = albedo * ((skyAmbient + bounce + night) * skyFactor + torch + cave) * ao;
  return direct * mix(0.5, 1.0, ao) + ambient;
}

fn finish(color: vec3<f32>, world: vec3<f32>) -> vec3<f32> {
  let dir = normalize(world - frame.cameraPos.xyz);
  return toDisplay(mix(color, skyColor(dir), fogAmount(world)));
}

@fragment
fn fs_opaque(in: VertexOut) -> @location(0) vec4<f32> {
  let uv = faceUV(in.world, in.face);
  let ddx = dpdx(uv);
  let ddy = dpdy(uv);
  let n = faceNormal(in.face);
  let layer = textureLayer(in.block, in.face);
  let texel = textureSampleGrad(blockTextures, blockSampler, fract(uv), layer, ddx, ddy);
  // Subtle per-block tone variation breaks up repetition of the 16×16 tiles.
  let cell = floor(in.world - n * 0.5);
  let tone = 0.94 + 0.12 * hash31(cell + vec3<f32>(0.37, 11.1, 5.3));
  let albedo = tinted(texel, layer, in.tint) * tone;
  let shadow = shadowFactor(in.world, n, in.viewDepth);
  let color = shade(albedo, n, in.world, in.ao, roughnessOf(in.block), 0.04, shadow, in.light);
  return vec4<f32>(finish(color, in.world), 1.0);
}

// Alpha-tested geometry: glass faces, cross plants and torches.
@fragment
fn fs_cutout(in: VertexOut) -> @location(0) vec4<f32> {
  let cross = in.face >= 6u;
  let worldUV = faceUV(in.world, in.face);
  let uv = select(worldUV, in.plantUV, cross);
  let ddx = dpdx(uv);
  let ddy = dpdy(uv);
  let layer = textureLayer(in.block, in.face);
  let sampleUV = select(fract(uv), clamp(uv, vec2<f32>(0.001), vec2<f32>(0.999)), cross);
  let texel = textureSampleGrad(blockTextures, blockSampler, sampleUV, layer, ddx, ddy);
  if (texel.a < 0.5) {
    discard;
  }
  let n = faceNormal(in.face);
  let albedo = tinted(texel, layer, in.tint);
  let shadow = shadowFactor(in.world, n, in.viewDepth);
  let ao = select(in.ao, 1.0, cross);
  var color = shade(albedo, n, in.world, ao, roughnessOf(in.block), 0.04, shadow, in.light);
  if (in.block == BLOCK_TORCH && in.plantUV.y < 0.42) {
    color = albedo * 3.2; // the flame glows
  }
  return vec4<f32>(finish(color, in.world), 1.0);
}

const WATER_SHALLOW: vec3<f32> = vec3<f32>(0.10, 0.42, 0.45);
const WATER_DEEP: vec3<f32> = vec3<f32>(0.015, 0.07, 0.16);

@fragment
fn fs_water(in: VertexOut) -> @location(0) vec4<f32> {
  let t = frame.cameraPos.w;
  // Two texture layers scrolled against each other with a small sine warp: animated UV waves.
  let base = faceUV(in.world, in.face);
  let warp = vec2<f32>(sin(base.y * 0.9 + t * 1.3), cos(base.x * 0.8 + t * 1.1)) * 0.08;
  let uv1 = base * 0.5 + vec2<f32>(t * 0.05, t * 0.02) + warp;
  let uv2 = base * 0.35 - vec2<f32>(t * 0.03, t * 0.045) - warp;
  let d1x = dpdx(uv1);
  let d1y = dpdy(uv1);
  let d2x = dpdx(uv2);
  let d2y = dpdy(uv2);
  let tex = 0.5 * (textureSampleGrad(blockTextures, blockSampler, fract(uv1), TEX_WATER, d1x, d1y).rgb +
    textureSampleGrad(blockTextures, blockSampler, fract(uv2), TEX_WATER, d2x, d2y).rgb);

  var n = faceNormal(in.face);
  if (in.face == 2u) {
    // Animated ripples: analytic derivatives of a few travelling sine waves.
    let p = in.world.xz;
    let dx = cos(p.x * 1.1 + t * 1.3) * 0.6 + cos((p.x + p.y) * 0.7 + t * 0.9) * 0.4;
    let dz = cos(p.y * 1.3 - t * 1.1) * 0.6 + cos((p.x - p.y) * 0.8 + t * 1.7) * 0.4;
    n = normalize(vec3<f32>(dx * 0.05, 1.0, dz * 0.05));
  }

  // Depth-based transparency: the thicker the water column in front of the opaque scene, the more
  // it absorbs (and the darker/bluer it gets).
  let scene = textureLoad(sceneDepth, vec2<i32>(in.clip.xy), 0);
  let thickness = max(linearDepth(scene) - linearDepth(in.clip.z), 0.0);
  let absorb = 1.0 - exp(-thickness * 0.3);
  let albedo = mix(WATER_SHALLOW, WATER_DEEP, absorb) * (0.75 + 0.5 * tex);

  let v = normalize(frame.cameraPos.xyz - in.world);
  let cosTheta = abs(dot(n, v));
  let fresnel = 0.02 + 0.98 * pow(1.0 - cosTheta, 5.0);
  let shadow = shadowFactor(in.world, faceNormal(in.face), in.viewDepth);
  let lit = shade(albedo, n, in.world, in.ao, 0.06, 0.02, shadow, in.light);
  // Enclosed water (caves) does not mirror the sky.
  let reflection = skyColor(reflect(-v, n)) * (0.08 + 0.92 * in.light.x * in.light.x);
  var color = mix(lit, reflection, fresnel);
  var alpha = clamp(mix(0.18, 0.93, absorb) + fresnel * 0.5, 0.0, 0.97);
  let fog = fogAmount(in.world);
  color = mix(color, skyColor(-v), fog);
  alpha = mix(alpha, 1.0, fog);
  return vec4<f32>(toDisplay(color), alpha);
}
