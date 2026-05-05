# Frontend Contract - CUA-Lark Backend API

> Status: v1.5 draft, updated for M5.
> Scope: this document is the frontend/backend integration contract. Existing M4 endpoints and SSE event names remain compatible; M5 only adds endpoints, events, and optional fields.

## A. Base URL

Backend dev server:

```bash
pnpm --filter @cua-lark/server dev
```

Default backend origin:

```text
http://127.0.0.1:7878
```

Dashboard code may call the same routes through its dev proxy as `/api/...`. The backend route signatures below are written without the dashboard proxy prefix.

## B. Task API

### `POST /tasks`

Create and enqueue a GUI automation task.

Request:

```json
{
  "instruction": "Open CUA-Lark-Test group and send Hello",
  "params": {}
}
```

Response `200`:

```json
{
  "taskId": "01J...",
  "status": "queued"
}
```

Response `429`:

```json
{
  "error": "QueueFull",
  "message": "Task queue is full"
}
```

### `GET /tasks`

Query tasks.

Query params:

| Name | Type | Default | Notes |
|---|---|---:|---|
| `status` | `queued | running | completed | failed | cancelled` | optional | Filter by status. |
| `limit` | number | 20 | Max 100. |
| `offset` | number | 0 | Non-negative. |

Response `200`:

```json
{
  "tasks": [
    {
      "id": "01J...",
      "instruction": "...",
      "status": "completed",
      "enqueuedAt": 1714723200000,
      "startedAt": 1714723201000,
      "finishedAt": 1714723215000,
      "totalTokens": 12345,
      "finishedReason": "message_sent",
      "routedSkill": "lark_im.send_message"
    }
  ],
  "total": 1
}
```

### `GET /tasks/:id`

Response `200`:

```json
{
  "id": "01J...",
  "instruction": "...",
  "params": {},
  "status": "running",
  "enqueuedAt": 1714723200000,
  "startedAt": 1714723201000,
  "finishedAt": 1714723215000,
  "totalTokens": 12345,
  "finishedReason": "message_sent",
  "routedSkill": "lark_im.send_message"
}
```

Response `404`:

```json
{
  "error": "NotFound",
  "message": "Task not found"
}
```

### `DELETE /tasks/:id`

Cancels a queued or running task.

Response:

| Status | Meaning |
|---:|---|
| `204` | Cancellation signal accepted. |
| `404` | Task not found or already completed. |

Cancellation is cooperative. The harness checks the abort signal around model/tool loop boundaries.

### `GET /tasks/:id/trace`

Returns persisted trace events from SQLite.

Query params:

| Name | Type | Notes |
|---|---|---|
| `since` | string | Optional trace event id; returns events after this id. |

Response `200`:

```json
[
  {
    "id": "01J...EVENT",
    "test_run_id": "01J...TASK",
    "parent_id": "01J...PARENT",
    "kind": "tool_result",
    "name": "tool_result",
    "status": "passed",
    "started_at": 1714723201000,
    "ended_at": 1714723201200,
    "payload": {
      "iteration": 1,
      "observation": "Clicked button",
      "durationMs": 200
    }
  }
]
```

Response `404`:

```json
{
  "error": "NotFound",
  "message": "Task not found"
}
```

## C. M5 Risk Confirmation

### `POST /tasks/:id/confirm`

Used by the frontend to answer a risk confirmation request emitted through SSE.

Request:

```json
{
  "confirmed": true,
  "reason": "User confirmed risk operation"
}
```

Response `200`:

```json
{
  "received": true
}
```

Response `404`:

```json
{
  "error": "NotFound",
  "message": "No pending confirmation for task 01J..."
}
```

Frontend behavior:

- Open a blocking confirmation dialog when receiving `risk_confirmation_required`.
- Call this endpoint with `confirmed: true` for approval.
- Call this endpoint with `confirmed: false` for denial.
- If the user does not respond, backend timeout resolves as denial.

## D. SSE

### `GET /tasks/:id/stream`

Long-lived Server-Sent Events stream.

```http
GET /tasks/:id/stream
Accept: text/event-stream
```

