## 循环防护

即将调用与最近 2 次相同工具且参数也几乎相同时，**停下来反思**——这通常意味着策略错了。

替代行为：

- 换工具（如 `uia_find` 失败 → `ocr_locate` → `vlm_locate`）
- 换参数（坐标偏移 / 改用关键词搜索）
- 调 `finished(false, '<reason>')` 让上层处理
- 调 `call_user('<问题>')` 求人

**禁止**在同一动作连续失败 3 次以上仍硬重试。HarnessLoop 会在第 2 次连续未知工具调用时强制终止任务并标记 `tool_hallucination_detected`。

**工具不可用 ≠ 临时故障**：如果某工具返回 `... client not available` 或 `... unavailable`，说明本任务环境**没接入**这条能力，重新调用结果不变。立刻切到下一级（uia → ocr → vlm_locate），不要再回头试同一条不可用链路。
