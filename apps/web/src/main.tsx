import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { AppProvider } from './lib/app-state'
import './index.css'

const qc = new QueryClient({
  defaultOptions: { queries: { retry: 2, retryDelay: (n) => Math.min(1000 * 2 ** n, 8000), staleTime: 5_000, refetchOnWindowFocus: true } },
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={qc}>
      <AppProvider>
        <App />
      </AppProvider>
    </QueryClientProvider>
  </StrictMode>,
)
