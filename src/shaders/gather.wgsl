// Gather pass: decodes the palette-compressed voxel slots of a chunk and its 26 neighbours into a
// dense 34³ volume (8 bits per voxel, 4 voxels per word) for the mesher.
// Dispatch: (ceil(PADDED_WORDS / 64), jobCount, 1).

@group(0) @binding(0) var<storage, read> voxels: array<u32>;
@group(0) @binding(1) var<storage, read> jobs: array<u32>;
@group(0) @binding(2) var<storage, read_write> padded: array<u32>;

fn readVoxel(slot: u32, index: u32) -> u32 {
  if (slot == NO_SLOT) {
    return BLOCK_AIR;
  }
  let base = slot * SLOT_WORDS;
  let bits = voxels[base];
  if (bits == 0u) {
    return voxels[base + GPU_PALETTE_OFFSET];
  }
  let bitIndex = index * bits;
  let word = voxels[base + GPU_DATA_OFFSET + (bitIndex >> 5u)];
  let paletteIndex = (word >> (bitIndex & 31u)) & ((1u << bits) - 1u);
  return voxels[base + GPU_PALETTE_OFFSET + paletteIndex];
}

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let w = gid.x;
  if (w >= PADDED_WORDS) {
    return;
  }
  let jobBase = gid.y * MESH_JOB_WORDS;
  var packed = 0u;
  for (var k = 0u; k < 4u; k++) {
    let p = w * 4u + k;
    if (p < PADDED_VOLUME) {
      let padPos = vec3<u32>(p % PADDED_SIZE, (p / PADDED_SIZE) % PADDED_SIZE, p / (PADDED_SIZE * PADDED_SIZE));
      let l = vec3<i32>(padPos) - vec3<i32>(1);
      let d = select(vec3<i32>(0), vec3<i32>(-1), l < vec3<i32>(0)) +
              select(vec3<i32>(0), vec3<i32>(1), l >= vec3<i32>(CHUNK_SIZE_I));
      let neighbor = u32((d.x + 1) + (d.y + 1) * 3 + (d.z + 1) * 9);
      let slot = jobs[jobBase + MESH_JOB_NEIGHBOR_OFFSET + neighbor];
      let local = vec3<u32>(l - d * CHUNK_SIZE_I);
      let block = readVoxel(slot, local.x | (local.y << 5u) | (local.z << 10u));
      packed |= (block & 0xffu) << (k * 8u);
    }
  }
  padded[gid.y * PADDED_WORDS + w] = packed;
}
