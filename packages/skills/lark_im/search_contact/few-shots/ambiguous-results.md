# Few-shot: 搜索结果有多个候选，区分群组 vs 消息片段

**Task**: 找到"项目讨论"群组并打开
**Skill**: lark_im.search_contact
**Outcome**: success

---

## Iteration 1

<observation>
飞书在前台，搜索框已聚焦（前置步骤已完成）。
</observation>
<action>
type({text: '项目讨论'})
</action>

**Observation**: Typed '项目讨论'

---

## Iteration 2

<observation>
下拉结果列表 4 条：
- "群组" 分类：1 个 "项目讨论"（左侧绿色群头像 + "5 人"）
- "消息" 分类：3 条历史消息片段（左侧个人头像 + 消息预览文本）
</observation>
<analysis>
按 search_contact 完成判据，要打开**会话**（群组卡片），不是消息片段。点击群组分类下的卡片。
</analysis>
<plan>
区分关键：群组卡片左侧是**群头像**（圆形多头像组合），消息片段左侧是**单人头像**。前者通常排在最上方"群组"分组下。
</plan>
<action>
uia_find({role: 'ListItem', name: '项目讨论'})
</action>

**Observation**: [{role: 'ListItem', name: '项目讨论', boundingRectangle: {x: 220, y: 210, width: 580, height: 50}}, {role: 'ListItem', name: '项目讨论 5 人', boundingRectangle: {x: 220, y: 270, width: 580, height: 50}}]

---

## Iteration 3

<observation>
两个候选——一个 name="项目讨论" 另一个 name 含 "5 人"（群组特征）。第二个是群组。
</observation>
<action>
click({x: 510, y: 295})
</action>

**Observation**: Clicked at (510, 295)

---

## Iteration 4

<observation>
右侧切换到"项目讨论"群聊（标题 + 成员列表 + 消息流），不是单条消息上下文。
</observation>
<action>
finished({success: true, reason: '已打开"项目讨论"群组'})
</action>
