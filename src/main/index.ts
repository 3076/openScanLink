import { app, shell, BrowserWindow, ipcMain, Tray, Menu, nativeImage } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { startServer } from './server'
import { logger } from './logger'
import { setupIpcHandlers } from './ipc'
import { initUpdater } from './updater'
import { configManager } from './config'

let tray: Tray | null = null
let mainWindow: BrowserWindow | null = null

function createWindow(): void {
  // 创建浏览器窗口
  mainWindow = new BrowserWindow({
    width: 900,
    height: 670,
    show: false,
    autoHideMenuBar: true,
    title: 'OpenScanLink 控制台',
    icon: join(__dirname, '../../resources/icon.png'),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    // 如果是通过开机自启（带 --hidden 参数）启动，则不显示主窗口，直接最小化到托盘
    if (!process.argv.includes('--hidden')) {
      mainWindow?.show()
    }
  })

  // 点击关闭按钮时隐藏窗口而不是退出程序
  mainWindow.on('close', (event) => {
    if (process.platform === 'win32') {
      event.preventDefault()
      mainWindow?.hide()
    }
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // 基于 vite 的开发服务器热重载或为生产环境加载本地文件
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

function createTray(): void {
  const iconPath = join(__dirname, '../../resources/icon.png')
  const icon = nativeImage.createFromPath(iconPath)
  tray = new Tray(icon)

  const contextMenu = Menu.buildFromTemplate([
    {
      label: '显示控制台',
      click: () => {
        mainWindow?.show()
      }
    },
    { type: 'separator' },
    {
      label: '退出',
      click: () => {
        app.releaseSingleInstanceLock()
        app.exit()
      }
    }
  ])

  tray.setToolTip('OpenScanLink 正在后台运行')
  tray.setContextMenu(contextMenu)

  tray.on('double-click', () => {
    mainWindow?.show()
  })
}

// 当 Electron 完成初始化并准备创建浏览器窗口时，将调用此方法
app.whenReady().then(() => {
  // 设置应用用户模型 ID (Windows)
  electronApp.setAppUserModelId('com.eduscan.link')

  // 同步开机自启状态
  const autostart = configManager.getConfig().autostart !== false
  app.setLoginItemSettings({
    openAtLogin: autostart,
    path: process.execPath,
    args: ['--hidden']
  })

  // 启动本地 HTTP 服务
  startServer()
  // 设置 IPC 处理器
  setupIpcHandlers()
  logger.info('数育帮扫描助手 启动中...')

  // 在开发中默认通过 F12 开启/关闭开发者工具，
  // 并在生产中忽略命令组合键。
  // 参见 https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  createWindow()
  createTray()
  initUpdater() // 初始化自动更新

  app.on('activate', function () {
    // 在 macOS 上，当点击托盘图标且没有其他窗口打开时，通常会重新创建一个窗口。
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

// 除了 macOS 外，当所有窗口关闭时退出应用。
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    // app.quit() // 修改：窗口关闭不退出，由托盘控制退出
  }
})