Wire format:

```text
event: <kind>
data: <json>

```

Heartbeat:

```text
event: ping
data: {}

```

The backend sends heartbeat every 15 seconds. Frontend does not need to render it.

### Existing Lifecycle Events

```ts
type TaskStartedEvent = {
  kind: 'task_started';
  taskId: string;
  instruction: string;
  routedSkill: string;
  startedAt: number;
};

type TaskFinishedEvent = {
  kind: 'task_finished';
  taskId: string;
  success: boolean;
  reason: string;
  durationMs: number;
  totalTokens: number;
};

type TaskFailedEvent = {
  kind: 'task_failed';
  taskId: string;
  error: { kind: string; message: string };
};

type TaskCancelledEvent = {
  kind: 'task_cancelled';
  taskId: string;
};
```

### Existing Harness Events

```ts
type IterationStartedEvent = {
  kind: 'iteration_started';
  taskId: string;
  iteration: number;
  screenshotPath: string;
};

type ThoughtChunkEvent = {
  kind: 'thought_chunk';
  taskId: string;
  iteration: number;
  delta: string;
};

type ThoughtCompleteEvent = {
  kind: 'thought_complete';
  taskId: string;
  iteration: number;
  full: string;
  tokens: number;
};

type ThoughtResetEvent = {
  kind: 'thought_reset';
  taskId: string;
  iteration: number;
  reason: 'stream_interrupted';
};

type ToolCallEvent = {
  kind: 'tool_call';
  taskId: string;
  iteration: number;
  name: string;
  args: unknown;
};

type ToolResultEvent = {
  kind: 'tool_result';
  taskId: string;
  iteration: number;
  success: boolean;
  observation: string;
  durationMs: number;
};

type IterationCompleteEvent = {
  kind: 'iteration_complete';
  taskId: string;
  iteration: number;
  durationMs: number;
  cost: { tokens: number };
};
```

### M4/M5 Model Timing Events

```ts
type ModelRequestStartedEvent = {
  kind: 'model_request_started';
  taskId: string;
  iteration: number;
  attempt: number;
  timeoutMs: number;
};

type ModelRequestFinishedEvent = {
  kind: 'model_request_finished';
  taskId: string;
  iteration: number;
  attempt: number;
  durationMs: number;
  success: boolean;
  reason?: string;
};
```

### Skill Events

```ts
type SkillStartedEvent = {
  kind: 'skill_started';
  taskId: string;
  skillName: string;
};

type SkillFinishedEvent = {
  kind: 'skill_finished';
  taskId: string;
  skillName: string;
  success: boolean;
  iterations: number;
};
```

### M5 Risk Events

```ts
type RiskEvaluationCompleteEvent = {
  kind: 'risk_evaluation_complete';
  taskId: string;
  toolName: string;
  args: unknown;
  riskLevel: string; // low | medium | high | destructive
  reason: string;
};

type RiskConfirmationRequiredEvent = {
  kind: 'risk_confirmation_required';
  taskId: string;
  action: { name: string; args?: unknown };
  riskLevel: string;
  reason: string;
  question: string;
};

type RiskConfirmationReceivedEvent = {
  kind: 'risk_confirmation_received';
  taskId: string;
  toolName: string;
  confirmed: boolean;
  source: 'user' | 'timeout';
  reason?: string;
};

type RiskApprovedEvent = {
  kind: 'risk_approved';
  taskId: string;
  toolName: string;
};
```

Frontend rendering guidance:

- `risk_confirmation_required`: show modal and block destructive action until user answers.
- `risk_confirmation_received`: close modal if still open; show denied/timed-out state when `confirmed` is false.
- `risk_approved`: optional audit badge in task timeline.
- `risk_evaluation_complete`: optional trace/timeline entry.

### M5 Self-Healing Events

```ts
type SelfHealingAttemptedEvent = {
  kind: 'self_healing_attempted';
  taskId: string;
  reason: string;
  confidence: number;
};

type SelfHealingSucceededEvent = {
  kind: 'self_healing_succeeded';
  taskId: string;
  iterationsBefore: number;
  iterationsAfter: number;
};

type SelfHealingSkippedEvent = {
  kind: 'self_healing_skipped';
  taskId: string;
  reason: string;
  skipCause: 'unretryable_kind' | 'low_confidence' | 'max_retries';
};
```

