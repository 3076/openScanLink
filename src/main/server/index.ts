import express from 'express'
import cors from 'cors'
import { Notification } from 'electron'
import { logger } from '../logger'
import { configManager } from '../config'
import { scannerService } from '../scanner'

const app = express()
const port = 17890
let lastNotifyTime = 0

app.use(cors()) // 允许所有源跨域访问
app.use(express.json())

// 静态文件服务：允许网页端预览扫描结果
// 访问示例：http://127.0.0.1:17890/api/file/view?path=C%3A%5CUsers%5CPublic%5CEduScan%5Cdata%5Cimages%5Ctest.jpg
app.get('/api/file/view', (req: express.Request, res: express.Response) => {
  const filePath = req.query.path as string
  if (!filePath) return res.status(400).send('Path is required')
  
  // 安全检查：确保只能访问指定的扫描数据目录
  const dataDir = configManager.getDataDir()
  if (!filePath.startsWith(dataDir)) {
    return res.status(403).send('Forbidden: Access outside data directory')
  }

  res.sendFile(filePath)
})

// 仅允许 localhost 访问
app.use((req: express.Request, res: express.Response, next: express.NextFunction) => {
  const remoteAddress = req.socket.remoteAddress
  if (remoteAddress === '127.0.0.1' || remoteAddress === '::1' || remoteAddress === '::ffff:127.0.0.1') {
    next()
  } else {
    logger.warn(`拦截非法访问请求: ${remoteAddress}`)
    res.status(403).send('Forbidden: Localhost only')
  }
})

// 获取扫描设备列表
app.get('/api/device/list', async (req: express.Request, res: express.Response) => {
  logger.info('请求获取设备列表')
  try {
    const devices = await scannerService.listDevices()

    // 网页端连接成功时弹出系统提示 (防抖: 5秒内不重复弹)
    const now = Date.now()
    if (now - lastNotifyTime > 5000 && Notification.isSupported()) {
      new Notification({
        title: '数育帮扫描助手',
        body: '网页端已成功连接至扫描服务！',
        silent: true
      }).show()
      lastNotifyTime = now
    }

    res.json({ success: true, data: devices })
  } catch (error: any) {
    logger.error(`获取设备列表失败: ${error.message}`)
    res.status(500).json({ success: false, message: error.message })
  }
})

// 启动扫描任务
app.post('/api/scan/start', async (req: express.Request, res: express.Response) => {
  const options = req.body
  logger.info(`请求启动扫描任务: ${JSON.stringify(options)}`)
  try {
    const taskId = await scannerService.startScan(options)
    res.json({ success: true, taskId })
  } catch (error: any) {
    logger.error(`启动扫描失败: ${error.message}`)
    res.status(500).json({ success: false, message: error.message })
  }
})

// 获取扫描状态
app.get('/api/scan/status/:taskId', (req: express.Request, res: express.Response) => {
  const taskId = req.params.taskId as string
  const status = scannerService.getScanStatus(taskId)
  if (!status) {
    return res.status(404).json({ success: false, message: '任务不存在' })
  }
  res.json({ success: true, ...status })
})

// 终止扫描任务
app.post('/api/scan/cancel/:taskId', async (req: express.Request, res: express.Response) => {
  const taskId = req.params.taskId as string
  logger.info(`请求取消扫描任务: ${taskId}`)
  try {
    const success = await scannerService.cancelScan(taskId)
    if (success) {
      res.json({ success: true, message: '扫描任务已终止' })
    } else {
      res.status(404).json({ success: false, message: '未找到该扫描任务' })
    }
  } catch (error: any) {
    logger.error(`取消扫描失败: ${error.message}`)
    res.status(500).json({ success: false, message: error.message })
  }
})

// 获取扫描结果
app.get('/api/scan/result/:taskId', (req: express.Request, res: express.Response) => {
  const taskId = req.params.taskId as string
  const status = scannerService.getScanStatus(taskId)
  if (!status) {
    return res.status(404).json({ success: false, message: '任务不存在' })
  }
  res.json({ success: true, files: status.files })
})

export function startServer() {
  logger.info(`准备启动本地 API 服务，端口: ${port}`)
  const server = app.listen(port, '0.0.0.0', () => {
    logger.info(`本地 API 服务已启动: http://127.0.0.1:${port}`)
  })
  
  server.on('error', (e) => {
    logger.error(`本地 API 服务启动失败: ${e.message}`)
  })
}
