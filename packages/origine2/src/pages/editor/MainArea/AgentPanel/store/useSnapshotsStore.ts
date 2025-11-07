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

  // 并发控制
  listRevision: number;
  opToken: string | null;


  // Actions
  setFilters: (filters: Partial<SnapshotFilters>) => void;
  fetchSnapshots: () => Promise<void>;
  selectSnapshot: (id: string | null) => void;
  restoreSnapshot: (snapshotId: string) => Promise<void>;
  dryRunRestore: (token?: string) => Promise<void>;
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


	  // 并发控制初始值
	  listRevision: 0,
	  opToken: null,

  // 设置过滤参数
  setFilters: (newFilters) => {
    set((state) => ({
      filters: { ...state.filters, ...newFilters },
    }));
    // 自动重新获取
    get().fetchSnapshots();
  },

  // 获取快照列表（并发安全：完成后校验选中项仍在列表）
  fetchSnapshots: async () => {
    const { filters, selectedId, listRevision } = get();
    set({ loading: true, error: null });

    try {
      const { agentClient } = await import('@/api/agentClient');
      const response = await agentClient.listSnapshots(filters);
      const nextRev = (listRevision || 0) + 1;
      const exists = selectedId ? response.snapshots.some((s) => s.id === selectedId) : false;
      set({ snapshots: response.snapshots, loading: false, listRevision: nextRev });
      if (selectedId && !exists) {
        set({
          selectedId: null,
          restoreState: null,
          error: { code: 'E_SELECTION_INVALIDATED', message: '当前选中的快照已不存在或列表已更新，请重新选择。' },
        });
      }
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
    if (!id) {
      set({ selectedId: null, restoreState: null, opToken: null });
      return;
    }
    // 切换选择时清空旧的预览，具体内容由 restoreSnapshot 重新拉取
    set({ selectedId: id, restoreState: null });
  },

  // 恢复快照内容（第一步：获取内容）
  restoreSnapshot: async (snapshotId) => {
    const token = `rs:${snapshotId}:${Date.now()}:${Math.random().toString(36).slice(2)}`;
    set({ restoring: true, error: null, opToken: token, selectedId: snapshotId, restoreState: null });

    try {
      const { agentClient } = await import('@/api/agentClient');
      const { path, content } = await agentClient.restoreSnapshot({ snapshotId });

      // 期间若用户切换了选择/过滤，终止旧请求的落地
      if (get().opToken !== token) {
        return;
      }

      set({
        restoreState: {
          snapshotId,
          path,
          content,
        },
        restoring: false,
      });

      // 自动执行 Dry-run（携带 token 做并发校验）
      await get().dryRunRestore(token);
    } catch (err: any) {
      if (get().opToken !== token) {
        return;
      }
      const errorData = err.response?.data;
      set({
        error: errorData || { code: 'E_INTERNAL', message: err.message },
        restoring: false,
      });
    }
  },

  // Dry-run 预览 Diff（并发安全）
  dryRunRestore: async (token?: string) => {
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

      // 如果 token 不匹配，说明期间用户已切换选择，丢弃结果
      if (token && get().opToken !== token) {
        return;
      }

      set({
        restoreState: {
          ...restoreState,
          diff: result.diff,
        },
        restoring: false,
      });
    } catch (err: any) {
      if (token && get().opToken !== token) {
        return;
      }
      const errorData = err.response?.data;
      set({
        error: errorData || { code: 'E_INTERNAL', message: err.message },
        restoring: false,
      });
    }
  },

  // 应用恢复（实际写入）——并发安全：操作 token 与后置校验
  applyRestore: async (idempotencyKey?: string) => {
    const { restoreState } = get();
    if (!restoreState) return;

    const token = `apply:${restoreState.snapshotId}:${Date.now()}:${Math.random().toString(36).slice(2)}`;
    set({ applyLoading: true, error: null, opToken: token });

    try {
      const { agentClient } = await import('@/api/agentClient');
      const result = await agentClient.writeToFile({
        path: restoreState.path,
        content: restoreState.content,
        dryRun: false,
        idempotencyKey,
      });

      if (get().opToken !== token) {
        // 用户在应用过程中切换了选择/过滤，避免旧结果覆盖当前 UI 状态
        return;
      }

      set({
        restoreState: {
          ...restoreState,
          applied: true,
          newSnapshotId: result.snapshotId,
        },
        applyLoading: false,
      });

      // 刷新快照列表（内部会在选中项消失时清理 restoreState/selectedId）
      await get().fetchSnapshots();
    } catch (err: any) {
      if (get().opToken !== token) {
        return;
      }
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
      opToken: null,
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

