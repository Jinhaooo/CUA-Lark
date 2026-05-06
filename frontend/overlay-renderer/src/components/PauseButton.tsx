import { useState } from 'react';
import { useStore } from '../store/overlayStore';

declare const window: Window & {
  electron?: {
    ipcRenderer?: {
      send: (channel: string, ...args: unknown[]) => void;
      on: (channel: string, listener: (...args: unknown[]) => void) => void;
    };
  };
};

export function PauseButton() {
  const { config, state, setState } = useStore();
  const [isHovered, setIsHovered] = useState(false);

  if (!config.pauseButton.enabled || !state.isRunning) {
    if (isHovered) {
      window.electron?.ipcRenderer?.send('overlay:disable-mouse-forwarding');
    }
    return null;
  }

  const handleMouseEnter = () => {
    setIsHovered(true);
    window.electron?.ipcRenderer?.send('overlay:enable-mouse-forwarding');
  };

  const handleMouseLeave = () => {
    setIsHovered(false);
    window.electron?.ipcRenderer?.send('overlay:disable-mouse-forwarding');
  };

  const handleClick = async () => {
    if (state.isPaused) {
      window.electron?.ipcRenderer?.send('overlay:resume-task');
      setState({ isPaused: false });
    } else {
      window.electron?.ipcRenderer?.send('overlay:pause-task');
      setState({ isPaused: true });
    }
  };

  const positionStyles = {
    left: {
      left: 0,
      right: 'auto',
    },
    right: {
      right: 0,
      left: 'auto',
    },
  };

  return (
    <div
      className="fixed z-[9999] cursor-pointer animate-fade-in"
      style={{
        ...positionStyles[config.pauseButton.position],
        top: typeof config.pauseButton.offsetY === 'number' ? `${config.pauseButton.offsetY}%` : config.pauseButton.offsetY,
        transform: 'translateY(-50%)',
        width: config.pauseButton.width,
        height: config.pauseButton.height,
        marginLeft: config.pauseButton.position === 'left' ? '8px' : undefined,
        marginRight: config.pauseButton.position === 'right' ? '8px' : undefined,
      }}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onClick={handleClick}
    >
      <div
        className="w-full h-full rounded-full flex items-center justify-center transition-all duration-200"
        style={{
          backgroundColor: isHovered
            ? config.pauseButton.hoverColor
            : config.pauseButton.backgroundColor,
          boxShadow: isHovered ? '0 4px 20px rgba(139, 92, 246, 0.5)' : '0 2px 10px rgba(0, 0, 0, 0.3)',
          transform: isHovered ? 'scale(1.1)' : 'scale(1)',
        }}
      >
        {state.isPaused ? (
          <svg
            style={{ width: config.pauseButton.iconSize, height: config.pauseButton.iconSize }}
            viewBox="0 0 24 24"
            fill="none"
            stroke="white"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polygon points="5 3 19 12 5 21 5 3" />
          </svg>
        ) : (
          <svg
            style={{ width: config.pauseButton.iconSize, height: config.pauseButton.iconSize }}
            viewBox="0 0 24 24"
            fill="none"
            stroke="white"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <rect x="6" y="4" width="4" height="16" />
            <rect x="14" y="4" width="4" height="16" />
          </svg>
        )}
      </div>
      {isHovered && (
        <div
          className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-1 rounded text-xs text-white whitespace-nowrap animate-fade-in"
          style={{
            backgroundColor: 'rgba(0, 0, 0, 0.85)',
          }}
        >
          {state.isPaused ? 'Resume (Click)' : 'Pause (Click)'}
        </div>
      )}
    </div>
  );
}