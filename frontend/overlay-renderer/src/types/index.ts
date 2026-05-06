export interface OverlayConfig {
  enabled: boolean;
  border: {
    color: string;
    pausedColor: string;
    width: string;
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
    offsetY: number;
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

export interface ExecutionState {
  isRunning: boolean;
  isPaused: boolean;
  currentThought: string;
  currentAction: ActionInfo | null;
  iteration: number;
}

export interface ActionInfo {
  type: 'click' | 'type' | 'navigate' | 'wait' | 'unknown';
  target?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  text?: string;
  description: string;
}

export interface OverlayMessage {
  type: 'update-state' | 'config-change' | 'task-started' | 'task-finished' | 'task-paused' | 'task-resumed';
  payload?: ExecutionState | Partial<OverlayConfig>;
}

export type ToolType = 'click' | 'type' | 'wait_for_loading' | 'navigate' | 'screenshot' | 'other';

export interface ToolExecutionInfo {
  toolType: ToolType;
  targetElement?: DOMRect;
  inputText?: string;
  description: string;
}