// Minimal companion pet state machine
// Handles calm desktop companion behavior only.

class CompanionStateMachine {
  constructor(config) {
    this.config = config;
    this.state = 'idle';
  }

  setState(next) {
    if (this.config.states[next]) {
      this.state = next;
    }
  }

  onClick() {
    this.setState('interaction');
    return 'wave';
  }

  tick() {
    return this.state;
  }

  randomIdleBehavior() {
    const actions = this.config.states.idle.actions;
    return actions[Math.floor(Math.random() * actions.length)];
  }
}

module.exports = CompanionStateMachine;
