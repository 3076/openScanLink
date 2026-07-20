import * as child_process from 'child_process'
import path from 'path'
import fs from 'fs'
import { BrowserWindow, app } from 'electron'
import { IScanner, DeviceInfo, ScanOptions, ScanStatus } from '../../common/types'
import { logger } from '../logger'
import { configManager } from '../config'
import sharp from 'sharp'
import os from 'os'

// 强制开启 CPU SIMD (单指令多数据流) 矢量计算加速
sharp.simd(true)
// 根据客户机实际 CPU 物理核心数，动态榨干并行处理线程
sharp.concurrency(os.cpus().length)
logger.info(`[sharp] 已开启 SIMD 硬件加速，并发线程数设置为: ${os.cpus().length}`)

export class ScannerService implements IScanner {
  private tasks: Map<string, ScanStatus> = new Map()
  private bridgePath: string
  private activeProcess: child_process.ChildProcess | null = null
  private isDaemonReady: boolean = false
  private daemonInitPromise: Promise<void> | null = null
  private deviceCache: any[] = []
  private stdoutBuffer: string = ''
  private warmedDeviceId: string = ''
  private warmingDeviceId: string = ''
  private deviceWarmedAt: number = 0
  private readonly deviceWarmTtlMs = 5 * 60 * 1000

  // 状态记录，用于在收到 image_scanned 时并发处理图像
  private activeTaskParams: any = null
  private activeTaskImages: Promise<string>[] = []
  private activeTaskSavedFiles: string[] = []
  private activeTaskId: string = ''
  
  // 用于限制 sharp 处理的并发数
  private processQueue: (() => Promise<void>)[] = []
  private activeProcessCount = 0
  private readonly MAX_CONCURRENT_PROCESS = 2

  constructor() {
    // 适配开发环境和生产环境的路径
    this.bridgePath = app.isPackaged
      ? path.join(process.resourcesPath, 'bridge', 'ScannerService.exe')
      : path.join(process.cwd(), 'bridge', 'ScannerService.exe')
      
    this.ensureDataDir()
    this.initDaemon()
  }

  private ensureDataDir() {
    const dataDir = configManager.getDataDir()
    const subDirs = ['images', 'pdf', 'temp']
    subDirs.forEach(dir => {
      const p = path.join(dataDir, dir)
      if (!fs.existsSync(p)) {
        fs.mkdirSync(p, { recursive: true })
      }
    })
  }

