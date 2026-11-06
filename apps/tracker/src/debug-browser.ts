import { chunkGlobal } from './constants.ts'
import { TRACKER_DEBUG } from './debug.ts'

;(globalThis as unknown as Record<string, unknown>)[chunkGlobal('debug')] = TRACKER_DEBUG
