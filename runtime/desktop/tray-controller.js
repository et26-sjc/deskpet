export class TrayController {
  constructor(callbacks = {}) {
    this.callbacks = callbacks;
  }

  pause() {
    this.callbacks.onPause?.();
  }

  resume() {
    this.callbacks.onResume?.();
  }

  quit() {
    this.callbacks.onQuit?.();
  }
}
