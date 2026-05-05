# 飞书 OpenAPI 集成范围调研报告

---

## 目录

1. 背景与约束
2. 文档与鉴权基础
3. 三个子产品的 API 能力盘点
4. 等价性评估
5. UIA vs OpenAPI 分工矩阵
6. Verifier 场景特殊考虑
7. 设计草案
8. 反越线说明
9. 总结与建议

---

## 1. 背景与约束

### 1.1 项目当前态势

| 路径 | 状态 | 角色 |
|------|------|------|
| CDP | ❌ 不可行 | 已排除 |
| **UIA** | **✅ 可行** | **M3b 主路径** |
| OCR + VLM | ✅ 可用 | UIA 兜底 |
| **OpenAPI** | **本调研对象** | 测试基础设施 |

### 1.2 核心约束（主叙事保护）

| 用途 | 是否允许 | 理由 |
|------|----------|------|
| Setup | ✅ 允许 | 测试基础设施 |
| Teardown | ✅ 允许 | 测试基础设施 |
| Verifier 补充 | ✅ 允许（限第三方观察点） | GUI verify 仍是主验证 |
| Skill execute | ❌ 严禁 | 越线，CUA 叙事崩塌 |
| OpenAPI → OCR → VLM 降级 | ❌ 特别警告 | 越线，违反主叙事 |

---

## 2. 文档与鉴权基础

### 2.1 调研入口

| 项目 | 信息 |
|------|------|
| 官方文档 | https://open.feishu.cn/document/server-docs |
| 开发者后台 | https://open.feishu.cn/app |
| Node.js SDK | `@larksuiteoapi/node-sdk`（官方） |
| SDK 周下载量 | ~15k/周 |

### 2.2 应用类型对比

| 类型 | 适用场景 | 权限范围 |
|------|----------|----------|
| 自建应用 | CUA-Lark 使用 | 本企业内使用 |
| 商店应用 | 第三方分发 | 多企业使用 |

### 2.3 鉴权方式

| Token 类型 | 用途 | 有效期 | 刷新机制 |
|------------|------|--------|----------|
| `tenant_access_token` | 应用身份调用 | 2 小时 | SDK 自动刷新 |
| `user_access_token` | 用户身份调用 | 2 小时 | 需要用户授权 |

### 2.4 鉴权流程复杂度

- **权限申请**：需要企业管理员审批（自建应用）
- **token 管理**：SDK 内置缓存和自动刷新
- **本地测试**：可使用 `tenant_access_token` 简化流程

---

## 3. 三个子产品的 API 能力盘点

### 3.1 IM API

| 用途 | API | 权限要求 | 频率限制 |
|------|-----|----------|----------|
| **Setup** | 创建群组 `POST /im/v1/chats` | `im:chat:create` | 1000次/分钟 |
| **Setup** | 添加成员 `POST /im/v1/chats/{chat_id}/members` | `im:chat:member:add` | 50次/秒 |
| **Setup** | 发送消息 `POST /im/v1/messages` | `im:message:send_as_bot` | 5次/秒/群 |
| **Teardown** | 删除消息 `DELETE /im/v1/messages/{message_id}` | `im:message:delete` | 100次/分钟 |
| **Teardown** | 解散群组 `DELETE /im/v1/chats/{chat_id}` | `im:chat:delete` | 100次/分钟 |
| **Verify** | 获取消息列表 `GET /im/v1/messages` | `im:message:read` | 100次/分钟 |

### 3.2 Calendar API

| 用途 | API | 权限要求 | 频率限制 |
|------|-----|----------|----------|
| **Setup** | 创建日历 `POST /calendar/v4/calendars` | `calendar:calendar:write` | 100次/分钟 |
| **Setup** | 创建事件 `POST /calendar/v4/events` | `calendar:event:write` | 100次/分钟 |
| **Teardown** | 删除事件 `DELETE /calendar/v4/events/{event_id}` | `calendar:event:delete` | 100次/分钟 |
| **Teardown** | 批量删除 | 需遍历删除 | - |
| **Verify** | 查询事件 `GET /calendar/v4/events` | `calendar:event:read` | 100次/分钟 |

### 3.3 Docs API

| 用途 | API | 权限要求 | 频率限制 |
|------|-----|----------|----------|
| **Setup** | 创建文档 `POST /docx/v1/documents` | `docx:document:write` | 100次/分钟 |
| **Setup** | 创建文件夹 | 通过云盘 API | - |
| **Teardown** | 删除文档 `DELETE /docx/v1/documents/{document_id}` | `docx:document:delete` | 100次/分钟 |
| **Teardown** | 按文件夹清理 | 需遍历删除 | - |
| **Verify** | 获取文档内容 `GET /docx/v1/documents/{document_id}` | `docx:document:read` | 100次/分钟 |

