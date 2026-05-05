# Few-shot: 中途遇到弹窗，主动 dismiss 后继续（反思示例）

**Task**: 在测试群发送 "你好"
**Skill**: lark_im.send_message
**Outcome**: failure_recovered

---

## Iteration 1

<observation>
飞书在前台，群聊打开。**当前 A1。**
</observation>
<action>
click({x: 680, y: 910})
</action>

**Observation**: Clicked at (680, 910)

---

## Iteration 2

<observation>
**意外**：屏幕中央出现一个白色对话框，标题 "升级到新版本"，含"立即更新"和"稍后"两个按钮。输入框被遮挡，光标未出现。**当前不在任何锚点上**——是个未预期的弹窗状态。
</observation>
<analysis>
按 state-diff 提示，状态未如预期变化（A1 → A2 失败）；可能原因之一是"出现拦截弹窗"。**禁止**重试同一 click，先 dismiss 弹窗。
"稍后" 按钮是非破坏性选择。
</analysis>
<plan>
ocr_locate('稍后') 定位"稍后"按钮，然后 click 关掉弹窗。
</plan>
<action>
ocr_locate({text: '稍后'})
</action>

**Observation**: Found "稍后" at (820, 540)

---

## Iteration 3

<action>
click({x: 820, y: 540})
</action>

**Observation**: Clicked at (820, 540)

---

## Iteration 4

<observation>
弹窗消失，群聊重新可见，输入框可见且为空。**回到 A1。**
</observation>
<analysis>
弹窗已 dismiss，重新尝试 A1 → A2 过渡。
</analysis>
<action>
click({x: 680, y: 910})
</action>

**Observation**: Clicked at (680, 910)

---

## Iteration 5

<observation>
光标显示。**A2 已达。**
</observation>
<action>
type({text: '你好'})
</action>

**Observation**: Typed '你好'

---

## Iteration 6

<action>
hotkey({key: 'Enter'})
</action>

**Observation**: Pressed 'Enter'

---

## Iteration 7

<observation>
"你好" 气泡出现在群聊底部。**A3 已达。**
</observation>
<action>
finished({success: true, reason: '消息已发送（中途 dismiss 弹窗后恢复）'})
</action>
