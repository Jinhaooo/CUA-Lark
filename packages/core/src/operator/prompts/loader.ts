import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';

export function loadPrompt(templateName: 'intent' | 'result'): string {
  const pkgDir = dirname(resolve(__dirname, '../'));
  const promptPath = resolve(pkgDir, 'prompts', `${templateName}.md`);
  
  try {
    return readFileSync(promptPath, 'utf-8');
  } catch {
    return getFallbackPrompt(templateName);
  }
}

function getFallbackPrompt(templateName: 'intent' | 'result'): string {
  if (templateName === 'intent') {
    return `你是飞书桌面 UI 自动化测试的视觉验证助手。

下面是 GUIAgent 即将执行的一个 action。请判断该 action 的目标元素是否在截图中**唯一可见且与描述一致**。

== Action 描述 ==
- action_type: \${action_type}
- action_inputs: \${action_inputs_json}
- VLM 思考链: \${thought}

== 当前截图 ==
（image attached）

请以 JSON 格式回复，不要任何其他文字：
{
  "uniquely_visible": <true|false>,
  "confidence": <0.0–1.0>,
  "reasoning": "<解释>"
}`;
  }
  
  return `你是飞书桌面 UI 自动化测试的视觉验证助手。

下面是 GUIAgent 刚执行的一个 action。请通过对比 before/after 截图，判断 UI 是否发生了**预期的变化**。

== Action 描述 ==
- action_type: \${action_type}
- action_inputs: \${action_inputs_json}
- VLM 思考链: \${thought}

== Before 截图 ==
（image 1 attached）

== After 截图 ==
（image 2 attached）

请以 JSON 格式回复，不要任何其他文字：
{
  "as_expected": <true|false>,
  "confidence": <0.0–1.0>,
  "reasoning": "<解释>"
}`;
}

export function replacePromptVariables(prompt: string, variables: Record<string, string>): string {
  let result = prompt;
  for (const [key, value] of Object.entries(variables)) {
    const pattern = '${' + key + '}';
    result = result.split(pattern).join(value);
  }
  return result;
}