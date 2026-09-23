# 候选 r1 的门禁结果

| 范围 | 结果 | 直接证据 |
| --- | --- | --- |
| MP4 编码及快照绑定 | 本次候选技术检查通过 | `manifest.json` 指向不可覆盖的 `run.json`；ffprobe 和 ffmpeg 整段解码核对 |
| 建筑照片保真 | FAIL | 两张用户图片与实际视频/封面查看，檐下、彩画、屋脊、门脸、台基细节差距明显 |
| 上游演示与拆解语义 | FAIL | 两段 MP4 采样对照；候选仍为原位正向装配，缺少可读的空间爆炸与构件路径 |
| TITMAS 本地 outcome review | FAIL | 5 项判据，4 FAIL、1 UNKNOWN；技术自审不能冒充独立审查 |
| TITMAS 远端服务 | NOT_CONNECTED | `docs/governance/titmas-live-check-20260923.json`；无实际调用、签名回执与独立核验 |
| 资料发现 | NEEDS_REVISION | `jobs/guanque-pilot/discovery/RESEARCH-R2.md`，必要来源缺口仍 PARTIAL |
| 客户接受与发布 | NOT_OBTAINED / NOT_RUN | 本候选只供返工评审 |

下一轮应先补齐可核查建筑视角和构件细节，再重做模型及空间爆炸时序，按原任务竖屏规格出片；对新工件重新进行独立视觉审查和 TITMAS 实际服务调用。旧版结果不能沿用。
