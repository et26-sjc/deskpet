const sprite = document.getElementById('sprite');

const actions = {
  idle: '../../assets/character/idle.png',
  wave: '../../assets/character/wave.png',
  sleep: '../../assets/character/sleep.png'
};

const messages = [
  '你好呀',
  '今天也辛苦啦',
  '记得休息一下'
];

function play(action) {
  if (actions[action]) sprite.src = actions[action];
}

function speak() {
  const bubble = document.createElement('div');
  bubble.innerText = messages[Math.floor(Math.random() * messages.length)];
  bubble.style.position = 'absolute';
  bubble.style.top = '10px';
  bubble.style.left = '10px';
  bubble.style.background = 'white';
  bubble.style.padding = '8px';
  bubble.style.borderRadius = '10px';
  document.body.appendChild(bubble);
  setTimeout(() => bubble.remove(), 2500);
}

setInterval(() => {
  const states = ['idle', 'idle', 'wave'];
  play(states[Math.floor(Math.random() * states.length)]);
}, 10000);

window.addEventListener('click', () => {
  play('wave');
  speak();
  setTimeout(() => play('idle'), 2000);
});
