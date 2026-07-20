<template>
  <div class="settings-container">
    <el-form :model="form" label-width="120px">
      <el-divider content-position="left">扫描参数</el-divider>
      <el-form-item label="选择扫描仪">
        <el-select v-model="form.scanner" placeholder="请选择设备" style="width: 100%">
          <el-option
            v-for="item in store.devices"
            :key="item.id"
            :label="item.name"
            :value="item.name"
          />
        </el-select>
      </el-form-item>
      <el-form-item label="扫描分辨率">
        <el-radio-group v-model="form.dpi">
          <el-radio :label="200">200 DPI</el-radio>
          <el-radio :label="300">300 DPI</el-radio>
          <el-radio :label="600">600 DPI</el-radio>
        </el-radio-group>
      </el-form-item>
      <el-form-item label="色彩模式">
        <el-radio-group v-model="form.color">
          <el-radio label="color">彩色</el-radio>
          <el-radio label="gray">灰度</el-radio>
          <el-radio label="blackwhite">黑白</el-radio>
        </el-radio-group>
      </el-form-item>
      <el-form-item label="扫描面数">
        <el-radio-group v-model="form.duplex">
          <el-radio :label="false">单面扫描</el-radio>
          <el-radio :label="true">双面扫描</el-radio>
        </el-radio-group>
      </el-form-item>
      <el-form-item label="图像处理">
        <el-checkbox v-model="form.autoDeskew">自动纠偏 (摆正倾斜)</el-checkbox>
        <el-checkbox v-model="form.rotate180">翻转 180° (修正倒置)</el-checkbox>
      </el-form-item>

      <el-divider content-position="left">缓存管理</el-divider>
      <el-form-item label="本地图片缓存">
        <el-button type="info" plain @click="handleOpenCache">打开缓存文件夹</el-button>
        <el-button type="danger" plain @click="handleClearCache">清空缓存图片</el-button>
      </el-form-item>

      <el-divider content-position="left">系统设置</el-divider>
      <el-form-item label="开机自启动">
        <el-switch
          v-model="autostart"
          @change="handleAutostartChange"
          active-text="开启"
          inactive-text="关闭"
        />
      </el-form-item>

      <el-divider content-position="left">版本与更新</el-divider>
      <el-form-item label="系统更新">
        <div style="display: flex; flex-direction: column; gap: 10px; width: 100%;">
          <div>
            <el-button type="primary" plain @click="checkUpdate" :loading="updateState.checking">
              {{ updateState.downloaded ? '立即重启并安装' : '检查更新' }}
            </el-button>
            <span style="margin-left: 15px; color: #666; font-size: 13px;">{{ updateState.message }}</span>
          </div>
          <el-progress 
            v-if="updateState.downloading" 
            :percentage="updateState.progress" 
            :status="updateState.downloaded ? 'success' : ''"
          />
        </div>
      </el-form-item>

      <el-form-item>
        <el-button type="primary" :loading="loading" @click="handleSave">保存配置</el-button>
        <el-button @click="resetForm">重置</el-button>
      </el-form-item>
    </el-form>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, toRaw } from 'vue'
import { useAppStore } from '../stores/app'
import { ElMessage } from 'element-plus'

const store = useAppStore()
const form = ref({
  scanner: '',
  dpi: 300,
  color: 'blackwhite',
  duplex: true,
  rotate180: true,
  autoDeskew: true
})
const loading = ref(false)
const autostart = ref(false)

const updateState = ref({
  checking: false,
  downloading: false,
  downloaded: false,
  progress: 0,
  message: '当前版本：读取中...'
})

