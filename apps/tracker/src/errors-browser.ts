import { chunkGlobal } from './constants.ts'
import { TRACKER_ERRORS } from './errors.ts'

;(globalThis as unknown as Record<string, unknown>)[chunkGlobal('errors')] = TRACKER_ERRORS
