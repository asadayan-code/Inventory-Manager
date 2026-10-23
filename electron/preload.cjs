const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  printDocument: (options) => ipcRenderer.invoke('print-document', options),
  getPrinters: () => ipcRenderer.invoke('get-printers'),
  isDesktop: true,
});
