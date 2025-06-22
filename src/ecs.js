import Pool from './pool';

/**
 * A World instance manages entities, components, and systems.
 * (Lowercase) entities are numeric IDs assigned by the World instance
 * Components are plain data wrapped in a named class for pooling.
 * Systems are (optionally) ordered functions iterated over entities of select components.
 */
export default class World {
  #entities;
  #recycledEntities;
  #pools;
  #nextId;
  #capacity;
  #maxEntity;
  #systems;

  constructor(capacity) {
    this.#nextId = 0;
    this.#entities = new Set();
    this.#recycledEntities = [];
    this.#pools = new Map();
    this.#capacity = capacity;
    this.#maxEntity = capacity - 1;
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
      return new Entity(this, entity);
    }
    else if (this.#nextId >= this.#capacity) {
      throw new Error('World is full of entities.');
    }
    const entity = this.#nextId;
    this.#nextId++;
    this.#entities.add(entity);
    return new Entity(this, entity);
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
    if (this.#pools.has(type)) return false;

    this.#pools.set(type, new Pool(this.#capacity, this.#maxEntity));
    return true;
  }
  deregister(type) {
    if (!this.#pools.has(type)) return false;
    this.#pools.delete(type);
    return true;
  }

  addComponent(entity, data) {
    if (!this.#entities.has(entity)) return false;

    const type = data.constructor;
    let pool = this.#pools.get(type);
    if (!pool) {
      this.register(type);
      pool = this.#pools.get(type);
    };
    return pool.add(entity, data);
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
    if (this.#pools.size === 0 || types.length === 0) return [];
    
    if (types.length === 1) {
      const pool = this.#pools.get(types[0]);
      return [...pool.keys()];
    }

    // fetch requested pool types
    const pools = types.map(type => this.#pools.get(type));

    // return empty array if any are missing or empty.
    if (this.#pools.size === 0 || pools.some(pool => !pool || pool.isEmpty())) return [];

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

  // query() {
  //   return new Query(this);
  // }
}

/**
 * Wrapper for entity IDs with ergonomic methods
 */
class Entity {
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

  add(component) {
    return this.#world.addComponent(this.#id, component);
  }

  get(type) {
    return this.#world.getComponent(this.#id, type);
  }

  has(type) {
    return this.#world.hasComponent(this.#id, type);
  }

  remove(type) {
    return this.#world.removeComponent(this.#id, type);
  }

  get id() {
    return this.#id;
  }
}

// class Query {
//   #world
//   #all
//   constructor(world) {
//     this.#world = world;
//   }
//   *[Symbol.iterator]() {

//   }
// }

// query implementation

// iterate all entities in one of the queried for components (usually the one with the least entities) and test for each subsequent component.

/**
 * Usage:
 * 
 * 
 * 
 */