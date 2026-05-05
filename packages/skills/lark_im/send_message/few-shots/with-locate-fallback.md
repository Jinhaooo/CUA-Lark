# Few-shot: 定位输入框时 uia_find 失败 → ocr_locate 兜底

**Task**: 在测试群发送 Hello
**Skill**: lark_im.send_message
**Outcome**: success

---

## Iteration 1

<observation>
飞书已在前台（之前已 activate_lark），"测试群"群聊已打开。**当前在锚点 A1。**
</observation>
<analysis>
A1 → A2 过渡：先用最便宜的 uia_find 定位输入框。
</analysis>
<action>
uia_find({role: 'Edit', name: '输入消息'})
</action>

**Observation**: null

---

## Iteration 2

<observation>
uia_find 返回 null，输入框的 UIA name 可能与 "输入消息" 不完全匹配。
</observation>
<analysis>
按工具优先级升级：uia_find 失败 → 试 ocr_locate（视觉 OCR）。
</analysis>
<plan>
ocr_locate('输入') 找输入框占位符位置。
</plan>
<action>
ocr_locate({text: '输入'})
</action>

**Observation**: Found "输入" at (580, 905) within bbox (520, 880, 700, 920)

---

## Iteration 3

<observation>
OCR 定位成功，输入框中心约 (610, 900)。
</observation>
<analysis>
拿到了真实坐标，可以 click 聚焦。
</analysis>
<action>
click({x: 610, y: 900})
</action>

**Observation**: Clicked at (610, 900)

---

## Iteration 4

<observation>
光标显示，占位符消失。**A2 已达。**
</observation>
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
消息列表底部出现 "Hello" 气泡，输入框清空。**A3 已达。**
</observation>
<action>
finished({success: true, reason: '消息已发送（OCR 兜底定位）'})
</action>
