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
    this.#systems = []; // {name, priority, func}
  }

  get state() {
    // Convert Map of Pool objects to plain arrays:
    // [typeName, [[entity, component], ...], ...]
    const pools = [];
    for (const [typeName, pool] of this.#pools.entries()){
      const poolData = [];
      for (const entity of pool.keys()){
        poolData.push([entity, pool.get(entity)]);
      }
      pools.push([typeName, poolData]);
    }

    return {
      nextId: this.#nextId,
      entities: Array.from(this.#entities),
      recycledEntities: this.#recycledEntities,
      pools,
      capacity: this.#capacity,
      maxEntity: this.#maxEntity,
      // systems: this.#systems.map(s => ({
      //   name: s.name, priority: s.priority
      // })) // cannot store func, must rebuild
    }
  }

  serialize() {
    // Convert state to JSON
    const json = JSON.stringify(this.state);
    // Encode JSON to binary
    const data = new TextEncoder().encode(json);
    return new Blob([data], { type: 'application/octet-stream' });
  }

  static async deserialize(blob) {
    // Read binary from blob
    const data = new Uint16Array(await blob.arrayBuffer());
    // Decode binary to JSON
    const json = new TextDecoder().decode(data);
    // Parse JSON to object
    const state = JSON.parse(json);
    // Reconstruct the World instance
    const world = new World(state.capacity);
    world.#nextId = state.nextId;
    world.#entities = new Set(state.entities);
    world.#recycledEntities = state.recycledEntities;

    // Restore components
    for (const [typeName, poolData] of state.pools){
      world.registerComponent(typeName);
      const pool = world.#pools.get(typeName);
      for (const [entity, component] of poolData){
        pool.add(entity, component);
      }
    }

    return world;
  }
  
  registerSystem(systemCallback, priority = 0) {
    const name = systemCallback.name;

    let system = { name: name, system: systemCallback, priority: priority };
    if (this.getSystem(name)) return false;
    this.#systems.push(system);
    this.#systems.sort((a, b) => a.name - b.name);
    this.#systems.sort((a, b) => b.priority - a.priority);
    return true;
  }

  getSystem(system) {
    const name = typeof system === 'function' ? system.name : system;
    return this.#systems.find((s) => s.name === name);
  }

  deregisterSystem(name) {
    const system = this.getSystem(name);
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

  #validateComponent(type) {
    if (type == null) throw new TypeError(`Component "${type}" cannot be null or undefined.`);
    switch (typeof type) {
      case 'string':
        return type;
      case 'function':
        return type.name;
      case 'object':
        if (type.type) {
          return type.type;
        }
        else {
          throw new TypeError(`Component "${type}" is missing a "type" property.`);
        }
      default:
        throw new TypeError('Invalid component type. Specify component type with a Class, object, or string');
    }
  }

  registerComponent(type) {
    const typeName = this.#validateComponent(type);
    if (this.#pools.has(typeName)) return false;
    this.#pools.set(typeName, new Pool(this.#capacity, this.#maxEntity));
    return true;
  }
  deregisterComponent(type) {
    const typeName = this.#validateComponent(type);
    if (!this.#pools.has(typeName)) return false;
    this.#pools.delete(typeName);
    return true;
  }

  addComponent(entity, component) {
    if (!this.#entities.has(entity)) return false;
    let typeName;
    let data = component;

    // Convert class instances to plain object data with a 'type' property
    if (typeof component === 'object' && component.constructor !== Object) {
      typeName = component.constructor.name;
      data = { type: typeName, ...component };
    } else {
      typeName = component.type;
    }

    // Verify plain object data has a 'type' property
    if (!data.type) {
      throw new TypeError(`Component "${component}" is missing a "type" property.`);
    }

    let pool = this.#pools.get(typeName);
    if (!pool) {
      this.registerComponent(typeName);
      pool = this.#pools.get(typeName);
    };
    return pool.add(entity, data);
  }

  removeComponent(entity, type) {
    if (!this.#entities.has(entity)) return false;
    const typeName = this.#validateComponent(type);
    const pool = this.#pools.get(typeName);
    if (!pool) return false;
    return pool.delete(entity);
  }

  getComponent(entity, type) {
    const typeName = this.#validateComponent(type);
    return this.#pools?.get(typeName)?.get(entity);
  }

  hasComponent(entity, type) {
    const typeName = this.#validateComponent(type);
    return this.#pools.get(typeName)?.has(entity) ?? false;
  }

  all(...types) {
    if (this.#pools.size === 0 || types.length === 0) return [];
    const typeNames = types.map(type => this.#validateComponent(type));
    if (typeNames.length === 1) {
      const pool = this.#pools.get(typeNames[0]);
      return [...pool.keys()];
    }

    // fetch requested pool types
    const pools = typeNames.map(type => this.#pools.get(type));

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
    const typeNames = types.map(type => this.#validateComponent(type));

    const entities = new Set();

    for (const type of typeNames) {
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

  with(...components) {
    for (const component of components){
      this.#world.addComponent(this.#id, component);
    }
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

// /**
//  * Abstract component class. Component classes must extend this class.
//  */
// export class AComponent {
//   constructor() {
//     const prototype = Object.getPrototypeOf(this);
//     const methods = Object.getOwnPropertyNames(prototype).filter(name => name !=='constructor' && typeof prototype[name] === 'function');
//     if (methods.length > 0) {
//       throw new TypeError(`Component classes cannot contain any methods other than the constructor. Your component class currently contains [${methods.join(', ')}]`);
//     }

//   }
// }

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