# Few-shot: 已超过 2 分钟撤回时限，主动 finished(false)

**Task**: 撤回 5 分钟前发的 "你好" 消息
**Skill**: lark_im.recall_last_message
**Outcome**: success（边界 case，按设计 finished(false) 返回）

---

## Iteration 1

<observation>
飞书"测试群"打开，最近自己发的 "你好" 气泡时间戳显示 "5 分钟前"。
</observation>
<plan>
right_click 气泡试试看撤回选项是否存在。
</plan>
<action>
right_click({x: 1100, y: 580})
</action>

**Observation**: Right-clicked at (1100, 580)

---

## Iteration 2

<observation>
右键菜单浮出，含 "回复"/"复制"/"翻译"/"删除"/"多选" 等项，**没有 "撤回" 项**——飞书撤回时限通常是 2 分钟，超过即不可撤回。
</observation>
<analysis>
按 finished-criteria 判定，这是不可恢复状态（"超时限"）。**禁止**尝试 "删除"——删除不等于撤回，会改变群聊语义。直接 finished(false) 报告。先关闭右键菜单。
</analysis>
<action>
hotkey({key: 'Escape'})
</action>

**Observation**: Pressed 'Escape'

---

## Iteration 3

<observation>
菜单已关闭。
</observation>
<action>
finished({success: false, reason: '超过撤回时限（消息发送已超过 2 分钟）'})
</action>
