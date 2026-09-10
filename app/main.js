const { app, BrowserWindow } = require('electron');
const path = require('path');

let petWindow;

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

  petWindow.setIgnoreMouseEvents(false);
  petWindow.loadFile(path.join(__dirname, 'renderer/index.html'));
}

app.whenReady().then(createPetWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
