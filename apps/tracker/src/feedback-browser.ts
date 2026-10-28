import { chunkGlobal } from './constants.ts'
import { TRACKER_FEEDBACK } from './feedback.ts'

;(globalThis as unknown as Record<string, unknown>)[chunkGlobal('feedback')] = TRACKER_FEEDBACK