  private async initDaemon(): Promise<void> {
    if (this.activeProcess && !this.activeProcess.killed) return

    this.isDaemonReady = false
    this.daemonInitPromise = new Promise((resolve) => {
      logger.info(`正在启动底层守护进程: ${this.bridgePath}`)
      
      this.activeProcess = child_process.spawn(this.bridgePath, ['--daemon'], {
        windowsHide: true
      })

      this.activeProcess.stdout?.on('data', (data) => {
        this.stdoutBuffer += data.toString()
        const lines = this.stdoutBuffer.split('\n')
        
        // 最后一个元素可能是未完整接收的一行，保留在缓冲区中等下一次拼接
        this.stdoutBuffer = lines.pop() || ''

        for (const line of lines) {
          if (!line.trim()) continue
          // 增加日志打印，排查守护进程到底输出了什么
          logger.info(`[Daemon Output] ${line.trim()}`)
          try {
            const result = JSON.parse(line)
            
            if (result.status === 'ready' && !this.isDaemonReady) {
              logger.info('守护进程已就绪')
              this.isDaemonReady = true
              resolve()
            }

            // 处理获取设备列表的回调
            if (result.type === 'device_list') {
              const resolvers = this.deviceResolvers
              this.deviceResolvers = [] // 清空队列

              if (result.success) {
                this.deviceCache = result.data
                resolvers.forEach(resolve => resolve(result.data))
                this.warmConfiguredDevice()
              } else {
                resolvers.forEach(resolve => resolve([]))
              }
            }

            if (result.type === 'device_warmed') {
              this.warmingDeviceId = ''
              if (result.success) {
                this.warmedDeviceId = result.deviceId
                this.deviceWarmedAt = Date.now()
                logger.info(`[ScannerService] device ${result.deviceId} warmed in ${result.elapsedMs}ms`)
              } else {
                logger.warn(`[ScannerService] device warm-up failed: ${result.message}`)
              }
            }

            // 同步进度和状态给前端
            if (result.status === 'scanning' || result.status === 'finished' || result.status === 'error') {
              const activeTaskId = Array.from(this.tasks.keys()).pop() || 'unknown_task'
              this.updateTaskStatus(activeTaskId, result)
              
              if (result.status === 'finished' || result.status === 'error') {
                const resolveFn = (this as any)._scanResolve
                const rejectFn = (this as any)._scanReject
                if (resolveFn && result.status === 'finished') resolveFn(result)
                if (rejectFn && result.status === 'error') rejectFn(new Error(result.message))
                ;(this as any)._scanResolve = null
                ;(this as any)._scanReject = null
              }
            }

            // 处理来自硬件的新图，交给 Node.js sharp 多线程并发处理
            if (result.status === 'image_scanned') {
              const { rawPath, currentIndex } = result
              const savePath = rawPath.replace('raw_', 'scan_')
              
              const p = this.enqueueSharpProcess(rawPath, savePath, this.activeTaskParams, currentIndex)
              this.activeTaskImages.push(p)
            }

            // 硬件进纸完成，等待所有的图像处理任务结束
            if (result.status === 'hardware_finished') {
              this.warmedDeviceId = this.activeTaskParams?.deviceId || ''
              this.deviceWarmedAt = Date.now()
              Promise.all(this.activeTaskImages).then(() => {
                const finalStatus = { 
                  status: 'finished' as const, 
                  progress: 100, 
                  message: '批量高速扫描并处理完成', 
                  files: this.activeTaskSavedFiles 
                }
                this.updateTaskStatus(this.activeTaskId, finalStatus)
                
                const resolveFn = (this as any)._scanResolve
                if (resolveFn) resolveFn(finalStatus)
                ;(this as any)._scanResolve = null
                ;(this as any)._scanReject = null
              }).catch(err => {
                const finalStatus = { 
                  status: 'error' as const, 
                  message: `图像批量处理失败: ${err.message}` 
                }
                this.updateTaskStatus(this.activeTaskId, finalStatus)
                
                const rejectFn = (this as any)._scanReject
                if (rejectFn) rejectFn(err)
                ;(this as any)._scanResolve = null
                ;(this as any)._scanReject = null
              })
            }

          } catch (e) {
            // 忽略非 JSON 输出
          }
        }
      })

      this.activeProcess.stderr?.on('data', (data) => {
        logger.error(`守护进程错误: ${data.toString()}`)
      })

      this.activeProcess.on('close', (code) => {
        logger.info(`守护进程已退出，退出码: ${code}`)
        this.activeProcess = null
        this.isDaemonReady = false
        this.warmedDeviceId = ''
        this.warmingDeviceId = ''
        this.deviceWarmedAt = 0
        // 如果异常退出，自动尝试重启
        if (code !== 0 && code !== null) {
          setTimeout(() => this.initDaemon(), 1000)
        }
      })
    })

    return this.daemonInitPromise
  }

  private async ensureDaemonReady() {
    if (!this.isDaemonReady || !this.activeProcess) {
      await this.initDaemon()
    }
  }

  private deviceResolvers: ((devices: DeviceInfo[]) => void)[] = []

  private warmConfiguredDevice() {
    const scannerName = configManager.getConfig().scanner
    const device = this.deviceCache.find(d => d.name === scannerName)
    const recentlyWarmed = device?.id === this.warmedDeviceId && Date.now() - this.deviceWarmedAt < this.deviceWarmTtlMs
    if (!device || recentlyWarmed || device.id === this.warmingDeviceId) return

    this.warmingDeviceId = device.id
    const cmd = JSON.stringify({ command: 'warm_device', deviceId: device.id }) + '\n'
    logger.info(`[ScannerService] warming device ${device.id}`)
    this.activeProcess!.stdin?.write(cmd, (error) => {
      if (error) {
        this.warmingDeviceId = ''
        logger.error(`[ScannerService] warm-up command failed: ${error.message}`)
      }
    })
  }

