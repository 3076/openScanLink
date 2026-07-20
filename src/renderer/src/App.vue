<template>
  <el-container class="layout-container">
    <el-aside width="200px">
      <div class="logo">
        <img src="@resources/icon.png" alt="logo" />
        <span>OpenScanLink</span>
      </div>
      <el-menu
        :default-active="route.path"
        router
        class="side-menu"
        background-color="#304156"
        text-color="#bfcbd9"
        active-text-color="#409EFF"
      >
        <el-menu-item index="/">
          <el-icon><Monitor /></el-icon>
          <span>控制台</span>
        </el-menu-item>
        <el-menu-item index="/settings">
          <el-icon><Setting /></el-icon>
          <span>扫描设置</span>
        </el-menu-item>
      </el-menu>
    </el-aside>
    
    <el-container>
      <el-header class="app-header">
        <div class="header-left">
          <el-breadcrumb separator="/">
            <el-breadcrumb-item>扫描助手</el-breadcrumb-item>
            <el-breadcrumb-item>{{ currentRouteName }}</el-breadcrumb-item>
          </el-breadcrumb>
        </div>
        <div class="header-right">
          <el-tag type="info" effect="plain">v{{ appVersion }}</el-tag>
        </div>
      </el-header>
      
      <el-main>
        <router-view v-slot="{ Component }">
          <transition name="fade" mode="out-in">
            <component :is="Component" />
          </transition>
        </router-view>
      </el-main>
    </el-container>
  </el-container>
</template>

<script setup lang="ts">
import { computed, ref, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { Monitor, Setting } from '@element-plus/icons-vue'

const route = useRoute()
const appVersion = ref('读取中...')

onMounted(async () => {
  if (window.api && window.api.getAppVersion) {
    appVersion.value = await window.api.getAppVersion()
  }
})

const currentRouteName = computed(() => {
  if (route.path === '/') return '控制台'
  if (route.path === '/settings') return '扫描设置'
  return ''
})
</script>

<style>
body {
  margin: 0;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial;
}
.layout-container {
  height: 100vh;
}
.el-aside {
  background-color: #304156;
  color: #fff;
}
.logo {
  height: 60px;
  display: flex;
  align-items: center;
  padding: 0 20px;
  background: #2b2f3a;
  gap: 10px;
}
.logo img {
  width: 30px;
  height: 30px;
}
.logo span {
  font-weight: bold;
  font-size: 16px;
}
.side-menu {
  border-right: none;
}
.side-menu .el-menu-item {
  height: 50px;
  line-height: 50px;
}
.side-menu .el-menu-item.is-active {
  background-color: #263445 !important;
}
.side-menu .el-menu-item.is-active::before {
  content: "";
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 4px;
  background-color: #409EFF;
}
.app-header {
  background: #fff;
  border-bottom: 1px solid #e6e6e6;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 20px;
}
.el-main {
  overflow: hidden; /* 完全禁止滚动 */
}
.fade-enter-active, .fade-leave-active {
  transition: opacity 0.2s ease;
}
.fade-enter-from, .fade-leave-to {
  opacity: 0;
}
</style>
