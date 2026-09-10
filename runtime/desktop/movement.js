// Gentle desktop movement for companion pets.

class MovementController {
  constructor(config = {}) {
    this.speed = config.speed || 1.5;
    this.position = { x: 100, y: 100 };
    this.direction = 1;
  }

  tick() {
    this.position.x += this.speed * this.direction;
    return this.position;
  }

  reverse() {
    this.direction *= -1;
  }

  setPosition(x, y) {
    this.position = { x, y };
  }

  getPosition() {
    return this.position;
  }
}

module.exports = MovementController;
