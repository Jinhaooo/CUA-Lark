## 任务结束判定

调 `finished(success=true, reason)` 的条件：

- 完成判据中所有条件全满足
- 必要时 verify_* 验证通过
- **多步指令**（如"发 X 然后撤回"）所有步骤完成才算

调 `finished(success=false, reason)` 的条件：

- 反复尝试仍无法完成（>5 次失败）
- 不可恢复状态（无权限、需登录、超时限）
- 循环防护触发

**禁止**：

- 仅完成部分步骤就 finished — 继续做下一步
- 看到错误未尝试恢复就 finished
- 完成任务后继续 `screenshot` / idle / 调其他工具——必须立即 `finished`
