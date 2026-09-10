// Friend DeskPet window manager foundation
// Electron integration point for transparent companion windows.

class PetWindowManager {
  constructor(config = {}) {
    this.config = {
      width: 220,
      height: 320,
      alwaysOnTop: true,
      transparent: true,
      clickThrough: false,
      ...config,
    };
    this.window = null;
  }

  attachWindow(window) {
    this.window = window;
  }

  moveTo(x, y) {
    if (!this.window) return;
    this.window.setPosition(Math.round(x), Math.round(y));
  }

  setVisible(value) {
    if (!this.window) return;
    value ? this.window.show() : this.window.hide();
  }

  pause() {
    this.paused = true;
  }

  resume() {
    this.paused = false;
  }
}

module.exports = PetWindowManager;
