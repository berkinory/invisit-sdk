import { DOCS_URL } from './constants.ts'
import type { Project } from './project.ts'
import { Unsafe } from './source.ts'

export interface FileChange {
  readonly path: string
  readonly before: string | null
  readonly after: string
}

/** One thing a person would do by hand: create a file, or paste a snippet somewhere in one. */
export interface Step {
  readonly file: string
  readonly how: string
  readonly snippet: string
  /** Set when the step could not be done safely, so the whole install falls back to the steps. */
  readonly blocked?: string
}

export interface Op {
  readonly change: FileChange | null
  readonly step: Step
}

export interface Plan {
  readonly label: string
  readonly ops: readonly Op[]
  /** The code imports @invisitdev/web, so the package has to be installed. */
  readonly usesPackage: boolean
  /** The public environment variable the code reads the site id from. */
  readonly envKey?: string
  /** The env files the framework loads, preferred first, when not the usual .env.local and .env. */
  readonly envFiles?: readonly string[]
}

export function createFile(project: Project, file: string, content: string): Op {
  const step = { file, how: `Create ${file}:`, snippet: content }
  if (project.exists(file))
    return { change: null, step: { ...step, blocked: `${file} already exists` } }
  return { change: { path: file, before: null, after: content }, step }
}

export function editFile(
  project: Project,
  file: string,
  how: string,
  snippet: string,
  edit: (source: string) => string,
): Op {
  const step = { file, how, snippet }
  const source = project.read(file)
  if (source === null) return { change: null, step: { ...step, blocked: `${file} was not found` } }
  try {
    return { change: { path: file, before: source, after: edit(source) }, step }
  } catch (error) {
    if (!(error instanceof Unsafe)) throw error
    return { change: null, step: { ...step, blocked: `in ${file}, ${error.message}` } }
  }
}

/** A step that can only be done by hand, with the reason why. */
export function manual(file: string, how: string, snippet: string, blocked: string): Op {
  return { change: null, step: { file, how, snippet, blocked } }
}

/** A plan for a project whose entry file is not where the framework normally puts it. */
export function notFound(label: string, what: string, file: string, docs: string): Plan {
  return {
    label,
    ops: [
      manual(
        file,
        `Add the tracker to ${what} (${file} in a default ${label} project) as ${DOCS_URL}#${docs} shows.`,
        '',
        `${what} was not found`,
      ),
    ],
    usesPackage: true,
  }
}
