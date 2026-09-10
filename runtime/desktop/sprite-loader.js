// Load generated human companion sprites.

const fs = require('fs');
const path = require('path');

class SpriteLoader {
  constructor(root = 'assets/character') {
    this.root = root;
  }

  load(action) {
    const file = path.join(this.root, `${action}.png`);
    if (!fs.existsSync(file)) {
      return null;
    }
    return file;
  }

  has(action) {
    return this.load(action) !== null;
  }
}

module.exports = SpriteLoader;
