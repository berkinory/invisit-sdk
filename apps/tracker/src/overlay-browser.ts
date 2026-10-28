import { chunkGlobal } from './constants.ts'
import { TRACKER_OVERLAY } from './overlay/index.ts'

;(globalThis as unknown as Record<string, unknown>)[chunkGlobal('overlay')] = TRACKER_OVERLAY
