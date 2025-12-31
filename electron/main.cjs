const { app, BrowserWindow, ipcMain, dialog, protocol, shell } = require('electron')
const path = require('path')
const fs = require('fs')

let mainWindow

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1600,
    height: 1000,
    minWidth: 1200,
    minHeight: 800,
    frame: false,
    titleBarStyle: 'hidden',
    trafficLightPosition: { x: 16, y: 16 },
    backgroundColor: '#0a0a0a',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.cjs'),
      webSecurity: false,
    },
  })

  protocol.registerFileProtocol('local-video', (request, callback) => {
    const filePath = decodeURIComponent(request.url.replace('local-video://', ''))
    callback({ path: filePath })
  })

  if (process.env.NODE_ENV === 'development' || !app.isPackaged) {
    mainWindow.loadURL('http://localhost:5173')
    mainWindow.webContents.openDevTools()
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
  }
}

app.whenReady().then(() => {
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

ipcMain.handle('select-folder', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory'],
    title: 'Select Tesla Dashcam Folder',
  })
  return result.filePaths[0] || null
})

ipcMain.handle('read-directory', async (_, dirPath) => {
  try {
    const files = fs.readdirSync(dirPath)
    return files.filter(f => f.endsWith('.mp4'))
  } catch (err) {
    console.error('Error reading directory:', err)
    return []
  }
})

ipcMain.handle('read-file', async (_, filePath) => {
  try {
    const buffer = fs.readFileSync(filePath)
    return buffer
  } catch (err) {
    console.error('Error reading file:', err)
    return null
  }
})

ipcMain.handle('get-file-path', (_, relativePath) => {
  return path.resolve(relativePath)
})

ipcMain.handle('save-file', async (_, { defaultPath, filters, data }) => {
  const result = await dialog.showSaveDialog(mainWindow, {
    defaultPath,
    filters,
  })

  if (!result.canceled && result.filePath) {
    fs.writeFileSync(result.filePath, Buffer.from(data))
    return result.filePath
  }
  return null
})

ipcMain.handle('show-save-dialog', async (_, { defaultPath, filters }) => {
  const result = await dialog.showSaveDialog(mainWindow, {
    defaultPath,
    filters,
  })

  if (!result.canceled && result.filePath) {
    return result.filePath
  }
  return null
})

ipcMain.handle('get-app-path', () => {
  return app.getAppPath()
})

ipcMain.handle('show-item-in-folder', (_, filePath) => {
  shell.showItemInFolder(filePath)
})

ipcMain.handle('maximize-window', () => {
  if (mainWindow.isMaximized()) {
    mainWindow.unmaximize()
  } else {
    mainWindow.maximize()
  }
  return mainWindow.isMaximized()
})

ipcMain.handle('is-maximized', () => {
  return mainWindow.isMaximized()
})