Frontend rendering guidance:

- Show self-healing as timeline annotations rather than user-blocking dialogs.
- `self_healing_attempted` means the first attempt ended with `finished(false)` and the harness is analyzing trace.
- `self_healing_succeeded` means a retry path was launched and returned.
- `self_healing_skipped` means retry was intentionally suppressed.

## E. Skill, Health, Benchmarks, Tool Stats, Screenshots

These endpoints are unchanged from M4.

### `GET /skills`

Response `200`:

```json
[
  {
    "name": "lark_im.send_message",
    "description": "Send an IM message",
    "toolWhitelistCount": 12,
    "fewShotCount": 3
  }
]
```

### `GET /skills/:name`

Response `200`:

```json
{
  "name": "lark_im.send_message",
  "description": "...",
  "toolWhitelist": ["screenshot", "uia_find", "click"],
  "maxLoopIterations": 25,
  "finishCriteria": "...",
  "fewShotCount": 3
}
```

### `GET /health`

Response `200`:

```json
{
  "status": "ok",
  "a11y": "enabled",
  "ocr": "available",
  "vlm": "available"
}
```

### `GET /benchmarks`

Response `200`:

```json
{
  "reports": [
    {
      "milestone": "m4",
      "filename": "m4-baseline.md",
      "title": "M4 Baseline",
      "rawMarkdown": "..."
    }
  ]
}
```

### `GET /tools/stats`

Response `200`:

```json
{
  "stats": [
    {
      "name": "click",
      "callCount": 234,
      "avgDurationMs": 12,
      "successRate": 0.98
    }
  ]
}
```

### `GET /screenshots/:runId/:filename`

Returns `image/png` for persisted trace screenshots. Frontend should treat this as a static resource and not assume arbitrary filesystem access.

## F. M5 Curation API

These routes are registered only when the server is created with `embeddingClient`, `fewShotMiner`, and `failureClusterer` dependencies. If those dependencies are absent, the routes may not exist.

### `GET /curation/stats`

Response `200`:

```json
{
  "totalFailures": 10,
  "resolvedFailures": 2,
  "unresolvedFailures": 8,
  "clusterCount": 3,
  "kindDistribution": {
    "locator_failed": 4,
    "verification_failed": 2,
    "unexpected_ui": 1,
    "permission_denied": 0,
    "network_error": 0,
    "timeout": 1,
    "assertion_failed": 0,
    "unknown": 0
  }
}
```

### `GET /curation/failures`

Query params:

| Name | Type | Default | Notes |
|---|---|---:|---|
| `resolved` | boolean | optional | Filter resolved/unresolved failures. |
| `kind` | string | optional | Filter by error kind. |
| `limit` | number | 50 | Max 100. |

Response `200`:

```json
{
  "failures": [
    {
      "id": "failure_...",
      "taskId": "01J...",
      "skillName": "lark_im.send_message",
      "reason": "locator_failed",
      "errorKind": "locator_failed",
      "resolved": false,
      "resolution": "Manually resolved via dashboard",
      "timestamp": "2026-05-04T08:00:00.000Z"
    }
  ],
  "total": 1
}
```

### `POST /curation/failures`

Records a failure for clustering.

Request:

```json
{
  "taskId": "01J...",
  "skillName": "lark_im.send_message",
  "reason": "button not found",
  "errorKind": "locator_failed",
  "trace": [
    {
      "iteration": 1,
      "thought": "try click",
      "toolCall": { "name": "click", "args": { "x": 1, "y": 2 } },
      "observation": "failed",
      "durationMs": 100
    }
  ],
  "screenshotBase64": "optional",
  "rootCause": "optional",
  "suggestedFix": "optional"
}
```

Response `201`:

```json
{
  "id": "failure_...",
  "message": "Failure recorded successfully"
}
```

Allowed `errorKind` values:

