import { WorldDelta, decodeChunkEdits, parseChunkId } from './delta';

/** Minimal async key-value store (IndexedDB in the browser, memory in tests). */
export interface KeyValueStore {
  get(key: string): Promise<unknown>;
  putMany(entries: readonly (readonly [string, unknown])[]): Promise<void>;
  /** Every entry whose key starts with `prefix`. */
  entries(prefix: string): Promise<[string, unknown][]>;
  /** Removes everything. */
  clear(): Promise<void>;
}

export class MemoryStore implements KeyValueStore {
  readonly data = new Map<string, unknown>();

  async get(key: string): Promise<unknown> {
    return this.data.get(key);
  }

  async putMany(entries: readonly (readonly [string, unknown])[]): Promise<void> {
    for (const [k, v] of entries) this.data.set(k, v instanceof Uint8Array ? v.slice() : structuredClone(v));
  }

  async entries(prefix: string): Promise<[string, unknown][]> {
    return [...this.data].filter(([k]) => k.startsWith(prefix));
  }

  async clear(): Promise<void> {
    this.data.clear();
  }
}

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('IndexedDB request failed'));
  });
}

function transactionDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(tx.error ?? new Error('IndexedDB transaction aborted'));
    tx.onerror = () => reject(tx.error ?? new Error('IndexedDB transaction failed'));
  });
}

/** Zero-dependency IndexedDB key-value store (one object store with out-of-line string keys). */
export class IndexedDbStore implements KeyValueStore {
  private constructor(private readonly db: IDBDatabase, private readonly storeName: string) {}

  static async open(name = 'webgpu-voxel-engine', storeName = 'world'): Promise<IndexedDbStore> {
    if (typeof indexedDB === 'undefined') throw new Error('IndexedDB is not available');
    const req = indexedDB.open(name, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(storeName)) req.result.createObjectStore(storeName);
    };
    const db = await request(req);
    return new IndexedDbStore(db, storeName);
  }

  async get(key: string): Promise<unknown> {
    const tx = this.db.transaction(this.storeName, 'readonly');
    return request(tx.objectStore(this.storeName).get(key));
  }

  async putMany(entries: readonly (readonly [string, unknown])[]): Promise<void> {
    if (entries.length === 0) return;
    const tx = this.db.transaction(this.storeName, 'readwrite');
    const store = tx.objectStore(this.storeName);
    for (const [k, v] of entries) store.put(v, k);
    await transactionDone(tx);
  }

  async entries(prefix: string): Promise<[string, unknown][]> {
    const tx = this.db.transaction(this.storeName, 'readonly');
    const store = tx.objectStore(this.storeName);
    const range = IDBKeyRange.bound(prefix, `${prefix}￿`);
    const [keys, values] = await Promise.all([request(store.getAllKeys(range)), request(store.getAll(range))]);
    return keys.map((k, i) => [String(k), values[i]]);
  }

  async clear(): Promise<void> {
    const tx = this.db.transaction(this.storeName, 'readwrite');
    tx.objectStore(this.storeName).clear();
    await transactionDone(tx);
  }

  close(): void {
    this.db.close();
  }
}

/** Player state saved alongside the world edits. */
export interface PlayerSave {
  position: [number, number, number];
  yaw: number;
  pitch: number;
  mode: 'freecam' | 'walk';
  timeOfDay: number;
  hotbar: { selected: number; counts: number[] };
}

export interface LoadedWorld {
  delta: WorldDelta;
  player: PlayerSave | null;
}

function isPlayerSave(v: unknown): v is PlayerSave {
  const p = v as PlayerSave | null;
  return !!p && Array.isArray(p.position) && p.position.length === 3 && p.position.every(Number.isFinite) &&
    Number.isFinite(p.yaw) && Number.isFinite(p.pitch) && (p.mode === 'walk' || p.mode === 'freecam') &&
    Number.isFinite(p.timeOfDay) && !!p.hotbar && Array.isArray(p.hotbar.counts);
}

/**
 * Persistence of one world (seed): chunk edit records under `w<seed>/c/<cx,cy,cz>` and the player
 * under `w<seed>/player`. Corrupt records are skipped rather than failing the load.
 */
export class WorldStore {
  private readonly prefix: string;

  constructor(private readonly kv: KeyValueStore, readonly seed: number) {
    this.prefix = `w${seed >>> 0}/`;
  }

  async load(): Promise<LoadedWorld> {
    const delta = new WorldDelta();
    for (const [key, value] of await this.kv.entries(`${this.prefix}c/`)) {
      const id = key.slice(this.prefix.length + 2);
      if (!parseChunkId(id) || !(value instanceof Uint8Array)) continue;
      try {
        delta.load(id, decodeChunkEdits(value));
      } catch (err) {
        console.warn(`skipping corrupt chunk record ${key}:`, err);
      }
    }
    const player = await this.kv.get(`${this.prefix}player`);
    return { delta, player: isPlayerSave(player) ? player : null };
  }

  /** Writes every dirty chunk and the player state. Returns the number of chunk records written. */
  async save(delta: WorldDelta, player: PlayerSave | null): Promise<number> {
    const dirty = delta.takeDirty();
    const entries: [string, unknown][] = dirty.map(([id, bytes]) => [`${this.prefix}c/${id}`, bytes]);
    if (player) entries.push([`${this.prefix}player`, player]);
    try {
      await this.kv.putMany(entries);
    } catch (err) {
      delta.markDirty(dirty.map(([id]) => id));
      throw err;
    }
    return dirty.length;
  }

  /** Deletes every saved world (all seeds) from the local database. */
  async reset(): Promise<void> {
    await this.kv.clear();
  }
}
