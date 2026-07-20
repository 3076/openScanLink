<template>
  <div style="padding: 20px;">
    <el-card shadow="never">
      <template #header>
        <div class="card-header">
          <span>扫描仪中间件测试 (eduScanLink) - Vue 3</span>
        </div>
      </template>
      
      <div style="margin-bottom: 20px;">
        <el-alert
          title="测试前请确保桌面中间件已启动"
          type="info"
          show-icon
          :closable="false"
          style="margin-bottom: 20px;">
        </el-alert>

        <el-button type="primary" @click="fetchDevices" :icon="Refresh">1. 检测连接 & 获取设备</el-button>
        
        <div v-if="devices.length" style="margin-top: 15px;">
          <el-table :data="devices" border size="small" style="width: 100%">
            <el-table-column prop="id" label="设备ID" width="220"></el-table-column>
            <el-table-column prop="name" label="设备名称"></el-table-column>
            <el-table-column prop="provider" label="驱动类型" width="100"></el-table-column>
          </el-table>
        </div>
      </div>

      <el-divider></el-divider>

      <div style="margin-bottom: 20px;">
        <el-form inline size="default">
          <el-form-item label="DPI">
            <el-select v-model="scanParams.dpi" style="width: 100px;">
              <el-option label="200" :value="200"></el-option>
              <el-option label="300" :value="300"></el-option>
            </el-select>
          </el-form-item>
          <el-form-item label="模式">
            <el-select v-model="scanParams.mode" style="width: 100px;">
              <el-option label="彩色" value="color"></el-option>
              <el-option label="灰度" value="gray"></el-option>
              <el-option label="黑白" value="bw"></el-option>
            </el-select>
          </el-form-item>
          <el-form-item>
            <el-checkbox v-model="scanParams.autoDeskew">自动纠偏</el-checkbox>
            <el-checkbox v-model="scanParams.duplex">双面扫描</el-checkbox>
            <el-checkbox v-model="scanParams.rotate180">翻转 180°</el-checkbox>
          </el-form-item>
          <el-form-item>
            <el-button 
              type="success" 
              :disabled="!devices.length || isScanning" 
              @click="doScan"
              :icon="VideoPlay"
            >
              2. 开始扫描测试
            </el-button>
            <el-button 
              v-if="isScanning"
              type="danger" 
              @click="cancelScan"
              :icon="Close"
              style="margin-left: 10px;"
            >
              终止采集
            </el-button>
          </el-form-item>
        </el-form>
      </div>

      <div v-if="statusInfo" style="margin-top: 20px; padding: 15px; background: #f5f7fa; border-radius: 4px; border: 1px solid #ebeef5;">
        <div style="margin-bottom: 10px; display: flex; justify-content: space-between; align-items: center;">
          <span>任务状态: <el-tag :type="statusTagType">{{ statusInfo.status }}</el-tag></span>
          <span v-if="isScanning" class="is-loading"><el-icon><Loading /></el-icon></span>
        </div>
        <el-progress :percentage="statusInfo.progress" :status="progressStatus"></el-progress>
        <p style="margin-top: 10px; color: #606266; font-size: 14px;">提示: {{ statusInfo.message }}</p>
      </div>

      <div v-if="results.length" style="margin-top: 20px;">
        <p>扫描结果预览:</p>
        <div class="image-gallery">
          <div v-for="(path, index) in results" :key="index" class="image-preview-item">
            <el-image 
              style="width: 150px; height: 200px; border: 1px solid #dcdfe6; border-radius: 4px;"
              :src="getImageUrl(path)" 
              :preview-src-list="allImageUrls"
              :initial-index="index"
              fit="contain"
            >
              <template #error>
                <div class="image-slot">
                  <el-icon><Picture /></el-icon>
                  <p style="font-size: 12px;">加载失败</p>
                </div>
              </template>
            </el-image>
            <div class="image-info">
              <span class="file-name">{{ getFileName(path) }}</span>
            </div>
          </div>
        </div>

        <el-divider content-position="left">原始路径信息</el-divider>
        <div style="background: #2d2d2d; color: #a9b7c6; padding: 15px; border-radius: 4px; font-family: monospace; white-space: pre-wrap; word-break: break-all; font-size: 12px;">
          {{ JSON.stringify(results, null, 2) }}
        </div>
      </div>
    </el-card>
  </div>
</template>

<script setup>
import { ref, computed, onBeforeUnmount } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { Refresh, VideoPlay, Picture, Loading, Close } from '@element-plus/icons-vue';
import { EduScanService } from './common/eduScanService';

const devices = ref([]);
const isScanning = ref(false);
const currentTaskId = ref(null);
const statusInfo = ref(null);
const results = ref([]);
const timer = ref(null);
const scanParams = ref({
  dpi: 200,
  mode: 'color',
  duplex: true,
  rotate180: true,
  autoDeskew: false
});

