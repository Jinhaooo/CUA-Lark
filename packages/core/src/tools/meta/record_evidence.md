# Record Evidence Tool Documentation

## Overview

The `record_evidence` tool is used to capture and store key evidence during skill execution. This evidence can be used for:
- Debugging failed tasks
- Audit logging
- Compliance verification
- Post-mortem analysis
- Cross-product trace linking

## Usage

```typescript
const result = await recordEvidenceTool.execute(ctx, {
  label: 'permission_denied',
  content: JSON.stringify({
    timestamp: Date.now(),
    type: 'camera_permission',
    action: 'denied',
    screenshot: 'base64_encoded_image',
  }),
});
```

## Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| label | string | Yes | A short descriptive label for the evidence |
| content | string | Yes | The evidence content (typically JSON stringified) |

## Common Evidence Types

### Permission Events
```json
{
  "label": "permission_denied",
  "content": "{\"type\":\"camera\",\"action\":\"denied\",\"timestamp\":1234567890}"
}
```

### UI State Capture
```json
{
  "label": "ui_state",
  "content": "{\"screen\":\"login\",\"fields\":[\"username\",\"password\"],\"errors\":[]}"
}
```

### External API Calls
```json
{
  "label": "api_call",
  "content": "{\"endpoint\":\"/api/events\",\"method\":\"POST\",\"status\":200,\"latency_ms\":150}"
}
```

### Cross-product Navigation
```json
{
  "label": "navigation",
  "content": "{\"from\":\"lark_im\",\"to\":\"lark_calendar\",\"timestamp\":1234567890}"
}
```

### Risk Assessment
```json
{
  "label": "risk_assessment",
  "content": "{\"level\":\"high\",\"tool\":\"delete_message\",\"reason\":\"Destructive operation\"}"
}
```

## Best Practices

### 1. Capture at Key Decision Points
Record evidence before and after critical operations:
- Before risky operations
- After permission prompts
- During cross-product navigation
- When unexpected UI appears

### 2. Include Contextual Information
Always include:
- Timestamp
- Current screen/context
- Relevant identifiers (task ID, user ID)
- Screenshot references

### 3. Structured Format
Use JSON for structured data to enable later querying:
```typescript
const evidence = JSON.stringify({
  timestamp: Date.now(),
  type: 'permission_event',
  detail: { /* ... */ }
});
```

### 4. Avoid Sensitive Data
Never store:
- Passwords or tokens
- PII (Personally Identifiable Information)
- Encryption keys

## Integration with Skills

### Example: Recording Permission Evidence

```markdown
## Usage in SKILL.md

When handling permission denial:
1. Use `screenshot` to capture the permission dialog
2. Use `record_evidence` to document the event:
   - label: "permission_denied"
   - content: JSON with permission type and action
3. Proceed with alternative workflow or finish task
```

### Example: Recording Cross-product Navigation

```markdown
## Cross-product Flow Documentation

When navigating between Lark applications:
1. Before navigation, record current state
2. Perform the navigation action
3. After navigation, record the new state
4. Use `wait_for_loading` to ensure completion
5. Verify the new application is active
```

## Trace Integration

Evidence records are stored in the trace system with:
- `kind: 'record_evidence'`
- `name: <label>`
- `payload.content: <content>`

This allows for querying and filtering evidence records separately from tool executions.

## Performance Considerations

- Evidence recording is asynchronous and non-blocking
- Content should be kept concise (< 1KB recommended)
- Frequent recording may impact performance
- Consider batching multiple related events

## Error Handling

If evidence recording fails:
- The tool returns `success: false`
- The task continues execution
- The failure is logged to the trace
- No exception is thrown

## Security

- All evidence is stored in the encrypted trace database
- Access is controlled via trace store permissions
- Evidence can be anonymized during export
- Retention policies apply based on configuration