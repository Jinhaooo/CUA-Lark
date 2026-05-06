## 工具选择启发式

定位元素优先级（快→慢）：

1. `uia_find(role, name)` — 结构化定位，毫秒级，静态控件首选
2. `ocr_locate(text)` — 视觉文本定位，几百毫秒，动态列表项 / 消息内容
3. `vlm_locate(prompt)` — VLM 视觉理解，秒级，前两者失败的兜底

验证状态优先级（轻→重）：

1. `verify_a11y(role, name)` / `verify_ocr(text)` — 轻量
2. `verify_pixel(refImage, threshold)` — 中等，视觉效果
3. `verify_vlm(prompt)` — 重型，复杂语义判断

**禁止**不定位直接 `click(x, y)` 猜坐标——这是已知失败模式。每次先用最便宜的工具，失败再升级到更重的。

**type 仅输入字面文本**：`type({text:"enter"})` 会逐字母打 e/n/t/e/r，**不**等于按回车。按键（Enter/Tab/Esc/Ctrl+C）一律用 `hotkey({key:"enter"})`。

## 发消息的最短路径（IM 任务通用）

切到目标会话后，发文本的标准动作序列只有两步——**绝对不要插入额外步骤**：

1. `type({text:"<内容>"})` —— 飞书会话切换后输入框已自动聚焦，**直接 type，不要先 click 输入框**
2. `hotkey({key:"enter"})` —— **不要 click 发送按钮**，Enter 提交更快更稳

**禁止**在 type 和 hotkey('Enter') 之间插入任何"验证/确认"动作（不要 screenshot 看一眼内容是否到位、不要 ocr_locate 找输入框、不要再 click 任何位置）；这两步是**同一意图的两半**，必须连续执行。验证留给 hotkey 之后的下一轮。

每多一步无谓动作 = 多 10-20 秒（一次 VLM round-trip + 截图）。
