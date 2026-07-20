import winston from 'winston'
import 'winston-daily-rotate-file'
import path from 'path'
import { configManager } from '../config'

const logDir = configManager.getLogDir()

const transport = new winston.transports.DailyRotateFile({
  filename: path.join(logDir, 'eduscan-%DATE%.log'),
  datePattern: 'YYYY-MM-DD',
  zippedArchive: true,
  maxSize: '20m',
  maxFiles: '14d',
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.printf((info) => `${info.timestamp} [${info.level.toUpperCase()}]: ${info.message}`)
  )
})

export const logger = winston.createLogger({
  transports: [
    transport,
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      )
    })
  ]
})

logger.info('日志系统初始化完成')
