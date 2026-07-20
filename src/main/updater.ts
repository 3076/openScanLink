import { ipcMain, BrowserWindow, app } from 'electron'
import { logger } from './logger'
import axios from 'axios'
import fs from 'fs'
import path from 'path'
import os from 'os'
import { spawn } from 'child_process'

const UPDATE_JSON_URL = 'https://web-shuyubang.oss-cn-shenzhen.aliyuncs.com/eduScanLink_version.json'
let downloadedExePath = ''

// 版本对比函数: v1 > v2 返回 true
function compareVersion(v1: string, v2: string) {
  const parts1 = v1.split('.').map(Number)
  const parts2 = v2.split('.').map(Number)
  for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
    const n1 = parts1[i] || 0
    const n2 = parts2[i] || 0
    if (n1 > n2) return true
    if (n1 < n2) return false
  }
  return false
}

export function initUpdater() {
  // IPC 监听：手动触发检查
  ipcMain.handle('check-update', async () => {
    try {
      sendStatusToWindow('checking-for-update', '正在检查更新...')
      
      // 1. 获取 OSS 上的配置
      const response = await axios.get(`${UPDATE_JSON_URL}?t=${Date.now()}`)
      const updateConfig = response.data
      
      const currentVersion = app.getVersion()
      const isMac = process.platform === 'darwin'
      
      const remoteVersion = isMac ? updateConfig.macVersion : updateConfig.windowVersion
      const downloadUrl = isMac ? updateConfig.macUrl : updateConfig.windowUrl

      // 2. 对比版本号
      if (remoteVersion && downloadUrl && compareVersion(remoteVersion, currentVersion)) {
        logger.info(`发现新版本: ${remoteVersion}`)
        sendStatusToWindow('update-available', { version: remoteVersion })
        // 自动开始下载
        downloadUpdate(downloadUrl)
      } else {
        logger.info('当前已是最新版本')
        sendStatusToWindow('update-not-available', null)
      }
    } catch (error: any) {
      logger.error('检查更新失败: ' + error.message)
      sendStatusToWindow('update-error', '检查更新失败，请检查网络')
    }
  })

  // IPC 监听：手动触发安装
  ipcMain.handle('install-update', () => {
    if (downloadedExePath && fs.existsSync(downloadedExePath)) {
      logger.info(`准备运行安装包: ${downloadedExePath}`)
      
      // 独立运行下载好的 exe 安装包
      const child = spawn(downloadedExePath, [], {
        detached: true,
        stdio: 'ignore'
      })
      child.unref()
      
      // 退出当前 Electron 应用
      app.quit()
    } else {
      logger.error('安装包不存在: ' + downloadedExePath)
      sendStatusToWindow('update-error', '安装包不存在，请重新下载')
    }
  })
}

async function downloadUpdate(fileUrl: string) {
  try {
    const tempDir = os.tmpdir()
    // 截取文件名，或使用默认名
    const fileName = fileUrl.substring(fileUrl.lastIndexOf('/') + 1) || 'eduScanLink_Setup.exe'
    downloadedExePath = path.join(tempDir, fileName)

    logger.info(`开始下载更新到临时目录: ${downloadedExePath}`)
    
    const response = await axios({
      url: fileUrl,
      method: 'GET',
      responseType: 'stream'
    })

    const contentLength = response.headers['content-length']
    const totalLength = contentLength ? parseInt(contentLength.toString(), 10) : 0
    let downloadedLength = 0

    const writer = fs.createWriteStream(downloadedExePath)

    response.data.on('data', (chunk: Buffer) => {
      downloadedLength += chunk.length
      if (totalLength > 0) {
        const percent = (downloadedLength / totalLength) * 100
        sendStatusToWindow('download-progress', {
          percent: percent,
          transferred: downloadedLength,
          total: totalLength
        })
      }
    })

    response.data.pipe(writer)

    writer.on('finish', () => {
      logger.info('新版本安装包下载完成')
      sendStatusToWindow('update-downloaded', null)
    })

    writer.on('error', (err) => {
      logger.error('安装包写入失败: ' + err.message)
      sendStatusToWindow('update-error', '安装包写入失败')
    })

  } catch (error: any) {
    logger.error('下载安装包失败: ' + error.message)
    sendStatusToWindow('update-error', '下载安装包失败')
  }
}

function sendStatusToWindow(event: string, data?: any) {
  BrowserWindow.getAllWindows().forEach(win => {
    win.webContents.send('updater-message', { event, data })
  })
}
