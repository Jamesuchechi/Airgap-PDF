import type { Asset, SerializedAirgapError } from '@airgap-pdf/core';
import { create } from 'zustand';

export interface JobState {
  id: string;
  toolId: string;
  status: 'running' | 'done' | 'error' | 'cancelled';
  progress: number;
  message?: string;
  stalled?: boolean;
  error?: SerializedAirgapError;
  cancel?: () => void;
}

interface WorkspaceState {
  history: Asset[][];
  cursor: number;
  activeJob: JobState | null;
  memoryWarning: string | null;

  currentAssets(): Asset[];
  canUndo(): boolean;
  canRedo(): boolean;
  setInitialAssets(assets: Asset[]): void;
  pushResult(assets: Asset[]): void;
  undo(): void;
  redo(): void;
  clear(): void;
  setActiveJob(job: JobState | null): void;
  setMemoryWarning(msg: string | null): void;
}

export const useWorkspaceStore = create<WorkspaceState>((set, get) => ({
  history: [],
  cursor: -1,
  activeJob: null,
  memoryWarning: null,

  currentAssets() {
    const { history, cursor } = get();
    if (cursor < 0 || cursor >= history.length) return [];
    return history[cursor] ?? [];
  },

  canUndo() {
    return get().cursor > 0;
  },

  canRedo() {
    const { history, cursor } = get();
    return cursor >= 0 && cursor < history.length - 1;
  },

  setInitialAssets(assets) {
    set({ history: [assets], cursor: 0, memoryWarning: null });
  },

  pushResult(assets) {
    const { history, cursor } = get();
    const next = history.slice(0, cursor + 1);
    next.push(assets);
    set({ history: next, cursor: next.length - 1 });
  },

  undo() {
    const { cursor } = get();
    if (cursor > 0) set({ cursor: cursor - 1 });
  },

  redo() {
    const { history, cursor } = get();
    if (cursor < history.length - 1) set({ cursor: cursor + 1 });
  },

  clear() {
    set({ history: [], cursor: -1, activeJob: null, memoryWarning: null });
  },

  setActiveJob(job) {
    set({ activeJob: job });
  },

  setMemoryWarning(msg) {
    set({ memoryWarning: msg });
  },
}));
