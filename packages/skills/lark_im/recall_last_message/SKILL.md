---
name: lark_im.recall_last_message
kind: procedural
description: Recall the latest outgoing message matching exact text in the current Lark chat.
verify_actions: true
fallback: false
params_schema:
  text: string
verifyDifficulty:
  uia: high
  ocr: medium
  vlm: low
finishCriteria: |
  群聊里出现"你撤回了一条消息"或"You recalled a message"提示，且原消息气泡消失。
---

# Recall Last Message（飞书撤回最近一条自己发的消息）

撤回飞书消息**不需要**任何特殊工具，**全部通过鼠标操作完成**。请按下面的标准流程一步一步走，**不要凭直觉乱试**。

## 标准流程（每一步都对应一次 tool_call）

0. **activate_lark** — 任何一步动作之前，先把飞书拉到前台。这是所有任务的开场动作。
1. **screenshot** — 截屏定位群聊区域，找到自己刚发出去（屏幕右侧）的那条目标气泡。颜色通常是蓝色或紫色背景。
2. **right_click** — 在目标消息气泡的中心右键单击。`args` 用 `{"x": <气泡中心x>, "y": <气泡中心y>}`。这一步会弹出右键菜单。**不要**点三个点（…）的更多按钮。
3. **screenshot** — 等右键菜单浮出后再截一张图。
4. **click** — 在弹出菜单里找到"撤回"（中文）或"Recall"（英文）一项，对它的中心点击。**不要**点附近的"删除"、"复制"、"翻译"、"回复"等其他菜单项。
5. **screenshot + finished** — 截图确认群聊里出现了撤回提示（"你撤回了一条消息"或"You recalled a message"），原消息气泡消失。然后立刻调用：
   ```json
   {"thought":"已成功撤回消息，看到撤回提示","tool_call":{"name":"finished","args":{"success":true,"reason":"消息已撤回"}}}
   ```

## 重要约束

- **只撤回最新一条匹配 `text` 的自己发出的消息**，不要去翻历史。
- 如果第 1 步找不到匹配 `text` 的消息气泡，立即 `finished(success=false, reason="未找到匹配的待撤回消息")`，不要乱点。
- 如果右键菜单里没有"撤回"项（比如消息已超过 2 分钟撤回时限），同样 `finished(success=false, reason="超过撤回时限")`。
- **绝对不要**调用 `noop` / `wait_until_done` / `do_nothing` 这种不存在的工具，也不要重复 screenshot 超过 2 次还不动作。

## 工具速查（这个任务用得到的）

- `activate_lark()` — 把飞书桌面客户端拉到前台（每个任务第一步必须调用）
- `screenshot()` — 截屏看当前界面
- `click({x, y})` — 左键单击坐标
- `right_click({x, y})` — 右键单击坐标，弹出上下文菜单
- `finished({success, reason})` — 任务结束（成功或失败都用它）

其它工具（`type`、`hotkey`、`scroll`…）这个流程基本用不到。

## 锚点状态

- **A1 · 目标气泡可见**：群聊滚动到底部，自己最新发的、文本匹配 `text` 的气泡（靠右）在屏幕内
- **A2 · 右键菜单已弹出**：气泡上方/下方浮出菜单，含 "回复"/"复制"/"翻译"/"撤回"/"删除" 等项
- **A3 · 消息已撤回**：原气泡消失，原位置出现灰色提示 "你撤回了一条消息" / "You recalled a message"

**过渡条件**：
- A1 → A2：`right_click(气泡中心)`
- A2 → A3：`click(菜单内"撤回"项)`

**异常出口**：
- 若 A2 菜单中没有"撤回"项（超过 2 分钟时限），调 `hotkey('Escape')` 关闭菜单后 `finished(false, '超过撤回时限')`
