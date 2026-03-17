import { app, BrowserWindow, ipcMain, Menu, shell, net } from 'electron';
import * as path from 'path';
import { registerHardwareHandlers } from './ipc/hardware';
import { registerOrderHandlers } from './ipc/orders';
import { registerSyncHandlers, startSyncEngine, onNetworkOnline } from './ipc/sync';
import { initLocalDb } from './store/local-db';

const isDev =
  process.env.NODE_ENV === 'development' || process.env.ELECTRON_DEV === 'true';

let mainWindow: BrowserWindow | null = null;

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 768,
    show: false,
    backgroundColor: '#0f172a',
    titleBarStyle: 'hiddenInset',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      webSecurity: !isDev,
    },
    icon: path.join(__dirname, '..', 'assets', 'icon.png'),
  });

  if (isDev) {
    mainWindow.loadURL('http://localhost:3000');
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    mainWindow.loadFile(
      path.join(__dirname, '..', 'renderer', 'out', 'index.html')
    );
  }

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
    mainWindow?.focus();
    // Démarrer l'engine de sync une fois la fenêtre prête
    startSyncEngine(mainWindow!);
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  if (!isDev) {
    Menu.setApplicationMenu(null);
  }
}

async function initialize(): Promise<void> {
  initLocalDb();
  registerHardwareHandlers(ipcMain);
  registerOrderHandlers(ipcMain);
  registerSyncHandlers(ipcMain);
}

app.whenReady().then(async () => {
  await initialize();
  createWindow();

  // Détecter le retour en ligne au niveau OS (Electron)
  app.on('browser-window-focus', () => {
    if (net.isOnline()) onNetworkOnline();
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// Sécurité : bloquer la navigation externe
app.on('web-contents-created', (_event, contents) => {
  contents.on('will-navigate', (event, url) => {
    const allowed = ['http://localhost:3000', 'file://'];
    if (!allowed.some((o) => url.startsWith(o))) {
      event.preventDefault();
    }
  });
  // Bloquer les nouvelles fenêtres complètement
  contents.setWindowOpenHandler(() => ({ action: 'deny' }));
});

export { mainWindow };
