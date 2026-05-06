import { BrowserWindow } from 'electron';
import ElectronStore from 'electron-store';

interface WindowBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface WindowState {
  bounds: WindowBounds;
  isCompact: boolean;
}

const store = new ElectronStore<{
  windowState?: WindowState;
}>();

const COMPACT_WIDTH = 420;
const COMPACT_HEIGHT = 520;
const EXPANDED_WIDTH = 800;
const EXPANDED_HEIGHT = 600;

export function getSavedWindowState(): WindowState | null {
  return store.get('windowState') || null;
}

export function saveWindowState(bounds: WindowBounds, isCompact: boolean) {
  store.set('windowState', { bounds, isCompact });
}

export function toggleWindowMode(window: BrowserWindow): boolean {
  const currentBounds = window.getBounds();
  const isCompact = currentBounds.width <= COMPACT_WIDTH + 10;

  const display = require('electron').screen.getPrimaryDisplay();
  const { width: screenWidth, height: screenHeight } = display.workAreaSize;

  let newBounds: WindowBounds;
  let newIsCompact: boolean;

  if (isCompact) {
    newBounds = {
      x: Math.max(0, Math.floor((screenWidth - EXPANDED_WIDTH) / 2)),
      y: Math.max(0, Math.floor((screenHeight - EXPANDED_HEIGHT) / 2)),
      width: EXPANDED_WIDTH,
      height: EXPANDED_HEIGHT,
    };
    newIsCompact = false;
  } else {
    newBounds = {
      x: Math.max(0, Math.floor((screenWidth - COMPACT_WIDTH) / 2)),
      y: Math.max(0, Math.floor((screenHeight - COMPACT_HEIGHT) / 2)),
      width: COMPACT_WIDTH,
      height: COMPACT_HEIGHT,
    };
    newIsCompact = true;
  }

  window.setBounds(newBounds);
  saveWindowState(newBounds, newIsCompact);

  return newIsCompact;
}

export function initializeWindowBounds(window: BrowserWindow) {
  const savedState = getSavedWindowState();

  if (savedState) {
    window.setBounds(savedState.bounds);
    return savedState.isCompact;
  }

  const display = require('electron').screen.getPrimaryDisplay();
  const { width: screenWidth, height: screenHeight } = display.workAreaSize;

  const defaultBounds: WindowBounds = {
    x: Math.max(0, Math.floor((screenWidth - EXPANDED_WIDTH) / 2)),
    y: Math.max(0, Math.floor((screenHeight - EXPANDED_HEIGHT) / 2)),
    width: EXPANDED_WIDTH,
    height: EXPANDED_HEIGHT,
  };

  window.setBounds(defaultBounds);
  saveWindowState(defaultBounds, false);

  return false;
}

export function setupBoundsPersistence(window: BrowserWindow) {
  window.on('resize', () => {
    const bounds = window.getBounds();
    const isCompact = bounds.width <= COMPACT_WIDTH + 10;
    saveWindowState(bounds, isCompact);
  });

  window.on('move', () => {
    const bounds = window.getBounds();
    const isCompact = bounds.width <= COMPACT_WIDTH + 10;
    saveWindowState(bounds, isCompact);
  });
}