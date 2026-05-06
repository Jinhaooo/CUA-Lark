export type PauseReason = 'user_hotkey' | 'user_button' | 'user_dashboard';

export interface PauseController {
  readonly state: 'running' | 'paused';
  readonly pausedAtIteration?: number;

  pause(reason: PauseReason): { paused: boolean; alreadyPaused: boolean; pausedAtIteration: number };
  resume(): { resumed: boolean; alreadyRunning: boolean; resumedAtIteration: number };
  skipNextTool(): { skipped: boolean };

  pauseSignal(): AbortSignal;
  waitForResume(): Promise<void>;
}

export class PauseControllerImpl implements PauseController {
  private stateValue: 'running' | 'paused' = 'running';
  private pausedAtIterationValue?: number;
  private resumeResolve?: () => void;
  private resumePromise?: Promise<void>;
  private abortController: AbortController = new AbortController();
  private iteration = 0;

  get state(): 'running' | 'paused' {
    return this.stateValue;
  }

  get pausedAtIteration(): number | undefined {
    return this.pausedAtIterationValue;
  }

  set currentIteration(value: number) {
    this.iteration = value;
  }

  pause(reason: PauseReason): { paused: boolean; alreadyPaused: boolean; pausedAtIteration: number } {
    if (this.stateValue === 'paused') {
      return { paused: false, alreadyPaused: true, pausedAtIteration: this.pausedAtIterationValue ?? 0 };
    }

    this.stateValue = 'paused';
    this.pausedAtIterationValue = this.iteration;
    this.abortController.abort();

    this.resumePromise = new Promise((resolve) => {
      this.resumeResolve = resolve;
    });

    return { paused: true, alreadyPaused: false, pausedAtIteration: this.iteration };
  }

  resume(): { resumed: boolean; alreadyRunning: boolean; resumedAtIteration: number } {
    if (this.stateValue === 'running') {
      return { resumed: false, alreadyRunning: true, resumedAtIteration: this.iteration };
    }

    this.stateValue = 'running';
    this.abortController = new AbortController();
    
    if (this.resumeResolve) {
      this.resumeResolve();
      this.resumeResolve = undefined;
      this.resumePromise = undefined;
    }

    return { resumed: true, alreadyRunning: false, resumedAtIteration: this.iteration };
  }

  skipNextTool(): { skipped: boolean } {
    if (this.stateValue !== 'paused') {
      return { skipped: false };
    }
    return { skipped: true };
  }

  pauseSignal(): AbortSignal {
    return this.abortController.signal;
  }

  waitForResume(): Promise<void> {
    if (this.stateValue === 'running') {
      return Promise.resolve();
    }
    return this.resumePromise ?? Promise.resolve();
  }
}