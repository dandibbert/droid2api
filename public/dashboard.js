class Dashboard {
    constructor() {
        this.authToken = sessionStorage.getItem('dashboardAuth');
        this.autoRefresh = true;
        this.refreshInterval = null;
        
        this.init();
    }

    init() {
        this.bindEvents();
        this.showAuthModal();
    }

    bindEvents() {
        // 认证相关
        document.getElementById('authLogin').addEventListener('click', () => this.authenticate());
        document.getElementById('authTokenInput').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.authenticate();
        });
        document.getElementById('logout').addEventListener('click', () => this.logout());

        // 标签切换
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', () => this.switchTab(btn.dataset.tab));
        });

        // 控制按钮
        document.getElementById('refreshToggle').addEventListener('click', () => this.toggleAutoRefresh());
        document.getElementById('clearLogs').addEventListener('click', () => this.clearLogs());

        // Token管理
        document.getElementById('saveFactoryKey').addEventListener('click', () => this.saveFactoryApiKey());
        document.getElementById('testFactoryKey').addEventListener('click', () => this.testFactoryApiKey());
        document.getElementById('saveRefreshToken').addEventListener('click', () => this.saveRefreshToken());
        document.getElementById('testRefreshToken').addEventListener('click', () => this.testRefreshToken());
        document.getElementById('reloadTokens').addEventListener('click', () => this.reloadTokens());
        document.getElementById('clearTokens').addEventListener('click', () => this.clearTokens());
    }

    showAuthModal() {
        if (!this.authToken) {
            document.getElementById('authModal').classList.remove('hidden');
        } else {
            document.getElementById('authModal').classList.add('hidden');
            this.startDashboard();
        }
    }

    async authenticate() {
        const token = document.getElementById('authTokenInput').value;
        const errorEl = document.getElementById('authError');
        
        if (!token) {
            errorEl.textContent = '请输入AUTH_TOKEN';
            return;
        }

        try {
            const response = await fetch('/dashboard/api/auth', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ token })
            });

            const result = await response.json();
            
            if (response.ok) {
                this.authToken = token;
                sessionStorage.setItem('dashboardAuth', token);
                document.getElementById('authModal').classList.add('hidden');
                errorEl.textContent = '';
                this.startDashboard();
            } else {
                errorEl.textContent = result.error || '认证失败';
            }
        } catch (error) {
            errorEl.textContent = '网络错误，请重试';
        }
    }

    logout() {
        this.authToken = null;
        sessionStorage.removeItem('dashboardAuth');
        if (this.refreshInterval) {
            clearInterval(this.refreshInterval);
        }
        this.showAuthModal();
    }

    startDashboard() {
        this.loadLogs();
        this.loadTokenStatus();
        this.setupAutoRefresh();
    }

    switchTab(tabName) {
        // 更新按钮状态
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.tab === tabName);
        });

        // 更新面板显示
        document.querySelectorAll('.tab-panel').forEach(panel => {
            panel.classList.toggle('active', panel.id === `${tabName}-tab`);
        });
    }

    toggleAutoRefresh() {
        const btn = document.getElementById('refreshToggle');
        this.autoRefresh = !this.autoRefresh;
        
        btn.classList.toggle('active', this.autoRefresh);
        btn.textContent = this.autoRefresh ? '自动刷新' : '手动刷新';
        
        if (this.autoRefresh) {
            this.setupAutoRefresh();
        } else if (this.refreshInterval) {
            clearInterval(this.refreshInterval);
        }
    }

    setupAutoRefresh() {
        if (this.refreshInterval) {
            clearInterval(this.refreshInterval);
        }
        
        if (this.autoRefresh) {
            this.refreshInterval = setInterval(() => {
                this.loadLogs();
            }, 5000); // 每5秒刷新
        }
    }

    async loadLogs() {
        try {
            const response = await fetch('/dashboard/api/logs', {
                headers: { 'Authorization': `Bearer ${this.authToken}` }
            });
            
            if (!response.ok) {
                throw new Error('加载日志失败');
            }
            
            const data = await response.json();
            this.updateLogsTable(data.logs);
            this.updateStats(data.stats);
        } catch (error) {
            console.error('加载日志失败:', error);
        }
    }

    updateLogsTable(logs) {
        const tbody = document.getElementById('logsTableBody');
        tbody.innerHTML = '';

        logs.forEach(log => {
            const row = document.createElement('tr');
            
            const statusClass = this.getStatusClass(log.statusCode);
            const time = new Date(log.timestamp).toLocaleString('zh-CN', {
                month: '2-digit',
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit'
            });
            
            row.innerHTML = `
                <td>${time}</td>
                <td><span class="method-${log.method.toLowerCase()}">${log.method}</span></td>
                <td>${log.path}</td>
                <td><span class="status-code ${statusClass}">${log.statusCode}</span></td>
                <td>${log.duration}</td>
                <td>${log.clientIP}</td>
                <td><code>${log.token}</code></td>
            `;
            
            tbody.appendChild(row);
        });
    }

    updateStats(stats) {
        document.getElementById('totalRequests').textContent = stats.total;
        document.getElementById('successRequests').textContent = stats.success;
        document.getElementById('errorRequests').textContent = stats.errors;
        document.getElementById('avgDuration').textContent = `${stats.avgDuration}ms`;
    }

    getStatusClass(statusCode) {
        if (statusCode >= 200 && statusCode < 300) return 'status-2xx';
        if (statusCode >= 400 && statusCode < 500) return 'status-4xx';
        if (statusCode >= 500) return 'status-5xx';
        return '';
    }

    async clearLogs() {
        if (!confirm('确定要清空所有日志吗？')) return;
        
        try {
            const response = await fetch('/dashboard/api/logs/clear', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${this.authToken}` }
            });
            
            if (response.ok) {
                this.loadLogs();
            } else {
                alert('清空日志失败');
            }
        } catch (error) {
            alert('清空日志失败：' + error.message);
        }
    }

    async loadTokenStatus() {
        try {
            const response = await fetch('/dashboard/api/tokens/status', {
                headers: { 'Authorization': `Bearer ${this.authToken}` }
            });
            
            if (!response.ok) return;
            
            const status = await response.json();
            this.updateTokenStatus(status);
        } catch (error) {
            console.error('加载Token状态失败:', error);
        }
    }

    updateTokenStatus(status) {
        document.getElementById('currentTokenType').textContent = status.currentType || '未知';
        
        const statusEl = document.getElementById('tokenStatus');
        statusEl.textContent = status.status || '未知';
        statusEl.className = `token-status ${status.status === '正常' ? 'active' : ''}`;
        
        document.getElementById('factoryKeyStatus').textContent = status.factoryApiKey ? '已设置' : '未设置';
        document.getElementById('refreshTokenStatus').textContent = status.refreshToken ? '已设置' : '未设置';
    }

    async saveFactoryApiKey() {
        const key = document.getElementById('factoryApiKey').value;
        if (!key) {
            alert('请输入FACTORY_API_KEY');
            return;
        }
        
        await this.saveToken('factoryApiKey', key);
        document.getElementById('factoryApiKey').value = '';
    }

    async saveRefreshToken() {
        const token = document.getElementById('refreshToken').value;
        if (!token) {
            alert('请输入Refresh Token');
            return;
        }
        
        await this.saveToken('refreshToken', token);
        document.getElementById('refreshToken').value = '';
    }

    async saveToken(type, value) {
        try {
            const response = await fetch('/dashboard/api/tokens/save', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.authToken}`
                },
                body: JSON.stringify({ type, value })
            });
            
            const result = await response.json();
            
            if (response.ok) {
                alert('保存成功');
                this.loadTokenStatus();
            } else {
                alert('保存失败: ' + result.error);
            }
        } catch (error) {
            alert('保存失败: ' + error.message);
        }
    }

    async testFactoryApiKey() {
        await this.testToken('factoryApiKey');
    }

    async testRefreshToken() {
        await this.testToken('refreshToken');
    }

    async testToken(type) {
        try {
            const response = await fetch('/dashboard/api/tokens/test', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.authToken}`
                },
                body: JSON.stringify({ type })
            });
            
            const result = await response.json();
            alert(result.message);
        } catch (error) {
            alert('测试失败: ' + error.message);
        }
    }

    async reloadTokens() {
        try {
            const response = await fetch('/dashboard/api/tokens/reload', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${this.authToken}` }
            });
            
            const result = await response.json();
            alert(result.message);
            this.loadTokenStatus();
        } catch (error) {
            alert('热重载失败: ' + error.message);
        }
    }

    async clearTokens() {
        if (!confirm('确定要清空所有Token配置吗？此操作不可撤销！')) return;
        
        try {
            const response = await fetch('/dashboard/api/tokens/clear', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${this.authToken}` }
            });
            
            const result = await response.json();
            alert(result.message);
            this.loadTokenStatus();
        } catch (error) {
            alert('清空失败: ' + error.message);
        }
    }
}

// 页面加载完成后初始化Dashboard
document.addEventListener('DOMContentLoaded', () => {
    new Dashboard();
});