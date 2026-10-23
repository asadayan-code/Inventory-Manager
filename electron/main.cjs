const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { spawn } = require('child_process');

let mainWindow = null;
let pyProcess = null;
const PY_PORT = 8001;

function startPythonBackend() {
  const isDev = !app.isPackaged;
  let pyExecutable = 'python';
  let pyScript = path.join(__dirname, '..', 'backend', 'server.py');

  if (process.platform === 'win32') {
    pyExecutable = isDev ? 'python.exe' : path.join(process.resourcesPath, 'backend_dist', 'server.exe');
  } else {
    pyExecutable = isDev ? 'python3' : path.join(process.resourcesPath, 'backend_dist', 'server');
  }

  const args = isDev ? [pyScript] : [];
  console.log('Spawning Python background process:', pyExecutable, args);

  pyProcess = spawn(pyExecutable, args, {
    stdio: 'ignore',
    windowsHide: true,
    env: { ...process.env, PORT: String(PY_PORT) }
  });

  pyProcess.on('error', (err) => {
    console.error('Failed to spawn Python backend process:', err);
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1280,
    minHeight: 720,
    title: 'Sohail Autos POS & Retail Management System',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
    autoHideMenuBar: true,
  });

  const isDev = !app.isPackaged;
  if (isDev) {
    mainWindow.loadURL('http://localhost:3000');
  } else {
    mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// IPC Handlers for Windows printing
ipcMain.handle('print-document', async (event, options = {}) => {
  if (!mainWindow) return { success: false, error: 'No active window' };
  return new Promise((resolve) => {
    mainWindow.webContents.print(
      {
        silent: options.silent || false,
        printBackground: true,
        deviceName: options.deviceName || '',
        pageSize: 'A4',
      },
      (success, failureReason) => {
        resolve({ success, failureReason });
      }
    );
  });
});

ipcMain.handle('get-printers', async () => {
  if (!mainWindow) return [];
  return mainWindow.webContents.getPrintersAsync();
});

app.whenReady().then(() => {
  startPythonBackend();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (pyProcess) {
    try {
      pyProcess.kill();
    } catch {}
  }
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
