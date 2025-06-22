# sparse-set-ecs-js

An entity-component system built in JS using sparse-set architecture.

>This ECS is for my personal use, but feel free to use it if you feel so inclined. See LICENSE for more details.

## Features

- ECMA Script 2015 (ES6) style API
- Framework agnostic
- TypeScript compatible (TBD)
- (De)Serialization*

>*Deserialization of components uses objects keyed by type rather than Classes, but is compatible with previously defined Classes as they have the same properties.

## Installation

```js
npm i github:gigann/sparse-set-ecs-js
```

## Usage

### Starter

```js
import World from './sparse-set-ecs-js';

// Create a new world for your entities to live in.
const world = new World(1000);

// Make an entity. This returns an Entity wrapper for the integer ID with some ergonomic methods.
const player = world.spawn();

// You can define components like this
class Position {
  constructor(x, y){
    this.x = x;
    this.y = y;
  }
}

const position = new Position(0, 0);

// or like this
const velocity = {
  type: 'Velocity',
  dX: 0,
  dY: 0
}

// and can add them to entities like this
player.addComponent(new Position(0, 0));

// or like this
player.addComponent({
  type: 'Velocity',
  dX: 0,
  dY: 0
});

// or just do it all at once
const player = world.spawn()
  .with(new Position(0, 0))
  .with(new Velocity(0, 0));

// even simpler
const player = world.spawn().with(
  new Position(0, 0),
  new Velocity(0, 0));

// And can query them by Class, object, or string
const entities = world.all(Position, velocity, 'Sprite');

// TODO

// Systems explanation

```
