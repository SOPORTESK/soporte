// ─── PRELOAD — puente seguro entre Electron y la app web ─────────────────────
const { contextBridge, ipcRenderer } = require('electron');

process.env.ELECTRON_DISABLE_SECURITY_WARNINGS = 'true';

contextBridge.exposeInMainWorld('electronAPI', {
  isElectron      : true,
  recargar        : () => ipcRenderer.send('recargar'),
  notificarN2     : (data) => ipcRenderer.send('notificar-n2', data),
  notificarModoManual: () => ipcRenderer.send('notificar-modo-manual'),
});
