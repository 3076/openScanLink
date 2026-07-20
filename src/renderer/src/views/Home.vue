<template>
  <div class="home-container">
    <el-row :gutter="20">
      <el-col :span="8">
          <el-card shadow="hover" class="status-card">
            <template #header>
              <div class="card-header">
                <span>扫描服务状态</span>
                <el-tag :type="deviceOnline ? 'success' : 'danger'">
                  {{ deviceOnline ? '已连接' : '未连接' }}
                </el-tag>
              </div>
            </template>
          <div class="device-info">
            <el-icon :size="40" :color="deviceOnline ? '#67C23A' : '#F56C6C'">
              <Monitor />
            </el-icon>
            <p>{{ store.config.scanner || '未选择设备' }}</p>
            <el-button type="primary" size="small" @click="store.fetchDevices">刷新设备</el-button>
          </div>
        </el-card>
      </el-col>
      
      <el-col :span="16">
        <el-card shadow="hover" class="task-card">
          <template #header>
            <div class="card-header">
              <span>当前任务进度</span>
            </div>
          </template>
          <div v-if="store.currentTask" class="task-content">
            <p>{{ store.currentTask.message }}</p>
            <el-progress
              :percentage="store.currentTask.progress"
              :status="store.currentTask.status === 'error' ? 'exception' : (store.currentTask.status === 'finished' ? 'success' : undefined)"
            />
            <div v-if="store.currentTask.status === 'finished'" class="file-list">
              <p class="file-list-title">生成文件 ({{ store.currentTask.files.length }}页)：</p>
              <ul class="file-items">
                <li v-for="file in store.currentTask.files" :key="file" :title="file">
                  <el-icon><Document /></el-icon> {{ file }}
                </li>
              </ul>
            </div>
          </div>
          <el-empty v-else description="暂无进行中的任务" :image-size="60" />
        </el-card>
      </el-col>
    </el-row>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useAppStore } from '../stores/app'
import { Monitor, Document } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'

const store = useAppStore()
const deviceOnline = computed(() => !!store.config.scanner && store.devices.some(d => d.name === store.config.scanner))

onMounted(() => {
  store.fetchConfig()
  store.fetchDevices()
  store.initTaskListener()
})
</script>

<style scoped>
.home-container {
  padding: 10px;
}
.status-card, .task-card {
  height: 300px;
}
:deep(.el-card__body) {
  overflow: auto;
  scrollbar-width: none; /* Firefox */
  -ms-overflow-style: none; /* IE 10+ */
}
:deep(.el-card__body::-webkit-scrollbar) {
  display: none; /* Chrome/Safari/Edge */
}
.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  width: 100%;
}
.device-info {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  padding-top: 10px;
}
.task-content {
  padding: 10px;
}
.file-list {
  margin-top: 15px;
}
.file-list-title {
  font-size: 13px;
  color: #333;
  margin-bottom: 8px;
  font-weight: bold;
}
.file-items {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.file-items li {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: #606266;
  background-color: #f4f4f5;
  padding: 6px 10px;
  border-radius: 4px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  border: 1px solid #e9e9eb;
}
.file-items li .el-icon {
  flex-shrink: 0;
}
.mt-20 {
  margin-top: 20px;
}
.quick-actions {
  display: flex;
  gap: 30px;
  justify-content: center;
  align-items: center;
  padding: 10px 0;
}
.action-btn {
  width: 180px;
  height: 50px;
  font-size: 16px;
  border-radius: 8px;
  letter-spacing: 2px;
}
.mr-2 {
  margin-right: 8px;
}
</style>