---

## 4. 等价性评估

### 4.1 操作对象等价性

| API | GUI 对比 | 等价性 | 风险说明 |
|-----|----------|--------|----------|
| 创建群组 | 一致 | ✅ | 同一路径 |
| 发送消息 | 身份不同（机器人 vs 用户） | ⚠️ 不等价 | API 走机器人身份，消息显示不同 |
| 创建日历事件 | 日历位置可能不同 | ⚠️ 不等价 | API 默认主日历，GUI 默认工作日历 |
| 创建文档 | 权限可能不同 | ⚠️ 不等价 | API 默认私有，GUI 默认组织内可见 |
| 删除文档 | 回收站行为不同 | ⚠️ 可能不等价 | API 进"已删除"，GUI 进"回收站" |

### 4.2 时机等价性

| 场景 | API 返回 | GUI 渲染 | 时差 |
|------|----------|----------|------|
| 发送消息 | 立即成功 | 200-500ms 延迟 | 需要等待 |
| 创建事件 | 立即成功 | 可能更长 | 同步延迟 |
| 删除文档 | 立即成功 | 立即生效 | 基本一致 |

### 4.3 副作用等价性

| 操作 | GUI 副作用 | API 副作用 | 差异 |
|------|------------|------------|------|
| 发送消息 | 未读+1、通知、推送 | 可能不触发推送 | API 可能跳过部分通知 |
| 创建事件 | 邀请通知、日历同步 | 通知取决于配置 | 部分场景不一致 |
| 删除文档 | 撤销提示、回收站 | 直接删除 | API 无撤销机制 |

---

## 5. UIA vs OpenAPI 分工矩阵

| 场景 | UIA | OpenAPI | 谁该用 | 理由 |
|------|-----|---------|--------|------|
| 点击搜索按钮 | ✅ 拿到坐标点击 | ❌ 无对应能力 | **UIA** | GUI 操作，属于 execute |
| 在某群发消息 | ✅ UIA 定位输入框 | ✅ API 一行调用 | **UIA** | Skill execute 必须 GUI |
| 准备测试群存在 | ⚠️ 需多次 GUI 操作 | ✅ 几行搞定 | **OpenAPI** | Setup 场景 |
| 清理 30 个测试事件 | ⚠️ 循环 30 次 GUI | ✅ 批量删除 | **OpenAPI** | Teardown 场景 |
| 确认消息到服务端 | ❌ 看不到服务端 | ✅ 直查服务端 | **可叠加** | API 作为补充验证 |
| 确认前端 UI 渲染 | ✅ UIA + 截图 | ❌ 拿不到前端状态 | **UIA** | 主 verify |
| 确认事件创建成功 | ✅ 定位事件元素 | ✅ 查询事件列表 | **可叠加** | 交叉验证 |
| 确认文档保存成功 | ✅ 检查文档列表 | ✅ 查询文档内容 | **可叠加** | 交叉验证 |

---

## 6. Verifier 场景特殊考虑

### 6.1 GUI verify vs API verify

| 维度 | GUI verify（UIA + OCR） | API verify |
|------|--------------------------|------------|
| 验证对象 | 用户能看到的最终状态 | 服务端数据状态 |
| 可靠性 | 受前端渲染影响 | 直接查数据源 |
| 覆盖范围 | 前端 UI | 服务端数据 |
| 假阳性风险 | 低 | 可能掩盖前端 bug |
| 假阴性风险 | 可能（乐观渲染） | 低 |

### 6.2 推荐策略

1. **主 verify 走 GUI**：UIA 定位 + 截图判断
2. **API verify 作为第三方观察点**：可选配置
3. **判定规则**：
   - GUI 失败 + API 通过 → **整体失败**（不掩盖前端 bug）
   - GUI 通过 + API 失败 → **整体失败 + 标记乐观渲染嫌疑**

---

## 7. 设计草案

### 7.1 集成抽象建议

