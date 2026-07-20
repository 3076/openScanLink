using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using Newtonsoft.Json;
using ImageMagick;
using NAPS2.Images;
using NAPS2.Scan;
using NAPS2.Images.ImageSharp;

namespace ScannerService
{
    class Program
    {
        static List<ScanDevice> _cachedDevices = new List<ScanDevice>();

        static async Task Main(string[] args)
        {
            Console.OutputEncoding = Encoding.UTF8;
            
            // 限制 ImageMagick 内部多线程，防止与外部并行任务冲突导致 CPU 满载
            ImageMagick.OpenCL.IsEnabled = false;
            ImageMagick.ResourceLimits.Thread = 1;

            if (args.Length > 0 && args[0] == "--daemon")
            {
                await RunDaemonMode();
                return;
            }

            if (args.Length == 0) {
                await ListDevices(null);
                return;
            }

            try {
                string input = args[0].Trim();
                string jsonParams = File.Exists(input) ? File.ReadAllText(input, Encoding.UTF8) : input;
                var options = JsonConvert.DeserializeObject<dynamic>(jsonParams);
                if (options == null) throw new Exception("无法解析参数内容");
                
                using var scanningContext = new ScanningContext(new ImageSharpImageContext());
                scanningContext.SetUpWin32Worker(); // 恢复 Worker，保证稳定性
                var controller = new ScanController(scanningContext);
                
                await StartHighSpeedScan(options, controller, CancellationToken.None);
            }
            catch (Exception ex) {
                Console.WriteLine(JsonConvert.SerializeObject(new { 
                    status = "error", 
                    message = "核心调度错误: " + ex.Message 
                }));
            }
        }

        static CancellationTokenSource _scanCts = new CancellationTokenSource();

        static async Task RunDaemonMode()
        {
            try {
                Console.WriteLine(JsonConvert.SerializeObject(new { status = "info", message = "守护进程正在初始化底层驱动..." }));
                
                using var scanningContext = new ScanningContext(new ImageSharpImageContext());
                scanningContext.SetUpWin32Worker(); // 恢复跨进程 worker
                var controller = new ScanController(scanningContext);

                Console.WriteLine(JsonConvert.SerializeObject(new { status = "ready", message = "守护进程已就绪，等待指令" }));

                while (true)
                {
                    string input = Console.ReadLine();
                    if (string.IsNullOrEmpty(input)) continue;

                    if (input.Trim() == "exit" || input.Trim() == "quit")
                        break;

                    try {
                        var options = JsonConvert.DeserializeObject<dynamic>(input);
                        string command = options?.command?.ToString() ?? "";

                        if (command == "list_devices") {
                            await ListDevices(controller);
                        }
                        else if (command == "warm_device") {
                            await WarmDevice(options?.deviceId?.ToString(), controller);
                        }
                        else if (command == "start_scan") {
                            _scanCts = new CancellationTokenSource();
                            // 不阻塞主消息循环，让扫描在后台运行
                            _ = Task.Run(() => StartHighSpeedScan(options.params_data, controller, _scanCts.Token));
                        }
                        else if (command == "cancel_scan") {
                            _scanCts.Cancel();
                            Console.WriteLine(JsonConvert.SerializeObject(new { status = "info", message = "已发送取消指令到扫描控制器" }));
                        }
                        else {
                            Console.WriteLine(JsonConvert.SerializeObject(new { status = "error", message = "未知的指令: " + command }));
                        }
                    }
                    catch (Exception ex) {
                        Console.WriteLine(JsonConvert.SerializeObject(new { status = "error", message = "指令执行异常: " + ex.Message }));
                    }
                    
                    Console.WriteLine(JsonConvert.SerializeObject(new { status = "ready", message = "守护进程空闲，等待指令" }));
                }
            }
            catch (Exception ex) {
                Console.WriteLine(JsonConvert.SerializeObject(new { status = "error", message = "守护进程崩溃: " + ex.Message }));
            }
        }

        static async Task ListDevices(ScanController existingController)
        {
            try {
                var controller = existingController;
                ScanningContext tempContext = null;
                
                if (controller == null) {
                    tempContext = new ScanningContext(new ImageSharpImageContext());
                    tempContext.SetUpWin32Worker(); // 恢复跨进程 worker
                    controller = new ScanController(tempContext);
                }

                var devices = new List<object>();
                _cachedDevices = await controller.GetDeviceList(Driver.Twain);
                
                foreach (var d in _cachedDevices) {
                    devices.Add(new { 
                        id = d.ID, 
                        name = d.Name, 
                        provider = "TWAIN",
                        naps2Id = d.ID
                    });
                }

                Console.WriteLine(JsonConvert.SerializeObject(new { success = true, data = devices, type = "device_list" }));
                
                if (tempContext != null) {
                    tempContext.Dispose();
                }
            } catch (Exception ex) {
                Console.WriteLine(JsonConvert.SerializeObject(new { success = false, message = ex.Message, type = "device_list" }));
            }
        }

