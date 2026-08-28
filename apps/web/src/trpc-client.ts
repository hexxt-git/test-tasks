import {
  createTRPCClient,
  httpBatchLink,
  httpSubscriptionLink,
  splitLink,
} from '@trpc/client'
import { createTRPCOptionsProxy } from '@trpc/tanstack-react-query'
import { QueryClient } from '@tanstack/react-query'
import type { AppRouter } from 'server'

export const queryClient = new QueryClient()

export const trpc = createTRPCOptionsProxy<AppRouter>({
  client: createTRPCClient<AppRouter>({
    links: [
      splitLink({
        condition: (op) => op.type === 'subscription',
        true: httpSubscriptionLink({ url: '/trpc' }),
        false: httpBatchLink({ url: '/trpc' }),
      }),
    ],
  }),
  queryClient,
})
