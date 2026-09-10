// Simple companion animation controller.

class Animator {
  constructor(spriteLoader) {
    this.spriteLoader = spriteLoader;
    this.current = 'idle';
    this.frame = null;
  }

  play(action) {
    if (!this.spriteLoader.has(action)) {
      return false;
    }
    this.current = action;
    this.frame = this.spriteLoader.load(action);
    return true;
  }

  getCurrent() {
    return {
      action: this.current,
      frame: this.frame,
    };
  }
}

module.exports = Animator;
