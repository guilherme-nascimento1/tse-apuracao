import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { ajustar, lerUrl, paraUrl, type Filtros } from './filtros'

export interface ToastItem { id: number; msg: string; acao?: { rotulo: string; fn: () => void } }

interface Ctx {
  f: Filtros
  set: (patch: Partial<Filtros>, opts?: { silencioso?: boolean }) => void
  toasts: ToastItem[]
  toast: (msg: string, acao?: ToastItem['acao']) => void
  fechaToast: (id: number) => void
  pausado: boolean
  setPausado: (v: boolean) => void
  tema: 'dark' | 'light'
  alternaTema: () => void
  agora: number
  alternaComparar: (sq: string) => void
}

const C = createContext<Ctx | null>(null)
export const useApp = () => {
  const c = useContext(C)
  if (!c) throw new Error('AppProvider ausente')
  return c
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [f, setF] = useState<Filtros>(() => lerUrl())
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const [pausado, setPausado] = useState(false)
  const [agora, setAgora] = useState(Date.now())
  const [tema, setTema] = useState<'dark' | 'light'>(() => (document.documentElement.dataset.theme === 'light' ? 'light' : 'dark'))
  const seq = useRef(0)
  const fRef = useRef(f)
  fRef.current = f

  const fechaToast = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), [])
  const toast = useCallback((msg: string, acao?: ToastItem['acao']) => {
    const id = ++seq.current
    setToasts((t) => [...t.slice(-2), { id, msg, acao }])
    setTimeout(() => fechaToast(id), acao ? 8000 : 5000)
  }, [fechaToast])

  const set = useCallback((patch: Partial<Filtros>, opts?: { silencioso?: boolean }) => {
    const { next, avisos } = ajustar(fRef.current, patch)
    const so = Object.keys(patch).every((k) => k === 'q' || k === 'partido' || k === 'cmp' || k === 'cand')
    const url = paraUrl(next)
    if (url !== location.search) (so ? history.replaceState : history.pushState).call(history, null, '', url)
    setF(next)
    if (!opts?.silencioso) avisos.forEach((a) => toast(a))
  }, [toast])

  useEffect(() => {
    const on = () => setF(lerUrl())
    addEventListener('popstate', on)
    return () => removeEventListener('popstate', on)
  }, [])
  useEffect(() => {
    // normaliza a URL inicial (ex.: cargo sem UF)
    if (paraUrl(f) !== location.search) history.replaceState(null, '', paraUrl(f))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  useEffect(() => {
    const t = setInterval(() => setAgora(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])

  const alternaTema = useCallback(() => {
    setTema((t) => {
      const n = t === 'dark' ? 'light' : 'dark'
      document.documentElement.dataset.theme = n
      try { localStorage.setItem('tema', n) } catch { /* ignore */ }
      return n
    })
  }, [])

  const alternaComparar = useCallback((sq: string) => {
    const cur = fRef.current.cmp
    if (cur.includes(sq)) return set({ cmp: cur.filter((x) => x !== sq) })
    if (cur.length >= 3) return toast('Você pode comparar até 3 candidatos. Remova um para adicionar outro.')
    set({ cmp: [...cur, sq] })
  }, [set, toast])

  const v = useMemo(
    () => ({ f, set, toasts, toast, fechaToast, pausado, setPausado, tema, alternaTema, agora, alternaComparar }),
    [f, set, toasts, toast, fechaToast, pausado, tema, alternaTema, agora, alternaComparar],
  )
  return <C.Provider value={v}>{children}</C.Provider>
}
