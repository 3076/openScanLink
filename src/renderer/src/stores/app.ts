import { defineStore } from 'pinia'
import { AppConfig, DeviceInfo, ScanStatus } from '../../../common/types'

export const useAppStore = defineStore('app', {
  state: () => ({
    config: {
      scanner: '',
      dpi: 200,
      color: 'gray',
      rotate180: true,
      duplex: true,
      autoDeskew: false
    } as AppConfig,
    devices: [] as DeviceInfo[],
    currentTask: null as ScanStatus | null,
    logs: [] as string[]
  }),
  actions: {
    async fetchConfig() {
      this.config = await window.electron.ipcRenderer.invoke('get-config')
    },
    async saveConfig(newConfig: Partial<AppConfig>) {
      await window.electron.ipcRenderer.invoke('save-config', newConfig)
      await this.fetchConfig()
    },
    async fetchDevices() {
      this.devices = await window.electron.ipcRenderer.invoke('list-devices')
    },
    async startScan(options: any) {
      const config = this.config
      // 重置当前任务状态
      this.currentTask = {
        taskId: '',
        status: 'waiting',
        progress: 0,
        message: '准备启动扫描...',
        files: []
      }
      
      try {
        const taskId = await window.electron.ipcRenderer.invoke('start-scan', {   
          ...options,
          duplex: config.duplex, // 显式传递双面设置
          autoDeskew: config.autoDeskew,
          rotate180: config.rotate180
        })
        if (taskId) {
          this.pollStatus(taskId)
        } else {
          this.currentTask.status = 'error'
          this.currentTask.message = '未能获取任务ID'
        }
      } catch (e: any) {
        this.currentTask.status = 'error'
        this.currentTask.message = '启动扫描失败: ' + e.message
      }
    },
    async pollStatus(taskId: string) {
      const timer = setInterval(async () => {
        const status = await window.electron.ipcRenderer.invoke('get-scan-status', taskId)
        this.currentTask = status
        if (status.status === 'finished' || status.status === 'error' || status.status === 'cancelled') {
          clearInterval(timer)
        }
      }, 1000)
    },
    initTaskListener() {
      // @ts-ignore
      if (window.api && window.api.onTaskUpdate) {
        // @ts-ignore
        window.api.onTaskUpdate((task) => {
          this.currentTask = task
        })
      }
    }
  }
})