const allImageUrls = computed(() => {
  return results.value.map(path => EduScanService.getFileUrl(path));
});

const statusTagType = computed(() => {
  if (!statusInfo.value) return 'info';
  switch (statusInfo.value.status) {
    case 'scanning': return '';
    case 'finished': return 'success';
    case 'error': return 'danger';
    default: return 'info';
  }
});

const progressStatus = computed(() => {
  if (!statusInfo.value) return '';
  if (statusInfo.value.status === 'finished') return 'success';
  if (statusInfo.value.status === 'error') return 'exception';
  return '';
});

const fetchDevices = async () => {
  try {
    const res = await EduScanService.getDevices();
    if (res.success) {
      devices.value = res.data;
      ElMessage.success('已连接扫描助手');
    } else {
      ElMessage.warning('连接成功但未发现扫描仪');
    }
  } catch (err) {
    ElMessage.error('无法连接到扫描助手，请检查程序是否启动且端口正确');
  }
};

const doScan = async () => {
  isScanning.value = true;
  results.value = [];
  statusInfo.value = { status: 'starting', progress: 0, message: '正在初始化任务...' };
  
  try {
    const startRes = await EduScanService.startScan(scanParams.value);
    if (startRes.success) {
      currentTaskId.value = startRes.taskId;
      startPolling(startRes.taskId);
    } else {
      throw new Error(startRes.message || '任务启动失败');
    }
  } catch (err) {
    ElMessage.error(err.message || '启动扫描失败');
    isScanning.value = false;
    statusInfo.value = { status: 'error', progress: 0, message: err.message };
  }
};

const cancelScan = async () => {
  if (!currentTaskId.value) return;
  
  try {
    await ElMessageBox.confirm(
      '确定要强行终止正在进行的扫描任务吗？这将会使扫描仪立即停止进纸。',
      '终止扫描',
      {
        confirmButtonText: '强制终止',
        cancelButtonText: '继续扫描',
        type: 'warning',
      }
    );
    
    statusInfo.value = { status: 'error', progress: statusInfo.value.progress, message: '正在强制终止...' };
    const res = await EduScanService.cancelScan(currentTaskId.value);
    
    if (res.success) {
      stopPolling();
      statusInfo.value = { status: 'error', progress: statusInfo.value.progress, message: '已强行终止扫描' };
      ElMessage.success('扫描已终止');
    } else {
      ElMessage.error('终止失败: ' + res.message);
    }
  } catch (err) {
    // 用户取消了对话框
  }
};

const startPolling = (taskId) => {
  timer.value = setInterval(async () => {
    try {
      const statusRes = await EduScanService.getStatus(taskId);
      statusInfo.value = statusRes;
      
      // 实时更新已处理的图片
      if (statusRes.files && statusRes.files.length > 0) {
        results.value = statusRes.files;
      }

      if (statusRes.status === 'finished') {
        stopPolling();
        // 最终完成时再次确保结果是最新的
        if (statusRes.files) {
          results.value = statusRes.files;
        } else {
          fetchResults(taskId);
        }
      } else if (statusRes.status === 'error') {
        stopPolling();
        ElMessage.error('扫描出错: ' + statusRes.message);
      }
    } catch (err) {
      stopPolling();
      ElMessage.error('状态轮询失败');
    }
  }, 1000);
};

const stopPolling = () => {
  if (timer.value) {
    clearInterval(timer.value);
    timer.value = null;
  }
  isScanning.value = false;
};

const fetchResults = async (taskId) => {
  try {
    const res = await EduScanService.getResult(taskId);
    if (res.success) {
      results.value = res.files;
      ElMessage.success('扫描完成');
    }
  } catch (err) {
    ElMessage.error('获取扫描结果失败');
  }
};

const getImageUrl = (path) => {
  return EduScanService.getFileUrl(path);
};

const getFileName = (path) => {
  if (!path) return '';
  return path.split('\\').pop().split('/').pop();
};

onBeforeUnmount(() => {
  stopPolling();
});
</script>

<style scoped>
.el-progress {
  margin: 10px 0;
}
.image-gallery {
  display: flex;
  flex-wrap: wrap;
  gap: 15px;
  margin-top: 10px;
}
.image-preview-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 150px;
}
.image-info {
  margin-top: 5px;
  width: 100%;
  text-align: center;
}
.file-name {
  font-size: 12px;
  color: #909399;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  display: block;
}
.image-slot {
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  width: 100%;
  height: 100%;
  background: #f5f7fa;
  color: #909399;
}
.image-slot .el-icon {
  font-size: 30px;
  margin-bottom: 10px;
}
.is-loading {
  animation: rotating 2s linear infinite;
}
@keyframes rotating {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}
</style>
