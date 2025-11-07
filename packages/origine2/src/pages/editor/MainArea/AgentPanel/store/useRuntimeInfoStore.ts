import { create } from 'zustand';
import type { RuntimeInfoResponse, ToolError } from '@/api/agentClient';

interface RuntimeInfoState {
  info: RuntimeInfoResponse | null;
  loading: boolean;
  error: ToolError | null;

  // Actions
  fetchRuntimeInfo: () => Promise<void>;
  clearError: () => void;
}

export const useRuntimeInfoStore = create<RuntimeInfoState>((set) => ({
  info: null,
  loading: false,
  error: null,

  fetchRuntimeInfo: async () => {
    set({ loading: true, error: null });

    try {
      const { agentClient } = await import('@/api/agentClient');
      const info = await agentClient.getRuntimeInfo();
      set({ info, loading: false });
    } catch (err: any) {
      const errorData = err.response?.data;
      set({
        error: errorData || { code: 'E_INTERNAL', message: err.message },
        loading: false,
      });
    }
  },

  clearError: () => {
    set({ error: null });
  },
}));

