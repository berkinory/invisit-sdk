import type { TrackerChunk } from './constants.ts'
import type { ChunkLoader, TrackerChunks } from './start.ts'

const IMPORTS: { readonly [K in TrackerChunk]: () => Promise<TrackerChunks[K]> } = {
  extras: () => import('./extras.ts').then((module) => module.TRACKER_EXTRAS),
  notices: () => import('./notices.ts').then((module) => module.TRACKER_NOTICES),
  rules: () => import('./rules-chunk.ts').then((module) => module.TRACKER_RULES),
  interactions: () => import('./interactions.ts').then((module) => module.TRACKER_INTERACTIONS),
  overlay: () => import('./overlay/index.ts').then((module) => module.TRACKER_OVERLAY),
  feedback: () => import('./feedback.ts').then((module) => module.TRACKER_FEEDBACK),
  errors: () => import('./errors.ts').then((module) => module.TRACKER_ERRORS),
  debug: () => import('./debug.ts').then((module) => module.TRACKER_DEBUG),
}

export const importChunk: ChunkLoader = (name, ready) => {
  IMPORTS[name]().then(ready, () => {})
}
