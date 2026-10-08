const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('kitesDesktop', {
  getLanguage: () => ipcRenderer.invoke('kites:language:get'),
  setLanguage: (preference) => ipcRenderer.invoke('kites:language:set', preference),
});
