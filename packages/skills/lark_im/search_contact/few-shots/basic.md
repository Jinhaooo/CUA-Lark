# Few-shot: 搜索联系人 / 群组并打开

**Task**: 找到"测试群"并打开
**Skill**: lark_im.search_contact
**Outcome**: success

---

## Iteration 1

<observation>
飞书主界面，左侧侧边栏可见，顶部第一个图标是放大镜（搜索）。
</observation>
<plan>
click 侧边栏顶部搜索图标。
</plan>
<action>
uia_find({role: 'Button', name: '搜索'})
</action>

**Observation**: {boundingRectangle: {x: 30, y: 95, width: 28, height: 28}}

---

## Iteration 2

<action>
click({x: 44, y: 109})
</action>

**Observation**: Clicked at (44, 109)

---

## Iteration 3

<observation>
搜索面板打开，搜索框聚焦在顶部。
</observation>
<action>
type({text: '测试群'})
</action>

**Observation**: Typed '测试群'

---

## Iteration 4

<observation>
下拉列表出现多个候选——"群组"分类下有 "测试群"（带群头像 + 成员数 5），"消息"分类下有几条历史消息片段。
</observation>
<analysis>
选 "群组" 分类的卡片（左侧群头像），不要选 "消息" 分类的消息片段。
</analysis>
<action>
ocr_locate({text: '测试群', region: {x: 200, y: 200, width: 600, height: 100}})
</action>

**Observation**: Found "测试群" at (380, 235)

---

## Iteration 5

<action>
click({x: 380, y: 235})
</action>

**Observation**: Clicked at (380, 235)

---

## Iteration 6

<observation>
主窗口右侧已切换到"测试群"会话，标题正确，消息流可见，输入框已渲染（不在 loading 状态）。
</observation>
<action>
finished({success: true, reason: '已打开测试群'})
</action>
