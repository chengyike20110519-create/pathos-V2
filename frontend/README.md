# PathOS Frontend

PathOS 的唯一正式前端。它使用 Next.js App Router，并由同一 Next.js 服务通过 BFF 读取本地 Preview Bundle。

## 开发预览（固定端口 3002）

需要 Node.js 20+ 和 npm。从仓库根目录进入前端目录并安装依赖：

```bash
cd frontend
npm ci
npm run dev:preview
```

然后打开 `http://localhost:3002/map` 或 `http://localhost:3002/discover`。`dev:preview` 已在 `package.json` 中固定使用 3002 端口。

以下其他启动方式均在 `frontend/` 目录运行；切换方式前，请先停止原来的服务。

## 构建后预览（端口 3017）

需要检查构建产物时运行：

```bash
npm run build
npm run start -- -p 3017
```

打开 `http://127.0.0.1:3017`。这里运行的是构建后的 Preview，不代表数据或产品已达到生产发布标准。

## Windows 无数据库开发预览

在 PowerShell 中显式启用开发专用 fixture 数据：

```powershell
$env:PATHOS_DATA_MODE='fixture'
$env:DATABASE_URL='postgresql://pathos_preview:pathos_preview@127.0.0.1:1/pathos_preview'
npm run dev -- -p 3017
```

fixture 只用于开发和显式测试，不能作为 backend mode 的事实来源。此命令使用 3017 端口。

## Backend 模式

首次使用时复制环境变量示例，并按示例配置所需数据：

```bash
cp .env.example .env.local
npm run dev -- -p 3017
```

默认 Bundle 位于 `data/preview`，无需另启 Python HTTP 服务。不要提交 `.env.local` 或任何真实 API Key。

`npm run dev`、`npm run build` 和 `npm run start` 会先跑 `scripts/check-secrets.ts`，如果 `.env.local` 含有看起来像真凭据的值，会报警（开发模式）或失败（生产模式）。生产凭据轮换流程见 [SECURITY.md](./SECURITY.md)。

完整项目说明见仓库根目录 [README.md](../README.md)，冻结状态见 [FINAL_PROJECT_ARCHIVE](../FINAL_PROJECT_ARCHIVE/)。
