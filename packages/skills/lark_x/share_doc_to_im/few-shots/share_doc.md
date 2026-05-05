# Few-Shot Example 2: Share Doc to IM

## Input
User: Share the document "Q3 Report" to the "Work Chat" conversation

## Trace

### Iteration 1
**Thought**: I need to open Lark Docs first. Let me click on the Docs app in the launcher.
**Tool**: uia_find {"name": "Docs", "type": "button"}
**Observation**: Found Docs button in app launcher

### Iteration 2
**Thought**: Clicking Docs to open the application.
**Tool**: click {"x": 100, "y": 150}
**Observation**: Docs app opened showing recent documents list

### Iteration 3
**Thought**: I need to search for the document titled "Q3 Report". Let me use search or scroll to find it.
**Tool**: ocr_locate {"text": "Q3 Report"}
**Observation**: Found "Q3 Report" in the recent documents list at (200, 180)

### Iteration 4
**Thought**: Found the document. Let me click on it to open it.
**Tool**: click {"x": 200, "y": 180}
**Observation**: Document "Q3 Report" opened in viewer mode

### Iteration 5
**Thought**: Now I need to find the Share button in the document toolbar. Let me take a screenshot to locate it.
**Tool**: screenshot
**Observation**: Document toolbar visible with Share button at top-right

### Iteration 6
**Thought**: I found the Share button. Let me click on it.
**Tool**: ocr_locate {"text": "Share"}
**Observation**: Found Share button at (750, 50)

### Iteration 7
**Thought**: Clicking Share to open the sharing dialog.
**Tool**: click {"x": 750, "y": 50}
**Observation**: Share dialog opened with contact picker and message input

### Iteration 8
**Thought**: I need to search for "Work Chat" in the contact picker. Let me type the chat name.
**Tool**: ocr_locate {"text": "Search"}
**Observation**: Found search input at (300, 100)

### Iteration 9
**Thought**: Typing "Work Chat" in the search input.
**Tool**: type {"text": "Work Chat"}
**Observation**: Search results show "Work Chat" conversation

### Iteration 10
**Thought**: Found "Work Chat". Let me click on it to select it.
**Tool**: ocr_locate {"text": "Work Chat"}
**Observation**: Found "Work Chat" in search results at (300, 200)

### Iteration 11
**Thought**: Selecting Work Chat as the recipient.
**Tool**: click {"x": 300, "y": 200}
**Observation**: "Work Chat" selected, send button enabled

### Iteration 12
**Thought**: Now I'll click Send to share the document.
**Tool**: ocr_locate {"text": "Send"}
**Observation**: Found Send button at (600, 400)

### Iteration 13
**Thought**: Clicking Send to share the document to Work Chat.
**Tool**: click {"x": 600, "y": 400}
**Observation**: Document shared successfully, confirmation message appeared

### Iteration 14
**Tool**: finished {"success": true, "reason": "doc_shared"}
**Observation**: Task completed - document link sent to Work Chat

## Output
{
  "success": true,
  "finishedReason": "doc_shared"
}
