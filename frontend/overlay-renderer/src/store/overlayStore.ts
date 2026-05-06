import { create } from 'zustand';
import type { ExecutionState, OverlayConfig } from '../types';

export type OverlayStoreState = {
  config: OverlayConfig;
  state: ExecutionState;
  setConfig: (config: Partial<OverlayConfig>) => void;
  setState: (state: Partial<ExecutionState>) => void;
  resetState: () => void;
};

const defaultConfig: OverlayConfig = {
  enabled: true,
  border: {
    color: '#8B5CF6',
    pausedColor: '#F97316',
    width: '0.4vh',
    breathDurationMs: 2000,
  },
  highlight: {
    enabled: true,
    color: '#8B5CF6',
    borderRadius: '4px',
    padding: '4px',
  },
  thoughtCard: {
    enabled: true,
    position: 'bottom-left',
    offsetX: 20,
    offsetY: 20,
    maxWidth: '400px',
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    textColor: '#ffffff',
    fontSize: '14px',
    borderRadius: '8px',
    padding: '12px 16px',
    shadow: '0 4px 20px rgba(0, 0, 0, 0.4)',
  },
  pauseButton: {
    enabled: true,
    position: 'right',
    offsetY: 50,
    width: '48px',
    height: '48px',
    backgroundColor: 'rgba(139, 92, 246, 0.9)',
    hoverColor: 'rgba(139, 92, 246, 1)',
    iconSize: '24px',
  },
  hotkey: {
    enabled: true,
    pauseKey: 'Escape',
    resumeKey: 'Escape',
  },
  display: {
    alwaysOnTop: true,
    ignoreMouseEvents: true,
  },
};

const defaultState: ExecutionState = {
  isRunning: false,
  isPaused: false,
  currentThought: '',
  currentAction: null,
  iteration: 0,
};

export const useStore = create<OverlayStoreState>((set) => ({
  config: defaultConfig,
  state: defaultState,
  setConfig: (newConfig) =>
    set((prev) => ({
      config: { ...prev.config, ...newConfig },
    })),
  setState: (newState) =>
    set((prev) => ({
      state: { ...prev.state, ...newState },
    })),
  resetState: () =>
    set({
      state: defaultState,
    }),
}));

export const overlayStore = useStore;