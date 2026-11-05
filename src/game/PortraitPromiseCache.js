/**
 * Small LRU for generated preview images.
 * Entries are promises so concurrent requests share a single GLB decode/render.
 * Rejected loads are not cached, allowing retries after temporary failures.
 */
export class PortraitPromiseCache {
  constructor(limit = 8) {
    if (!Number.isInteger(limit) || limit < 1) throw new RangeError('Cache limit must be positive.');
    this.limit = limit;
    this.entries = new Map();
  }

  get size() { return this.entries.size; }

  getOrLoad(key, loader) {
    if (this.entries.has(key)) {
      const cached = this.entries.get(key);
      this.entries.delete(key);
      this.entries.set(key, cached);
      return cached;
    }
    const pending = Promise.resolve().then(loader);
    this.entries.set(key, pending);
    while (this.entries.size > this.limit) {
      this.entries.delete(this.entries.keys().next().value);
    }
    // Only clear the same rejected request. A replacement request may exist.
    void pending.catch(() => {
      if (this.entries.get(key) === pending) this.entries.delete(key);
    });
    return pending;
  }

  delete(key) { return this.entries.delete(key); }
  clear() { this.entries.clear(); }
}
