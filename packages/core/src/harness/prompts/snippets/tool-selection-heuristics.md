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
