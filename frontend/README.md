# PathOS Frontend

PathOS 的唯一正式前端。它使用 Next.js App Router，并由同一 Next.js 服务通过 BFF 读取本地 Preview Bundle。

## 启动

```bash
npm ci
npm run build
npm run start -- -p 3017
```

Windows 无数据库本地预览：

```powershell
npm ci
$env:PATHOS_DATA_MODE='fixture'
$env:DATABASE_URL='postgresql://pathos_preview:pathos_preview@127.0.0.1:1/pathos_preview'
npm run dev -- -p 3017
```

Backend 模式：

```bash
cp .env.example .env.local
npm run dev -- -p 3017
```

默认 Bundle 位于 `data/preview`，无需另启 Python HTTP 服务。不要提交 `.env.local` 或任何真实 API Key。

`npm run dev`、`npm run build` 和 `npm run start` 会先跑 `scripts/check-secrets.ts`，如果 `.env.local` 含有看起来像真凭据的值，会报警（开发模式）或失败（生产模式）。生产凭据轮换流程见 [SECURITY.md](./SECURITY.md)。

完整项目说明见仓库根目录 `README.md`，冻结状态见 `FINAL_PROJECT_ARCHIVE/`。
# PathOS 前端预览

从项目根目录启动固定的本地预览端口：

```bash
cd frontend
npm run dev:preview
```

然后打开 `http://localhost:3002/map` 或 `http://localhost:3002/discover`。

