import { create } from 'zustand';
import type { SnapshotMetadata, ToolError, Diff } from '@/api/agentClient';

/**
 * 快照恢复流程状态
 */
export interface SnapshotRestoreState {
  snapshotId: string;
  path: string;
  content: string;
  diff?: Diff;
  applied?: boolean;
  newSnapshotId?: string;
}

/**
 * 快照过滤参数
 */
export interface SnapshotFilters {
  path?: string;
  limit: number;
}

interface SnapshotsState {
  // 快照列表
  snapshots: SnapshotMetadata[];
  loading: boolean;
  error: ToolError | null;

  // 过滤参数
  filters: SnapshotFilters;

  // 选中的快照
  selectedId: string | null;

  // 恢复流程状态
  restoreState: SnapshotRestoreState | null;
  restoring: boolean;
  applyLoading: boolean;

  // Actions
  setFilters: (filters: Partial<SnapshotFilters>) => void;
  fetchSnapshots: () => Promise<void>;
  selectSnapshot: (id: string | null) => void;
  restoreSnapshot: (snapshotId: string) => Promise<void>;
  dryRunRestore: () => Promise<void>;
  applyRestore: (idempotencyKey?: string) => Promise<void>;
  retryDryRun: () => Promise<void>;
  clearRestore: () => void;
  copySnapshotId: (id: string) => void;
}

export const useSnapshotsStore = create<SnapshotsState>((set, get) => ({
  // 初始状态
  snapshots: [],
  loading: false,
  error: null,

  filters: {
    limit: 50,
  },

  selectedId: null,
  restoreState: null,
  restoring: false,
  applyLoading: false,

  // 设置过滤参数
  setFilters: (newFilters) => {
    set((state) => ({
      filters: { ...state.filters, ...newFilters },
    }));
    // 自动重新获取
    get().fetchSnapshots();
  },

  // 获取快照列表
  fetchSnapshots: async () => {
    const { filters } = get();
    set({ loading: true, error: null });

    try {
      const { agentClient } = await import('@/api/agentClient');
      const response = await agentClient.listSnapshots(filters);
      set({ snapshots: response.snapshots, loading: false });
    } catch (err: any) {
      const errorData = err.response?.data;
      set({
        error: errorData || { code: 'E_INTERNAL', message: err.message },
        loading: false,
      });
    }
  },

  // 选择快照
  selectSnapshot: (id) => {
    set({ selectedId: id });
    if (!id) {
      set({ restoreState: null });
    }
  },

  // 恢复快照内容（第一步：获取内容）
  restoreSnapshot: async (snapshotId) => {
    set({ restoring: true, error: null });

    try {
      const { agentClient } = await import('@/api/agentClient');
      const { path, content } = await agentClient.restoreSnapshot({ snapshotId });

      set({
        restoreState: {
          snapshotId,
          path,
          content,
        },
        restoring: false,
        selectedId: snapshotId,
      });

      // 自动执行 Dry-run
      await get().dryRunRestore();
    } catch (err: any) {
      const errorData = err.response?.data;
      set({
        error: errorData || { code: 'E_INTERNAL', message: err.message },
        restoring: false,
      });
    }
  },

  // Dry-run 预览 Diff
  dryRunRestore: async () => {
    const { restoreState } = get();
    if (!restoreState) return;

    set({ restoring: true, error: null });

    try {
      const { agentClient } = await import('@/api/agentClient');
      const result = await agentClient.writeToFile({
        path: restoreState.path,
        content: restoreState.content,
        dryRun: true,
      });

      set({
        restoreState: {
          ...restoreState,
          diff: result.diff,
        },
        restoring: false,
      });
    } catch (err: any) {
      const errorData = err.response?.data;
      set({
        error: errorData || { code: 'E_INTERNAL', message: err.message },
        restoring: false,
      });
    }
  },

  // 应用恢复（实际写入）
  applyRestore: async (idempotencyKey?: string) => {
    const { restoreState } = get();
    if (!restoreState) return;

    set({ applyLoading: true, error: null });

    try {
      const { agentClient } = await import('@/api/agentClient');
      const result = await agentClient.writeToFile({
        path: restoreState.path,
        content: restoreState.content,
        dryRun: false,
        idempotencyKey,
      });

      set({
        restoreState: {
          ...restoreState,
          applied: true,
          newSnapshotId: result.snapshotId,
        },
        applyLoading: false,
      });

      // 刷新快照列表
      await get().fetchSnapshots();
    } catch (err: any) {
      const errorData = err.response?.data;
      set({
        error: errorData || { code: 'E_INTERNAL', message: err.message },
        applyLoading: false,
      });
    }
  },

  // 重试 Dry-run（用于 E_CONFLICT 场景）
  retryDryRun: async () => {
    await get().dryRunRestore();
  },

  // 清除恢复状态
  clearRestore: () => {
    set({
      restoreState: null,
      selectedId: null,
      error: null,
    });
  },

  // 复制快照 ID 到剪贴板
  copySnapshotId: (id) => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(id).catch((err) => {
        console.error('Failed to copy snapshot ID:', err);
      });
    }
  },
}));

