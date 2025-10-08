# Docker 部署指南

## 本地 Docker 部署

### 1. 准备环境变量

创建 `.env` 文件（从 `.env.example` 复制）：

```bash
cp .env.example .env
```

编辑 `.env` 文件，填入你需要的环境变量，例如：

```env
PORT=3000
AUTH_TOKEN=your_dashboard_password
FACTORY_API_KEY=
DROID_REFRESH_KEY=your_actual_refresh_token_here
SESSION_SECRET=replace-me
TOKEN_STORE_PATH=/app/data/token-store.json
```

### 2. 使用 Docker Compose 启动

```bash
docker-compose up -d
```

查看日志：

```bash
docker-compose logs -f
```

停止服务：

```bash
docker-compose down
```

### 3. 使用原生 Docker 命令

**构建镜像：**

```bash
docker build -t droid2api:latest .
```

**运行容器：**

```bash
docker run -d \
  --name droid2api \
  -p ${PORT:-3000}:${PORT:-3000} \
  -e PORT=${PORT:-3000} \
  -e AUTH_TOKEN="your_dashboard_password" \
  -e FACTORY_API_KEY="" \
  -e DROID_REFRESH_KEY="your_refresh_token_here" \
  -e SESSION_SECRET="replace-me" \
  -e TOKEN_STORE_PATH="/app/data/token-store.json" \
  -v droid2api-token-store:/app/data \
  droid2api:latest
```

**查看日志：**

```bash
docker logs -f droid2api
```

**停止容器：**

```bash
docker stop droid2api
docker rm droid2api
```

## 云平台部署

### Render.com 部署

1. 在 Render 创建新的 Web Service
2. 连接你的 GitHub 仓库
3. 配置：
   - **Environment**: Docker
   - **Branch**: docker-deploy
   - **Port**: 3000
4. 添加环境变量：
   - `DROID_REFRESH_KEY`: 你的 refresh token
   - 如需使用 Dashboard，可额外配置 `AUTH_TOKEN`、`FACTORY_API_KEY` 等
5. 点击 "Create Web Service"

### Railway 部署

1. 在 Railway 创建新项目
2. 选择 "Deploy from GitHub repo"
3. 选择分支：docker-deploy
4. Railway 会自动检测 Dockerfile
5. 添加环境变量：
   - `DROID_REFRESH_KEY`: 你的 refresh token
   - 根据需要添加 `AUTH_TOKEN`、`FACTORY_API_KEY` 等
6. 部署完成后会自动分配域名

### Fly.io 部署

1. 安装 Fly CLI：
   ```bash
   curl -L https://fly.io/install.sh | sh
   ```

2. 登录：
   ```bash
   fly auth login
   ```

3. 初始化应用（在项目目录）：
   ```bash
   fly launch
   ```

4. 设置环境变量：
   ```bash
   fly secrets set DROID_REFRESH_KEY="your_refresh_token_here"
   ```

5. 部署：
   ```bash
   fly deploy
   ```

### Google Cloud Run 部署

1. 构建并推送镜像：
   ```bash
   gcloud builds submit --tag gcr.io/YOUR_PROJECT_ID/droid2api
   ```

2. 部署到 Cloud Run：
   ```bash
   gcloud run deploy droid2api \
     --image gcr.io/YOUR_PROJECT_ID/droid2api \
     --platform managed \
     --region us-central1 \
     --allow-unauthenticated \
     --set-env-vars DROID_REFRESH_KEY="your_refresh_token_here" \
     --port 3000
   ```

### AWS ECS 部署

1. 创建 ECR 仓库
2. 推送镜像到 ECR
3. 创建 ECS 任务定义
4. 配置环境变量：
   - `DROID_REFRESH_KEY`
5. 创建 ECS 服务

## 持久化配置

如果需要持久化 Dashboard 中新增/修改的密钥，保持 `TOKEN_STORE_PATH` 指向一个挂载目录（默认 `/app/data/token-store.json`），并在 Docker 中挂载卷：

### Docker Compose 方式

当前 `docker-compose.yml` 已默认挂载名为 `token-store` 的卷至 `/app/data`，直接运行即可实现持久化。

### Docker 命令方式

```bash
docker volume create droid2api-token-store

docker run -d \
  --name droid2api \
  -p ${PORT:-3000}:${PORT:-3000} \
  -e PORT=${PORT:-3000} \
  -e AUTH_TOKEN="your_dashboard_password" \
  -e DROID_REFRESH_KEY="your_refresh_token_here" \
  -e TOKEN_STORE_PATH="/app/data/token-store.json" \
  -v droid2api-token-store:/app/data \
  droid2api:latest
```

## 健康检查

容器启动后，可以通过以下端点检查服务状态：

```bash
curl http://localhost:3000/
curl http://localhost:3000/v1/models
```

## 环境变量说明

| 变量名 | 必需 | 说明 |
|--------|------|------|
| `PORT` | 否 | 服务监听端口，默认 3000 |
| `AUTH_TOKEN` | 否 | Dashboard 登录口令，未设置则无法访问管理界面 |
| `FACTORY_API_KEY` | 否 | 固定 Factory API key，优先级最高 |
| `DROID_REFRESH_KEY` | 否 | refresh token，支持自动刷新 access token |
| `SESSION_SECRET` | 否 | Dashboard 会话密钥 |
| `TOKEN_STORE_PATH` | 否 | token 存储路径，默认 `/app/data/token-store.json` |
| `NODE_ENV` | 否 | 运行环境，默认 production |

## 故障排查

### 容器无法启动

查看日志：
```bash
docker logs droid2api
```

常见问题：
- 缺少 `DROID_REFRESH_KEY` 环境变量
- refresh token 无效或过期
- 端口 3000 已被占用

### API 请求返回 401

**原因**：refresh token 过期或无效

**解决**：
1. 获取新的 refresh token
2. 更新环境变量
3. 重启容器

### 容器频繁重启

检查健康检查日志和应用日志，可能是：
- 内存不足
- API key 刷新失败
- 配置文件错误

## 安全建议

1. **不要将 `.env` 文件提交到 Git**
2. **使用 secrets 管理敏感信息**（如 GitHub Secrets、Docker Secrets）
3. **定期更新 refresh token**
4. **启用 HTTPS**（云平台通常自动提供）
5. **限制访问来源**（通过防火墙或云平台配置）

## 性能优化

### 多阶段构建（可选）

```dockerfile
# 构建阶段
FROM node:24-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci

# 生产阶段
FROM node:24-alpine
WORKDIR /app
COPY --from=builder /app/node_modules ./node_modules
COPY . .
EXPOSE 3000
CMD ["node", "server.js"]
```

### 资源限制

在 docker-compose.yml 中添加：

```yaml
services:
  droid2api:
    deploy:
      resources:
        limits:
          cpus: '1'
          memory: 512M
        reservations:
          cpus: '0.5'
          memory: 256M
```

## 监控和日志

### 查看实时日志

```bash
docker-compose logs -f
```

### 导出日志

```bash
docker logs droid2api > droid2api.log 2>&1
```

### 集成监控工具

可以集成：
- Prometheus + Grafana
- Datadog
- New Relic
- Sentry（错误追踪）