  async listDevices(): Promise<DeviceInfo[]> {
    await this.ensureDaemonReady()
    return new Promise((resolve) => {
      this.deviceResolvers.push(resolve)
      logger.info(`[ScannerService] listDevices called. queue length: ${this.deviceResolvers.length}`)
      // 防止重复发送指令，如果已经有请求在排队，说明已经发过了（除非需要强制刷新）
      if (this.deviceResolvers.length === 1) {
        const cmd = JSON.stringify({ command: 'list_devices' }) + '\n'
        logger.info(`[ScannerService] sending to daemon: ${cmd.trim()}`)
        this.activeProcess!.stdin?.write(cmd, (error) => {
          if (error) logger.error(`[ScannerService] stdin write error: ${error.message}`)
        })
      }
    })
  }

  async startScan(options: ScanOptions): Promise<string> {
    const taskId = `task_${Date.now()}`
    const status: ScanStatus = {
      taskId,
      status: 'scanning',
      progress: 0,
      message: '准备发送指令...',
      files: []
    }
    
    // 清理旧任务，保持最新的 task 状态
    this.tasks.clear()
    this.tasks.set(taskId, status)

    logger.info(`开始扫描任务 ${taskId}`)

    // 我们不在这里 await，而是让它在后台执行，直接返回 taskId
    this.executeRealScan(taskId, options).catch(err => {
      this.updateTaskStatus(taskId, { status: 'error', message: err.message })
    })

    return taskId
  }

  private async executeRealScan(taskId: string, options: ScanOptions): Promise<any> {
    await this.ensureDaemonReady()

    const config = configManager.getConfig()
    const devices = this.deviceCache || []
    const targetDevice = devices.find(d => d.name === config.scanner)

    const parseBool = (val: any, defaultVal: boolean) => {
      if (val === undefined || val === null) return defaultVal;
      if (val === 'false' || val === '0') return false;
      if (val === 'true' || val === '1') return true;
      return !!val;
    }

    // 极速优化：使用缓存的 TWAIN 设备对象（包含底层 TW_IDENTITY），避免 NAPS2 内部重新枚举导致的 5-7 秒延迟
    const scanParams = {
      deviceId: targetDevice?.id || '',
      dpi: Number(options.dpi || config.dpi || 300),
      mode: options.mode || config.color,
      duplex: parseBool(options.duplex, !!config.duplex),
      rotate180: parseBool(options.rotate180, !!config.rotate180),
      autoDeskew: parseBool(options.autoDeskew, !!config.autoDeskew),
      saveDir: path.join(configManager.getDataDir(), 'images')
    }

    // 重置并发处理状态
    this.activeTaskId = taskId
    this.activeTaskParams = scanParams
    this.activeTaskImages = []
    this.activeTaskSavedFiles = []
    this.processQueue = []
    this.activeProcessCount = 0

    // 初始化任务状态，确保 files 数组为空
    this.updateTaskStatus(taskId, {
      status: 'scanning',
      progress: 0,
      message: '正在向硬件发送扫描指令...',
      files: []
    })

    const cmd = JSON.stringify({ 
      command: 'start_scan',
      params_data: scanParams 
    }) + '\n'
    
    logger.info(`向下发指令到守护进程管道...`)
    
    return new Promise((resolve, reject) => {
      ;(this as any)._scanResolve = resolve
      ;(this as any)._scanReject = reject
      this.activeProcess!.stdin?.write(cmd)
    })
  }

  private updateTaskStatus(taskId: string, update: Partial<ScanStatus>) {
    const current = this.tasks.get(taskId)
    if (current) {
      const newStatus = { ...current, ...update }
      this.tasks.set(taskId, newStatus)
      // 向渲染进程广播状态更新
      BrowserWindow.getAllWindows().forEach(win => {
        win.webContents.send('scan-task-update', newStatus)
      })
    }
  }

