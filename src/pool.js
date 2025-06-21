/**
 * Pool is a map-like collection, providing O(1) time complexity for addition, deletion, and lookup. Iteration is O(n). Clearing is O(n) rather than O(1).
 */
export default class Pool {
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
