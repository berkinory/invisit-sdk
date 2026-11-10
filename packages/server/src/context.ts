import { version as PACKAGE_VERSION } from '../package.json'

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

/* Lets the collector tell a site when its release has fallen behind; it is not trusted for anything
   else. */
export const SDK_VERSION_HEADER = 'x-invisit-sdk-version'
export const SDK_VERSION: string = PACKAGE_VERSION
