import { chunkGlobal } from './constants.ts'
import { TRACKER_INTERACTIONS } from './interactions.ts'

;(globalThis as unknown as Record<string, unknown>)[chunkGlobal('interactions')] =
  TRACKER_INTERACTIONS
