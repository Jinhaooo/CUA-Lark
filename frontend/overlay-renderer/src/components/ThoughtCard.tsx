import { useStore } from '../store/overlayStore';

export function ThoughtCard() {
  const { config, state } = useStore();

  if (!config.thoughtCard.enabled || !state.isRunning || !state.currentThought) {
    return null;
  }

  const positionStyles = {
    'top-left': {
      top: config.thoughtCard.offsetY,
      left: config.thoughtCard.offsetX,
      bottom: 'auto',
      right: 'auto',
    },
    'top-right': {
      top: config.thoughtCard.offsetY,
      right: config.thoughtCard.offsetX,
      bottom: 'auto',
      left: 'auto',
    },
    'bottom-left': {
      bottom: config.thoughtCard.offsetY,
      left: config.thoughtCard.offsetX,
      top: 'auto',
      right: 'auto',
    },
    'bottom-right': {
      bottom: config.thoughtCard.offsetY,
      right: config.thoughtCard.offsetX,
      top: 'auto',
      left: 'auto',
    },
  };

  return (
    <div
      className="fixed z-[9998] animate-slide-up pointer-events-none"
      style={{
        ...positionStyles[config.thoughtCard.position],
        maxWidth: config.thoughtCard.maxWidth,
        backgroundColor: config.thoughtCard.backgroundColor,
        color: config.thoughtCard.textColor,
        fontSize: config.thoughtCard.fontSize,
        borderRadius: config.thoughtCard.borderRadius,
        padding: config.thoughtCard.padding,
        boxShadow: config.thoughtCard.shadow,
      }}
    >
      <div className="flex items-start gap-3">
        <div
          className="flex-shrink-0 mt-0.5"
          style={{
            width: '12px',
            height: '12px',
            borderRadius: '50%',
            backgroundColor: state.isPaused ? config.border.pausedColor : config.border.color,
            animation: !state.isPaused ? 'breathe 1s ease-in-out infinite' : undefined,
          }}
        />
        <p className="leading-relaxed break-words">{state.currentThought}</p>
      </div>
      {state.currentAction && (
        <div className="mt-3 pt-3 border-t border-white/10">
          <div className="text-xs text-white/60 uppercase tracking-wide mb-1">
            {state.currentAction.type}
          </div>
          <div className="text-sm opacity-80">
            {state.currentAction.text || state.currentAction.description}
          </div>
        </div>
      )}
    </div>
  );
}