import { memo, useEffect, useMemo, useRef, useState } from 'react';
import {
  FileText,
  Image as ImageIcon,
  Link2,
  Pencil,
  Plus,
  Trash2,
  Video,
  Wand2,
  X,
} from 'lucide-react';

import { Button } from '@renderer/components/ui/button';
import { api } from '@renderer/api';
import { Card } from '@renderer/components/ui/card';
import { Input } from '@renderer/components/ui/input';
import { Label } from '@renderer/components/ui/label';
import { Switch } from '@renderer/components/ui/switch';
import { Textarea } from '@renderer/components/ui/textarea';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@renderer/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@renderer/components/ui/select';
import { useSession } from '@renderer/hooks/useSession';
import {
  createAttachmentFromFile,
  useSkillStore,
  type SkillAttachment,
  type SkillItem,
  type SkillScope,
  type SkillTestCase,
} from '@renderer/store/skills';

const scopeLabel: Record<SkillScope, string> = {
  common: '通用',
  docs: '云文档',
  calendar: '日历',
  im: 'IM/消息',
  custom: '未分组',
};

const builtInScopeOptions: Array<{ value: SkillScope; label: string }> = [
  { value: 'common', label: scopeLabel.common },
  { value: 'docs', label: scopeLabel.docs },
  { value: 'calendar', label: scopeLabel.calendar },
  { value: 'im', label: scopeLabel.im },
];

const ADD_SCOPE_VALUE = '__add_scope__';
const MAX_SKILL_NAME_LENGTH = 10;
const MAX_VIDEO_SIZE = 500 * 1024 * 1024;
const MOCK_LARK_DOC_NAME = '智能助手PRD';

function limitSkillName(name: string) {
  return Array.from(name).slice(0, MAX_SKILL_NAME_LENGTH).join('');
}

function inferAttachmentKind(file: File): SkillAttachment['kind'] {
  if (file.type.startsWith('image/')) return 'image';
  if (file.type.startsWith('video/')) return 'video';
  return 'document';
}

function getAttachmentLabel(kind: SkillAttachment['kind']) {
  if (kind === 'screen-recording' || kind === 'video') return '视频';
  if (kind === 'image') return '图片';
  if (kind === 'lark-doc') return '飞书文档';
  return '文档';
}

async function createMarkdownAttachmentFromFile(file: File) {
  const kind = inferAttachmentKind(file);
  const attachment = createAttachmentFromFile(file, kind);
  const isReadableText =
    file.type.startsWith('text/') ||
    /\.(md|txt|json|html|csv)$/i.test(file.name);
  const textPreview = isReadableText
    ? (await file.text()).slice(0, 4000)
    : '';

  return {
    ...attachment,
    markdown: [
      `## ${getAttachmentLabel(kind)}：${file.name}`,
      '',
      `- 文件类型：${file.type || file.name.split('.').pop() || 'unknown'}`,
      `- 上传时间：${new Date(attachment.uploadedAt).toLocaleString()}`,
      '',
      textPreview ? '### 文件内容预览' : '### 文件说明',
      textPreview ||
        '该文件已作为资料导入。模型解析技能时会结合文件名、类型和可用摘要进行判断。',
    ].join('\n'),
  };
}

function createMockLarkDocAttachment(): SkillAttachment {
  const now = Date.now();
  return {
    id: `mock-lark-doc-${now}`,
    name: MOCK_LARK_DOC_NAME,
    kind: 'lark-doc',
    size: 0,
    type: 'lark/docx',
    uploadedAt: now,
    sourceUrl: 'https://feishu.example/docx/smart-assistant-prd',
    markdown: [
      `## 飞书云文档：${MOCK_LARK_DOC_NAME}`,
      '',
      '- 文档类型：产品需求文档 PRD',
      '- 来源：模拟飞书云文档',
      '- 目标：描述智能助手在飞书桌面端中的入口、悬浮窗、全屏对话和技能管理能力。',
      '',
      '### 核心需求',
      '- 支持从飞书桌面端悬浮入口唤起 Lark-CUA。',
      '- 支持纯问答与电脑操作任务的意图识别。',
      '- 支持导入资料并沉淀为可复用技能。',
    ].join('\n'),
  };
}

