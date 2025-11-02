import { create } from 'zustand';
import type { ToolError } from '@/api/agentClient';

export interface AgentResult {
  type: 'read' | 'diff' | 'apply' | 'validate' | 'resources';
  data: any;
}

interface AgentResultsState {
  result: AgentResult | null;
  error: ToolError | null;
  setResult: (result: AgentResult) => void;
  setError: (error: ToolError) => void;
  clearResults: () => void;
}

export const useAgentResultsStore = create<AgentResultsState>((set) => ({
  result: null,
  error: null,
  setResult: (result) => set({ result, error: null }),
  setError: (error) => set({ error, result: null }),
  clearResults: () => set({ result: null, error: null }),
}));

