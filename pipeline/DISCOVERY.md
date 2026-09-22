# 建筑资料缺口发现合同 v1

发现层既可在任何工位触发，也可由用户第一次指定建筑时启动。它把“找可复用技术模块”和“补当前建筑资料”区分开；Scout/GitHub 搜索不是建筑图像或尺寸发现服务。

## 文件与运行记录

- `jobs/<id>/discovery-plan.json`：记录待回答缺口、阻塞工位、优先级、证据类型、允许来源、搜索预算和停止条件；计划绑定当前 `request.json`。
- `jobs/<id>/discovery/index.json`：指向每次尝试和当前尝试。新尝试使用新的 `attempt_id` 文件，禁止覆盖旧尝试。
- `jobs/<id>/discovery/attempts/<attempt-id>.json`：记录实际模块及版本、开始/结束时间、查询、来源覆盖、每个缺口结果及停止原因。绑定 request、plan、sources 三份当前字节。
- `jobs/<id>/sources.json`：存来源和可复核证据。未找到时不创建虚构来源。

`observations` 是带出处的主张记录：每项包含唯一 `claim_id`、所属 `gap_id`、`claim_kind`（`OBSERVED`、`SOURCE_REPORTED`、`CONTRADICTS` 或 `UNKNOWN`）、准确陈述、`source_id` 和可定位到页面、图号、视频时间或视角的 `locator`。`UNKNOWN` 可以没有来源，但必须写清未知内容与已尝试范围。`RESOLVED` 结果只能引用当前 sources 包中的来源及同缺口观察项；`CONFLICTED` 必须保留至少两个不同来源的观察，不得把冲突压成单一结论。

机器字段及状态见 `schemas/discovery.schema.json`。每个计划缺口必须且只能有一个当前结果：`RESOLVED`、`PARTIAL`、`CONFLICTED`、`UNKNOWN` 或 `BUDGET_EXHAUSTED`。冲突双方各自保留来源。重要缺口未解决时只阻断依赖它的工位；无关工作可继续。

## 版本与失效

请求身份或计划修改会使旧尝试失效；来源包变化后，旧 attempt 对应旧 `sources_sha256`，状态显示 `STALE`，需要基于新来源版本追加一份尝试。追加新尝试不能删除旧失败或 `UNKNOWN`。下游 model-plan 必须绑定已完成的 discovery attempt ID 与哈希；视觉审查、视频清单应通过既有输入绑定追溯这个 model-plan。选了一个发现模块不代表它执行过，也不构成 PASS。

搜索预算耗尽是可记录结果，不自动扩大预算、来源范围或外部服务权限。`UNKNOWN` 必须保留；关键缺口未解决时不能交给施工层伪装为已知事实。非关键简化须在 model-plan 明确写为艺术选择和限制。

## 能力边界

当前实现状态见 `integrations.json`。本合同描述执行输入/输出和证据边界；没有注册的实时搜索服务不会因此出现。执行者需要真实打开来源并记录访问，合同或 schema 校验本身不能证明内容真实性、视觉理解、照片发布权或建筑测绘精度。
