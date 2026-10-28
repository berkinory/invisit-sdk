import { chunkGlobal } from './constants.ts'
import { TRACKER_RULES } from './rules-chunk.ts'

;(globalThis as unknown as Record<string, unknown>)[chunkGlobal('rules')] = TRACKER_RULES
