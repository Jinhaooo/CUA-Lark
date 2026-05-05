---
name: _common.dismiss_popup
kind: agent_driven
description: 关闭与测试任务无关的弹窗，包括权限提示、更新提示、广告等各类干扰弹窗
params_schema:
  popupType:
    type: string
    optional: true
    description: 指定弹窗类型，如 permission_denied, update, ad, notification, dialog
verify_actions: true
verifyDifficulty:
  uia: medium
  ocr: medium
  vlm: low
toolWhitelist:
  - screenshot
  - ocr_locate
  - ocr_read
  - uia_find
  - click
  - wait
  - wait_for_loading
  - finished
---

# 关闭无关弹窗

## 功能说明
- 检测当前界面是否存在与测试任务无关的弹窗
- 支持多种弹窗类型：权限提示、更新提示、广告、通知、对话框等
- 关闭所有无关弹窗，确保界面干净无干扰

## 弹窗类型识别

### 权限弹窗 (permission_denied)
- 常见关键词：权限、允许、拒绝、授权、访问、隐私政策
- 常见按钮：允许、拒绝、确定、取消
- 处理策略：记录证据后关闭

### 更新弹窗 (update)
- 常见关键词：更新、升级、新版本、安装
- 常见按钮：立即更新、稍后提醒、跳过
- 处理策略：选择稍后提醒或跳过

### 广告弹窗 (ad)
- 常见关键词：广告、推广、优惠、免费
- 常见按钮：关闭、跳过、忽略
- 处理策略：直接关闭

### 通知弹窗 (notification)
- 常见关键词：通知、消息、提醒
- 常见按钮：关闭、确定、知道了
- 处理策略：关闭

### 通用对话框 (dialog)
- 各种确认对话框、警告对话框
- 处理策略：根据上下文判断是否需要关闭

## 处理优先级
1. 安全相关弹窗（权限、隐私）- 需要记录证据
2. 更新提示弹窗 - 选择推迟
3. 广告和推广弹窗 - 立即关闭
4. 系统通知弹窗 - 关闭

## 完成判据
- 截图中无任何模态弹窗
- 界面干净，无干扰元素
- 主应用界面可见且可交互

## 常见陷阱
- 弹窗可能嵌套出现，需要递归检测
- 某些弹窗可能有延迟出现，需要等待
- 弹窗按钮位置可能随界面变化
- 权限弹窗可能需要特殊处理逻辑

## 工具使用建议
- 使用 `ocr_locate` 识别弹窗标题和按钮
- 使用 `wait_for_loading` 等待弹窗完全加载
- 使用 `screenshot` 记录弹窗内容作为证据
- 使用 `record_evidence` 记录权限拒绝等重要弹窗