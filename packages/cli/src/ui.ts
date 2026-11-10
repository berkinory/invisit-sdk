/* For a person at a terminal. Piped output, which agents and CI read, gets no escape codes and no
   animation. Hand-written because the published CLI has no runtime dependencies. */

export const live: boolean = Boolean(process.stdout.isTTY) && process.env['TERM'] !== 'dumb'
const color = live && !process.env['NO_COLOR']

const paint = (open: number, close: number) => (text: string) =>
  color ? `\x1b[${open}m${text}\x1b[${close}m` : text

export const bold = paint(1, 22)
export const dim = paint(2, 22)
export const red = paint(31, 39)
export const green = paint(32, 39)
export const yellow = paint(33, 39)
export const cyan = paint(36, 39)
export const badge = paint(7, 27)

const FRAMES = '⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏'
const CLEAR_LINE = '\r\x1b[2K'
const HIDE_CURSOR = '\x1b[?25l'
const SHOW_CURSOR = '\x1b[?25h'

/** Animates one line until the returned function is called, which erases it. */
export function startSpinner(text: string): () => void {
  if (!live) return () => {}
  let frame = 0
  const draw = () => {
    const glyph = FRAMES[frame++ % FRAMES.length] ?? ''
    process.stdout.write(`${CLEAR_LINE}${cyan(glyph)} ${text}`)
  }
  process.stdout.write(HIDE_CURSOR)
  draw()
  const timer = setInterval(draw, 80)
  const stop = () => {
    clearInterval(timer)
    process.off('SIGINT', interrupted)
    process.stdout.write(`${CLEAR_LINE}${SHOW_CURSOR}`)
  }
  // Ctrl+C would otherwise leave the person's shell with a hidden cursor.
  function interrupted() {
    stop()
    process.exit(130)
  }
  process.once('SIGINT', interrupted)
  return stop
}
