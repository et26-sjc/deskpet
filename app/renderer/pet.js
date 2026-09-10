const sprite = document.getElementById('sprite');

const actions = {
  idle: '../../assets/character/idle.png',
  wave: '../../assets/character/wave.png',
  sleep: '../../assets/character/sleep.png'
};

function play(action) {
  if (actions[action]) sprite.src = actions[action];
}

setInterval(() => {
  const states = ['idle', 'idle', 'wave'];
  play(states[Math.floor(Math.random() * states.length)]);
}, 10000);

window.addEventListener('click', () => {
  play('wave');
  setTimeout(() => play('idle'), 2000);
});
