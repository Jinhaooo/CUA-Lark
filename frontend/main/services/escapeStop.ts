import { globalShortcut } from 'electron';
import { StatusEnum } from '@ui-tars/shared/types';
import { store } from '../store/create';
import { closeScreenMarker } from '../window/ScreenMarker';
import { logger } from '../logger';

let registered = false;

const isAgentActive = (status: StatusEnum): boolean =>
  status === StatusEnum.RUNNING ||
  status === StatusEnum.PAUSE ||
  status === StatusEnum.CALL_USER;

const handleEscape = () => {
  const { status, abortController } = store.getState();
  if (!isAgentActive(status)) return;

  logger.info('[escapeStop] ESC pressed → aborting agent task');
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