type FormState = {
  name: string;
  scope: SkillScope;
  scopeName: string;
  description: string;
  content: string;
  enabled: boolean;
  attachments: SkillAttachment[];
  testCases: SkillTestCase[];
};

function createSkillContentTemplate(name = '新技能') {
  return [
    `# ${name || '新技能'}`,
    '',
    '## 触发场景',
    '- 用户提出什么任务时应该调用这个技能？',
    '',
    '## 输入信息',
    '- 需要用户提供哪些信息？',
    '',
    '## 执行步骤',
    '1. ',
    '2. ',
    '3. ',
    '',
    '## 验收标准',
    '- 如何判断任务已经完成？',
    '',
    '## 注意事项',
    '- 哪些边界条件需要避免？',
  ].join('\n');
}

function normalizeForm(s?: SkillItem | null): FormState {
  return {
    name: limitSkillName(s?.name || ''),
    scope:
      s?.scope === 'custom' && !s.scopeName ? 'common' : s?.scope || 'common',
    scopeName: s?.scopeName || '',
    description: s?.description || '',
    content: s?.content || createSkillContentTemplate(s?.name),
    enabled: s?.enabled ?? true,
    attachments: s?.attachments || [],
    testCases: s?.testCases || [],
  };
}

function isDefaultTemplate(content: string) {
  return content.trim() === createSkillContentTemplate().trim();
}

function getSkillScopeLabel(skill: SkillItem) {
  return skill.scope === 'custom' && skill.scopeName
    ? skill.scopeName
    : scopeLabel[skill.scope];
}