        static async Task WarmDevice(string deviceId, ScanController controller)
        {
            var stopwatch = Stopwatch.StartNew();
            try {
                var targetDevice = _cachedDevices.FirstOrDefault(d => d.ID == deviceId);
                if (targetDevice == null) {
                    _cachedDevices = await controller.GetDeviceList(Driver.Twain);
                    targetDevice = _cachedDevices.FirstOrDefault(d => d.ID == deviceId);
                }
                if (targetDevice == null) throw new Exception("未找到需要预热的扫描仪");

                await controller.GetCaps(targetDevice);
                Console.WriteLine(JsonConvert.SerializeObject(new {
                    type = "device_warmed",
                    success = true,
                    deviceId,
                    elapsedMs = stopwatch.ElapsedMilliseconds
                }));
            } catch (Exception ex) {
                Console.WriteLine(JsonConvert.SerializeObject(new {
                    type = "device_warmed",
                    success = false,
                    deviceId,
                    elapsedMs = stopwatch.ElapsedMilliseconds,
                    message = ex.Message
                }));
            }
        }

        static async Task StartHighSpeedScan(dynamic options, ScanController existingController, CancellationToken cancelToken = default)
        {
            ScanController controller = existingController;
            ScanningContext tempContext = null;
            
            try {
                if (controller == null) {
                    tempContext = new ScanningContext(new ImageSharpImageContext());
                    tempContext.SetUpWin32Worker(); // 恢复跨进程 worker
                    controller = new ScanController(tempContext);
                }

                string deviceId = options.deviceId?.ToString();
                if (string.IsNullOrEmpty(deviceId)) throw new Exception("未选择有效的扫描仪设备");

                int dpi = (int?)options.dpi ?? 300;
                string modeStr = (string)options.mode ?? "gray";
                bool duplex = (bool?)options.duplex ?? false;
                bool rotate180 = (bool?)options.rotate180 ?? false;
                bool autoDeskew = (bool?)options.autoDeskew ?? false;
                
                string saveDir = options.saveDir?.ToString() ?? @"C:\Users\Public\EduScan\data\images";
                if (!Directory.Exists(saveDir)) {
                    Directory.CreateDirectory(saveDir);
                }

                // 极速优化：使用缓存的 TWAIN 设备对象（包含底层 TW_IDENTITY），避免 NAPS2 内部重新枚举导致的 5-7 秒延迟
                var targetDevice = _cachedDevices.FirstOrDefault(d => d.ID == deviceId);
                if (targetDevice == null) {
                    Console.WriteLine(JsonConvert.SerializeObject(new { status = "info", message = "正在极速预热驱动..." }));
                    _cachedDevices = await controller.GetDeviceList(Driver.Twain);
                    targetDevice = _cachedDevices.FirstOrDefault(d => d.ID == deviceId) 
                                   ?? new ScanDevice(Driver.Twain, deviceId, deviceId);
                }

                var scanOptions = new ScanOptions
                {
                    Device = targetDevice,
                    PaperSource = duplex ? PaperSource.Duplex : PaperSource.Feeder,
                    PageSize = PageSize.A4,
                    Dpi = dpi,
                    BitDepth = modeStr == "color" ? BitDepth.Color : (modeStr == "gray" ? BitDepth.Grayscale : BitDepth.BlackAndWhite),
                    BrightnessContrastAfterScan = true,
                    AutoDeskew = autoDeskew, 
                    RotateDegrees = 0 // 禁用 NAPS2 的软件旋转，由 Node.js 处理
                };

                var startupStopwatch = Stopwatch.StartNew();
                var firstPageStarted = false;
                EventHandler<PageStartEventArgs> pageStartHandler = (_, _) => {
                    if (firstPageStarted) return;
                    firstPageStarted = true;
                    Console.WriteLine(JsonConvert.SerializeObject(new {
                        status = "scanning",
                        progress = 10,
                        message = "扫描仪已启动，开始进纸...",
                        startupMs = startupStopwatch.ElapsedMilliseconds
                    }));
                };
                controller.PageStart += pageStartHandler;

                Console.WriteLine(JsonConvert.SerializeObject(new { status = "scanning", progress = 5, message = "正在打开扫描仪..." }));

                int i = 1;
                try {
                    await foreach (var image in controller.Scan(scanOptions, cancelToken))
                    {
                        int currentIndex = i++;
                        // 极致提速：仅做进纸和保存 JPG 操作（Sharp 原生不支持读取 NAPS2 导出的 BMP）
                        string rawPath = Path.Combine(saveDir, $"raw_{DateTime.Now:yyyyMMdd_HHmmss_fff}_{currentIndex}.jpg");

                        image.Save(rawPath);
                        image.Dispose();

                        // 通知 Node.js 接收原图并开启并发处理
                        Console.WriteLine(JsonConvert.SerializeObject(new {
                            status = "image_scanned",
                            rawPath = rawPath,
                            currentIndex = currentIndex,
                            firstImageMs = currentIndex == 1 ? startupStopwatch.ElapsedMilliseconds : (long?)null
                        }));
                    }
                } finally {
                    controller.PageStart -= pageStartHandler;
                }

                Console.WriteLine(JsonConvert.SerializeObject(new { 
                    status = "hardware_finished", 
                    message = "扫描仪物理进纸结束，等待图像处理..." 
                }));
            } catch (Exception ex) {
                Console.WriteLine(JsonConvert.SerializeObject(new { status = "error", message = ex.Message }));
            } finally {
                // 强制清理上下文，解决 TWAIN 状态死锁
                if (tempContext != null) {
                    tempContext.Dispose();
                }
            }
        }
    }
}
