export type Fetch = (input: string, init: RequestInit) => Promise<Response>

export interface Context {
  readonly key: string
  /* Without a trailing slash, so paths append directly. */
  readonly baseUrl: string
  readonly clientIp: (request: Request) => string | null
  readonly respectGpc: boolean
  readonly fetch: Fetch
  readonly onError: (error: unknown) => void
  readonly noteUnresolvedIp: () => void
}

export const authorization = (context: Context): string => `Bearer ${context.key}`
