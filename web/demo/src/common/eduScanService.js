const API_BASE = 'http://127.0.0.1:17890';
const TOKEN = '11111';

export class EduScanService {
    static async request(endpoint, options = {}) {
        const url = `${API_BASE}${endpoint}`;
        const headers = {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${TOKEN}`,
            ...options.headers
        };

        const response = await fetch(url, { ...options, headers });
        return response.json();
    }

    static async getDevices() {
        return this.request('/api/device/list');
    }

    static async startScan(params) {
        return this.request('/api/scan/start', {
            method: 'POST',
            body: JSON.stringify(params)
        });
    }

    static async cancelScan(taskId) {
        return this.request(`/api/scan/cancel/${taskId}`, {
            method: 'POST'
        });
    }

    static async getStatus(taskId) {
        return this.request(`/api/scan/status/${taskId}`);
    }

    static async getResult(taskId) {
        return this.request(`/api/scan/result/${taskId}`);
    }

    static getFileUrl(filePath) {
        return `${API_BASE}/api/file/view?path=${encodeURIComponent(filePath)}&token=${TOKEN}`;
    }
}
