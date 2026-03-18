import { app, BrowserWindow, ipcMain, Menu, shell, net, screen } from 'electron';
import * as path from 'path';
import { registerHardwareHandlers } from './ipc/hardware';
import { registerOrderHandlers } from './ipc/orders';
import { registerSyncHandlers, startSyncEngine, onNetworkOnline } from './ipc/sync';
import { initLocalDb } from './store/local-db';

const isDev =
  process.env.NODE_ENV === 'development' || process.env.ELECTRON_DEV === 'true';

let mainWindow:            BrowserWindow | null = null;
let customerDisplayWindow: BrowserWindow | null = null;
let lastDisplayState:      unknown              = null;

// ─── Fenêtre principale (caissier) ───────────────────────────────────────────

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width:  1440,
    height: 900,
    minWidth:  1024,
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
    startSyncEngine(mainWindow!);
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
    // Fermer l'écran client quand la fenêtre principale se ferme
    customerDisplayWindow?.close();
    customerDisplayWindow = null;
  });

  if (!isDev) Menu.setApplicationMenu(null);
}

// ─── Écran client (2e moniteur) ───────────────────────────────────────────────

function createCustomerDisplay(): BrowserWindow {
  const displays    = screen.getAllDisplays();
  const primary     = screen.getPrimaryDisplay();
  const external    = displays.find((d) => d.id !== primary.id) ?? primary;

  customerDisplayWindow = new BrowserWindow({
    x:      external.bounds.x,
    y:      external.bounds.y,
    width:  external.bounds.width,
    height: external.bounds.height,
    fullscreen: displays.length > 1,   // plein écran seulement si vrai 2e moniteur
    frame:  false,
    backgroundColor: '#0f172a',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      webSecurity: !isDev,
    },
  });

  if (isDev) {
    customerDisplayWindow.loadURL('http://localhost:3000/display');
  } else {
    customerDisplayWindow.loadFile(
      path.join(__dirname, '..', 'renderer', 'out', 'display', 'index.html')
    );
  }

  customerDisplayWindow.on('closed', () => {
    customerDisplayWindow = null;
  });

  return customerDisplayWindow;
}

// ─── IPC : écran client ───────────────────────────────────────────────────────

function registerDisplayHandlers(): void {
  // Caissier → Main → écran client (données panier/paiement)
  ipcMain.on('display:update', (_event, state: unknown) => {
    lastDisplayState = state;

    if (!customerDisplayWindow) return;

    // Mécanisme 1 : IPC classique
    customerDisplayWindow.webContents.send('display:data', state);

    // Mécanisme 2 : injection directe via executeJavaScript (bypass tous les canaux)
    // Dispatche un CustomEvent que display/page.tsx écoute via addEventListener
    try {
      const stateJson = JSON.stringify(state);
      customerDisplayWindow.webContents.executeJavaScript(
        `(function(){
           window.__ELM_DISPLAY_STATE = ${stateJson};
           window.dispatchEvent(new CustomEvent('elm-display-update', { detail: ${stateJson} }));
         })()`
      ).catch(() => {});
    } catch {
      // ignore si la fenêtre n'est pas encore prête
    }
  });

  // Ouvrir l'écran client
  ipcMain.handle('display:open', () => {
    if (!customerDisplayWindow) {
      createCustomerDisplay();
    } else {
      customerDisplayWindow.show();
      customerDisplayWindow.focus();
    }
    return { success: true };
  });

  // Fermer l'écran client
  ipcMain.handle('display:close', () => {
    customerDisplayWindow?.close();
    customerDisplayWindow = null;
    return { success: true };
  });

  // Statut
  ipcMain.handle('display:status', () => ({
    open:      !!customerDisplayWindow,
    monitors:  screen.getAllDisplays().length,
  }));

  // Dernier état connu (demandé par l'écran client après montage React)
  ipcMain.handle('display:get-state', () => lastDisplayState);
}

// ─── Initialisation ───────────────────────────────────────────────────────────

async function initialize(): Promise<void> {
  initLocalDb();
  registerHardwareHandlers(ipcMain);
  registerOrderHandlers(ipcMain);
  registerSyncHandlers(ipcMain);
  registerDisplayHandlers();
}

app.whenReady().then(async () => {
  await initialize();
  createWindow();

  // Auto-ouvrir l'écran client si 2 moniteurs détectés au démarrage
  const displays = screen.getAllDisplays();
  if (displays.length > 1) {
    createCustomerDisplay();
  }

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

app.on('web-contents-created', (_event, contents) => {
  contents.on('will-navigate', (event, url) => {
    const allowed = ['http://localhost:3000', 'file://'];
    if (!allowed.some((o) => url.startsWith(o))) {
      event.preventDefault();
    }
  });
  contents.setWindowOpenHandler(() => ({ action: 'deny' }));
});

export { mainWindow };
