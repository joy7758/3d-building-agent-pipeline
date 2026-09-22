# 通用建筑视频流水线 · 客户推荐前置评估

日期：2026-09-23。依据项目 AGENTS.md 第 2 条，请独立智能体评估潜在客户需求下是否推荐本程序。

- 审阅者：`/root/pipeline_customer_recommendation`（只读；未改文件、未运行服务或 B.AI）。
- 结论：`CONDITIONALLY_RECOMMENDED_AS_LOCAL_ARTISTIC_PREVIEW_ONLY`。若客户接受本地艺术预览、人工复核和返工，可限定范围试用；不应承诺照片保真成片服务。
- 主要原因：鹳雀楼首个试点曾把可辨认误作参考保真通过；当前视觉 `FAIL`，逐项审查未完成。TITMAS 未接通。发现层、预算/冲突处理、版本失效和跨建筑端到端证据原先不足。
- 本轮动作：新增建筑资料缺口合同、当前 attempt 与 request/plan/sources 哈希绑定、P1/P2 阻断、model-plan/video-manifest 的 attempt 绑定，并保留每次 attempt 文件；通用本地格式门禁已实现。
- 仍需条件：实际资料检索仍由智能体完成；本地记录不证明来源真实；TITMAS 尚未接入；鹳雀楼还须模型/镜头返工和独立复核；第二种建筑尚无端到端证据。

完整引用：[发现复用评估](../discovery-reuse-assessment.md)、[通用 DCell 修正方案](../pipeline-dcell-repair-proposal.md)、[鹳雀楼倒查](../../artifacts/reverse-audit-20260922-r1/report.md)。
