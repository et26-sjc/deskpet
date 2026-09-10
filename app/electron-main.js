const { app, BrowserWindow, ipcMain, screen } = require('electron');
const path = require('path');

let win;

function createPetWindow() {
  const display = screen.getPrimaryDisplay();
  const bounds = display.workArea;

  win = new BrowserWindow({
    width: 220,
    height: 320,
    x: bounds.width - 260,
    y: bounds.height - 380,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    resizable: false,
    skipTaskbar: true,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
}

app.whenReady().then(createPetWindow);

ipcMain.on('pet-pause', () => win?.webContents.send('pause'));
ipcMain.on('pet-resume', () => win?.webContents.send('resume'));

app.on('window-all-closed', () => {});
