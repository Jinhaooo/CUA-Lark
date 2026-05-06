import { createRoot } from 'react-dom/client';
import App from './App.tsx';

createRoot(document.getElementById('root')!).render(<App />);

declare const window: Window & {
  electron?: {
    ipcRenderer?: {
      send: (channel: string, ...args: unknown[]) => void;
      on: (channel: string, listener: (...args: unknown[]) => void) => void;
    };
  };
};

window.electron?.ipcRenderer?.on('overlay:update-state', (_, state) => {
  console.log('Received state update:', state);
});

window.electron?.ipcRenderer?.on('overlay:config-change', (_, config) => {
  console.log('Received config update:', config);
});