onMounted(async () => {
  await store.fetchConfig()
  // 使用 toRaw 确保是一个普通对象，避免响应式追踪导致的显示问题
  form.value = JSON.parse(JSON.stringify(store.config))

  // 获取当前版本
  if (window.api && window.api.getAppVersion) {
    const version = await window.api.getAppVersion()
    updateState.value.message = `当前版本：v${version}`
  }

  // 获取开机自启状态
  if (window.api && window.api.getAutostart) {
    autostart.value = await window.api.getAutostart()
  }

  // 监听更新消息
  if (window.api && window.api.onUpdaterMessage) {
    window.api.onUpdaterMessage((payload: any) => {
      const { event, data } = payload
      if (event === 'checking-for-update') {
        updateState.value.message = '正在检查更新...'
      } else if (event === 'update-available') {
        updateState.value.message = `发现新版本 v${data.version}，正在下载...`
        updateState.value.checking = false
        updateState.value.downloading = true
      } else if (event === 'update-not-available') {
        updateState.value.message = '当前已是最新版本'
        updateState.value.checking = false
      } else if (event === 'download-progress') {
        updateState.value.progress = Math.floor(data.percent || 0)
      } else if (event === 'update-downloaded') {
        updateState.value.message = '新版本下载完成，请安装'
        updateState.value.progress = 100
        updateState.value.downloading = true
        updateState.value.downloaded = true
      } else if (event === 'update-error') {
        updateState.value.message = '更新发生错误'
        updateState.value.checking = false
        updateState.value.downloading = false
      }
    })
  }
})

const checkUpdate = async () => {
  if (updateState.value.downloaded) {
    // 已经下载完成，点击直接安装
    if (window.api && window.api.installUpdate) {
      window.api.installUpdate()
    }
    return
  }

  if (!window.api || !window.api.checkUpdate) {
    ElMessage.error('自动更新 API 未就绪')
    return
  }
  updateState.value.checking = true
  updateState.value.message = '正在连接服务器...'
  try {
    await window.api.checkUpdate()
  } catch (error) {
    updateState.value.checking = false
    updateState.value.message = '检查更新失败'
  }
}

const handleSave = async () => {
  loading.value = true
  try {
    console.log('正在保存配置:', toRaw(form.value))
    await store.saveConfig(toRaw(form.value))
    ElMessage({
      message: '配置已保存成功',
      type: 'success',
      duration: 2000
    })
  } catch (error) {
    console.error('保存失败:', error)
    ElMessage.error('保存失败，请检查控制台日志')
  } finally {
    loading.value = false
  }
}

const resetForm = () => {
  form.value = { ...store.config }
}

const handleAutostartChange = async (val: boolean) => {
  if (window.api && window.api.setAutostart) {
    try {
      const result = await window.api.setAutostart(val)
      autostart.value = result
      if (result) {
        ElMessage.success('已开启开机自启动')
      } else {
        ElMessage.success('已关闭开机自启动')
      }
    } catch (error) {
      ElMessage.error('设置开机自启动失败')
      autostart.value = !val
    }
  } else {
    ElMessage.warning('当前环境不支持设置开机自启动')
    autostart.value = !val
  }
}

const handleOpenCache = async () => {
  try {
    if (!window.api || !window.api.openCacheFolder) {
      throw new Error('Electron API 未就绪，请重启应用');
    }
    const res = await window.api.openCacheFolder()
    if (!res.success) {
      throw new Error(res.message || '未知错误');
    }
  } catch (error: any) {
    ElMessage.error('打开文件夹失败: ' + (error.message || error))
  }
}

const handleClearCache = async () => {
  try {
    if (!window.api || !window.api.clearCache) {
      throw new Error('Electron API 未就绪，请重启应用');
    }
    const res = await window.api.clearCache()
    if (res.success) {
      ElMessage.success('缓存已清空')
    } else {
      ElMessage.error(res.message || '清空缓存失败')
    }
  } catch (error: any) {
    ElMessage.error('清空缓存失败: ' + (error.message || error))
  }
}
</script>

<style scoped>
.settings-container {
  padding: 20px;
  padding-bottom: 40px; /* 增加底部间距 */
  background: #fff;
  border-radius: 8px;
  height: calc(100vh - 100px); /* 减去头部高度，适配窗口 */
  box-sizing: border-box;
  overflow-y: auto;
}

/* 优化滚动条样式 */
.settings-container::-webkit-scrollbar {
  width: 6px;
}
.settings-container::-webkit-scrollbar-thumb {
  background-color: #dcdfe6;
  border-radius: 4px;
}
.settings-container::-webkit-scrollbar-track {
  background: transparent;
}

/* 调整分割线间距 */
:deep(.el-divider--horizontal) {
  margin: 16px 0;
}
:deep(.el-form > .el-divider--horizontal:first-child) {
  margin-top: 0;
}
</style>
