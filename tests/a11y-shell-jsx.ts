import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'

// vitest.config.ts has no JSX transform (tsconfig keeps `jsx: preserve` for Next), so a component cannot be imported
// or rendered here. These helpers read the real component source with the TypeScript parser instead, so a test can
// assert on the JSX a component returns (which elements, which attributes, in which order) without running it.

const root = fileURLToPath(new URL('../', import.meta.url))

export type Jsx = ts.JsxElement | ts.JsxSelfClosingElement

export function parseTsx(relative: string): ts.SourceFile {
  const path = join(root, relative)
  return ts.createSourceFile(path, readFileSync(path, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
}

const opening = (element: Jsx) => (ts.isJsxElement(element) ? element.openingElement : element)

export const tagName = (element: Jsx): string => opening(element).tagName.getText()

/** Every JSX element under `node` (or only those with the given tag), in source order. */
export function elements(node: ts.Node, tag?: string): Jsx[] {
  const found: Jsx[] = []
  const visit = (child: ts.Node) => {
    if ((ts.isJsxElement(child) || ts.isJsxSelfClosingElement(child)) && (!tag || tagName(child) === tag)) found.push(child)
    ts.forEachChild(child, visit)
  }
  visit(node)
  return found
}

/** The value of a string-literal attribute, or undefined when it is missing or computed. */
export function attr(element: Jsx, name: string): string | undefined {
  for (const prop of opening(element).attributes.properties) {
    if (ts.isJsxAttribute(prop) && prop.name.getText() === name && prop.initializer && ts.isStringLiteral(prop.initializer)) {
      return prop.initializer.text
    }
  }
  return undefined
}

/** The literal text written between an element's tags, trimmed; expressions are ignored. */
export function literalText(element: Jsx): string {
  if (!ts.isJsxElement(element)) return ''
  return element.children.filter(ts.isJsxText).map((child) => child.text).join('').trim()
}

/** Every .tsx file under a folder of the repository, as repository-relative paths. */
export function tsxFiles(folder: string): string[] {
  return readdirSync(join(root, folder), { withFileTypes: true }).flatMap((entry) => {
    const path = `${folder}/${entry.name}`
    if (entry.isDirectory()) return tsxFiles(path)
    return entry.name.endsWith('.tsx') ? [path] : []
  })
}
