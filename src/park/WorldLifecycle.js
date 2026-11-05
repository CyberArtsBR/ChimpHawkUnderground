/**
 * One-shot ownership scope for meshes, materials, GLTF textures, subscriptions,
 * and per-world prepared state. Global renderer, music and UI are never owned.
 */
export class WorldResourceScope {
  constructor() {
    this.disposed = false;
    this.roots = [];
    this.cleanups = [];
    this.errors = [];
  }

  trackRoot(root, { disposeTextures = false } = {}) {
    if (!root || typeof root.traverse !== 'function')
      throw new TypeError('trackRoot requires an Object3D-like root.');
    if (this.disposed) {
      disposeRoots([{ root, disposeTextures }], this.errors);
    } else {
      const existing = this.roots.find(item => item.root === root);
      if (existing) existing.disposeTextures ||= disposeTextures;
      else this.roots.push({ root, disposeTextures });
    }
    return root;
  }

  trackWorld(world, options = {}) {
    if (!world) return world;
    // A late GLB can complete after cancellation. Dispose its two roots as a
    // single ownership graph: visual and collision may share GPU resources.
    if (this.disposed) {
      const roots = [world.park, world.collision]
        .filter((root, index, values) => root && values.indexOf(root) === index);
      disposeRoots(roots.map(root => ({ root, disposeTextures: Boolean(options.disposeTextures) })), this.errors);
      return world;
    }
    if (world.park) this.trackRoot(world.park, options);
    if (world.collision && world.collision !== world.park)
      this.trackRoot(world.collision, options);
    return world;
  }

  trackCleanup(dispose) {
    if (typeof dispose !== 'function') throw new TypeError('Cleanup must be a function.');
    if (this.disposed) this.#safeCleanup(dispose);
    else this.cleanups.push(dispose);
    return dispose;
  }

  trackEvent(target, event, handler, options) {
    target.addEventListener(event, handler, options);
    this.trackCleanup(() => target.removeEventListener(event, handler, options));
    return handler;
  }

  #safeCleanup(fn) {
    try { fn(); } catch (error) { this.errors.push(error); }
  }

  dispose() {
    if (this.disposed) return this.errors;
    this.disposed = true;
    // Cleanup listeners/controllers before their backing scene objects vanish.
    for (const fn of this.cleanups.reverse()) this.#safeCleanup(fn);
    disposeRoots(this.roots, this.errors);
    this.cleanups.length = 0;
    this.roots.length = 0;
    return this.errors;
  }
}

function disposeRoots(entries, errors) {
  const geometries = new Set();
  const materials = new Set();
  const textures = new Set();
  const roots = new Set();
  for (const { root, disposeTextures } of entries) {
    roots.add(root);
    try {
      root.traverse(object => {
        if (!object.isMesh && !object.isPoints && !object.isLine) return;
        if (object.geometry) geometries.add(object.geometry);
        for (const material of (Array.isArray(object.material) ? object.material : [object.material])) {
          if (!material) continue;
          materials.add(material);
          if (disposeTextures) {
            // Includes normal, alpha, bump, roughness, env and light maps.
            for (const value of Object.values(material)) {
              if (value?.isTexture) textures.add(value);
            }
            // GLTF custom shader textures may be stored as uniforms.
            for (const uniform of Object.values(material.uniforms || {})) {
              if (uniform?.value?.isTexture) textures.add(uniform.value);
            }
          }
        }
      });
    } catch (error) { errors.push(error); }
  }
  for (const root of roots) {
    try { root.removeFromParent?.(); } catch (error) { errors.push(error); }
  }
  for (const geometry of geometries) {
    try {
      geometry.disposeBoundsTree?.();
      geometry.boundsTree = null;
      geometry.dispose?.();
    } catch (error) { errors.push(error); }
  }
  for (const material of materials) {
    try { material.dispose?.(); } catch (error) { errors.push(error); }
  }
  for (const texture of textures) {
    try { texture.dispose?.(); } catch (error) { errors.push(error); }
  }
}

