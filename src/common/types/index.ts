export interface AppConfig {
  scanner: string;
  dpi: number;
  color: 'color' | 'gray' | 'blackwhite';
  rotate180?: boolean;
  duplex?: boolean;
  autostart?: boolean;
  autoDeskew?: boolean;
}

export interface ScanOptions {
  dpi: number;
  mode: 'color' | 'gray' | 'blackwhite';
  duplex: boolean;
  format: 'jpg' | 'pdf';
  savePath?: string;
  rotate180?: boolean;
  autoDeskew?: boolean;
}

export interface DeviceInfo {
  id: string;
  name: string;
  provider: 'TWAIN' | 'WIA';
}

export interface ScanStatus {
  taskId: string;
  status: 'waiting' | 'scanning' | 'finished' | 'error' | 'cancelled';
  progress: number;
  message: string;
  files: string[];
}

export interface IScanner {
  listDevices(): Promise<DeviceInfo[]>;
  startScan(options: ScanOptions): Promise<string>; // 返回 taskId
  getScanStatus(taskId: string): ScanStatus | undefined;
  cancelScan(taskId: string): Promise<boolean>;
}
