import { chunkGlobal } from './constants.ts'
import { TRACKER_EXTRAS } from './extras.ts'

;(globalThis as unknown as Record<string, unknown>)[chunkGlobal('extras')] = TRACKER_EXTRAS
