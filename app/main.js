const { app, BrowserWindow } = require('electron');
const path = require('path');
const MovementController = require('./movement');
const { createTray } = require('./tray');

let petWindow;
let movement;

function createPetWindow() {
  petWindow = new BrowserWindow({
    width: 220,
    height: 320,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    resizable: false,
    hasShadow: false,
    webPreferences: {
      contextIsolation: true
    }
  });

  petWindow.loadFile(path.join(__dirname, 'renderer/index.html'));

  movement = new MovementController(petWindow);
  movement.start();

  createTray({
    pause: () => movement.pause(),
    resume: () => movement.resume(),
    reload: () => petWindow.reload()
  });
}

app.whenReady().then(createPetWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