export class WorldLoadCancelledError extends Error {
  constructor() {
    super('Park load superseded or cancelled.');
    this.name = 'WorldLoadCancelledError';
  }
}

/**
 * Transactional world switch coordinator; does not own the shared scene,
 * renderer, UI, audio, camera or input. Those belong to the composition root.
 *
 * prepare({ world, scope, signal, previous }) asynchronously creates *isolated*
 * collision/rail/controller state without touching the live state.
 * activate({ next, previous }) synchronously attaches the new world and swaps
 * bindings. On failure, restore({ previous, failed }) must restore the old
 * binding (and scene attachments) before staging is disposed.
 */
export class WorldLifecycle {
  constructor({
    registry,
    prepare = async ({ world }) => world,
    activate = () => {},
    restore = () => {},
    deactivate = () => {},
    onCleanupError = () => {},
  } = {}) {
    if (!registry || typeof registry.requirePlayable !== 'function')
      throw new TypeError('WorldLifecycle requires a ParkRegistry.');
    this.registry = registry;
    this.prepare = prepare;
    this.activate = activate;
    this.restore = restore;
    this.deactivate = deactivate;
    this.onCleanupError = onCleanupError;
    this.current = null;
    this.pending = null;
    this.generation = 0;
    this.disposed = false;
  }

  #check(request, signal) {
    if (this.disposed || request !== this.generation || signal.aborted)
      throw new WorldLoadCancelledError();
  }

  #cleanup(scope) {
    const errors = scope.dispose();
    if (errors.length) {
      try { this.onCleanupError(errors); } catch { /* Cleanup failures are non-fatal. */ }
    }
  }

  async switchTo(id, { reload = false } = {}) {
    if (this.disposed) throw new Error('WorldLifecycle has been disposed.');
    const entry = this.registry.requirePlayable(id);
    ++this.generation;
    this.pending?.abort();
    if (this.current?.id === id && !reload) return this.current;

    const request = this.generation;
    const controller = new AbortController();
    this.pending = controller;
    const { signal } = controller;
    const scope = new WorldResourceScope();
    try {
      const loaded = await entry.load({ scope, signal, parkId: id });
      // Even a *superseded* loader may return a valid Object3D. Own its roots
      // before checking the generation, otherwise that stale result leaks.
      // Loaders should track resources as soon as they are created. This
      // additional registration also handles simple third-party park loaders.
      scope.trackWorld(loaded, { disposeTextures: loaded?.resourceOwnership?.textures === 'owned' });
      this.#check(request, signal);
      const { validateParkWorld } = await import('./ParkRegistry.js');
      const world = validateParkWorld(loaded);
      this.#check(request, signal);

      const previous = this.current;
      const prepared = await this.prepare({ id, world, scope, signal, previous });
      this.#check(request, signal);
      const next = { id, metadata: entry, world, prepared, scope };
      try {
        const activationResult = this.activate({ next, previous });
        if (activationResult && typeof activationResult.then === 'function')
          throw new Error('activate must be synchronous to preserve atomic world swaps.');
      } catch (error) {
        try { this.restore({ previous, failed: next }); }
        catch (restoreError) { error.restoreError = restoreError; }
        throw error;
      }
      this.current = next;
      if (previous) this.#cleanup(previous.scope);
      return next;
    } catch (error) {
      this.#cleanup(scope);
      if (this.disposed || request !== this.generation || signal.aborted)
        throw new WorldLoadCancelledError();
      throw error;
    } finally {
      if (this.pending === controller) this.pending = null;
    }
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    ++this.generation;
    this.pending?.abort();
    this.pending = null;
    const previous = this.current;
    this.current = null;
    if (previous) {
      try { this.deactivate({ previous }); }
      catch (error) { try { this.onCleanupError([error]); } catch { /* no-op */ } }
      this.#cleanup(previous.scope);
    }
  }
}
