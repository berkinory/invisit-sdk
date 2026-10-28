/**
 * A request to the collector that did not succeed. `code` is the collector's error code
 * (`VALIDATION_FAILED`, `RATE_LIMITED`, `UNAUTHENTICATED`…), or one of this package's own:
 * `NETWORK_ERROR` when the collector could not be reached, `CLIENT_IP_UNRESOLVED` when no visitor
 * address could be read from the request. `status` is the HTTP status, null when there was none.
 */
export class InvisitError extends Error {
  // Bun's code splitting renames the class (InvisitError2), and console.error prints the
  // constructor's name: pinned so a logged error still reads as an InvisitError.
  static {
    Object.defineProperty(this, 'name', { value: 'InvisitError' })
  }
  override readonly name = 'InvisitError'
  readonly code: string
  readonly status: number | null
  /** The collector's request id, worth quoting in a bug report. */
  readonly requestId: string | null
  readonly details: Readonly<Record<string, unknown>>

  constructor(
    code: string,
    message: string,
    init: {
      status?: number | null
      requestId?: string | null
      details?: Record<string, unknown>
      cause?: unknown
    } = {},
  ) {
    super(message, init.cause === undefined ? undefined : { cause: init.cause })
    this.code = code
    this.status = init.status ?? null
    this.requestId = init.requestId ?? null
    this.details = init.details ?? {}
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

export async function errorFromResponse(response: Response): Promise<InvisitError> {
  let body: unknown = null
  try {
    body = await response.json()
  } catch {}
  const error = isRecord(body) && isRecord(body['error']) ? body['error'] : {}
  const code = typeof error['code'] === 'string' ? error['code'] : `HTTP_${response.status}`
  const message =
    typeof error['message'] === 'string'
      ? error['message']
      : `The collector answered ${response.status}.`
  return new InvisitError(code, message, {
    status: response.status,
    requestId: typeof error['request_id'] === 'string' ? error['request_id'] : null,
    details: isRecord(error['details']) ? error['details'] : {},
  })
}
