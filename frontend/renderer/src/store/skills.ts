import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { nanoid } from 'nanoid/non-secure';

export type SkillScope = 'im' | 'calendar' | 'docs' | 'common' | 'custom';

export type SkillAttachmentKind =
  | 'lark-doc'
  | 'screen-recording'
  | 'image'
  | 'video'
  | 'document';
export type SkillSource = 'manual' | 'upload' | 'agent-summary';

export interface SkillAttachment {
  id: string;
  name: string;
  kind: SkillAttachmentKind;
  size: number;
  type: string;
  uploadedAt: number;
  markdown?: string;
  sourceUrl?: string;
}

export interface SkillTestCase {
  id: string;
  title: string;
  precondition: string;
  steps: string[];
  expectedResult: string;
  priority: 'P0' | 'P1' | 'P2';
}

export interface SkillItem {
  id: string;
  name: string;
  scope: SkillScope;
  scopeName?: string;
  description?: string;
  content?: string;
  enabled: boolean;
  source: SkillSource;
  attachments: SkillAttachment[];
  testCases: SkillTestCase[];
  createdAt: number;
  updatedAt: number;
}

export interface SkillEvent {
  id: string;
  type: 'create' | 'update' | 'delete' | 'supplemental_instruction';
  skillId?: string;
  name: string;
  at: number;
  content?: string;
}

interface SkillState {
  skills: SkillItem[];
  customScopes: string[];
  events: SkillEvent[];
  supplementalInstructions: SkillEvent[];

  setSkills: (skills: SkillItem[]) => void;
  createSkill: (
    input: Pick<
      SkillItem,
      'name' | 'scope' | 'description' | 'content' | 'enabled'
    > &
      Partial<
        Pick<SkillItem, 'scopeName' | 'source' | 'attachments' | 'testCases'>
      >,
  ) => SkillItem;
  updateSkill: (
    id: string,
    updates: Partial<
      Pick<
        SkillItem,
        | 'name'
        | 'scope'
        | 'scopeName'
        | 'description'
        | 'content'
        | 'enabled'
        | 'source'
        | 'attachments'
        | 'testCases'
      >
    >,
  ) => SkillItem | null;
  deleteSkill: (id: string) => SkillItem | null;
  createSkillFromTask: (task: {
    instruction: string;
    summary?: string;
    scope?: SkillScope;
  }) => SkillItem | null;
  addCustomScope: (name: string) => void;
  addSupplementalInstruction: (instruction: string) => void;
  clearEvents: () => void;
}

export const createAttachmentFromFile = (
  file: File,
  kind: SkillAttachmentKind,
) => {
  const extension = file.name.split('.').pop() || 'unknown';
  const markdown = [
    `### ${file.name}`,
    `- 类型：${kind}`,
    `- 文件格式：${file.type || extension}`,
    `- 文件大小：${Math.round(file.size / 1024)}KB`,
    '- 说明：已导入为资料，模型解析时会结合文件名、类型和摘要生成技能草稿。',
  ].join('\n');

  return {
    id: nanoid(),
    name: file.name,
    kind,
    size: file.size,
    type: file.type || 'unknown',
    uploadedAt: Date.now(),
    markdown,
  };
};

export const generateTestCasesFromAttachment = (
  attachment: SkillAttachment,
): SkillTestCase[] => {
  const sourceLabel =
    attachment.kind === 'screen-recording' || attachment.kind === 'video'
      ? '视频/录屏'
      : attachment.kind === 'image'
        ? '图片'
        : attachment.kind === 'lark-doc'
          ? '飞书文档'
          : '文档';
  const featureName = attachment.name.replace(/\.[^.]+$/, '');

  return [
    {
      id: nanoid(),
      title: `验证${featureName}主流程可完成`,
      precondition: `已上传${sourceLabel}：${attachment.name}`,
      steps: [
        `阅读${sourceLabel}并识别核心入口、关键字段和成功态`,
        '按文档/录屏中的主路径执行一次完整操作',
        '记录关键页面状态、提示文案和结果数据',
      ],
      expectedResult: '主流程可顺利完成，页面反馈与文档/录屏描述一致。',
      priority: 'P0',
    },
    {
      id: nanoid(),
      title: `验证${featureName}异常输入提示`,
      precondition: `已根据${sourceLabel}整理出必填项和边界条件`,
      steps: [
        '保留必填项为空或输入边界值',
        '触发提交/保存/下一步操作',
        '观察错误提示和页面状态是否可恢复',
      ],
      expectedResult: '系统给出清晰错误提示，用户可修改后继续完成任务。',
      priority: 'P1',
    },
  ];
};

