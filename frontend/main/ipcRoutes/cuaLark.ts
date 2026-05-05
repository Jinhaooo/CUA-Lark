/**
 * cua-lark · 前端同学在 UI-TARS-desktop renderer 上新增的 6 个 IPC routes.
 *
 * Phase 2 实装策略：
 *   - listSkillFiles / upsertSkillFile / deleteSkillFile
 *       → 用 ElectronStore 持久化用户自定义 skill（独立于 cua-lark backend
 *         的 SKILL.md 文件系统；D29「不允许 IPC 写后端 SKILL.md」依然成立）。
 *   - answerQuestion / parseSkillDraft
 *       → 直接调用 OpenAI 兼容协议的 LLM（取 SettingStore 已配置的 VLM/LLM
 *         credentials），与 cua-lark backend 解耦。
 *   - createAutoSkillFromSummary
 *       → spec D30 不实施 auto skill mining，**永久 stub** + log warn.
 */
import { OpenAI } from 'openai';
import ElectronStore from 'electron-store';
import { initIpc } from '@ui-tars/electron-ipc/main';
import { logger } from '../logger';
import { SettingStore } from '../store/setting';

const t = initIpc.create();

/* ===== 类型 ===== */

// 与前端 store/skills.ts SkillItem 形状对齐（用 any 避开 SkillAttachment / SkillTestCase 跨边界重定义）
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type SkillItemShape = any;

/** listSkillFiles 返回包装：renderer 通过 record.skill 取 */
export interface SkillFileRecord {
  skill: SkillItemShape;
}

export interface SkillDraftInput {
  name: string;
  materialsMarkdown: string;
  instruction?: string;
}

/* ===== 持久化：ElectronStore ===== */

interface UserSkillsStore {
  skills: SkillItemShape[];
}

let userSkillsStoreSingleton: ElectronStore<UserSkillsStore> | null = null;

function getUserSkillsStore(): ElectronStore<UserSkillsStore> {
  if (!userSkillsStoreSingleton) {
    userSkillsStoreSingleton = new ElectronStore<UserSkillsStore>({
      name: 'cua_lark.user_skills',
      defaults: { skills: [] },
    });
  }
  return userSkillsStoreSingleton;
}

/* ===== LLM 客户端：复用 SettingStore 已配置的 VLM credentials ===== */

function getLlmClient(): { openai: OpenAI; model: string } | null {
  const settings = SettingStore.getStore();
  if (!settings.vlmBaseUrl || !settings.vlmApiKey || !settings.vlmModelName) {
    return null;
  }
  return {
    openai: new OpenAI({
      baseURL: settings.vlmBaseUrl,
      apiKey: settings.vlmApiKey,
    }),
    model: settings.vlmModelName,
  };
}

/* ===== 路由实现 ===== */

