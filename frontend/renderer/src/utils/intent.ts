export type CuaIntent = {
  requiresCua: boolean;
  reason: string;
};

const operationKeywords = [
  '打开',
  '点击',
  '输入',
  '填写',
  '发送',
  '回复',
  '整理',
  '创建',
  '新建',
  '删除',
  '修改',
  '更新',
  '复制',
  '粘贴',
  '下载',
  '上传',
  '导出',
  '截图',
  '搜索',
  '查询',
  '查找',
  '登录',
  '预约',
  '切换',
  '关闭',
  '进入',
  '发消息',
  '操作',
  '执行',
  '完成',
];

const appKeywords = [
  '飞书',
  'lark',
  'cua',
  '文档',
  '表格',
  '多维表格',
  '日历',
  '会议',
  '群',
  '聊天',
  '消息',
  '浏览器',
  '页面',
  '网页',
  '电脑',
  '文件',
  '系统设置',
];

const questionPrefixPattern =
  /^(什么是|什么叫|为什么|为何|怎么理解|如何理解|解释|说明|介绍|对比|区别|评价|建议|帮我想|帮我写一段|写一段|翻译|润色|总结一下|概括|列出|分析一下|what is|why|explain|compare|summarize|translate|rewrite)/i;

const chatOnlyPatterns = [
  /^(你好|您好|嗨|hi|hello|在吗|谢谢|感谢|辛苦了)[。！？!,.，\s]*$/i,
  /^(你是谁|你能做什么|你可以做什么|介绍一下你自己|帮助|help)[。！？!,.，\s]*$/i,
  /^(讲个笑话|闲聊|陪我聊聊)[。！？!,.，\s]*$/i,
];

export function classifyCuaIntent(input: string): CuaIntent {
  const text = input.trim().toLowerCase();

  if (!text) {
    return { requiresCua: false, reason: '空指令' };
  }

  if (chatOnlyPatterns.some((pattern) => pattern.test(text))) {
    return { requiresCua: false, reason: '普通对话' };
  }

  if (questionPrefixPattern.test(text)) {
    return { requiresCua: false, reason: '问答请求' };
  }

  if (
    operationKeywords.some((keyword) => text.includes(keyword)) ||
    (/帮我.*(做|操作|处理|完成|执行|打开|点击|发送|创建|查询|搜索|预约|整理)/.test(
      text,
    ) &&
      appKeywords.some((keyword) => text.includes(keyword.toLowerCase())))
  ) {
    return { requiresCua: true, reason: '需要操作应用或电脑' };
  }

  if (/[?？]$/.test(text)) {
    return { requiresCua: false, reason: '问答请求' };
  }

  return { requiresCua: false, reason: '问答请求' };
}

export function buildDirectChatReply(input: string) {
  const text = input.trim().toLowerCase();

  if (/^(你是谁|介绍一下你自己)/.test(text)) {
    return '我是 Lark-CUA，可以在需要时操作飞书桌面端和电脑；如果只是普通问题，我会直接在对话里回复。';
  }

  if (/^(你能做什么|你可以做什么|帮助|help)/.test(text)) {
    return '我可以帮你处理飞书消息、文档、日历、网页和电脑操作；也可以直接回答不需要操作的问题。';
  }

  if (/^(谢谢|感谢|辛苦了)/.test(text)) {
    return '不客气。';
  }

  if (/^(讲个笑话)/.test(text)) {
    return '当然可以：为什么电脑很少感冒？因为它总是有 Windows。';
  }

  return '我在。这个问题不需要调用 CUA 操作，你可以继续直接和我对话。';
}
