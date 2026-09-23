# 鹳雀楼正向营造候选片 r1（仅预览）

本目录的 `guanque-forward-wide-preview.mp4` 是 1280×720、30 FPS、24 秒、静音横屏片；`cover.png` 来自同一次渲染的第 717 帧。机器可读的绑定与状态见 `manifest.json`。原竖屏交付及其历史审查记录未被覆盖。

画面由基台、柱架、楼层到屋面正向营造，比旧片更易辨认工序，但模型与用户照片在檐下构件、彩画、屋脊、入口与台基细部仍有明显差距，且尚未形成构件组空间爆炸拆解。横屏 720p 与原任务 1080×1920 约定不同，不能作为原规格终片。

实际 MP4 的编码、帧数、时长、整段解码、来源快照与封面绑定检查通过。根据 `titmas-outcome-review` 本地 Skill（源码 `joy7758/titmas-sandbox-gateway@f8de578`）执行了一次真实离线文件绑定与逐项结果聚合：`FAIL`（建筑、动作、集成、客户目标 4 项失败；技术自审 1 项因非独立而 `UNKNOWN`）。完整 packet、观察和原始本地结果保存在本机 `artifacts/titmas-outcome-r1/`，不把这个离线结果称为远端回执。

远端 TITMAS 机器入口仍未获得可用合同，服务调用、原始签名回执和独立验证均 `NOT_RUN`。当前状态为 `NEEDS_REVISION / PREVIEW_ONLY`；用户未验收，也未发布。发布文案待视觉与服务门禁关闭后定稿。

本项目复用 Hailey 的 `threejs-architecture-effects` MIT Skill；许可证见同级历史 `LICENSE-Hailey.txt` 与仓库 `app/LICENSE`。参考照片仅用于本地审查，未嵌入视频。画面是程序化艺术重现，不是测绘、结构仿真或真实施工方法。
