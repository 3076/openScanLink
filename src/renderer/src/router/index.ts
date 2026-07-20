import { createRouter, createWebHashHistory } from 'vue-router'
import Home from '../views/Home.vue'
import Settings from '../views/Settings.vue'

const routes = [
  { path: '/', component: Home },
  { path: '/settings', component: Settings }
]

export const router = createRouter({
  history: createWebHashHistory(),
  routes
})