export const cuaLarkRoute = t.router({
  /**
   * answerQuestion · 轻量 LLM Q&A（不触发 GUI）
   * 直连 SettingStore 配置的 VLM 端点的 chat.completions（不走 cua-lark backend）。
   */
  answerQuestion: t.procedure
    .input<{ question: string }>()
    .handle(async ({ input }) => {
      const client = getLlmClient();
      if (!client) {
        return '请先在「设置」中配置 VLM (baseUrl / apiKey / modelName)。';
      }
      try {
        const res = await client.openai.chat.completions.create({
          model: client.model,
          messages: [
            {
              role: 'system',
              content:
                '你是 CUA-Lark 助手。回答用户问题时简洁直接，避免输出 GUI 操作步骤（用户的问题已被判定为不需要 CUA 执行）。',
            },
            { role: 'user', content: input.question },
          ],
          stream: false,
          temperature: 0.3,
        });
        return res.choices[0]?.message?.content || '（无回复）';
      } catch (err) {
        logger.warn('[cuaLark.answerQuestion] LLM call failed:', err);
        const msg = err instanceof Error ? err.message : String(err);
        return `LLM 调用失败：${msg}`;
      }
    }),

  /**
   * listSkillFiles · 列出用户 skill（从 ElectronStore）
   * cua-lark backend 的 built-in SKILL.md 是只读的、被 HarnessLoop 消费，不在此处暴露。
   */
  listSkillFiles: t.procedure.input<void>().handle(async () => {
    const store = getUserSkillsStore();
    const skills = store.get('skills', []);
    return skills.map((skill) => ({ skill })) as SkillFileRecord[];
  }),

  /**
   * upsertSkillFile · 写入/更新用户 skill
   * 用 ElectronStore 按 id upsert；DO NOT 写 cua-lark backend 的 SKILL.md（D29）。
   */
  upsertSkillFile: t.procedure
    .input<{ skill: SkillItemShape }>()
    .handle(async ({ input }) => {
      const skill = input?.skill;
      if (!skill || !skill.id) {
        logger.warn('[cuaLark.upsertSkillFile] missing skill.id, skip');
        return;
      }
      const store = getUserSkillsStore();
      const skills = store.get('skills', []) as SkillItemShape[];
      const idx = skills.findIndex((s: SkillItemShape) => s.id === skill.id);
      if (idx >= 0) {
        skills[idx] = { ...skill, updatedAt: Date.now() };
      } else {
        skills.unshift({ ...skill, createdAt: skill.createdAt || Date.now(), updatedAt: Date.now() });
      }
      store.set('skills', skills);
      logger.info('[cuaLark.upsertSkillFile] saved:', skill.id, skill.name);
    }),

  /**
   * deleteSkillFile · 删除用户 skill
   */
  deleteSkillFile: t.procedure
    .input<{ id: string }>()
    .handle(async ({ input }) => {
      if (!input?.id) {
        logger.warn('[cuaLark.deleteSkillFile] missing id, skip');
        return;
      }
      const store = getUserSkillsStore();
      const skills = store.get('skills', []) as SkillItemShape[];
      const next = skills.filter((s: SkillItemShape) => s.id !== input.id);
      store.set('skills', next);
      logger.info('[cuaLark.deleteSkillFile] deleted:', input.id);
    }),

  /**
   * parseSkillDraft · 把上传材料/录屏 markdown 解析为 skill 草稿（content 字符串）
   */
  parseSkillDraft: t.procedure
    .input<SkillDraftInput>()
    .handle(async ({ input }): Promise<string> => {
      const client = getLlmClient();
      if (!client) {
        return '';
      }
      try {
        const userPrompt = [
          `请基于下面的资料为「${input.name || '未命名技能'}」写一份 SKILL.md 内容（仅 markdown 正文，不要 frontmatter）。`,
          '正文需含 4 个段落：',
          '1. 任务目标 — 一句话',
          '2. 完成判据 — 何时调 finished(true) / finished(false)',
          '3. 工具使用建议 — 列出关键步骤与推荐工具',
          '4. 常见陷阱 — 列出已知边角场景',
          '',
          input.instruction ? `用户补充指令：${input.instruction}` : '',
          '',
          '资料 markdown：',
          input.materialsMarkdown.slice(0, 8000),
        ]
          .filter(Boolean)
          .join('\n');

        const res = await client.openai.chat.completions.create({
          model: client.model,
          messages: [
            {
              role: 'system',
              content:
                '你是 CUA-Lark 技能编辑助手。基于用户提供的资料生成 SKILL.md 草稿。只输出 markdown 正文。',
            },
            { role: 'user', content: userPrompt },
          ],
          stream: false,
          temperature: 0.2,
        });
        return res.choices[0]?.message?.content || '';
      } catch (err) {
        logger.warn('[cuaLark.parseSkillDraft] LLM call failed:', err);
        return '';
      }
    }),

  /**
   * createAutoSkillFromSummary · auto skill mining
   * spec D30 不实施 auto skill mining；永久 no-op。
   */
  createAutoSkillFromSummary: t.procedure
    .input<{ task: string; finalAnswer: string }>()
    .handle(async ({ input }): Promise<SkillItemShape | null> => {
      logger.warn(
        '[cuaLark.createAutoSkillFromSummary] STUB (D30 不实施 auto skill mining):',
        input.task?.slice(0, 40),
      );
      return null;
    }),
});
