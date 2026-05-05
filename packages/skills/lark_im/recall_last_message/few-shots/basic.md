# Few-shot: 撤回最近一条自己发的消息

**Task**: 撤回刚发的 "Hello" 消息
**Skill**: lark_im.recall_last_message
**Outcome**: success

---

## Iteration 1

<observation>
飞书"测试群"打开，最底部是自己刚发的 "Hello" 气泡（蓝色、靠右、约 (1100, 600)）。
</observation>
<plan>
按 SKILL.md 5 步流程：右键消息气泡 → 菜单 → 撤回。先 right_click 气泡中心。
</plan>
<action>
right_click({x: 1100, y: 600})
</action>

**Observation**: Right-clicked at (1100, 600)

---

## Iteration 2

<observation>
右键上下文菜单浮出，含 "回复"/"复制"/"翻译"/"撤回"/"删除"/"多选" 等项。
</observation>
<analysis>
选 "撤回"——不要点附近的 "删除"（删除是不可恢复的、会留下"消息已删除"占位）。
</analysis>
<action>
ocr_locate({text: '撤回'})
</action>

**Observation**: Found "撤回" at (1180, 705)

---

## Iteration 3

<action>
click({x: 1180, y: 705})
</action>

**Observation**: Clicked at (1180, 705)

---

## Iteration 4

<observation>
原 "Hello" 气泡消失，原位置出现灰色提示 "你撤回了一条消息"。
</observation>
<analysis>
完成判据满足：撤回提示出现 + 原气泡消失。
</analysis>
<action>
finished({success: true, reason: '消息已撤回'})
</action>
