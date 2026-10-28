export function isExcludedPath(path: string, patterns: readonly string[]): boolean {
  return patterns.some((pattern) => {
    if (!pattern.startsWith('/')) return false
    const wildcard = pattern.indexOf('*')
    return wildcard === -1
      ? path === pattern
      : wildcard === pattern.length - 1 && path.startsWith(pattern.slice(0, -1))
  })
}
