'use client';

import { useEffect, useRef, useState, useCallback } from 'react';

interface UseEmailAutosaveOptions {
  onSave: () => Promise<boolean>;
  isDirty: boolean;
  onSaved: () => void;
  debounceMs?: number;
  disabled?: boolean;
}

export type SaveStatus = 'idle' | 'pending' | 'saving' | 'saved' | 'error';

export function useEmailAutosave({
  onSave,
  isDirty,
  onSaved,
  debounceMs = 1500,
  disabled = false,
}: UseEmailAutosaveOptions) {
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onSaveRef = useRef(onSave);
  const onSavedRef = useRef(onSaved);
  const savingRef = useRef(false);

  useEffect(() => { onSaveRef.current = onSave; }, [onSave]);
  useEffect(() => { onSavedRef.current = onSaved; }, [onSaved]);

  useEffect(() => {
    if (disabled || !isDirty || savingRef.current) return;

    setSaveStatus('pending');
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(async () => {
      timeoutRef.current = null;
      if (savingRef.current) return;
      savingRef.current = true;
      setSaveStatus('saving');
      try {
        const ok = await onSaveRef.current();
        if (ok) {
          setLastSavedAt(new Date());
          setSaveError(null);
          setSaveStatus('saved');
          onSavedRef.current();
        } else {
          setSaveError('Erro ao salvar');
          setSaveStatus('error');
        }
      } catch (err: any) {
        setSaveError(err?.message || 'Erro ao salvar');
        setSaveStatus('error');
      } finally {
        savingRef.current = false;
      }
    }, debounceMs);

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };
  }, [isDirty, disabled, debounceMs]);

  useEffect(() => {
    if (disabled) return;
    const handler = (e: BeforeUnloadEvent) => {
      if (isDirty || savingRef.current) {
        e.preventDefault();
        e.returnValue = '';
        return '';
      }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [isDirty, disabled]);

  const flush = useCallback(async (): Promise<boolean> => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    if (savingRef.current) {
      while (savingRef.current) {
        await new Promise(r => setTimeout(r, 50));
      }
      return saveError === null;
    }
    if (!isDirty) return true;
    savingRef.current = true;
    setSaveStatus('saving');
    try {
      const ok = await onSaveRef.current();
      if (ok) {
        setLastSavedAt(new Date());
        setSaveError(null);
        setSaveStatus('saved');
        onSavedRef.current();
        return true;
      }
      setSaveError('Erro ao salvar');
      setSaveStatus('error');
      return false;
    } catch (err: any) {
      setSaveError(err?.message || 'Erro ao salvar');
      setSaveStatus('error');
      return false;
    } finally {
      savingRef.current = false;
    }
  }, [isDirty, saveError]);

  return { saveStatus, lastSavedAt, saveError, flush };
}
