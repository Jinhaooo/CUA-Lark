import { useStore } from '../store/overlayStore';

export function ActionHighlight() {
  const { config, state } = useStore();

  if (!config.highlight.enabled || !state.isRunning || !state.currentAction?.target) {
    return null;
  }

  const { x, y, width, height } = state.currentAction.target;

  return (
    <>
      <div
        className="fixed pointer-events-none z-[9998] animate-highlight-pulse"
        style={{
          left: x - parseInt(config.highlight.padding),
          top: y - parseInt(config.highlight.padding),
          width: width + parseInt(config.highlight.padding) * 2,
          height: height + parseInt(config.highlight.padding) * 2,
          border: `2px solid ${config.highlight.color}`,
          borderRadius: config.highlight.borderRadius,
          backgroundColor: `${config.highlight.color}10`,
        }}
      />
      <div
        className="fixed pointer-events-none z-[9997]"
        style={{
          left: x - parseInt(config.highlight.padding) - 8,
          top: y - parseInt(config.highlight.padding) - 8,
          width: width + parseInt(config.highlight.padding) * 2 + 16,
          height: height + parseInt(config.highlight.padding) * 2 + 16,
          border: `1px solid ${config.highlight.color}40`,
          borderRadius: config.highlight.borderRadius,
          animation: 'pulse-ring 1.5s ease-out infinite',
        }}
      />
    </>
  );
}