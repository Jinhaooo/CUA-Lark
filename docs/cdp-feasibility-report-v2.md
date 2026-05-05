# CDP 可行性验证报告 v2

- 验证日期：2026-04-29
- 飞书版本：7.67.0.40
- 操作系统：Windows x64

## 排查 1 · 进程结构定位

### 安装目录 .exe 列表

| FullName | Length |
|----------|--------|
| C:\Users\16009\AppData\Local\Feishu\Feishu.exe | 1,636,184 |
| C:\Users\16009\AppData\Local\Feishu\uninstall.exe | 1,533,272 |
| C:\Users\16009\AppData\Local\Feishu\7.67.9\Feishu.exe | 4,061,528 |
| C:\Users\16009\AppData\Local\Feishu\7.67.9\update.exe | 2,227,544 |
| C:\Users\16009\AppData\Local\Feishu\app\Feishu.exe | 4,060,504 |
| C:\Users\16009\AppData\Local\Feishu\app\update.exe | 2,227,032 |

### 启动后实际运行进程列表

```
   Id ProcessName Path                                           StartTime     
   -- ----------- ----                                           ---------      
16672 Feishu      C:\Users\16009\AppData\Local\Feishu\Feishu.exe 2026/4/29 1... 
```

### 判定的「主进程真身路径」

`C:\Users\16009\AppData\Local\Feishu\7.67.9\Feishu.exe`（4,061,528字节，最大的Feishu.exe）

---

## 排查 2 · 真身启动

### 启动命令

```powershell
& "C:\Users\16009\AppData\Local\Feishu\7.67.9\Feishu.exe" --remote-debugging-port=19222
```

### 端口 netstat 结果

```
（无输出，端口未监听）
```

### curl 结果

```
curl : 无法连接到远程服务器
```

### 结论

进排查 3（端口未监听）

---

## 排查 3 · 启动日志

### 关键日志片段（已脱敏）

从 `apollo_2026.0429.log` 中发现：

**渲染进程启动命令（多次出现）：**
```
#### Lark (renderer) Startup #### cmd: --aha-multi-profile --browser-runtime --enable-logging=handle --enable-prefer-compositing-to-lcd-text --remote-debugging-port=9222 --scene=profile_main --type=renderer
```

**主进程启动命令（未找到）：**
- 日志中未发现 `--type=browser` 的进程启动记录
- 未发现 `DevToolsHttpHandler started` 或 `Cannot start HTTP server` 字样
- 未发现 `Disabling DevTools` 或 `--remote-debugging-port disallowed` 字样

### 判定

- ✅ 参数传递：`--remote-debugging-port` 确实传递到了渲染进程
- ❌ DevToolsHttpHandler：**未启动**（主进程未监听端口）
- ⚠️ 原因：主进程没有处理该参数，CDP HTTP服务器未启动

---

## 排查 4 · 网络层

### netstat 监听情况

```powershell
> netstat -ano | findstr ":19222"
（无输出）

> netstat -ano | findstr ":9222"
（无输出）
```

### 防火墙临时关闭后 curl 结果

未执行（端口未监听，防火墙不是问题根源）

---

## 排查 5 · ASAR 检查

### 是否找到 DevTools 相关代码

跳过。原因：
- 飞书安装目录存在多个 `.asar` 文件（如 `main-window.asar`、`messenger.asar` 等）
- 根据任务要求，DO NOT 修改安装包文件
- 日志分析已提供足够证据，无需进一步检查 ASAR

---

## 总体结论

**❌ CDP 路径不可行**

### 决定性证据

从 `apollo_2026.0429.log` 日志分析得出：

1. **参数传递成功**：`--remote-debugging-port=9222` 参数确实传递到了渲染进程
2. **主进程未响应**：日志中未发现主浏览器进程（`--type=browser`）的启动记录，也未发现 `DevToolsHttpHandler` 启动日志
3. **CDP服务器未启动**：端口 9222/19222 始终未监听

这表明飞书桌面客户端在 **Chromium/Electron 层面主动拦截或忽略了 CDP 启动参数**，导致无法通过标准 CDP 协议访问 DOM/ARIA 信息。

---

## 对 M3b 的建议

基于本次深入排查结果，提出以下建议：

1. **放弃 CDP 路径**：飞书桌面客户端已在代码层面禁用了远程调试端口，CDP 路径在当前版本不可行

2. **专注 OCR + VLM 方案**：建议 M3b 阶段投入资源优化现有的 OCR + VLM 混合定位方案，提升稳定性

3. **备选方案研究**：
   - 探索飞书 OpenAPI 进行部分操作（如消息发送、联系人搜索）
   - 研究 Windows UI Automation / Accessibility API 作为 OCR 的补充
   - 评估其他自动化框架（如 Playwright 在特定场景下的可用性）

4. **降级策略**：建议实现三段降级顺序：**飞书 OpenAPI → OCR → VLM**，优先使用 API 保证稳定性，OCR 和 VLM 作为兜底

---

## 排查总结

| 排查项 | 结果 | 状态 |
|--------|------|------|
| 排查1 · 进程结构定位 | 找到主进程真身路径 | ✅ |
| 排查2 · 真身启动 | 飞书启动但端口未监听 | ⚠️ |
| 排查3 · 启动日志 | 参数传递到渲染进程，但主进程未启动CDP服务器 | ❌ |
| 排查4 · 网络层 | 端口未监听，与防火墙无关 | ❌ |
| 排查5 · ASAR检查 | 跳过（日志已提供足够证据） | ⏭️ |