import { globalShortcut } from 'electron';
import { StatusEnum } from '@ui-tars/shared/types';
import { store } from '../store/create';
import { closeScreenMarker } from '../window/ScreenMarker';
import { logger } from '../logger';
import * as env from '@main/env';

let registered = false;

const isAgentActive = (status: StatusEnum): boolean =>
  status === StatusEnum.RUNNING ||
  status === StatusEnum.PAUSE ||
  status === StatusEnum.CALL_USER;

const handleEscape = async () => {
  const { status, abortController, currentTaskId } = store.getState();
  if (!isAgentActive(status)) return;

  logger.info('[escapeStop] ESC pressed → attempting to pause task');

  if (currentTaskId) {
    try {
      const response = await fetch(`${env.serverUrl}/tasks/${currentTaskId}/pause`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ reason: 'user_hotkey' }),
      });

      if (response.ok) {
        const result = await response.json();
        logger.info('[escapeStop] Task paused via API:', result);
        store.setState({
          status: StatusEnum.PAUSE,
          thinking: false,
        });
        try {
          closeScreenMarker();
        } catch (err) {
          logger.warn('[escapeStop] closeScreenMarker failed:', err);
        }
        return;
      } else {
        logger.warn('[escapeStop] API pause failed, falling back to abort');
      }
    } catch (error) {
      logger.warn('[escapeStop] Failed to call pause API:', error);
    }
  }

  abortController?.abort();
  store.setState({
    status: StatusEnum.USER_STOPPED,
    thinking: false,
  });
  try {
    closeScreenMarker();
  } catch (err) {
    logger.warn('[escapeStop] closeScreenMarker failed:', err);
  }
};

const setRegistration = (active: boolean) => {
  if (active && !registered) {
    const ok = globalShortcut.register('Escape', handleEscape);
    if (ok) {
      registered = true;
      logger.info('[escapeStop] Escape shortcut registered (agent active)');
    } else {
      logger.warn('[escapeStop] Failed to register Escape shortcut');
    }
  } else if (!active && registered) {
    globalShortcut.unregister('Escape');
    registered = false;
    logger.info('[escapeStop] Escape shortcut released');
  }
};

export function setupEscapeStop() {
  setRegistration(isAgentActive(store.getState().status));

  store.subscribe((state, prev) => {
    if (state.status === prev.status) return;
    setRegistration(isAgentActive(state.status));
  });
}
