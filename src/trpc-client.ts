import { createTRPCClient, httpBatchLink } from '@trpc/client'
import { createTRPCOptionsProxy } from '@trpc/tanstack-react-query'
import { QueryClient } from '@tanstack/react-query'
import type { AppRouter } from './trpc'

export const queryClient = new QueryClient()

export const trpc = createTRPCOptionsProxy<AppRouter>({
  client: createTRPCClient<AppRouter>({
    links: [httpBatchLink({ url: '/trpc' })],
  }),
  queryClient,
})
