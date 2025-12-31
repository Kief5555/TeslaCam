const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electronAPI', {
  selectFolder: () => ipcRenderer.invoke('select-folder'),
  readDirectory: (path) => ipcRenderer.invoke('read-directory', path),
  readFile: (path) => ipcRenderer.invoke('read-file', path),
  getFilePath: (relativePath) => ipcRenderer.invoke('get-file-path', relativePath),
  saveFile: (options) => ipcRenderer.invoke('save-file', options),
  showSaveDialog: (options) => ipcRenderer.invoke('show-save-dialog', options),
  getAppPath: () => ipcRenderer.invoke('get-app-path'),
  showItemInFolder: (path) => ipcRenderer.invoke('show-item-in-folder', path),
  maximizeWindow: () => ipcRenderer.invoke('maximize-window'),
  isMaximized: () => ipcRenderer.invoke('is-maximized'),
})
