import { chunkGlobal } from './constants.ts'
import { TRACKER_NOTICES } from './notices.ts'

;(globalThis as unknown as Record<string, unknown>)[chunkGlobal('notices')] = TRACKER_NOTICES
