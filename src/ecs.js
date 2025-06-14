import Pool from './pool';

export default class World {
  #entities;
  #recycledEntities;
  #pools;
  #nextId;
  #capacity;
  #systems;

  constructor(capacity = 1000000) {
    this.#nextId = 0;
    this.#entities = new Set();
    this.#recycledEntities = [];
    this.#pools = new Map();
    this.#capacity = capacity;
    this.#systems = []; // {function, priority}
  }
  
  registerSystem(systemCallback, priority = 0) {
    let system = { system: systemCallback, priority: priority };
    if (this.getSystem(systemCallback)) return false;
    this.#systems.push(system);
    this.#systems.sort((a, b) => b.priority - a.priority);
    return true;
  }

  getSystem(systemCallback) {
    return this.#systems.find((e) => e.system === systemCallback);
  }

  deregisterSystem(systemCallback) {
    const system = this.getSystem(systemCallback);
    if (!system) return false;
    this.#systems.splice(this.#systems.indexOf(system), 1);
    return true;
  }

  with(systemCallback, priority = 0) {
    this.registerSystem(systemCallback, priority);
    return this;
  }

  update(...args) {
    for (const prioritizedSystem of this.#systems) {
      prioritizedSystem.system(...args);
    }
  }

  spawn() {
    if (this.#recycledEntities.length > 0) {
      const entity = this.#recycledEntities.pop();
      this.#entities.add(entity);
      return new EntityBuilder(this, entity);
    }
    else if (this.#nextId >= this.#capacity) {
      throw new Error('World is full of entities.');
    }
    const entity = this.#nextId;
    this.#nextId++;
    this.#entities.add(entity);
    return new EntityBuilder(this, entity);
  }

  destroy(entity) {
    if (!this.#entities.has(entity)) return false;

    for (const pool of this.#pools.values()) {
      pool.delete(entity);
    }
    this.#entities.delete(entity);
    this.#recycledEntities.push(entity);
    return true;
  }

  /**
   * 
   * @param {*} type - the component type or class (not instance!)
   */
  register(type) {
    this.#pools.set(type, new Pool(this.#capacity, this.#capacity));
  }
  deregister(type) {
    const pool = this.#pools.get(type);
    if (pool) {
      for (const entity of this.#entities) {
        pool.delete(entity);
      }
    }
    this.#pools.delete(type);
  }

  addComponent(entity, data) {
    const type = data.constructor;
    let pool = this.#pools.get(type);
    if (!pool) {
      this.register(type);
      pool = this.#pools.get(type);
    };
    pool.add(entity, data);
  }

  removeComponent(entity, type) {
    if (!this.#entities.has(entity)) return false;

    const pool = this.#pools.get(type);
    if (!pool) return false;

    return pool.delete(entity);
  }

  getComponent(entity, type) {
    return this.#pools?.get(type)?.get(entity);
  }

  hasComponent(entity, type) {
    return this.#pools.get(type)?.has(entity) ?? false;
  }

  all(...types) {
    if (types.length === 0) return [];
    
    if (types.length === 1) {
      const pool = this.#pools.get(types[0]);
      return [...pool.keys()];
    }

    // fetch requested pool types
    const pools = types.map(type => this.#pools.get(type));

    // return empty array if any are missing or empty.
    if (pools.some(pool => !pool || pool.isEmpty())) return [];

    // sort by smallest to largest
    pools.sort((a, b) => a.size - b.size);

    const [smallestPool, ...remainingPools] = pools;
    const entities = [];

    for (const entity of smallestPool.keys()) {
      if (remainingPools.every(pool => pool.has(entity))) {
        entities.push(entity);
      }
    }
    return entities;
  }

  any(...types) {
    if (types.length === 0) return [];

    const entities = new Set();

    for (const type of types) {
      const pool = this.#pools.get(type);
      if (!pool || pool.isEmpty()) continue;

      for (const entity of pool.keys()) {
        entities.add(entity);
      }
    }
    return [...entities];
  }
}

/**
 * Wrapper for entity IDs with ergonomic methods
 */
class EntityBuilder {
  #world
  #id
  constructor(world, id) {
    this.#world = world;
    this.#id = id;
  }

  with(component) {
    this.#world.addComponent(this.#id, component);
    return this;
  }
}

// query implementation

// iterate all entities in one of the queried for components (usually the one with the least entities) and test for each subsequent component.

/**
 * Usage:
 * 
 * 
 * 
 */