const { Tray, Menu, app } = require('electron');

let tray;

function createTray(actions = {}) {
  tray = new Tray(actions.icon || '');

  tray.setToolTip('Friend DeskPet');

  tray.setContextMenu(Menu.buildFromTemplate([
    {
      label: 'Pause',
      click: () => actions.pause && actions.pause()
    },
    {
      label: 'Resume',
      click: () => actions.resume && actions.resume()
    },
    {
      label: 'Reload Character',
      click: () => actions.reload && actions.reload()
    },
    {
      label: 'Quit',
      click: () => app.quit()
    }
  ]));

  return tray;
}

module.exports = { createTray };
