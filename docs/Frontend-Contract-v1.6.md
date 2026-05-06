# Frontend Contract v1.6

## 1. Overview

This document defines the interface contract between the frontend components and the backend services for CUA-Lark v1.6, focusing on the Human-Computer Collaboration Interaction Layer.

## 2. Architecture

### 2.1 Component Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        Electron Application                            │
├─────────────────────────────────────────────────────────────────────────┤
│  Main Process                                                          │
│  ├── SSE Client (Single Point)                                         │
│  ├── SSE Dispatcher (Broadcast to Renderers)                          │
│  ├── Window Manager                                                   │
│  └── Overlay Window Controller                                         │
├─────────────────────────────────────────────────────────────────────────┤
│  Renderer Processes                                                    │
│  ├── Main Window (Chat Interface)                                      │
│  ├── Overlay Window (Visual Cues)                                      │
│  └── Dashboard (Management Panel - Port 5174)                          │
└─────────────────────────────────────────────────────────────────────────┘
```

### 2.2 Communication Flow

```
Backend ──SSE──▶ Main Process ──IPC──▶ Renderer Processes
    │                                    │
    └──HTTP◀─────────────────────────────┘
```

## 3. IPC Channels

### 3.1 Main → Renderer

| Channel | Description | Payload |
|---------|-------------|---------|
| `sse:event` | All SSE events | `{ kind: string; ...data }` |
| `sse:task_paused` | Task paused event | `TaskPausedEvent` |
| `sse:task_resumed` | Task resumed event | `TaskResumedEvent` |
| `sse:takeover_armed` | Takeover armed event | `TakeoverArmedEvent` |
| `sse:risk_confirmed` | Risk confirmed event | `RiskConfirmedEvent` |
| `sse:task_started` | Task started event | `TaskStartedEvent` |
| `sse:task_finished` | Task finished event | `TaskFinishedEvent` |
| `sse:task_failed` | Task failed event | `TaskFailedEvent` |
| `sse:trace_updated` | Trace updated event | `TraceUpdatedEvent` |

### 3.2 Renderer → Main

| Channel | Description | Payload |
|---------|-------------|---------|
| `sse:subscribe` | Subscribe to SSE events | None |
| `overlay:pause-task` | Request task pause | None |
| `overlay:resume-task` | Request task resume | None |
| `overlay:enable-mouse-forwarding` | Enable mouse events | None |
| `overlay:disable-mouse-forwarding` | Disable mouse events | None |

## 4. SSE Event Types

### 4.1 TaskPausedEvent

```typescript
interface TaskPausedEvent {
  kind: 'task_paused';
  taskId: string;
  pausedAtIteration: number;
  reason: PauseReason;
  pausedAt: number;
}

type PauseReason = 'user_hotkey' | 'user_dashboard' | 'user_overlay' | 'system';
```

### 4.2 TaskResumedEvent

```typescript
interface TaskResumedEvent {
  kind: 'task_resumed';
  taskId: string;
  resumedAt: number;
  resumedAtIteration: number;
}
```

### 4.3 TakeoverArmedEvent

```typescript
interface TakeoverArmedEvent {
  kind: 'takeover_armed';
  taskId: string;
  hotkey: string;
  armedAt: number;
}
```

### 4.4 RiskConfirmedEvent

```typescript
interface RiskConfirmedEvent {
  kind: 'risk_confirmed';
  taskId: string;
  confirmed: boolean;
  source: 'widget' | 'auto_timeout' | 'auto_approve';
  reason?: string;
  confirmedAt: number;
}
```

## 5. HTTP API Endpoints

### 5.1 Pause/Resume Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/tasks/:id/pause` | Pause a running task |
| POST | `/tasks/:id/resume` | Resume a paused task |
| POST | `/tasks/:id/skip-step` | Skip current step |

#### POST /tasks/:id/pause

**Request Body:**
```json
{
  "reason": "user_hotkey"
}
```

**Response:**
```json
{
  "paused": true,
  "alreadyPaused": false,
  "pausedAtIteration": 5,
  "reason": "user_hotkey"
}
```

#### POST /tasks/:id/resume

**Response:**
```json
{
  "resumed": true,
  "wasPaused": true,
  "resumedAtIteration": 5
}
```

#### POST /tasks/:id/skip-step

**Response:**
```json
{
  "skipped": true,
  "skippedStep": 5,
  "nextStep": 6
}
```

### 5.2 Confirmation Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/confirm/pending/:taskId` | Get pending confirmations |
| POST | `/confirm/:id` | Confirm/Reject a pending action |

## 6. Overlay Configuration

### 6.1 Config Structure

