'use client';

import { useState, useCallback, useEffect } from 'react';
import { useFlowStore, FlowNode, FlowEdge } from '@/stores/flowStore';

// ============================================
// TYPES
// ============================================

interface UseFlowBuilderOptions {
  automationId?: string;
  organizationId: string;
  storeId?: string;
  onSaveSuccess?: (automationId: string) => void;
  onSaveError?: (error: string) => void;
}

interface AutomationData {
  id?: string;
  name: string;
  description?: string;
  status: 'draft' | 'active' | 'paused' | 'error';
  nodes: FlowNode[];
  edges: FlowEdge[];
  settings?: Record<string, any>;
}

// ============================================
// HOOK
// ============================================

export function useFlowBuilder(options: UseFlowBuilderOptions) {
  const {
    automationId,
    organizationId,
    storeId,
    onSaveSuccess,
    onSaveError,
  } = options;

  // Local state
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<any>(null);

  // Store state
  const nodes = useFlowStore((s) => s.nodes);
  const edges = useFlowStore((s) => s.edges);
  const automationName = useFlowStore((s) => s.automationName);
  const automationDescription = useFlowStore((s) => s.automationDescription);
  const automationStatus = useFlowStore((s) => s.automationStatus);
  const isDirty = useFlowStore((s) => s.isDirty);
  const isSaving = useFlowStore((s) => s.isSaving);

  // Store actions
  const loadAutomation = useFlowStore((s) => s.loadAutomation);
  const resetStore = useFlowStore((s) => s.resetStore);
  const setSaving = useFlowStore((s) => s.setSaving);
  const markSaved = useFlowStore((s) => s.markSaved);
  const setAutomationId = useFlowStore((s) => s.setAutomationId);
  const validateFlow = useFlowStore((s) => s.validateFlow);
  const updateNodeStatus = useFlowStore((s) => s.updateNodeStatus);
  const resetNodeStatuses = useFlowStore((s) => s.resetNodeStatuses);
  const startExecution = useFlowStore((s) => s.startExecution);
  const completeExecution = useFlowStore((s) => s.completeExecution);

  // ============================================
  // LOAD AUTOMATION
  // ============================================

  const load = useCallback(async () => {
    if (!automationId || automationId === 'new') {
      resetStore();
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/automations?id=${automationId}`);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to load automation');
      }

      const automation = data.automation;

      loadAutomation({
        id: automation.id,
        name: automation.name || 'Nova Automação',
        description: automation.description,
        status: automation.status || 'draft',
        nodes: automation.nodes || [],
        edges: automation.edges || [],
      });

    } catch (err: any) {
      setError(err.message);
      console.error('Error loading automation:', err);
    } finally {
      setIsLoading(false);
    }
  }, [automationId, loadAutomation, resetStore]);

  // Load on mount or when ID changes
  useEffect(() => {
    load();
  }, [load]);

  // ============================================
  // SAVE AUTOMATION
  // ============================================

  const save = useCallback(async (): Promise<string | undefined> => {
    setSaving(true);
    setError(null);

    try {
      const currentId = useFlowStore.getState().automationId;
      const isNew = !currentId || currentId === 'new';

      // Prepare data
      const payload: Record<string, any> = {
        name: automationName,
        description: automationDescription,
        nodes,
        edges,
        status: automationStatus,
      };

      if (!isNew) {
        payload.id = currentId;
      } else {
        payload.organization_id = organizationId;
        if (storeId) {
          payload.store_id = storeId;
        }
      }

      // API call
      const response = await fetch('/api/automations', {
        method: isNew ? 'POST' : 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to save automation');
      }

      const savedId = data.automation?.id;
      
      if (isNew && savedId) {
        setAutomationId(savedId);
      }
      
      markSaved();
      onSaveSuccess?.(savedId);

      return savedId;

    } catch (err: any) {
      setError(err.message);
      onSaveError?.(err.message);
      console.error('Error saving automation:', err);
      return undefined;
    } finally {
      setSaving(false);
    }
  }, [
    automationName,
    automationDescription,
    automationStatus,
    nodes,
    edges,
    organizationId,
    storeId,
    setSaving,
    markSaved,
    setAutomationId,
    onSaveSuccess,
    onSaveError,
  ]);

  // ============================================
  // TEST AUTOMATION
  // ============================================

  const test = useCallback(async (triggerData?: Record<string, any>) => {
    // Validate first
    const validation = validateFlow();
    if (!validation.valid) {
      setError(validation.errors.join(', '));
      return null;
    }

    setIsTesting(true);
    setTestResult(null);
    resetNodeStatuses();

    try {
      // Get current automation ID (save first if new)
      let id = useFlowStore.getState().automationId;
      
      if (!id || id === 'new') {
        id = await save();
        if (!id) {
          throw new Error('Salve a automação antes de testar');
        }
      }

      startExecution(`test_${Date.now()}`, triggerData);

      // Call test endpoint
      const response = await fetch('/api/workers/automation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'test',
          automationId: id,
          triggerData,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Test failed');
      }

      // Update node statuses from result
      if (result.nodeResults) {
        for (const [nodeId, nodeResult] of Object.entries(result.nodeResults) as any) {
          updateNodeStatus(
            nodeId,
            nodeResult.status,
            nodeResult.error || undefined,
            nodeResult.duration
          );
        }
      }

      completeExecution(result.status === 'success', result.error);
      setTestResult(result);

      return result;

    } catch (err: any) {
      setError(err.message);
      completeExecution(false, err.message);
      console.error('Error testing automation:', err);
      return null;
    } finally {
      setIsTesting(false);
    }
  }, [
    validateFlow,
    save,
    startExecution,
    completeExecution,
    updateNodeStatus,
    resetNodeStatuses,
  ]);

  // ============================================
  // TOGGLE STATUS
  // ============================================

  const toggleStatus = useCallback(async () => {
    const newStatus = automationStatus === 'active' ? 'paused' : 'active';
    
    // Validate if activating
    if (newStatus === 'active') {
      const validation = validateFlow();
      if (!validation.valid) {
        setError(validation.errors.join(', '));
        return false;
      }
    }

    try {
      const currentId = useFlowStore.getState().automationId;
      
      if (!currentId || currentId === 'new') {
        setError('Salve a automação primeiro');
        return false;
      }

      const response = await fetch('/api/automations', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: currentId,
          status: newStatus,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to update status');
      }

      useFlowStore.getState().setAutomationStatus(newStatus);
      return true;

    } catch (err: any) {
      setError(err.message);
      return false;
    }
  }, [automationStatus, validateFlow]);

  // ============================================
  // DELETE AUTOMATION
  // ============================================

  const deleteAutomation = useCallback(async () => {
    const currentId = useFlowStore.getState().automationId;
    
    if (!currentId || currentId === 'new') {
      resetStore();
      return true;
    }

    try {
      const response = await fetch(`/api/automations?id=${currentId}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to delete');
      }

      resetStore();
      return true;

    } catch (err: any) {
      setError(err.message);
      return false;
    }
  }, [resetStore]);

  // ============================================
  // DUPLICATE AUTOMATION
  // ============================================

  const duplicate = useCallback(async () => {
    try {
      const response = await fetch('/api/automations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          organization_id: organizationId,
          store_id: storeId,
          name: `${automationName} (cópia)`,
          description: automationDescription,
          nodes,
          edges,
          status: 'draft',
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to duplicate');
      }

      return data.automation?.id;

    } catch (err: any) {
      setError(err.message);
      return null;
    }
  }, [organizationId, storeId, automationName, automationDescription, nodes, edges]);

  // ============================================
  // RETURN
  // ============================================

  return {
    // State
    isLoading,
    isSaving,
    isTesting,
    isDirty,
    error,
    testResult,

    // Validation
    validation: validateFlow(),

    // Actions
    save,
    test,
    toggleStatus,
    deleteAutomation,
    duplicate,
    reload: load,
    clearError: () => setError(null),
  };
}

export default useFlowBuilder;