  private enqueueSharpProcess(rawPath: string, savePath: string, params: any, currentIndex: number): Promise<string> {
    return new Promise((resolve) => {
      const task = async () => {
        try {
          await this.processImageWithSharp(rawPath, savePath, params)
          this.activeTaskSavedFiles.push(savePath)
          const currentFiles = [...this.activeTaskSavedFiles] // 创建副本确保引用更新
          this.updateTaskStatus(this.activeTaskId, { 
            message: `已处理并保存第 ${currentIndex} 页...`,
            progress: Math.min(90, (currentFiles.length * 10)),
            files: currentFiles
          })
          resolve(savePath)
        } catch (err) {
          logger.error(`图像处理失败: ${err}`)
          if (fs.existsSync(rawPath)) {
            try { fs.renameSync(rawPath, savePath) } catch (e) {}
          }
          this.activeTaskSavedFiles.push(savePath)
          resolve(savePath)
        } finally {
          this.activeProcessCount--
          this.processNextSharpTask()
        }
      }

      this.processQueue.push(task)
      this.processNextSharpTask()
    })
  }

  private processNextSharpTask() {
    if (this.activeProcessCount < this.MAX_CONCURRENT_PROCESS && this.processQueue.length > 0) {
      const task = this.processQueue.shift()
      if (task) {
        this.activeProcessCount++
        task()
      }
    }
  }

  private async processImageWithSharp(rawPath: string, savePath: string, params: any): Promise<void> {
    const { mode, rotate180 } = params
    logger.info(`[sharp] 处理图片: mode=${mode}, rotate180=${rotate180}`)
    let pipeline = sharp(rawPath)

    if (mode === 'color') {
      // 模拟 Level(8%, 80%) 的色阶拉伸：加强文字黑度，背景变白
      // 映射 [0.08*255, 0.8*255] 到 [0, 255] -> multiplier 1.388, offset -28.3
      pipeline = pipeline.linear(1.388, -28.3)
      // 适度增加色彩饱和度
      pipeline = pipeline.modulate({ saturation: 1.2 })
    } else {
      // 灰度或黑白模式，增加对比度，黑白二值化
      pipeline = pipeline.grayscale().linear(1.7, -21)
    }

    if (rotate180) {
      pipeline = pipeline.rotate(180)
    }

    await pipeline.jpeg({ quality: 80 }).toFile(savePath)

    // 处理完后立刻删除原图 BMP
    if (fs.existsSync(rawPath)) {
      fs.unlinkSync(rawPath)
    }
  }

  getScanStatus(taskId: string): ScanStatus | undefined {
    return this.tasks.get(taskId)
  }

  async cancelScan(taskId: string): Promise<boolean> {
    const status = this.tasks.get(taskId)
    if (status) {
      status.status = 'cancelled'
      status.message = '正在终止扫描任务...'
      this.tasks.set(taskId, status)
      this.updateTaskStatus(taskId, status)

      // 优先发送优雅取消指令，释放 TWAIN 锁
      if (this.activeProcess) {
        logger.info(`向守护进程发送 cancel_scan 指令...`)
        const cmd = JSON.stringify({ command: 'cancel_scan' }) + '\n'
        this.activeProcess.stdin?.write(cmd)

        // 给予 C# 进程 3 秒时间优雅释放 TWAIN 资源并终止硬件进纸
        setTimeout(() => {
          if (this.activeProcess && !this.activeProcess.killed) {
            logger.info(`强制结束守护进程 PID: ${this.activeProcess.pid}`)
            try {
              this.activeProcess.kill('SIGKILL')
            } catch (e) {
              logger.error(`强杀进程失败: ${e}`)
            }
            this.activeProcess = null
            this.isDaemonReady = false
            
            // 杀掉后立即重启一个新的守护进程待命
            this.initDaemon()
          }
        }, 3000)
      }

      return true
    }
    return false
  }
}

export const scannerService = new ScannerService()
