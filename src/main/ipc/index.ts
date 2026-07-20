import { ipcMain, shell, app } from 'electron'
import fs from 'fs'
import path from 'path'
import { configManager } from '../config'
import { logger } from '../logger'
import { scannerService } from '../scanner'

export function setupIpcHandlers() {
  // 获取应用版本号
  ipcMain.handle('get-app-version', () => {
    return app.getVersion()
  })

  // 获取配置
  ipcMain.handle('get-config', () => {
    return configManager.getConfig()
  })

  // 保存配置
  ipcMain.handle('save-config', (_, newConfig) => {
    configManager.saveConfig(newConfig)
    logger.info('通过渲染进程更新配置')
    return { success: true }
  })

  // 获取扫描仪列表
  ipcMain.handle('list-devices', async () => {
    return await scannerService.listDevices()
  })

  // 启动扫描
  ipcMain.handle('start-scan', async (_, options) => {
    return await scannerService.startScan(options)
  })

  // 获取任务状态
  ipcMain.handle('get-scan-status', (_, taskId) => {
    return scannerService.getScanStatus(taskId)
  })

  // 获取日志
  ipcMain.handle('get-logs', () => {
    // TODO: 读取日志文件内容
    return []
  })

  // 打开缓存文件夹
  ipcMain.handle('open-cache-folder', async () => {
    const dataDir = configManager.getDataDir()
    const imagesDir = path.join(dataDir, 'images')
    if (!fs.existsSync(imagesDir)) {
      fs.mkdirSync(imagesDir, { recursive: true })
    }
    await shell.openPath(imagesDir)
    return { success: true }
  })

  // 获取缓存
  ipcMain.handle('clear-cache', async () => {
    try {
      const dataDir = configManager.getDataDir()
      const imagesDir = path.join(dataDir, 'images')
      if (fs.existsSync(imagesDir)) {
        const files = fs.readdirSync(imagesDir)
        for (const file of files) {
          const filePath = path.join(imagesDir, file)
          const stat = fs.statSync(filePath)
          if (stat.isFile()) {
            fs.unlinkSync(filePath)
          }
        }
        logger.info(`已清空缓存文件夹: ${imagesDir}`)
        return { success: true }
      }
      return { success: true }
    } catch (error: any) {
      logger.error(`清空缓存失败: ${error.message}`)
      return { success: false, message: error.message }
    }
  })

  // 获取开机自启状态
  ipcMain.handle('get-autostart', () => {
    return configManager.getConfig().autostart !== false
  })

  // 设置开机自启
  ipcMain.handle('set-autostart', (_, enable: boolean) => {
    app.setLoginItemSettings({
      openAtLogin: enable,
      path: process.execPath,
      args: ['--hidden']
    })
    // 同步到配置文件
    configManager.saveConfig({ autostart: enable })
    logger.info(`设置开机自启: ${enable}`)
    return enable
  })

  logger.info('IPC 通信处理器初始化完成')
}
