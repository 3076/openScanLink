import fs from 'fs'
import path from 'path'
import { AppConfig } from '../../common/types'

const CONFIG_DIR = 'C:\\Users\\Public\\EduScan'
const CONFIG_PATH = path.join(CONFIG_DIR, 'config.json')

const DEFAULT_CONFIG: AppConfig = {
  scanner: '',
  dpi: 200,
  color: 'gray',
  rotate180: true,
  duplex: true,
  autostart: true,
  autoDeskew: false
}

export class ConfigManager {
  private config: AppConfig

  constructor() {
    this.config = this.loadConfig()
  }

  private loadConfig(): AppConfig {
    try {
      if (!fs.existsSync(CONFIG_DIR)) {
        fs.mkdirSync(CONFIG_DIR, { recursive: true })
      }

      if (fs.existsSync(CONFIG_PATH)) {
        const data = fs.readFileSync(CONFIG_PATH, 'utf-8')
        return { ...DEFAULT_CONFIG, ...JSON.parse(data) }
      }
    } catch (error) {
      console.error('加载配置文件失败:', error)
    }

    this.saveConfig(DEFAULT_CONFIG)
    return DEFAULT_CONFIG
  }

  public getConfig(): AppConfig {
    return this.config
  }

  public saveConfig(newConfig: Partial<AppConfig>): void {
    this.config = { ...this.config, ...newConfig }
    try {
      if (!fs.existsSync(CONFIG_DIR)) {
        fs.mkdirSync(CONFIG_DIR, { recursive: true })
      }
      fs.writeFileSync(CONFIG_PATH, JSON.stringify(this.config, null, 2), 'utf-8')
      console.log('配置文件已写入:', CONFIG_PATH)
    } catch (error) {
      console.error('保存配置文件失败:', error)
    }
  }

  public getDataDir(): string {
    return path.join(CONFIG_DIR, 'data')
  }

  public getLogDir(): string {
    return path.join(CONFIG_DIR, 'logs')
  }
}

export const configManager = new ConfigManager()
