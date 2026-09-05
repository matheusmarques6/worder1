'use client'

// Hooks compartilhados pelas telas de Configurações.

import { useCallback, useEffect, useRef, useState } from 'react'
import { useToast } from '@/components/ui/Toast'
import { api, ApiError } from './format'

/** Busca JSON de uma API com estado de carregamento/erro e `reload()`. */
export function useApi<T = any>(url: string | null, deps: any[] = []) {
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(!!url)
  const [error, setError] = useState<string | null>(null)
  const seq = useRef(0)
  const load = useCallback(async (silent = false) => {
    if (!url) return
    const my = ++seq.current
    if (!silent) setLoading(true)
    setError(null)
    try {
      const d = await api<T>(url)
      if (my === seq.current) setData(d)
    } catch (e: any) {
      if (my === seq.current) setError(e instanceof ApiError ? e.message : 'Não foi possível carregar.')
    } finally {
      if (my === seq.current) setLoading(false)
    }
  }, [url]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { load() }, [load, ...deps]) // eslint-disable-line react-hooks/exhaustive-deps
  return { data, setData, loading, error, reload: load }
}

/** Envolve uma ação assíncrona com estado `busy` e toasts de erro. */
export function useAction() {
  const toast = useToast()
  const [busy, setBusy] = useState<string | null>(null)
  const run = useCallback(async <R,>(key: string, fn: () => Promise<R>, opts?: { success?: string; error?: string }): Promise<R | undefined> => {
    setBusy(key)
    try {
      const r = await fn()
      if (opts?.success) toast.success(opts.success)
      return r
    } catch (e: any) {
      toast.error(opts?.error || 'Não foi possível concluir', e?.message)
      return undefined
    } finally {
      setBusy(null)
    }
  }, [toast])
  return { busy, run }
}

/** Salvar de um card: chama a API, mostra o erro no rodapé e um toast no sucesso. */
export function useSave() {
  const toast = useToast()
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const save = useCallback(async <R,>(fn: () => Promise<R>, successMsg = 'Alterações salvas'): Promise<R | undefined> => {
    setSaving(true)
    setError(null)
    try {
      const r = await fn()
      toast.success(successMsg)
      return r
    } catch (e: any) {
      setError(e?.message || 'Não foi possível salvar')
      return undefined
    } finally {
      setSaving(false)
    }
  }, [toast])
  return { saving, error, setError, save }
}

export function useFilePicker(accept: string, onFile: (f: File) => void) {
  const ref = useRef<HTMLInputElement | null>(null)
  useEffect(() => {
    const el = document.createElement('input')
    el.type = 'file'
    el.accept = accept
    el.style.display = 'none'
    el.onchange = () => { const f = el.files?.[0]; if (f) onFile(f); el.value = '' }
    document.body.appendChild(el)
    ref.current = el
    return () => { el.remove() }
  }, [accept, onFile])
  return () => ref.current?.click()
}
