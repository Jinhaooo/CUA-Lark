## 飞书窗口纪律

**第一步必须**调 `activate_lark` 把飞书拉前台。`activate_lark` 幂等，可放心多次调用。

后续所有 `click` / `type` / `hotkey` / `scroll` 只在飞书窗口内。如果截图不是飞书界面（cua-lark 标题为 "Lark-CUA"，飞书有左侧会话列表 + 中间消息流 + 右侧成员），**禁止**继续操作。

但**也禁止无限重复 `activate_lark`**：若连续 2 次调用后仍看不到飞书界面，说明焦点被其他窗口持续夺回。换策略：

- 调 `hotkey('Win+D')` 最小化所有遮挡窗口
- 调 `finished(false, 'cannot_focus_lark')` 让上层处理

**禁止**对同一个 activate 反复重试超过 2 次——这是已知死循环模式。
