import Pool from './pool';

export default class World {
  #entities;
  #recycledEntities;
  #pools;
  #nextId;
  #capacity;

  constructor(capacity = 1000000) {
    this.#nextId = 0;
    this.#entities = new Set();
    this.#recycledEntities = [];
    this.#pools = new Map();
    this.#capacity = capacity;
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
    const pool = this.#pools.get(type);
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