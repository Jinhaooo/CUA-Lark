---
name: lark_im.search_contact
kind: agent_driven
description: Search a Lark contact or group and open the matching chat.
verify_actions: true
params_schema:
  name_pattern: string
verifyDifficulty:
  uia: low
  ocr: low
  vlm: low
---

# Search Contact

Use Lark global search to find the contact or group whose name contains `name_pattern`, then open that chat.

When processing an existing message, you can right-click the target message first, then inspect the context menu to decide the next operation.

Completion criteria:
- The main conversation area has switched to the matching chat.
- The chat title contains `name_pattern`.
- The message list and input box are visible.

## 锚点状态

- **A1 · 搜索框未打开**：飞书主界面，侧边栏可见放大镜图标
- **A2 · 搜索框已聚焦**：顶部搜索面板浮出，光标在文本框内
- **A3 · 候选列表显示**：搜索面板下方出现"群组"/"消息"分组的候选项
- **A4 · 目标会话已打开**：右侧主区切换到目标群/联系人，标题正确

**过渡条件**：
- A1 → A2：`click(侧边栏放大镜图标)`
- A2 → A3：`type(name_pattern)`
- A3 → A4：`click(群组分类下匹配的群组卡片)` — **不是消息片段**
