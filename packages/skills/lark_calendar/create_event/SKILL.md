---
name: lark_calendar.create_event
kind: agent_driven
description: Create a Lark calendar event.
verify_actions: true
params_schema:
  title: string
  time_hint: string
verifyDifficulty:
  uia: medium
  ocr: medium
  vlm: low
sideEffects:
  calendar:
    createdEvents:
      titlePattern: "${params.title}"
      timeRangeRef: "${params.time_hint}"
---

# Create Event

Create a calendar event with title `title` and time hint `time_hint`. Save the event and finish only after the event is visible or the UI clearly confirms creation.

## Common Pitfalls

### 日期选择失败
- 日历视图可能显示不同月份
- 日期选择器可能需要滚动才能找到目标日期
- 某些日期可能不可选择（已过期、节假日等）

### 时间设置问题
- 时间格式解析错误（如12小时/24小时格式混淆）
- 结束时间早于开始时间
- 时区设置不一致

### 重复事件处理
- 重复规则设置复杂
- 重复事件的例外日期难以处理
- 重复事件创建后难以修改

### 权限限制
- 可能没有创建日历事件的权限
- 某些日历可能是只读的
- 企业日历政策限制

### UI状态问题
- 日历应用可能未正确加载
- 创建按钮可能被禁用
- 表单验证失败但无明确提示

### 冲突检测
- 创建重复事件时可能与已有事件冲突
- 冲突提示可能被忽略
- 自动安排建议可能不符合预期

### 保存失败
- 网络延迟导致保存超时
- 事件标题过长被截断
- 特殊字符导致创建失败
