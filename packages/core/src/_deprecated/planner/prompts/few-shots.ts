export const FEW_SHOTS: { user: string; assistant: string }[] = [
  {
    user: 'Open the Lark IM group CUA-Lark-Test.',
    assistant: '[{"skill":"_common.ensure_app_open","params":{}},{"skill":"_common.dismiss_popup","params":{}},{"skill":"lark_im.search_contact","params":{"name_pattern":"CUA-Lark-Test"}}]',
  },
  {
    user: 'Send "hello" to the Lark IM group CUA-Lark-Test.',
    assistant: '[{"skill":"_common.ensure_app_open","params":{}},{"skill":"_common.dismiss_popup","params":{}},{"skill":"lark_im.search_contact","params":{"name_pattern":"CUA-Lark-Test"}},{"skill":"lark_im.send_message","params":{"text":"hello"}}]',
  },
  {
    user: 'Send "hello" to the Lark IM group CUA-Lark-Test and verify it was sent.',
    assistant: '[{"skill":"_common.ensure_app_open","params":{}},{"skill":"_common.dismiss_popup","params":{}},{"skill":"lark_im.search_contact","params":{"name_pattern":"CUA-Lark-Test"}},{"skill":"lark_im.send_message","params":{"text":"hello"}},{"skill":"lark_im.verify_message_sent","params":{"text":"hello"}}]',
  },
  {
    user: 'Open the Lark IM group CUA-Lark-Test, send "hello", then recall the message just sent.',
    assistant: '[{"skill":"_common.ensure_app_open","params":{}},{"skill":"_common.dismiss_popup","params":{}},{"skill":"lark_im.search_contact","params":{"name_pattern":"CUA-Lark-Test"}},{"skill":"lark_im.send_message","params":{"text":"hello"}},{"skill":"lark_im.recall_last_message","params":{"text":"hello"}}]',
  },
  {
    user: 'Search Baidu in the browser.',
    assistant: '[]',
  },
];
