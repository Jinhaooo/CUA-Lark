export type CuaEntryMode = 'icon' | 'panel' | 'full';

export const CUA_ENTRY_MODE_KEY = 'lark-cua-entry-mode';
export const CUA_ENTRY_MODE_EVENT = 'lark-cua-entry-mode-change';

export const getCuaEntryMode = (): CuaEntryMode => {
  if (typeof window === 'undefined') return 'icon';
  const mode = window.sessionStorage.getItem(CUA_ENTRY_MODE_KEY);
  return mode === 'panel' || mode === 'full' || mode === 'icon'
    ? mode
    : 'icon';
};

export const setCuaEntryMode = (mode: CuaEntryMode) => {
  if (typeof window === 'undefined') return;
  window.sessionStorage.setItem(CUA_ENTRY_MODE_KEY, mode);
  window.dispatchEvent(
    new CustomEvent<CuaEntryMode>(CUA_ENTRY_MODE_EVENT, { detail: mode }),
  );
};
