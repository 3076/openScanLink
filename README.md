# OpenScanLink (开源网页扫描桥接器)

OpenScanLink 是一款基于 Vue 3 + Electron + Node.js + C# (NAPS2/TWAIN) 架构的高性能、跨平台（Windows）本地扫描桥接工具。

> **设备兼容性说明**：理论上支持所有兼容 TWAIN 协议的扫描仪设备，目前已在**虹光 (Avision) AU362** 型号上进行了充分测试与生产环境验证。

它的核心目标是：**彻底打破浏览器的沙盒限制，让任何 Web 网页系统（如档案管理、在线阅卷、医疗系统）都能通过极简的 HTTP API，直接驱动本地的高速 TWAIN 扫描仪进行大批量、高速连续扫描。**

## 🚀 核心特性

- **极致连扫性能**：针对大批量试卷/档案连扫进行了深度优化，Node.js 侧集成 `sharp` (libvips) 进行 SIMD 并发图像处理，消除卡纸与内存溢出风险。
- **无缝 Web 对接**：提供跨域 CORS 支持的本地 RESTful API (`http://127.0.0.1:17890`)，网页只需发送几个简单的 Axios 请求即可驱动硬件。
- **完全突破沙盒**：内置代理服务器，网页可直接通过 API 流式预览或下载扫描生成的本地超高清图片，无需复杂的文件系统权限。
- **多进程防崩溃**：C# 硬件控制进程作为 Daemon 常驻后台，彻底解决老旧 32位 TWAIN 驱动导致的崩溃、死锁和冷启动延迟问题。
- **轻量化独立部署**：安装包仅约 300MB，支持静默卸载与自定义网络静默更新机制，完美适应企业级/教育级批量部署场景。

## 📦 技术栈架构

`网页前端` (HTTP) -> `Electron / Node.js` (本地服务 & 图像调色) -> `Stdio 管道` -> `C# 守护进程` (NAPS2 / TWAIN 硬件驱动) -> `物理扫描仪`

## 🧩 核心子项目与开发指南

### 1. 网页前端测试 Demo (`web/demo`)
该目录包含一个开箱即用的 Vue 3 网页端 Demo，用于演示第三方网页如何通过 Axios 与本地的 OpenScanLink 服务交互、发送扫描指令以及实时流式渲染图片。
**运行步骤**：
```bash
cd web/demo
npm install
npm run dev
```
*(注：运行前请确保外层的 OpenScanLink 桌面端主程序已启动，否则网页将无法连接到 `127.0.0.1:17890`)*

### 2. C# 硬件桥接服务 (`bridge`)
该目录包含了直接与 NAPS2/TWAIN 驱动交互的底层 C# 控制台程序。为消除驱动冷启动延迟并防止崩溃，它被设计为通过 `stdio` 管道与 Node.js 通信的常驻 Daemon 进程。
**重新编译步骤**：
若您修改了 `bridge/ScannerService` 下的 C# 源码，需要重新编译以生效：
```bash
cd bridge/ScannerService
# 推荐使用独立部署 (Self-Contained) 模式编译，确保客户机无需额外安装 .NET 运行时
dotnet publish -c Release -r win-x86 --self-contained true
```
*(注：编译后请确保生成的 `ScannerService.exe` 及其依赖的 `.dll` 文件覆盖到外层 `bridge` 目录下，以便 Electron 在执行 `npm run build:win` 打包时能正确将其作为 `extraResources` 引入)*

## 🛠️ 快速开始

### 1. 环境要求
- Node.js (推荐 v18+)
- .NET 8.0 SDK (用于编译 C# 硬件桥接服务)

### 2. 安装与启动
```bash
# 安装依赖
npm install

# 启动开发环境
npm run dev

# 编译 Windows 安装包 (NSIS)
npm run build:win
```

> **📦 打包产物说明**：执行 `npm run build:win` 后，生成的安装包（如 `OpenScanLink Setup 1.0.0.exe`）及免安装版目录将会输出到项目根目录的 `release/1.0.0/` 文件夹下。

## 📖 文档指南

项目中包含详细的对接与二次开发文档：

- **[网页端对接开发文档](./网页对接文档.md)**: 包含完整的 API 接口说明、前端 Axios 调用示例以及图片预览方案。
- **[版本更新对接文档](./版本更新对接文档.md)**: 介绍了如何通过自定义 JSON 和文件服务器实现无感知的自动更新。

## 📊 性能说明与进阶版本

- **当前开源版本**：在大批量扫描测试中，CPU 占用率大约在 **60%**，内存峰值约为 **1GB**。
- **进阶商业版本（.NET 重构）**：我们还提供了一个彻底使用原生 .NET 重构的高性能版本，将 CPU 占用稳定降低至 **40%-50%** 之间，内存占用严格控制在 **500MB** 以内。

> **💡 商业授权说明**：.NET 高性能重构版为付费版本。如果您对系统资源消耗有更严苛的要求，欢迎添加下方的个人微信联系我了解详情（添加时请备注：.NET版本咨询）。

## ☕ 支持与交流

如果您觉得 OpenScanLink 对您的项目有帮助，或者为您节省了开发时间，欢迎请作者喝杯咖啡 ☕️，您的支持是项目持续维护的动力！

<div align="center">
  <img src="assets/alipay.jpg" width="300" alt="支付宝赞助" />
  &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;
  <img src="assets/wechat.jpg" width="300" alt="微信赞助" />
</div>

如果你在对接或使用过程中遇到任何问题，欢迎添加我的个人微信进行交流（**添加时请备注：OpenScanLink**）：

<div align="center">
  <img src="assets/wechat_personal.jpg" width="300" alt="个人微信" />
</div>

## 📄 开源协议

本项目采用 [MIT License](LICENSE) 开源协议。您可以自由地将其用于商业系统集成。
