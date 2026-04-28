---
name: _common.dismiss_popup
kind: agent_driven
description: 关闭与测试任务无关的弹窗
params_schema: {}
---

# 关闭无关弹窗

## 功能说明
- 检测当前界面是否存在与测试任务无关的弹窗
- 关闭所有无关弹窗
- 确保界面干净无干扰

## 完成判据
- 截图中无任何模态弹窗
- 界面干净，无干扰元素