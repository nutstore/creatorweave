'use client'

import {
  Children,
  createContext,
  isValidElement,
  type ReactElement,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react'

type NavigateOptions = { replace?: boolean }
type RouterState = { pathname: string; search: string }

const RouterContext = createContext<{
  state: RouterState
  navigate: (to: string, options?: NavigateOptions) => void
  params: Record<string, string>
} | null>(null)

function currentState(): RouterState {
  return { pathname: window.location.pathname || '/', search: window.location.search }
}

function matchPath(pattern: string, pathname: string): Record<string, string> | null {
  if (pattern === '*') return {}
  const expected = pattern.split('/').filter(Boolean)
  const actual = pathname.split('/').filter(Boolean)
  if (expected.length !== actual.length) return null
  const params: Record<string, string> = {}
  for (let index = 0; index < expected.length; index += 1) {
    const part = expected[index]
    const value = actual[index]
    if (part.startsWith(':')) params[part.slice(1)] = decodeURIComponent(value)
    else if (part !== value) return null
  }
  return params
}

export function HashRouter({ children }: { children: ReactNode }) {
  const [state, setState] = useState<RouterState>(() => currentState())
  const navigate = useCallback((to: string, options: NavigateOptions = {}) => {
    const url = new URL(to, window.location.origin)
    window.history[options.replace ? 'replaceState' : 'pushState']({}, '', `${url.pathname}${url.search}${url.hash}`)
    setState(currentState())
  }, [])

  useEffect(() => {
    const onPopState = () => setState(currentState())
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [])

  return <RouterContext.Provider value={{ state, navigate, params: {} }}>{children}</RouterContext.Provider>
}

export function Route(_props: { path: string; element: ReactNode }) {
  return null
}

export function Routes({ children }: { children: ReactNode }) {
  const router = useRouterContext()
  const routes = Children.toArray(children).filter(isValidElement) as ReactElement<{ path: string; element: ReactNode }>[]
  for (const route of routes) {
    const params = matchPath(route.props.path, router.state.pathname)
    if (params) {
      return (
        <RouterContext.Provider value={{ ...router, params }}>
          {route.props.element}
        </RouterContext.Provider>
      )
    }
  }
  return null
}

function useRouterContext() {
  const context = useContext(RouterContext)
  if (!context) throw new Error('Router hooks must be used beneath the application router')
  return context
}

export function useNavigate() {
  return useRouterContext().navigate
}

export function useParams<T extends Record<string, string | undefined> = Record<string, string>>() {
  return useRouterContext().params as T
}

export function useSearchParams(): [URLSearchParams, (next: URLSearchParams | string) => void] {
  const router = useRouterContext()
  const params = useMemo(() => new URLSearchParams(router.state.search), [router.state.search])
  const setParams = useCallback((next: URLSearchParams | string) => {
    const search = typeof next === 'string' ? next : next.toString()
    router.navigate(`${router.state.pathname}${search ? `?${search}` : ''}`)
  }, [router])
  return [params, setParams]
}
