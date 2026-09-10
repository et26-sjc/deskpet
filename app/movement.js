class MovementController {
  constructor(win) {
    this.win = win;
    this.timer = null;
    this.enabled = true;
    this.direction = 1;
    this.speed = 2;
  }

  start() {
    if (this.timer) return;
    this.timer = setInterval(() => this.step(), 100);
  }

  step() {
    if (!this.enabled || !this.win) return;

    const [x, y] = this.win.getPosition();
    const nextX = x + this.direction * this.speed;

    if (nextX < 0 || nextX > 1600) {
      this.direction *= -1;
      return;
    }

    this.win.setPosition(nextX, y);
  }

  pause() {
    this.enabled = false;
  }

  resume() {
    this.enabled = true;
  }
}

module.exports = MovementController;
