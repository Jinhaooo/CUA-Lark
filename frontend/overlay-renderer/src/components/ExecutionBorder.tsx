import { useStore } from '../store/overlayStore';

export function ExecutionBorder() {
  const { config, state } = useStore();

  if (!config.enabled || !state.isRunning) return null;

  const borderColor = state.isPaused ? config.border.pausedColor : config.border.color;

  return (
    <div
      className="fixed inset-0 pointer-events-none z-[9999]"
      style={{
        borderWidth: config.border.width,
        borderStyle: 'solid',
        borderColor,
        animation: !state.isPaused ? `breathe ${config.border.breathDurationMs}ms ease-in-out infinite` : undefined,
      }}
    />
  );
}