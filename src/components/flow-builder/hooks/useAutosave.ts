'use client';

import { useEffect, useRef, useCallback } from 'react';
import { useFlowStore } from '@/stores/flowStore';

interface UseAutosaveOptions {
  onSave: () => Promise<string | undefined>;
  debounceMs?: number;
  disabled?: boolean;
}

export function useAutosave({ onSave, debounceMs = 1500, disabled = false }: UseAutosaveOptions) {
  const isDirty = useFlowStore(s => s.isDirty);
  const isSaving = useFlowStore(s => s.isSaving);
  const setSaving = useFlowStore(s => s.setSaving);
  const setDirty = useFlowStore(s => s.setDirty);
  const setLastSavedAt = useFlowStore(s => s.setLastSavedAt);
  const setSaveError = useFlowStore(s => s.setSaveError);

  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onSaveRef = useRef(onSave);
  useEffect(() => { onSaveRef.current = onSave; }, [onSave]);

  useEffect(() => {
    if (disabled || !isDirty || isSaving) return;

    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(async () => {
      timeoutRef.current = null;
      setSaving(true);
      setSaveError(null);
      try {
        const result = await onSaveRef.current();
        if (result) {
          setDirty(false);
          setLastSavedAt(new Date());
        }
      } catch (err: any) {
        setSaveError(err?.message || 'Erro ao salvar');
      } finally {
        setSaving(false);
      }
    }, debounceMs);

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };
  }, [isDirty, isSaving, disabled, debounceMs, setSaving, setDirty, setLastSavedAt, setSaveError]);

  useEffect(() => {
    if (disabled) return;
    const handler = (e: BeforeUnloadEvent) => {
      if (useFlowStore.getState().isDirty || useFlowStore.getState().isSaving) {
        e.preventDefault();
        e.returnValue = '';
        return '';
      }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [disabled]);

  const flush = useCallback(async () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    const state = useFlowStore.getState();
    if (state.isDirty && !state.isSaving) {
      setSaving(true);
      setSaveError(null);
      try {
        const result = await onSaveRef.current();
        if (result) {
          setDirty(false);
          setLastSavedAt(new Date());
        }
      } catch (err: any) {
        setSaveError(err?.message || 'Erro ao salvar');
      } finally {
        setSaving(false);
      }
    }
  }, [setSaving, setDirty, setLastSavedAt, setSaveError]);

  return { flush };
}
