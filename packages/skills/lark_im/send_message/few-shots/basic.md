# Few-shot: 基础发消息流程

**Task**: 在测试群发送 Hello
**Skill**: lark_im.send_message
**Outcome**: success

---

## Iteration 1

<observation>
当前屏幕显示 cua-lark 控制面板，飞书未在前台。
</observation>
<analysis>
任务尚未开始，第一步必须先把飞书拉前台。
</analysis>
<plan>
调用 activate_lark 切换焦点到飞书。
</plan>
<action>
activate_lark({})
</action>

**Observation**: Activated Feishu (PID 19464). The Lark/Feishu window is now in the foreground.

---

## Iteration 2

<observation>
飞书"测试群"群聊已打开，左侧会话列表选中、底部输入框可见且为空（占位符 "输入消息"）。**当前在锚点 A1（群聊已打开）。**
</observation>
<analysis>
进入 A1，下一步过渡到 A2 需要 click 输入框聚焦。先用 uia_find（最便宜）。
</analysis>
<plan>
uia_find({role: 'Edit', name: '输入消息'}) 定位输入框。
</plan>
<action>
uia_find({role: 'Edit', name: '输入消息'})
</action>

**Observation**: {role: 'Edit', boundingRectangle: {x: 480, y: 880, width: 400, height: 60}}

---

## Iteration 3

<observation>
uia_find 返回了输入框 box，中心约 (680, 910)。
</observation>
<analysis>
A1 → A2 过渡：click 输入框中心。
</analysis>
<plan>
click(680, 910) 聚焦输入框。
</plan>
<action>
click({x: 680, y: 910})
</action>

**Observation**: Clicked at (680, 910)

---

## Iteration 4

<observation>
输入框光标显现，占位符消失。**当前在锚点 A2（输入框已聚焦）。**
</observation>
<analysis>
A2 → A3 过渡：type 文本 + Enter。
</analysis>
<plan>
type "Hello" + hotkey('Enter')。
</plan>
<action>
type({text: 'Hello'})
</action>

**Observation**: Typed 'Hello'

---

## Iteration 5

<action>
hotkey({key: 'Enter'})
</action>

**Observation**: Pressed 'Enter'

---

## Iteration 6

<observation>
输入框清空（占位符恢复），消息列表底部出现 "Hello" 气泡（靠右、蓝色背景），无红色感叹号。**当前在锚点 A3（消息已发送）。**
</observation>
<analysis>
A3 已达到，完成判据全部满足：输入框清空 ✓ / 消息出现 ✓ / 无失败标记 ✓。
</analysis>
<plan>
立即调用 finished(true)，不再 screenshot 或 idle。
</plan>
<action>
finished({success: true, reason: '消息已发送'})
</action>