```typescript
interface OverlayConfig {
  enabled: boolean;
  border: {
    color: string;           // Running border color
    pausedColor: string;     // Paused border color
    width: string;           // CSS length (e.g., "0.4vh")
    breathDurationMs: number;
  };
  highlight: {
    enabled: boolean;
    color: string;
    borderRadius: string;
    padding: string;
  };
  thoughtCard: {
    enabled: boolean;
    position: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
    offsetX: number;
    offsetY: number;
    maxWidth: string;
    backgroundColor: string;
    textColor: string;
    fontSize: string;
    borderRadius: string;
    padding: string;
    shadow: string;
  };
  pauseButton: {
    enabled: boolean;
    position: 'left' | 'right';
    offsetY: number | string;
    width: string;
    height: string;
    backgroundColor: string;
    hoverColor: string;
    iconSize: string;
  };
  hotkey: {
    enabled: boolean;
    pauseKey: string;
    resumeKey: string;
  };
  display: {
    alwaysOnTop: boolean;
    ignoreMouseEvents: boolean;
  };
}
```

### 6.2 Default Values

```yaml
overlay:
  enabled: true
  border:
    color: "#8B5CF6"
    pausedColor: "#F97316"
    width: "0.4vh"
    breathDurationMs: 2000
  highlight:
    enabled: true
    color: "#8B5CF6"
    borderRadius: "4px"
    padding: "4px"
  thoughtCard:
    enabled: true
    position: "bottom-left"
    offsetX: 20
    offsetY: 20
    maxWidth: "400px"
    backgroundColor: "rgba(0, 0, 0, 0.85)"
    textColor: "#ffffff"
    fontSize: "14px"
    borderRadius: "8px"
    padding: "12px 16px"
    shadow: "0 4px 20px rgba(0, 0, 0, 0.4)"
  pauseButton:
    enabled: true
    position: "right"
    offsetY: "50%"
    width: "48px"
    height: "48px"
    backgroundColor: "rgba(139, 92, 246, 0.9)"
    hoverColor: "rgba(139, 92, 246, 1)"
    iconSize: "24px"
  hotkey:
    enabled: true
    pauseKey: "Escape"
    resumeKey: "Escape"
  display:
    alwaysOnTop: true
    ignoreMouseEvents: true
```

## 7. Window Modes

### 7.1 Compact Mode

- **Width:** 420px
- **Height:** 520px
- **Use Case:** Floating widget interaction

### 7.2 Expanded Mode

- **Width:** 800px
- **Height:** 600px
- **Use Case:** Full-featured chat interface

### 7.3 State Persistence

Window bounds and mode are persisted to `electron-store` with the key `windowState`:

```typescript
interface WindowState {
  bounds: { x: number; y: number; width: number; height: number };
  isCompact: boolean;
}
```

## 8. Performance Requirements (C19)

### 8.1 Pause Latency

| Metric | Requirement |
|--------|-------------|
| P95 Latency | ≤ 200ms |
| Average Latency | ≤ 100ms |

### 8.2 Overlay Performance

| Metric | Requirement |
|--------|-------------|
| CPU Usage | ≤ 5% |
| FPS | ≥ 55 |
| No FPS drops below 60 | Required |

## 9. Task Queue Interface

### 9.1 Methods

```typescript
interface TaskQueue {
  pauseTask(taskId: string, reason: PauseReason): PauseResult;
  resumeTask(taskId: string): ResumeResult;
  skipTaskStep(taskId: string): SkipResult;
  getTask(taskId: string): Task | null;
  getTasks(): Task[];
}

interface PauseResult {
  paused: boolean;
  alreadyPaused: boolean;
  pausedAtIteration: number;
  reason: PauseReason;
}

interface ResumeResult {
  resumed: boolean;
  wasPaused: boolean;
  resumedAtIteration: number;
}

interface SkipResult {
  skipped: boolean;
  skippedStep: number;
  nextStep: number;
}
```

## 10. Pause Controller Interface

### 10.1 PauseController

```typescript
interface PauseController {
  readonly state: 'running' | 'paused';
  readonly pausedAtIteration: number | null;
  readonly currentIteration: number;

  pause(reason: PauseReason): PauseResult;
  resume(): ResumeResult;
  skipNextTool(): { skipped: boolean };
  pauseSignal(): AbortSignal;
}
```

## 11. Error Handling

### 11.1 Error Types

| Error Code | Description |
|------------|-------------|
| `task_not_found` | Task ID does not exist |
| `task_not_running` | Task is not in running state |
| `task_not_paused` | Task is not in paused state |
| `no_pending_confirmation` | No pending confirmation for task |
| `confirmation_expired` | Confirmation has expired |

### 11.2 Error Response Format

```json
{
  "error": "task_not_found",
  "message": "Task with ID 'xxx' not found",
  "timestamp": 1234567890
}
```

## 12. Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.6 | 2025 | Added Visual Overlay, Takeover Protocol, Dashboard Independence |
| 1.5 | 2025 | Initial release |

**Document End.**