# 本地确定性视频工位

当前唯一建筑 adapter 是 `guanque`。输入别的建筑 ID 会在渲染前失败，不能通过改片名把鹳雀楼当成另一座建筑。

施工实现使用 Hailey 的 `threejs-architecture-effects` MIT Skill，许可证保留在 `app/LICENSE` 和 `vendor/architecture-skill/LICENSE`。该视频工位直接调用现有程序化构件，不请求外部模型、素材或声音。

先在仓库根目录运行 `npm run build`，再在独立终端运行 `npm --prefix app run preview -- --port 4188 --strictPort`。该工位不启动或重启服务；`4186` 上的交互试玩可以继续使用。

并行施工时，将完整 app 输入复制到独立的 `artifacts/pipeline/source-snapshots/<id>/app`，对快照执行 check/build，再用独立端口（如 4189）preview 快照内的 dist。`--app-root` 必须与该 preview 实际服务的 app 对应；不要用正在施工的 app 作为快照，也不要在捕获中修改快照。已安装的 node_modules 可以链接复用，源码与 dist 必须是独立副本。复制前后应核对来源文件哈希，确认没有复制到一半的新版本。

```sh
node pipeline/render-video.mjs --config pipeline/video/guanque-pilot.json --url http://127.0.0.1:4188/ --smoke
node pipeline/render-video.mjs --config pipeline/video/guanque-pilot.json --url http://127.0.0.1:4188/
# 可显式改为 720 × 1280，其余保留 24 秒、30 FPS。
node pipeline/render-video.mjs --config pipeline/video/guanque-pilot.json --url http://127.0.0.1:4188/ --width 720 --height 1280
# 并行施工的隔离快照：将 <id> 替换为已完成检查和构建的快照 ID。
node pipeline/render-video.mjs --app-root 'artifacts/pipeline/source-snapshots/<id>/app' --url http://127.0.0.1:4189/
# 鹳雀楼竖屏拆解候选 r2：配置带有可复现的分层分离量。
node pipeline/render-video.mjs --app-root 'artifacts/pipeline/source-snapshots/<id>/app' --config pipeline/video/guanque-breakdown-portrait-r2.json --url http://127.0.0.1:4189/
```

默认规格由镜头配置决定。原始 `guanque-pilot.json` 为 1080 × 1920、30 FPS、24 秒、静音；`guanque-forward-preview-r1.json` 保持竖屏并改为从基台至屋顶正向营造；`guanque-forward-wide-r1.json` 为 1920 × 1080 横屏正向营造；`guanque-breakdown-portrait-r2.json` 使用原竖屏规格，从正向营造进入四带空间分离与回装。`--smoke` 仅把像素和帧率改为 360 × 640、4 FPS，**不保持配置宽高比**，因此横屏配置试镜请显式给出 `--width 640 --height 360 --fps 4`。720p 渲染只能标为预览规格。需要已安装的 Chrome、Playwright、ffmpeg（libx264）和 ffprobe。支持 `ARCHITECTURE_CHROME_PATH`、`ARCHITECTURE_PLAYWRIGHT_PATH` 覆盖本地运行时位置，不会自动安装依赖。

镜头配置声明连续时间区间、进度端点、可选的 `explode`（0–1 分带距离）、camera position/target 与片中文字。原始配置开头展示成品，接着逆放逐构件装配、正放重建；r2 从基台正向营造，13–21 秒分离现有四个构件带并回装。可选 `coverAtSeconds` 从该秒附近实际帧选封面；未指定则取首帧，`run.json` 记录 `coverFrameIndex`。横屏导出专用布局保留左侧文字区、右侧场景，摄像机使用 34° 垂直视角；竖屏导出仍用 48°。该分层只用于观察构件关系，没有经测绘确认的拆卸顺序、真实施工工法或结构受力含义。

仅在 `?export=1` 下，页面暴露：

```ts
window.__ARCHITECTURE_EXPORT__ = {
  version: 'architecture-export.v1',
  adapterId: 'guanque',
  ready: true,
  setFrame({ progress: 0.5, explode: 0.8, position: [48, 34, 82], target: [0, 12.5, 3] })
}
```

`setFrame` 同步更新构件与文字牌、camera、lookAt target、阴影与颜色帧，并等待 WebGL 命令完成。导出模式固定 DPR=1，竖屏 48°、横屏 34° 垂直视角；不运行自主 rAF、自动播放、交互控件、camera 缓动或阴影限频。正常页面保持原交互方式。

输出位于 `artifacts/pipeline/guanque-pilot/<时间戳-唯一ID>/`，新目录不覆盖历史结果。包含 MP4、全部 PNG 帧、封面、首中末预览、逐帧参数与哈希、三组跨进度重访同帧哈希、源码和生产 bundle 前后哈希、ffmpeg 日志、ffprobe 元数据和浏览器错误。只允许给定 localhost origin 的网络访问。

`--app-root` 默认为工作区的 `app/`。显式指定时，源码指纹只读取该 app root 的 src、dist、package/lock、index、Vite/TypeScript 配置，并继续记录视频脚本和所选镜头配置的哈希；原工作区 app 的后续施工不参与快照比对。`run.json` 的 `source_root` 与 `input.appRoot` 记录绝对路径。交付属于这个固定快照；后续源变化不会将已验证的旧快照降级，但新版本必须重新检查和出片。快照内部发生 `SOURCE_HASH_CHANGED` 仍然失败；旧的失败 run 永远不会改为 PASS。

源码快照与服务 URL 通过 bundle 字节握手绑定：出片前从给定 localhost origin 读取 dist 全部文件，逐个比对 SHA-256；浏览器实际加载的 HTML、JavaScript 和 CSS 响应再次逐字节比对。全部匹配才记录 `servedBundleVerified: true`，并保存 `servedBundle.preflight`、`browserResponses` 和期望 bundle 指纹。重定向或任一文件不匹配会失败，不能把旧服务的视频记成新快照的结果。

每个新 run 同时归档 `exporter-source.mjs` 及其 SHA-256，用于追溯当次导出逻辑；该归档保留原脚本的工作区相对布局假设，不作为可独立运行的发行包。

`TECHNICAL_PASS_CONTENT_REVIEW_PENDING` 仅表示文件、编码、帧数、同运行环境的重访帧与源码稳定检查通过，不等于 TITMAS 检查、建筑外观验收、用户验收或发布。仍需复核文字、镜头裁切、建筑来源与艺术处理程度，并观看完整视频。不同 GPU/Chrome/字体环境间的逐像素相同尚未验证。帧 PNG 被保留用于追溯，单条样片可能占用数百 MB。
