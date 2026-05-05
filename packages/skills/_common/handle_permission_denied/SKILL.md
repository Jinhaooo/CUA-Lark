---
name: _common.handle_permission_denied
kind: agent_driven
description: 处理权限拒绝场景，记录证据并尝试替代方案或提示用户手动操作
params_schema:
  permissionType:
    type: string
    description: 权限类型，如 camera, microphone, file, location, notification
verify_actions: true
verifyDifficulty:
  uia: medium
  ocr: high
  vlm: low
toolWhitelist:
  - screenshot
  - ocr_locate
  - ocr_read
  - record_evidence
  - click
  - wait
  - finished
---

# 处理权限拒绝

## 功能说明
- 检测权限拒绝弹窗或提示
- 记录权限拒绝证据
- 尝试提供替代方案或建议用户手动授权

## 权限类型

### 摄像头权限 (camera)
- 常见场景：视频会议、扫码、拍照
- 拒绝时的替代方案：跳过功能、使用已有图片

### 麦克风权限 (microphone)
- 常见场景：语音通话、语音输入
- 拒绝时的替代方案：使用文字输入

### 文件权限 (file)
- 常见场景：文件上传、导出、附件操作
- 拒绝时的替代方案：提示用户手动选择文件

### 位置权限 (location)
- 常见场景：签到、定位分享
- 拒绝时的替代方案：使用默认位置、手动输入地址

### 通知权限 (notification)
- 常见场景：消息推送、提醒
- 拒绝时的替代方案：定期检查消息列表

## 处理流程

### 步骤1：识别权限拒绝
- 使用OCR识别"权限"、"拒绝"、"无法访问"等关键词
- 识别权限类型和影响的功能

### 步骤2：记录证据
- 使用 `record_evidence` 记录权限拒绝事件
- 包含截图和权限类型信息

### 步骤3：尝试解决方案
- 根据权限类型尝试替代操作
- 如无法继续，提示用户手动授权

### 步骤4：标记任务状态
- 成功：权限问题已解决或绕过
- 失败：需要用户手动干预

## 完成判据
- 权限问题已解决或记录
- 任务可以继续执行或已优雅降级
- 已记录完整的权限拒绝证据

## 常见陷阱
- 权限弹窗可能在操作过程中随时出现
- 某些功能在权限拒绝后可能完全不可用
- 权限设置可能需要跳转到系统设置页面
- 多次权限拒绝可能导致应用行为变化

## 工具使用建议
- 使用 `ocr_locate` 识别权限弹窗内容
- 使用 `record_evidence` 记录权限拒绝事件
- 使用 `screenshot` 捕获权限弹窗作为证据
- 使用 `click` 尝试关闭弹窗或选择替代选项