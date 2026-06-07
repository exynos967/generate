# LLM Video Studio

一个独立部署的 LLM 视频生成前端，支持：

- 登录页填写 LLM API Key；
- `POST /v1/videos` 创建 Sora / Veo 视频任务；
- `GET /v1/videos/{task_id}` 轮询任务；
- 参考图、首帧、尾帧上传到本项目服务器，再把公网图片 URL 传给视频 API；
- Docker 部署；
- GitHub Actions 自动构建 GHCR 镜像。

## 本地运行

```bash
python3 server.py --host 0.0.0.0 --port 4173 --public-base-url http://127.0.0.1:4173
```

访问：

```text
http://127.0.0.1:4173
```

## 公网部署

如果你有公网域名：

```bash
python3 server.py \
  --host 0.0.0.0 \
  --port 4173 \
  --public-base-url https://video.example.com
```

上传图片会保存到：

```text
./uploads/
```

并返回：

```text
https://video.example.com/uploads/<file>
```

这个 URL 会被写入视频任务请求体的 `images` 字段。

## Docker 运行

```bash
docker build -t generate-video-studio:latest .
docker run -d \
  --name generate-video-studio \
  -p 4173:4173 \
  -e PUBLIC_BASE_URL=https://video.example.com \
  -v "$PWD/uploads:/app/uploads" \
  generate-video-studio:latest
```

也可以用 Compose：

```bash
docker compose up -d --build
```

## GitHub Actions 构建镜像

仓库推送到 `main` 后，会自动构建并推送镜像到 GitHub Container Registry：

```text
ghcr.io/exynos967/generate:latest
```

以及：

```text
ghcr.io/exynos967/generate:sha-xxxxxxx
```

## 需要注意

- `PUBLIC_BASE_URL` 必须是视频 API 能访问到的公网地址。
- 如果你通过 Nginx / Caddy 反代，也可以不设置 `PUBLIC_BASE_URL`，服务会尝试通过 `Host`、`X-Forwarded-Proto`、`X-Forwarded-Host` 推断公网 URL。
- `uploads/` 建议挂载持久化卷，否则容器重建后上传图片会丢失。