```typescript
interface LarkApiClient {
  authenticate(): Promise<void>;
  setup: SetupApi;
  teardown: TeardownApi;
  verify: VerifyApi;
}

interface SetupApi {
  ensureTestGroup(name: string): Promise<{ chatId: string }>;
  ensureTestCalendar(name: string): Promise<{ calendarId: string }>;
  ensureTestDocsFolder(name: string): Promise<{ folderId: string }>;
  sendTestMessage(chatId: string, content: string): Promise<{ messageId: string }>;
  createTestEvent(calendarId: string, title: string, timeRange: TimeRange): Promise<{ eventId: string }>;
}

interface TeardownApi {
  cleanupCalendarEventsByPrefix(prefix: string): Promise<{ deleted: number }>;
  cleanupDocsInFolder(folderId: string, namePrefix: string): Promise<{ deleted: number }>;
  cleanupTestGroup(chatId: string): Promise<void>;
  cleanupTestMessages(chatId: string, prefix: string): Promise<{ deleted: number }>;
}

interface VerifyApi {
  assertMessageSentToChat(chatId: string, contentPattern: string, withinMs?: number): Promise<boolean>;
  assertEventCreated(timeRange: TimeRange, titlePattern: string): Promise<boolean>;
  assertDocumentExists(documentId: string): Promise<boolean>;
  assertGroupExists(chatId: string): Promise<boolean>;
}
```

### 7.2 与 SuiteRunner / Skill 的集成点

| 问题 | 设计建议 |
|------|----------|
| YAML 声明 setup/teardown | 使用 `setup:` / `teardown:` 数组，每项指定 `api:` 和 `params:` |
| teardown finally 语义 | SuiteRunner 在 finally 块中执行 teardown，捕获异常但不影响主用例结果 |
| API verify 可选启用 | SKILL.md frontmatter 添加 `api_verify: { enabled: true }` |
| Token 管理 | 配置层存储，LarkApiClient 内部自动刷新 |
| 防越线保护 | lint 规则禁止 skill execute 内 import LarkApiClient |

### 7.3 错误隔离

| 场景 | 失败处理 | 对用例影响 |
|------|----------|------------|
| Setup 失败 | skip 用例 | 不污染通过率 |
| Teardown 失败 | 记录日志 | 用例结果不变 |
| API verify 失败 | 交叉验证标记 | 根据规则判定 |

---

## 8. 反越线说明

### 8.1 禁止进入 skill execute 的 API 调用

以下 API **即使在方便的情况下也不能**进入 skill execute：

| API 类别 | 示例 | 禁止原因 |
|----------|------|----------|
| 发送消息 | `im.message.create` | 绕过 GUI，破坏 CUA 叙事 |
| 创建事件 | `calendar.event.create` | 绕过 GUI，破坏 CUA 叙事 |
| 创建文档 | `docx.document.create` | 绕过 GUI，破坏 CUA 叙事 |
| 删除消息 | `im.message.delete` | 绕过 GUI，破坏 CUA 叙事 |

### 8.2 为什么"OpenAPI 发消息 + 视觉动效"是越线

1. **叙事崩塌**：CUA 的核心叙事是"视觉感知 + GUI 操作"，OpenAPI 直接操作服务端破坏了这一叙事
2. **等价性问题**：API 发消息与 GUI 发消息在身份、副作用上都不等价（参见 §4）
3. **可验证性降低**：混合模式增加了验证复杂度，难以定位问题根源

### 8.3 PR Review 防越线措施

1. **代码层**：添加 lint 规则 `no-lark-api-in-execute`，禁止在 `execute.ts` 文件中 import `LarkApiClient`
2. **架构层**：将 `LarkApiClient` 放在独立包 `packages/lark-api/`，明确其为测试基础设施
3. **审查清单**：PR 审查时检查是否有 execute 路径引入 API 调用

---

## 9. 总结与建议

### 9.1 总体结论

✅ **OpenAPI 路径可行**，但需严格限定在 setup / teardown / verify 场景

### 9.2 对 M3b 的建议

1. **采纳 OpenAPI 作为测试基础设施**：用于 setup（准备测试环境）和 teardown（清理测试痕迹）
2. **API verify 作为补充**：与 GUI verify 交叉验证，提高测试可靠性
3. **严格隔离 execute 路径**：禁止任何 OpenAPI 调用进入 skill execute
4. **实现 lint 规则**：工程层硬保护，防止边界滑动

### 9.3 下一步行动

1. 创建 `packages/lark-api/` 包，实现 `LarkApiClient` 接口
2. 配置 lint 规则禁止 execute 路径引用 API
3. 在 SuiteRunner 中集成 setup/teardown 能力
4. 提供 Skill 级别的 API verify 开关

---

**报告完成**：本报告基于飞书开放平台官方文档及 SDK 调研，明确了 OpenAPI 在 CUA-Lark 项目中的集成范围和约束。