export const useSkillStore = create<SkillState>()(
  persist(
    (set, get) => ({
      skills: [],
      customScopes: [],
      events: [],
      supplementalInstructions: [],

      setSkills: (skills) => {
        set({ skills });
      },

      createSkill: (input) => {
        const now = Date.now();
        const skill: SkillItem = {
          id: nanoid(),
          name: input.name.trim(),
          scope: input.scope,
          scopeName: input.scopeName?.trim() || undefined,
          description: input.description?.trim() || undefined,
          content: input.content?.trim() || undefined,
          enabled: input.enabled,
          source: input.source || 'manual',
          attachments: input.attachments || [],
          testCases: input.testCases || [],
          createdAt: now,
          updatedAt: now,
        };
        set((s) => ({
          skills: [skill, ...s.skills],
          events: [
            {
              id: nanoid(),
              type: 'create',
              skillId: skill.id,
              name: skill.name,
              at: now,
            },
            ...s.events,
          ],
        }));
        return skill;
      },

      updateSkill: (id, updates) => {
        const now = Date.now();
        const prev = get().skills.find((s) => s.id === id);
        if (!prev) return null;
        const nextName = (updates.name ?? prev.name).trim();
        const nextSkill: SkillItem = {
          ...prev,
          ...updates,
          name: nextName,
          scopeName:
            updates.scopeName !== undefined
              ? updates.scopeName.trim() || undefined
              : prev.scopeName,
          description:
            updates.description !== undefined
              ? updates.description.trim() || undefined
              : prev.description,
          content:
            updates.content !== undefined
              ? updates.content.trim() || undefined
              : prev.content,
          enabled: updates.enabled ?? prev.enabled,
          source: updates.source ?? prev.source,
          attachments: updates.attachments ?? prev.attachments,
          testCases: updates.testCases ?? prev.testCases,
          updatedAt: now,
        };
        set((s) => ({
          skills: s.skills.map((item) => (item.id === id ? nextSkill : item)),
          events: [
            {
              id: nanoid(),
              type: 'update',
              skillId: id,
              name: nextName,
              at: now,
            },
            ...s.events,
          ],
        }));
        return nextSkill;
      },

      deleteSkill: (id) => {
        const now = Date.now();
        const prev = get().skills.find((s) => s.id === id);
        if (!prev) return null;
        set((s) => ({
          skills: s.skills.filter((item) => item.id !== id),
          events: [
            {
              id: nanoid(),
              type: 'delete',
              skillId: id,
              name: prev.name,
              at: now,
            },
            ...s.events,
          ],
        }));
        return prev;
      },

      createSkillFromTask: ({ instruction, summary, scope = 'custom' }) => {
        const trimmedInstruction = instruction.trim();
        if (!trimmedInstruction) return null;
        return get().createSkill({
          name: `任务技能：${trimmedInstruction.slice(0, 24)}`,
          scope,
          description: summary || '由对话任务自动沉淀的技能草稿',
          content: [
            '## 触发场景',
            trimmedInstruction,
            '',
            '## Agent 总结',
            summary ||
              '请在技能库中补充该任务的稳定操作步骤、输入约束和验收标准。',
          ].join('\n'),
          enabled: false,
          source: 'agent-summary',
        });
      },

      addCustomScope: (name) => {
        const scopeName = name.trim();
        if (!scopeName) return;
        set((s) => {
          if (s.customScopes.includes(scopeName)) return s;
          return {
            customScopes: [...s.customScopes, scopeName],
          };
        });
      },

      addSupplementalInstruction: (instruction) => {
        const content = instruction.trim();
        if (!content) return;
        const now = Date.now();
        const event: SkillEvent = {
          id: nanoid(),
          type: 'supplemental_instruction',
          name: '运行中补充指令',
          content,
          at: now,
        };
        set((s) => ({
          supplementalInstructions: [event, ...s.supplementalInstructions],
          events: [event, ...s.events],
        }));
      },

      clearEvents: () => set({ events: [] }),
    }),
    {
      name: 'cua-lark-skill-store',
      partialize: (s) => ({
        skills: s.skills,
        customScopes: s.customScopes,
        events: s.events,
        supplementalInstructions: s.supplementalInstructions,
      }),
    },
  ),
);
