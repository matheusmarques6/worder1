'use client';

import { useEffect, useRef, useState, useCallback } from 'react';

interface UseEmailAutosaveOptions {
  onSave: () => Promise<boolean>;
  isDirty: boolean;
  onSaved: () => void;
  debounceMs?: number;
  disabled?: boolean;
  /**
   * Optional monotonic token that changes on every content edit. When
   * provided, the hook detects edits that land WHILE a save is in flight
   * (the snapshot passed to onSave was taken before them) and re-saves
   * instead of clearing the dirty flag — otherwise those edits are
   * silently lost. Omit it to keep the legacy behavior unchanged.
   */
  getDirtyToken?: () => number | string;
}

export type SaveStatus = 'idle' | 'pending' | 'saving' | 'saved' | 'error';

export function useEmailAutosave({
  onSave,
  isDirty,
  onSaved,
  debounceMs = 1500,
  disabled = false,
  getDirtyToken,
}: UseEmailAutosaveOptions) {
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onSaveRef = useRef(onSave);
  const onSavedRef = useRef(onSaved);
  const getTokenRef = useRef(getDirtyToken);
  const savingRef = useRef(false);
  const isDirtyRef = useRef(isDirty);

  useEffect(() => { onSaveRef.current = onSave; }, [onSave]);
  useEffect(() => { onSavedRef.current = onSaved; }, [onSaved]);
  useEffect(() => { getTokenRef.current = getDirtyToken; }, [getDirtyToken]);
  useEffect(() => { isDirtyRef.current = isDirty; }, [isDirty]);

  // One save attempt. Captures the dirty token BEFORE awaiting onSave so
  // it can tell whether the content changed during the (async) save:
  //   'saved' → persisted and content is unchanged → safe to clear dirty
  //   'stale' → edits landed mid-save → keep dirty, caller re-saves
  //   'error' → save failed
  const runSave = useCallback(async (): Promise<'saved' | 'stale' | 'error'> => {
    const tokenAtStart = getTokenRef.current?.();
    setSaveStatus('saving');
    try {
      const ok = await onSaveRef.current();
      if (!ok) {
        setSaveError('Erro ao salvar');
        setSaveStatus('error');
        return 'error';
      }
      setLastSavedAt(new Date());
      setSaveError(null);
      const changedDuringSave =
        tokenAtStart !== undefined && getTokenRef.current?.() !== tokenAtStart;
      if (changedDuringSave) {
        // Don't clear dirty — the just-saved snapshot is already behind.
        return 'stale';
      }
      setSaveStatus('saved');
      onSavedRef.current();
      return 'saved';
    } catch (err: any) {
      setSaveError(err?.message || 'Erro ao salvar');
      setSaveStatus('error');
      return 'error';
    }
  }, []);

  // Run save(s), re-arming while edits keep landing mid-save. Bounded by
  // actual edits (token stops changing once the user pauses).
  const saveUntilClean = useCallback(async (): Promise<boolean> => {
    savingRef.current = true;
    try {
      let res = await runSave();
      while (res === 'stale') {
        res = await runSave();
      }
      return res === 'saved';
    } finally {
      savingRef.current = false;
    }
  }, [runSave]);

  useEffect(() => {
    if (disabled || !isDirty || savingRef.current) return;

    setSaveStatus('pending');
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => {
      timeoutRef.current = null;
      if (savingRef.current) return;
      void saveUntilClean();
    }, debounceMs);

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };
  }, [isDirty, disabled, debounceMs, saveUntilClean]);

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
    // Wait out any in-flight save so we don't run two concurrently.
    while (savingRef.current) {
      await new Promise((r) => setTimeout(r, 50));
    }
    if (!isDirtyRef.current) return saveError === null;
    return saveUntilClean();
  }, [saveUntilClean, saveError]);

  return { saveStatus, lastSavedAt, saveError, flush };
}