export const SkillLibraryDialog = memo(function SkillLibraryDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const {
    skills,
    customScopes,
    createSkill,
    updateSkill,
    deleteSkill,
    addCustomScope,
    setSkills,
  } = useSkillStore();
  const { currentSessionId, chatMessages, updateMessages } = useSession();

  const [mode, setMode] = useState<'create' | 'edit' | 'preview'>('create');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(() => normalizeForm(null));
  const [addingScope, setAddingScope] = useState(false);
  const [newScopeName, setNewScopeName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [parsingDraft, setParsingDraft] = useState(false);
  const [draftContent, setDraftContent] = useState('');
  const [materialInstruction, setMaterialInstruction] = useState('');
  const [draftDialogOpen, setDraftDialogOpen] = useState(false);
  const docInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);

  const editing = useMemo(
    () => (editingId ? skills.find((s) => s.id === editingId) : undefined),
    [editingId, skills],
  );

  useEffect(() => {
    if (!open) return;
    api.listSkillFiles().then((records) => {
      if (records.length) {
        setSkills(records.map((record) => record.skill));
      } else if (skills.length) {
        skills.forEach((skill) => {
          void api.upsertSkillFile({ skill });
        });
      }
    });
  }, [open]);

  const normalizedSkillName = limitSkillName(form.name.trim());
  const skillNameLength = Array.from(form.name).length;
  const canSubmit = normalizedSkillName.length >= 2;

  const customScopeOptions = useMemo(
    () =>
      Array.from(
        new Set([
          ...customScopes,
          ...skills
            .map((skill) => skill.scopeName)
            .filter((name): name is string => !!name),
        ]),
      ),
    [customScopes, skills],
  );

  const scopeValue =
    form.scope === 'custom' && form.scopeName
      ? `custom:${form.scopeName}`
      : form.scope;

  const selectedSkill = useMemo(
    () => (editingId ? skills.find((skill) => skill.id === editingId) : null),
    [editingId, skills],
  );

  const skillFilePreview = useMemo(() => {
    if (!selectedSkill) return '';
    return selectedSkill.content || '暂无技能内容';
  }, [selectedSkill]);

  const materialsMarkdown = useMemo(
    () =>
      form.attachments
        .map((attachment) => attachment.markdown || `## ${attachment.name}`)
        .join('\n\n---\n\n'),
    [form.attachments],
  );

  const appendSkillLog = async (content: string) => {
    if (!currentSessionId) return;
    const now = Date.now();
    await updateMessages(currentSessionId, [
      ...(chatMessages || []),
      {
        from: 'human',
        value: `【技能日志】${content}`,
        timing: {
          start: now,
          end: now,
          cost: 0,
        },
      },
    ]);
  };

  const createCustomScope = () => {
    const scopeName = newScopeName.trim();
    if (!scopeName) return;
    addCustomScope(scopeName);
    setForm((s) => ({ ...s, scope: 'custom', scopeName }));
    setNewScopeName('');
    setAddingScope(false);
  };

  const parseSkillDraft = async (nextMaterialsMarkdown = materialsMarkdown) => {
    if (!nextMaterialsMarkdown.trim() || parsingDraft) return;
    setDraftContent('');
    setDraftDialogOpen(false);
    setParsingDraft(true);
    try {
      const draft = await api.parseSkillDraft({
        name: form.name || '新技能',
        materialsMarkdown: nextMaterialsMarkdown,
        instruction: materialInstruction,
      });
      setDraftContent(draft);
      setDraftDialogOpen(true);
    } finally {
      setParsingDraft(false);
    }
  };

  const handleUpload = async (
    files: FileList | null,
    forcedKind?: SkillAttachment['kind'],
  ) => {
    if (!files?.length) return;
    const incomingFiles = Array.from(files);
    const isVideoUpload =
      forcedKind === 'screen-recording' ||
      incomingFiles.some((file) => file.type.startsWith('video/'));
    const existingCount = form.attachments.filter((attachment) =>
      isVideoUpload
        ? attachment.kind === 'video' || attachment.kind === 'screen-recording'
        : attachment.kind === 'document' || attachment.kind === 'lark-doc',
    ).length;
    const maxCount = 1;
    const remainingCount = Math.max(maxCount - existingCount, 0);

    if (remainingCount <= 0) {
      window.alert(isVideoUpload ? '最多上传 1 个视频' : '最多上传 1 个文档');
      return;
    }

    const validFiles = incomingFiles.slice(0, remainingCount).filter((file) => {
      if (!isVideoUpload) return true;
      if (file.size <= MAX_VIDEO_SIZE) return true;
      window.alert(`${file.name} 超过 500MB，已跳过`);
      return false;
    });
    if (incomingFiles.length > remainingCount) {
      window.alert(isVideoUpload ? '视频最多 1 个' : '文档最多 1 个');
    }
    const attachments = await Promise.all(
      validFiles.map(async (file) => {
        const attachment = await createMarkdownAttachmentFromFile(file);
        return forcedKind ? { ...attachment, kind: forcedKind } : attachment;
      }),
    );
    if (!attachments.length) return;
    setForm((s) => ({
      ...s,
      attachments: [...attachments, ...s.attachments],
    }));
    void appendSkillLog(
      `导入资料 ${attachments
        .map((item) => `「${item.name}」`)
        .join('、')}`,
    );
  };

  const linkMockLarkDoc = () => {
    const attachment = createMockLarkDocAttachment();
    const exists = form.attachments.some(
      (item) => item.kind === 'lark-doc' && item.name === MOCK_LARK_DOC_NAME,
    );
    if (exists) return;
    setForm((s) => ({
      ...s,
      scope: 'docs',
      attachments: [attachment, ...s.attachments],
    }));
    void appendSkillLog(`关联云文档「${MOCK_LARK_DOC_NAME}」`);
  };

  const removeAttachment = (id: string) => {
    setForm((s) => ({
      ...s,
      attachments: s.attachments.filter((item) => item.id !== id),
    }));
    setDraftContent('');
    setDraftDialogOpen(false);
  };

  const closeDialog = () => {
    onOpenChange(false);
    setMode('create');
    setEditingId(null);
    setForm(normalizeForm(null));
    setSubmitting(false);
  };

  if (!open) {
    return null;
  }

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (!next) {
            closeDialog();
            return;
          }
          onOpenChange(next);
        }}
      >
      <DialogContent
        hideCloseButton
        className="grid h-[calc(100vh-2rem)] max-h-[calc(100vh-2rem)] grid-rows-[auto_minmax(0,1fr)] overflow-hidden border-[#dbe6ff] bg-white/95 shadow-[0_24px_80px_rgba(19,61,154,0.16)] backdrop-blur-xl sm:max-w-[900px]"
      >
        <DialogClose asChild disabled={submitting}>
          <button
            type="button"
            className="absolute right-4 top-4 z-30 flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-50"
            style={{ '-webkit-app-region': 'no-drag', pointerEvents: 'auto' }}
            onPointerDown={(event) => event.stopPropagation()}
            aria-label="关闭"
          >
            <X className="h-4 w-4" />
          </button>
        </DialogClose>
        <DialogHeader className="pr-10">
          <DialogTitle>技能管理库</DialogTitle>
        </DialogHeader>

        <div className="grid min-h-0 grid-cols-1 gap-4 overflow-hidden lg:grid-cols-[320px_minmax(0,1fr)]">
          <Card className="flex min-h-0 flex-col overflow-hidden border-[#dbe6ff] bg-white/80 p-4 shadow-[0_18px_48px_rgba(19,61,154,0.08)]">
            <div className="mb-3 flex items-center justify-between">
              <div className="text-sm font-medium">技能列表</div>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  setMode('create');
                  setEditingId(null);
                  setForm(normalizeForm(null));
                }}
              >
                <Plus className="mr-2 h-4 w-4" />
                新建
              </Button>
            </div>

            <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
              {skills.length === 0 ? (
                <div className="text-sm text-muted-foreground">
                  还没有技能。你可以先创建一个“飞书云文档：插入智能配图”等。
                </div>
              ) : (
                skills.map((s) => (
                  <div
                    key={s.id}
                    className="flex cursor-pointer items-start justify-between gap-2 rounded-md border p-3 hover:bg-muted/40"
                    onClick={() => {
                      setMode('preview');
                      setEditingId(s.id);
                      setForm(normalizeForm(s));
                    }}
                  >
                    <div className="min-w-0">
                      <div className="truncate font-medium">{s.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {getSkillScopeLabel(s)}
                        {s.enabled ? ' · 已启用' : ' · 已停用'}
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={(event) => {
                          event.stopPropagation();
                          setMode('edit');
                          setEditingId(s.id);
                          setForm(normalizeForm(s));
                        }}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={(event) => {
                          event.stopPropagation();
                          deleteSkill(s.id);
                          void api.deleteSkillFile({ id: s.id });
                          void appendSkillLog(`删除技能「${s.name}」`);
                        }}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </Card>

          <Card className="flex min-h-0 flex-col overflow-hidden border-[#dbe6ff] bg-white/80 p-4 shadow-[0_18px_48px_rgba(19,61,154,0.08)]">
            {mode === 'preview' ? null : (
              <div className="mb-3 shrink-0 text-sm font-medium">
                {mode === 'create'
                  ? '新建技能'
                  : `编辑技能：${editing?.name || ''}`}
              </div>
            )}

            {mode === 'preview' && selectedSkill ? (
              <div className="flex min-h-0 flex-1 flex-col space-y-4">
                <div className="flex shrink-0 justify-end">
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      setMode('edit');
                      setForm(normalizeForm(selectedSkill));
                    }}
                  >
                    编辑
                  </Button>
                </div>
                <pre className="min-h-0 flex-1 overflow-auto whitespace-pre-wrap rounded-md border bg-muted/30 p-3 text-xs leading-5 text-foreground/80">
                  {skillFilePreview}
                </pre>
              </div>
            ) : (
              <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pr-1">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label>名称</Label>
                    <span className="text-xs text-muted-foreground">
                      {skillNameLength}/{MAX_SKILL_NAME_LENGTH}
                    </span>
                  </div>
                  <Input
                    value={form.name}
                    maxLength={MAX_SKILL_NAME_LENGTH}
                    onChange={(e) => {
                      const nextName = limitSkillName(e.target.value);
                      setForm((s) => ({
                        ...s,
                        name: nextName,
                        content: isDefaultTemplate(s.content)
                          ? createSkillContentTemplate(nextName)
                          : s.content,
                      }));
                    }}
                    placeholder="最多10个字"
                  />
                </div>

                <div className="space-y-2">
                  <Label>作用域</Label>
                  <Select
                    value={scopeValue}
                    onValueChange={(v) => {
                      if (v === ADD_SCOPE_VALUE) {
                        setAddingScope(true);
                        return;
                      }
                      if (v.startsWith('custom:')) {
                        setForm((s) => ({
                          ...s,
                          scope: 'custom',
                          scopeName: v.replace('custom:', ''),
                        }));
                        return;
                      }
                      setForm((s) => ({
                        ...s,
                        scope: v as SkillScope,
                        scopeName: '',
                      }));
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="选择作用域" />
                    </SelectTrigger>
                    <SelectContent>
                      {builtInScopeOptions.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                      {customScopeOptions.map((scopeName) => (
                        <SelectItem
                          key={scopeName}
                          value={`custom:${scopeName}`}
                        >
                          {scopeName}
                        </SelectItem>
                      ))}
                      <SelectItem value={ADD_SCOPE_VALUE}>
                        + 添加新分组
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {addingScope ? (
                  <div className="flex items-center gap-2">
                    <Input
                      value={newScopeName}
                      onChange={(e) => setNewScopeName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          createCustomScope();
                        }
                      }}
                      placeholder="输入新分组名称"
                    />
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={createCustomScope}
                      disabled={!newScopeName.trim()}
                    >
                      添加
                    </Button>
                  </div>
                ) : null}

                <div className="space-y-2">
                  <Label>描述（可选）</Label>
                  <Input
                    value={form.description}
                    onChange={(e) =>
                      setForm((s) => ({ ...s, description: e.target.value }))
                    }
                    placeholder="用于解释技能用途/触发条件/边界"
                  />
                </div>

                <div className="space-y-2">
                  <Label>技能内容</Label>
                  <Textarea
                    value={form.content}
                    onChange={(e) =>
                      setForm((s) => ({ ...s, content: e.target.value }))
                    }
                    placeholder="填写 skill 文件内容，Agent 会在执行前检索相关技能并参考这里的内容"
                    className="min-h-48 font-mono text-xs leading-5"
                  />
                </div>

                <div className="space-y-3 rounded-md border p-3">
                  <div>
                    <Label>导入资料</Label>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <input
                      ref={docInputRef}
                      type="file"
                      className="hidden"
                      multiple
                      accept=".md,.txt,.doc,.docx,.pdf,.html,.json"
                      onChange={(e) => {
                        void handleUpload(e.target.files, 'document');
                        e.target.value = '';
                      }}
                    />
                    <input
                      ref={videoInputRef}
                      type="file"
                      className="hidden"
                      multiple
                      accept="video/*"
                      onChange={(e) => {
                        void handleUpload(e.target.files, 'screen-recording');
                        e.target.value = '';
                      }}
                    />
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={() => docInputRef.current?.click()}
                    >
                      <FileText className="mr-2 h-4 w-4" />
                      上传文档
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={() => videoInputRef.current?.click()}
                    >
                      <Video className="mr-2 h-4 w-4" />
                      上传视频
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={linkMockLarkDoc}
                    >
                      <Link2 className="mr-2 h-4 w-4" />
                      云文档
                    </Button>
                  </div>

                  {parsingDraft ? (
                    <div className="flex items-center gap-2 rounded-md bg-blue-50 px-3 py-2 text-xs text-blue-700">
                      <Wand2 className="h-4 w-4 animate-pulse" />
                      正在解析
                    </div>
                  ) : null}

                  {form.attachments.length ? (
                    <>
                      <div className="space-y-2">
                        {form.attachments.map((attachment) => (
                          <div
                            key={attachment.id}
                            className="flex items-center justify-between gap-2 rounded-md bg-muted/50 px-3 py-2 text-xs"
                          >
                            <div className="flex min-w-0 items-center gap-2">
                              {attachment.kind === 'image' ? (
                                <ImageIcon className="h-4 w-4 shrink-0" />
                              ) : attachment.kind === 'video' ||
                                attachment.kind === 'screen-recording' ? (
                                <Video className="h-4 w-4 shrink-0" />
                              ) : (
                                <FileText className="h-4 w-4 shrink-0" />
                              )}
                              <span className="truncate">
                                {getAttachmentLabel(attachment.kind)}：
                                {attachment.name}
                              </span>
                            </div>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => removeAttachment(attachment.id)}
                            >
                              移除
                            </Button>
                          </div>
                        ))}
                      </div>
                      <div className="space-y-2">
                        <Textarea
                          value={materialInstruction}
                          onChange={(event) =>
                            setMaterialInstruction(event.target.value)
                          }
                          placeholder="输入技能要求，如参考文档排版的skill"
                          className="min-h-20 text-xs leading-5"
                        />
                        <div className="flex justify-end">
                          <Button
                            type="button"
                            size="sm"
                            disabled={parsingDraft}
                            onClick={() => {
                              void parseSkillDraft();
                            }}
                          >
                            <Wand2 className="mr-2 h-4 w-4" />
                            解析
                          </Button>
                        </div>
                      </div>
                    </>
                  ) : null}

                </div>

                <div className="flex items-center justify-between rounded-md border p-3">
                  <div>
                    <Label>启用技能</Label>
                  </div>
                  <Switch
                    checked={form.enabled}
                    onCheckedChange={(enabled) =>
                      setForm((s) => ({ ...s, enabled }))
                    }
                  />
                </div>

                <div className="sticky bottom-0 z-20 flex items-center justify-end gap-2 border-t bg-white/95 py-3 backdrop-blur">
                  {mode === 'edit' ? (
                    <Button
                      variant="secondary"
                      disabled={submitting}
                      onClick={() => {
                        if (editing) {
                          setMode('preview');
                          setForm(normalizeForm(editing));
                        } else {
                          setMode('create');
                          setEditingId(null);
                          setForm(normalizeForm(null));
                        }
                      }}
                    >
                      取消编辑
                    </Button>
                  ) : null}

                  <Button
                    disabled={!canSubmit || submitting}
                    onClick={async () => {
                      if (!canSubmit || submitting) return;
                      setSubmitting(true);
                      try {
                        if (mode === 'create') {
                          const createdSkill = createSkill({
                            name: normalizedSkillName,
                            scope: form.scope,
                            scopeName: form.scopeName,
                            description: form.description,
                            content: form.content,
                            enabled: form.enabled,
                            source:
                              form.attachments.length > 0 ? 'upload' : 'manual',
                            attachments: form.attachments,
                            testCases: [],
                          });
                          if (!createdSkill) return;
                          await api.upsertSkillFile({
                            skill: createdSkill,
                          });
                          await appendSkillLog(
                            `创建技能「${normalizedSkillName}」，分组「${
                              form.scope === 'custom'
                                ? form.scopeName || '未分组'
                                : scopeLabel[form.scope]
                            }」，状态：${form.enabled ? '启用' : '停用'}`,
                          );
                          setEditingId(createdSkill.id);
                          setForm(normalizeForm(createdSkill));
                          setMode('preview');
                        } else if (editingId) {
                          const updatedSkill = updateSkill(editingId, {
                            name: normalizedSkillName,
                            scope: form.scope,
                            scopeName: form.scopeName,
                            description: form.description,
                            content: form.content,
                            enabled: form.enabled,
                            source:
                              form.attachments.length > 0
                                ? 'upload'
                                : editing?.source || 'manual',
                            attachments: form.attachments,
                            testCases: [],
                          });
                          if (updatedSkill) {
                            await api.upsertSkillFile({
                              skill: updatedSkill,
                            });
                            setEditingId(updatedSkill.id);
                            setForm(normalizeForm(updatedSkill));
                            setMode('preview');
                          }
                          await appendSkillLog(
                            `更新技能「${normalizedSkillName}」，状态：${
                              form.enabled ? '启用' : '停用'
                            }`,
                          );
                        }
                      } finally {
                        setSubmitting(false);
                      }
                    }}
                  >
                    {submitting
                      ? '保存中...'
                      : mode === 'create'
                        ? '创建'
                        : '保存'}
                  </Button>
                </div>
              </div>
            )}
          </Card>
        </div>

      </DialogContent>
      </Dialog>
      <Dialog open={draftDialogOpen} onOpenChange={setDraftDialogOpen}>
        <DialogContent className="max-h-[85vh] overflow-hidden sm:max-w-[720px]">
          <DialogHeader>
            <DialogTitle>确认技能文件草稿</DialogTitle>
          </DialogHeader>
          <Textarea
            value={draftContent}
            onChange={(event) => setDraftContent(event.target.value)}
            className="min-h-[52vh] font-mono text-xs leading-5"
            placeholder="模型解析出的技能内容会显示在这里，可直接编辑"
          />
          <DialogFooter>
            <Button
              type="button"
              disabled={!draftContent.trim()}
              onClick={() => {
                setForm((s) => ({ ...s, content: draftContent }));
                setDraftDialogOpen(false);
              }}
            >
              确认
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
});
