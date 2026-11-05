import { manual, type Plan } from '../ops.ts'
import type { Project } from '../project.ts'
import { planAngular } from './angular.ts'
import { planAstro } from './astro.ts'
import { planDocusaurus, planGatsby, planVitePress } from './docs-sites.ts'
import { htmlPages, scriptTag, scriptTagPlan } from './html.ts'
import { planNuxt } from './nuxt.ts'
import { planNext, planReactRouter, planTanStackStart, planWaku } from './react.ts'
import { planSvelteKit } from './sveltekit.ts'
import { planSolidStart, planVite } from './vite.ts'

export interface Framework {
  readonly name: string
  /** Any one of these dependencies marks the project as this framework. */
  readonly deps: readonly string[]
  readonly plan: (project: Project, id: string) => Plan
  /** The HTML files whose <head> takes the script tag, where the framework has them. */
  readonly documents?: (project: Project) => readonly string[]
}

const one = (file: string) => (project: Project) => (project.exists(file) ? [file] : [])

// Meta-frameworks first: most of them depend on vite as well.
const FRAMEWORKS: readonly Framework[] = [
  { name: 'Next.js', deps: ['next'], plan: planNext },
  { name: 'TanStack Start', deps: ['@tanstack/react-start'], plan: planTanStackStart },
  { name: 'Nuxt', deps: ['nuxt'], plan: planNuxt },
  {
    name: 'SvelteKit',
    deps: ['@sveltejs/kit'],
    plan: planSvelteKit,
    documents: one('src/app.html'),
  },
  { name: 'Astro', deps: ['astro'], plan: (p, id) => planAstro(p, id, false) },
  {
    name: 'React Router',
    deps: ['@react-router/dev', '@remix-run/react', '@remix-run/dev'],
    plan: planReactRouter,
  },
  { name: 'Waku', deps: ['waku'], plan: planWaku },
  { name: 'SolidStart', deps: ['@solidjs/start'], plan: planSolidStart },
  {
    name: 'Angular',
    deps: ['@angular/core'],
    plan: (p, id) => planAngular(p, id, false),
    documents: one('src/index.html'),
  },
  { name: 'Gatsby', deps: ['gatsby'], plan: planGatsby },
  { name: 'Docusaurus', deps: ['@docusaurus/core'], plan: planDocusaurus },
  { name: 'VitePress', deps: ['vitepress'], plan: planVitePress },
  { name: 'Vite', deps: ['vite'], plan: planVite, documents: one('index.html') },
]

export function detectFramework(project: Project): Framework | null {
  return FRAMEWORKS.find((framework) => framework.deps.some((dep) => project.has(dep))) ?? null
}

/** The plan for a detected framework, or for plain HTML pages when there is none. */
export function planFor(
  project: Project,
  framework: Framework | null,
  id: string,
  tag: boolean,
): Plan | null {
  if (!framework) {
    const pages = htmlPages(project)
    return pages.length > 0 ? scriptTagPlan('Static HTML', project, pages, id) : null
  }
  if (!tag) return framework.plan(project, id)
  if (framework.name === 'Astro') return planAstro(project, id, true)
  if (framework.name === 'Angular') return planAngular(project, id, true)
  const documents = framework.documents?.(project) ?? []
  if (documents.length > 0)
    return scriptTagPlan(`${framework.name} (script tag)`, project, documents, id)
  return {
    label: `${framework.name} (script tag)`,
    ops: [
      manual(
        'the root layout',
        `Paste this into the <head> of the root layout:`,
        scriptTag(id),
        `${framework.name} has no HTML file to put the tag in, so it is rendered from the root layout`,
      ),
    ],
    usesPackage: false,
  }
}
