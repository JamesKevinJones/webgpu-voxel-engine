// Deterministic hashed-gradient simplex noise. Mirrors src/world/noise.ts exactly.

fn hash3(x: i32, y: i32, z: i32, seed: u32) -> u32 {
  var h = seed ^ (bitcast<u32>(x) * 0x8da6b343u) ^ (bitcast<u32>(y) * 0xd8163841u) ^ (bitcast<u32>(z) * 0xcb1ab31fu);
  h = h ^ (h >> 16u);
  h = h * 0x85ebca6bu;
  h = h ^ (h >> 13u);
  h = h * 0xc2b2ae35u;
  h = h ^ (h >> 16u);
  return h;
}

fn grad3(hash: u32, x: f32, y: f32, z: f32) -> f32 {
  let h = hash & 15u;
  let u = select(y, x, h < 8u);
  let v = select(select(z, x, h == 12u || h == 14u), y, h < 4u);
  return select(-u, u, (h & 1u) == 0u) + select(-v, v, (h & 2u) == 0u);
}

fn grad2(hash: u32, x: f32, y: f32) -> f32 {
  let h = hash & 7u;
  let u = select(y, x, h < 4u);
  let v = select(x, y, h < 4u);
  return select(-u, u, (h & 1u) == 0u) + select(-2.0 * v, 2.0 * v, (h & 2u) == 0u);
}

const NOISE_F2: f32 = 0.3660254037844386;
const NOISE_G2: f32 = 0.21132486540518713;
const NOISE_F3: f32 = 0.3333333333333333;
const NOISE_G3: f32 = 0.16666666666666666;

fn simplex2(x: f32, y: f32, seed: u32) -> f32 {
  let s = (x + y) * NOISE_F2;
  let fi = floor(x + s);
  let fj = floor(y + s);
  let t = (fi + fj) * NOISE_G2;
  let x0 = x - (fi - t);
  let y0 = y - (fj - t);
  let i = i32(fi);
  let j = i32(fj);
  let i1 = select(0, 1, x0 > y0);
  let j1 = 1 - i1;
  let x1 = x0 - f32(i1) + NOISE_G2;
  let y1 = y0 - f32(j1) + NOISE_G2;
  let x2 = x0 - 1.0 + 2.0 * NOISE_G2;
  let y2 = y0 - 1.0 + 2.0 * NOISE_G2;
  var n = 0.0;
  var t0 = 0.5 - x0 * x0 - y0 * y0;
  if (t0 > 0.0) {
    t0 = t0 * t0;
    n += t0 * t0 * grad2(hash3(i, j, 0, seed), x0, y0);
  }
  var t1 = 0.5 - x1 * x1 - y1 * y1;
  if (t1 > 0.0) {
    t1 = t1 * t1;
    n += t1 * t1 * grad2(hash3(i + i1, j + j1, 0, seed), x1, y1);
  }
  var t2 = 0.5 - x2 * x2 - y2 * y2;
  if (t2 > 0.0) {
    t2 = t2 * t2;
    n += t2 * t2 * grad2(hash3(i + 1, j + 1, 0, seed), x2, y2);
  }
  return 40.0 * n;
}

fn simplex3(x: f32, y: f32, z: f32, seed: u32) -> f32 {
  let s = (x + y + z) * NOISE_F3;
  let fi = floor(x + s);
  let fj = floor(y + s);
  let fk = floor(z + s);
  let t = (fi + fj + fk) * NOISE_G3;
  let x0 = x - (fi - t);
  let y0 = y - (fj - t);
  let z0 = z - (fk - t);
  var o1 = vec3<i32>(0, 0, 0);
  var o2 = vec3<i32>(0, 0, 0);
  if (x0 >= y0) {
    if (y0 >= z0) { o1 = vec3<i32>(1, 0, 0); o2 = vec3<i32>(1, 1, 0); }
    else if (x0 >= z0) { o1 = vec3<i32>(1, 0, 0); o2 = vec3<i32>(1, 0, 1); }
    else { o1 = vec3<i32>(0, 0, 1); o2 = vec3<i32>(1, 0, 1); }
  } else {
    if (y0 < z0) { o1 = vec3<i32>(0, 0, 1); o2 = vec3<i32>(0, 1, 1); }
    else if (x0 < z0) { o1 = vec3<i32>(0, 1, 0); o2 = vec3<i32>(0, 1, 1); }
    else { o1 = vec3<i32>(0, 1, 0); o2 = vec3<i32>(1, 1, 0); }
  }
  let p0 = vec3<f32>(x0, y0, z0);
  let p1 = p0 - vec3<f32>(o1) + vec3<f32>(NOISE_G3);
  let p2 = p0 - vec3<f32>(o2) + vec3<f32>(2.0 * NOISE_G3);
  let p3 = p0 - vec3<f32>(1.0) + vec3<f32>(3.0 * NOISE_G3);
  let c = vec3<i32>(i32(fi), i32(fj), i32(fk));
  var n = 0.0;
  var t0 = 0.6 - dot(p0, p0);
  if (t0 > 0.0) {
    t0 = t0 * t0;
    n += t0 * t0 * grad3(hash3(c.x, c.y, c.z, seed), p0.x, p0.y, p0.z);
  }
  var t1 = 0.6 - dot(p1, p1);
  if (t1 > 0.0) {
    t1 = t1 * t1;
    let q = c + o1;
    n += t1 * t1 * grad3(hash3(q.x, q.y, q.z, seed), p1.x, p1.y, p1.z);
  }
  var t2 = 0.6 - dot(p2, p2);
  if (t2 > 0.0) {
    t2 = t2 * t2;
    let q = c + o2;
    n += t2 * t2 * grad3(hash3(q.x, q.y, q.z, seed), p2.x, p2.y, p2.z);
  }
  var t3 = 0.6 - dot(p3, p3);
  if (t3 > 0.0) {
    t3 = t3 * t3;
    let q = c + vec3<i32>(1, 1, 1);
    n += t3 * t3 * grad3(hash3(q.x, q.y, q.z, seed), p3.x, p3.y, p3.z);
  }
  return 32.0 * n;
}

fn fbm2(x: f32, y: f32, octaves: u32, seed: u32) -> f32 {
  var sum = 0.0;
  var amp = 1.0;
  var freq = 1.0;
  var norm = 0.0;
  for (var o = 0u; o < octaves; o++) {
    sum += amp * simplex2(x * freq, y * freq, seed + o);
    norm += amp;
    amp *= 0.5;
    freq *= 2.0;
  }
  return sum / norm;
}

fn ridged2(x: f32, y: f32, octaves: u32, seed: u32) -> f32 {
  var sum = 0.0;
  var amp = 1.0;
  var freq = 1.0;
  var norm = 0.0;
  for (var o = 0u; o < octaves; o++) {
    let r = 1.0 - abs(simplex2(x * freq, y * freq, seed + o));
    sum += amp * r * r;
    norm += amp;
    amp *= 0.5;
    freq *= 2.0;
  }
  return sum / norm;
}
