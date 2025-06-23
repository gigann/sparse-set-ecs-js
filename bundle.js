(function (global, factory) {
  typeof exports === 'object' && typeof module !== 'undefined' ? module.exports = factory() :
  typeof define === 'function' && define.amd ? define(factory) :
  (global = typeof globalThis !== 'undefined' ? globalThis : global || self, global["sparse-set-ecs"] = factory());
})(this, (function () { 'use strict';

  /**
   * Pool is a map-like collection, providing O(1) time complexity for addition, deletion, and lookup. Iteration is O(n). Clearing is O(n) rather than O(1).
   */
  class Pool {
    #sparse;
    #entities;
    #components;
    #size;
    #capacity;
    #maxEntity;

    /**
     * @param {number} capacity Maximum quantity of entities that the Pool can contain.
     * @param {number} maximumEntity Highest possible unsigned integer ID (Entity) that the Pool can contain.
     * @param {TypedArrayConstructor} UintXXArray Unsigned integer TypedArray constructor for the sparse and dense arrays.
     */
    constructor(
      capacity = 1000,
      maximumEntity = 65535,
      UintXXArray = Uint16Array
    ) {
      // Initial validation
      if (!Number.isInteger(capacity) || capacity < 0) {
        throw new TypeError('capacity must be an unsigned integer.')
      }

      if (!Number.isInteger(maximumEntity) || maximumEntity < 0) {
        throw new TypeError('maximumEntity must be an unsigned integer.')
      }
      
      const maxTypedValue = 2 ** (UintXXArray.BYTES_PER_ELEMENT * 8) - 1;
      if (maximumEntity > maxTypedValue) {
        throw new RangeError(`maximumEntity exceeds maximum storable value for ${UintXXArray.name}: ${maxTypedValue}.`);
      }

      /**Maximum size */
      this.#capacity = capacity;

      /**Maximum value that can be stored */
      this.#maxEntity = maximumEntity;

      /**Cardinality - number of elements in the set */
      this.#size = 0;

      this.#sparse = new UintXXArray(maximumEntity + 1);

      // dense arrays
      this.#entities = new UintXXArray(capacity);
      this.#components = new Array(capacity).fill(null);    
    }

    #assert(value) {
      if (!Number.isInteger(value) || value < 0 || value > this.#maxEntity) {
        throw new TypeError('Pool only supports unsigned (non-negative) integers less than the Pool\'s maximumEntity.')
      }
    }

    /**
     * @returns the number of unique entities in the Pool.
     */
    get size() {
      return this.#size;
    }
    get capacity() {
      return this.#capacity;
    }

    /**
     * Appends an Entity-Component pair to the Pool, or sets it if it already exists.
     * @param {number} entity 
     * @param {*} component
     * @returns Returns true if successfully added or set, or false if the Pool is full.
     */
    add(entity, component) {
      this.#assert(entity);

      if (this.#size >= this.#capacity) return false;

      const i = this.#sparse[entity];

      // setting the component the entity already has
      if (i < this.#size && this.#entities[i] === entity) {
        this.#components[i] = component;
        return true;
      }

      // adding the component for the first time
      this.#entities[this.#size] = entity;
      this.#components[this.#size] = component;
      this.#sparse[entity] = this.#size;
      this.#size++;
      return true;
    }

    /**
     * Removes a specified Entity from the Pool.
     * @returns Returns true if an Entity in the Pool existed and has been removed, or false if the Entity does not exist.
     * @param {number} entity 
     */
    delete(entity) {
      this.#assert(entity);

      if (!this.has(entity)) return false;

      const index = this.#sparse[entity];
      const lastEntity = this.#entities[this.#size - 1];
      const lastComponent = this.#components[this.#size - 1];

      this.#entities[index] = lastEntity;
      this.#components[index] = lastComponent;

      this.#sparse[lastEntity] = index;
      this.#size--;
      this.#components[this.#size] = null;

      return true;
    }

    /**
     * @returns a boolean indicating whether the Entity exists in the Pool or not.
     * @param {number} entity 
     */
    has(entity) {
      if (entity > this.#maxEntity) return false;

      const i = this.#sparse[entity];
      return Number.isInteger(i) && i < this.#size && this.#entities[i] === entity;
    }

    clear() {
      for (let i = 0; i < this.#size; i++) {
        this.#components[i] = null;
      }
      this.#size = 0;
    }

    /**
     * Executes a provided function once per each Entity in the Pool, in insertion order.
     * @param {function} callbackfn 
     * @param {*} thisArg 
     */
    forEach(callbackfn, thisArg) {
      for (let i = 0; i < this.#size; i++) {
        callbackfn.call(thisArg, this.#components[i], this.#entities[i], this);
      }
    }

    /**
     * @returns Returns the Component value from the given Entity. If no Component is associated with the specified Entity, undefined is returned.
     * @param {number} entity 
     */
    get(entity) {
      if (!Number.isInteger(entity) || entity < 0 || entity > this.#maxEntity) {
        return undefined;
      }

      const i = this.#sparse[entity];
      if (i < this.#size && this.#entities[i] === entity) {
        return this.#components[i];
      }
      return undefined;
    }

    *keys() {
      for (let i = 0; i < this.#size; i++) {
        yield this.#entities[i];
      }
    }

    *values() {
      for (let i = 0; i < this.#size; i++) {
        yield this.#components[i];
      }
    }

    *entries() {
      for (let i = 0; i < this.#size; i++) {
        yield [this.#entities[i], this.#components[i]];
      }
    }

    [Symbol.iterator]() {
      return this.entries();
    }

    toArray() {
      return this.#components.slice(0, this.#size);
    }

    entitiesToArray() {
      return this.#entities.slice(0, this.#size);
    }

    isEmpty() {
      return this.#size === 0;
    }

    static default(capacity=1000, maximumEntity=65535, UintXXArray=Uint16Array) {
      return new Pool(capacity, maximumEntity, UintXXArray);
    }
    static defaultSmall(capacity = 255, maximumEntity = 255, UintXXArray = Uint8Array) {
      return new Pool(capacity, maximumEntity, UintXXArray);
    }
    static defaultLarge(capacity = 10000, maximumEntity = 1000000, UintXXArray = Uint32Array) {
      return new Pool(capacity, maximumEntity, UintXXArray);
    }
  }

  /**
   * A World instance manages entities, components, and systems.
   * (Lowercase) entities are numeric IDs assigned by the World instance
   * Components are plain data wrapped in a named class for pooling.
   * Systems are (optionally) ordered functions iterated over entities of select components.
   */
  class World {
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
      }    return pool.add(entity, data);
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

  return World;

}));