```text
locator_failed
verification_failed
unexpected_ui
permission_denied
network_error
timeout
assertion_failed
unknown
```

### `POST /curation/failures/:id/resolve`

Request:

```json
{
  "resolution": "Added wait_for_loading before verification"
}
```

Response `200`:

```json
{
  "success": true,
  "message": "Failure failure_... marked as resolved"
}
```

Response `404`:

```json
{
  "success": false,
  "message": "Failure failure_... not found"
}
```

### `POST /curation/cluster`

Runs failure clustering.

Request:

```json
{
  "minClusterSize": 2,
  "similarityThreshold": 0.85
}
```

Response `200`:

```json
{
  "clusters": [
    {
      "id": "cluster_...",
      "kind": "locator_failed",
      "pattern": "Tool \"click\" failing",
      "count": 3,
      "sharedRootCause": "Target button moved after popup",
      "suggestedFix": "Dismiss popup before click",
      "avgTokens": 1200,
      "avgDurationMs": 4500
    }
  ],
  "totalClusters": 1
}
```

### `GET /curation/cluster/:id`

Response `200`:

```json
{
  "cluster": {
    "id": "cluster_...",
    "kind": "locator_failed",
    "pattern": "Tool \"click\" failing",
    "count": 3,
    "sharedRootCause": "Target button moved after popup",
    "suggestedFix": "Dismiss popup before click",
    "records": [
      {
        "id": "failure_...",
        "taskId": "01J...",
        "reason": "button not found",
        "timestamp": "2026-05-04T08:00:00.000Z"
      }
    ]
  }
}
```

Response `404`:

```json
{
  "error": "NotFound",
  "message": "Cluster cluster_... not found"
}
```

### `POST /curation/few-shots/mine`

Mines few-shot candidates.

Request:

```json
{
  "query": "send a message in IM",
  "skillName": "lark_im.send_message",
  "maxExamples": 5,
  "includeFailures": false
}
```

Response `200`:

```json
{
  "candidates": [
    {
      "id": "example_...",
      "skillName": "lark_im.send_message",
      "taskInstruction": "Send Hello to CUA-Lark-Test",
      "success": true,
      "finishedReason": "message_sent",
      "score": 0.91,
      "relevanceReason": "Skill: lark_im.send_message | 5 tool calls | successful execution"
    }
  ],
  "total": 1
}
```

### `GET /curation/few-shots/build-prompt`

Query params:

| Name | Type | Default |
|---|---|---:|
| `query` | string | required |
| `skillName` | string | required |
| `maxExamples` | number | 3 |
| `includeFailures` | boolean | false |

Response `200`:

```json
{
  "prompt": "# Few-Shot Examples\n..."
}
```

## G. Error Kinds

Known tool/harness error kinds:

```text
unknown
precondition_unmet
verify_failed
not_found
locator_failed
a11y_not_enabled
uia_unavailable
unknown_tool
invalid_tool_args
max_iterations_reached
vlm_loop_detected
tool_call_parse_failed
budget_exceeded
risk_denied
risk_timeout_denied
stream_interrupted
```

M5 self-healing does not retry these reasons by default:

```text
permission_denied
risk_denied
max_iterations_reached
budget_exceeded
tool_call_parse_failed
```

## H. Frontend Implementation Notes

- Treat `kind` as the SSE discriminant.
- Do not assume every SSE event has an `event` wrapper; backend sends the event object directly.
- Use `GET /tasks/:id/trace?since=<eventId>` to recover missed history after SSE disconnect.
- `risk_confirmation_required` is the only M5 SSE event that should block the user with a modal.
- `self_healing_*` events are informational timeline events.
- Curation endpoints are optional and should be hidden or shown as unavailable if a `404` route-level response is encountered.

## I. Compatibility Promise

Allowed changes:

- Add new endpoints.
- Add new SSE event kinds.
- Add optional fields to existing JSON responses.
- Add new `ErrorKind` values.

Forbidden without an explicit contract revision:

- Rename or remove existing endpoints.
- Rename or remove existing SSE event kinds.
- Change required response field types.
- Change task status enum values.

