export class MovementController {
  constructor(options = {}) {
    this.speed = options.speed ?? 1.5;
    this.direction = 1;
    this.enabled = true;
    this.position = { x: options.x ?? 100, y: options.y ?? 100 };
    this.bounds = options.bounds ?? { width: 1200, height: 800 };
  }

  update() {
    if (!this.enabled) return this.position;

    this.position.x += this.speed * this.direction;

    if (this.position.x <= 0 || this.position.x >= this.bounds.width) {
      this.direction *= -1;
    }

    return this.position;
  }

  pause() {
    this.enabled = false;
  }

  resume() {
    this.enabled = true;
  }
}
