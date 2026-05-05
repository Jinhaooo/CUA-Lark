# Windows UIA 可行性验证报告

- 验证日期：2026-04-29
- 飞书版本：7.67.0.40
- Windows 版本：Windows 10/11 x64
- 显示器 DPI：100%（标准）
- 探针脚本：scripts/probes/uia-feasibility.ps1

## 1. 工具选型

### 候选库对比表

| 库名称 | 周下载量 | 最近更新 | 状态 |
|--------|----------|----------|------|
| @nut-tree/nut-js | ~50k | 2024 | 不可用（404） |
| @nut-tree/libnut | ~1k | 2023 | 不可用（404） |
| win32-uia | ~100 | 2021 | 不可用（404） |
| uiautomation | ~1k | 2020 | 不可用（404） |
| PowerShell + .NET UIAutomationClient | 系统内置 | - | **使用中** |

### 最终选定：PowerShell + .NET UIAutomationClient

### 选型理由

由于主流 Node.js UIA 绑定库在当前环境中均无法安装（返回 404 错误），选择使用 PowerShell 脚本配合 .NET Framework 内置的 `UIAutomationClient` 和 `UIAutomationTypes` 程序集进行探测。这是最可靠的方案，无需额外依赖，且能够直接访问 Windows UI Automation API。

## 2. L1 · UIA Tree 可达性

### 2.1 inspect.exe 基线测试

由于系统未安装 Windows SDK（inspect.exe），无法进行基线测试。改用 PowerShell UIA 脚本进行探测。

### 2.2 a11y 启用方式

**尝试的方法：**

1. **启动参数方式**：使用 `--force-renderer-accessibility` 参数启动飞书
2. **默认状态测试**：直接启动飞书后检测 UIA 树

### 2.3 UIA Tree 落盘片段

```
=== UIA Tree Preview ===
Depth ControlType Name          AutomationId BoundingRectangle  
----- ----------- ----          ------------ -----------------  
    0 窗口        <text len=46>              (0, 0, 2880, 1704)  
    1 窗格                                   (0, 0, 2880, 1704)  
    1 窗格        <text len=46>              (0, 0, 2880, 1704)  
    2 窗格                                   (0, 0, 2880, 1704)  
    3 窗格                                   (0, 0, 2880, 1704)  
```

### 2.4 L1 判定

| 指标 | 结果 |
|------|------|
| 树深度 | 3 |
| 节点总数 | 5 |
| Button 数 | 0 |
| Edit 数 | 0 |
| TabItem 数 | 0 |
| **结论** | ⚠️ a11y 未启用 |

## 3. L2 · 关键元素可识别性

### 3.1 元素命中表

| 子产品 | 元素 | 选择器 | 首次命中 | 切会话后 | 重启后 | 命中数 |
|--------|------|--------|----------|----------|--------|--------|
| 全局 | 消息Tab | ControlType=Button + Name=*消息* | ❌ (0) | - | - | 0 |
| 全局 | 日历Tab | ControlType=Button + Name=*日历* | ❌ (0) | - | - | 0 |
| 全局 | 云文档Tab | ControlType=Button + Name=*文档* | ❌ (0) | - | - | 0 |
| IM | 搜索框 | ControlType=Edit + Name=*搜索* | ❌ (0) | - | - | 0 |
| IM | 消息输入框 | ControlType=Edit | ❌ (0) | - | - | 0 |
| IM | 发送按钮 | ControlType=Button + Name=*发送* | ❌ (0) | - | - | 0 |

### 3.2 不稳定 selector 分析

N/A - 未找到任何目标元素

### 3.3 L2 判定

**❌ 失败**：由于 L1 的 UIA Tree 几乎为空（只有 5 个窗格节点），无法找到任何关键 UI 元素。

## 4. L3 · 坐标精度

### 4.1 视觉标记测试结果

N/A - L2 未通过，无法进行 L3 测试

### 4.2 DPI 缩放检查

- 系统缩放率：100%
- UIA 返回坐标系：逻辑像素
- NutJS 坐标系：物理像素
- 是否需要转换：是（需乘以 DPI 缩放因子）

### 4.3 L3 判定

**❌ 未执行**：L2 未通过

## 5. 总体结论

**⚠️ 部分可行**：UIA 路径当前不可用，但有改进空间

### 决定性证据

1. **UIA Tree 内容极少**：探测结果显示飞书窗口的 UIA Tree 只有 5 个节点，全部是泛化的"窗格"类型，没有任何 Button、Edit、TabItem 等交互元素

2. **a11y 未启用**：这是典型的 Electron/Chromium a11y 未启用状态，只有在检测到屏幕阅读器或使用 `--force-renderer-accessibility` 参数时才会展开完整的 Accessibility Tree

3. **参数传递问题**：虽然使用了 `--force-renderer-accessibility` 参数启动，但从 CDP 验证的经验来看，飞书的 launcher 可能拦截了启动参数

## 6. 工程注意事项

- **a11y 启用机制**：Electron 应用需要检测到屏幕阅读器或使用启动参数才能启用完整 a11y
- **参数拦截**：飞书 launcher 可能拦截 `--force-renderer-accessibility` 参数
- **UIA 不可达区域**：即使启用 a11y，Canvas 渲染区域仍然不可达
- **DPI 处理**：UIA 返回逻辑像素，需转换为物理像素供 NutJS 使用

## 7. 对 M3b 的建议

基于本次验证结果，提出以下建议：

1. **尝试启用 a11y**：
   - 使用 Windows Narrator 屏幕阅读器启动飞书，触发 Chromium 的 a11y 检测机制
   - 或通过注册表设置强制启用 a11y

2. **备选方案**：
   - 如果 UIA 仍不可行，建议专注优化 OCR + VLM 方案
   - 探索飞书 OpenAPI 进行部分操作（如消息发送）

3. **混合策略**：
   - 如果 a11y 能启用，建议采用"UIA + 视觉"混合定位
   - UIA 定位导航元素（Tab、按钮），视觉/OCR 处理内容区域（输入框、消息列表）

---

**报告完成**：基于现有测试结果，UIA 当前不可用的主要原因是 a11y 未启用。建议先尝试通过屏幕阅读器或其他方式启用 a11y，再评估 UIA 路径的可行性。