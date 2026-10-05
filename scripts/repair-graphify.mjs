// Repairs a graphify extraction before it is built into a graph. Run from the repo root:
//   node scripts/repair-graphify.mjs INPUT.json OUTPUT.json
// Three fixes, each documented where it happens:
//   1. dangling import targets -> declared external/asset nodes
//   2. phantom self-calls (a member call like `db.auth.getUser()` resolved to the enclosing function) -> dropped
//   3. several edges between one pair of nodes -> ONE edge, every fact kept in `parallel_facts`
import { readFileSync } from 'node:fs'
import { readFile, writeFile } from 'node:fs/promises'
import { isAbsolute, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const importRelations = new Set(['imports', 'imports_from', 're_exports'])
const esc = (s) => s.replace(/[$()*+.?[\\\]^{|}]/g, '\\$&')

function priority(edge) {
  if (edge.relation === 'calls') return 3
  if (edge.relation === 'indirect_call') return 2
  if (['references', 'uses', 'mentions', 'contains'].includes(edge.relation)) return 0
  return 1
}

// A `calls` self-edge is phantom when the source line only has a member call (`obj.name(` or
// `obj?.name(`) and never a bare `name(`. Real recursion (a bare call) is kept, and so is the edge
// whenever we cannot tell (method node, unreadable file or line, mixed bare and member calls).
// ponytail: single-line check; a multi-line chain whose `.name(` sits on a later line is kept.
export function isPhantomSelfCall(edge, label, root = process.cwd()) {
  if (edge.relation !== 'calls' || !label || label.startsWith('.')) return false
  const name = label.replace(/\(\)$/, '')
  const at = /^L(\d+)/.exec(edge.source_location ?? '')
  if (!at || !edge.source_file || !/^[\w$]+$/.test(name)) return false
  let line
  try { line = readFileSync(resolve(root, edge.source_file), 'utf8').split('\n')[Number(at[1]) - 1] } catch { return false }
  if (line === undefined) return false
  const bare = new RegExp(`(^|[^.\\w$]|\\.\\.\\.)${esc(name)}\\s*[(<]`).test(line)
  const member = new RegExp(`(?<!\\.)\\??\\.\\s*${esc(name)}\\s*[(<]`).test(line)
  return member && !bare
}

function portableFact(fact, root) {
  const result = { ...fact }
  for (const key of ['source_file', 'definition_file']) {
    if (typeof result[key] === 'string' && isAbsolute(result[key])) {
      const path = relative(root, result[key])
      if (path && !path.startsWith('..') && !isAbsolute(path)) result[key] = path
    }
  }
  delete result.target_file
  delete result.local_alias
  return result
}

export function repairGraphify(extraction, root = process.cwd(), onDrop = () => {}) {
  const nodes = [...extraction.nodes]
  const byId = new Map(nodes.map((node) => [node.id, node]))
  const groups = new Map()

  for (const edge of extraction.edges) {
    if (typeof edge.source !== 'string' || !edge.source.trim()
      || typeof edge.target !== 'string' || !edge.target.trim()) {
      throw new Error('invalid endpoint')
    }
    // Fix 2: phantom self-calls.
    if (edge.source === edge.target && isPhantomSelfCall(edge, byId.get(edge.source)?.label, root)) {
      onDrop(edge)
      continue
    }

    if (!byId.has(edge.source)) throw new Error(`missing endpoint: ${edge.source}`)
    // Fix 1: an import of something the AST has no node for. Only imports may be repaired, and only
    // by declaring what it really is: the local CSS file, or an external module/package (stdlib, node:*,
    // npm). Anything else is a real extraction bug and must fail loudly.
    if (!byId.has(edge.target)) {
      if (!importRelations.has(edge.relation)) throw new Error(`missing endpoint: ${edge.target}`)
      const declared = edge.target === 'app_globals'
        ? { id: edge.target, label: 'globals.css', file_type: 'code', type: 'asset', source_file: 'app/globals.css' }
        : {
            id: edge.target, file_type: 'concept', type: 'external', external: true, source_file: '',
            label: edge.target.replace(/^ref_node_/, 'node:').replace(/^ref_/, ''),
          }
      nodes.push(declared)
      byId.set(declared.id, declared)
    }

    const key = JSON.stringify([edge.source, edge.target].sort())
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(edge)
  }

  // Fix 3: graphify builds an undirected simple graph, so several edges between one pair collapse and
  // the survivor mixes attributes (e.g. relation=contains with call context, losing the `calls` fact).
  // Make that explicit: one edge per pair, the strongest relation as the primary, ALL facts kept in
  // `parallel_facts`. No synthetic nodes are added.
  const edges = []
  for (const group of groups.values()) {
    if (group.length === 1) {
      edges.push(group[0].parallel_facts
        ? { ...group[0], parallel_facts: group[0].parallel_facts.map((fact) => portableFact(fact, root)) }
        : group[0])
      continue
    }
    const primary = group.reduce((best, edge) => priority(edge) > priority(best) ? edge : best)
    edges.push({ ...primary, parallel_facts: group.flatMap((edge) => edge.parallel_facts ?? [edge]).map((fact) => portableFact(fact, root)) })
  }
  return { ...extraction, nodes, edges }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [input, output] = process.argv.slice(2)
  if (!input || !output) throw new Error('usage: node scripts/repair-graphify.mjs INPUT.json OUTPUT.json (run from the repo root)')
  const original = JSON.parse(await readFile(input, 'utf8'))
  const dropped = []
  const repaired = repairGraphify(original, process.cwd(), (edge) => dropped.push(edge))
  await writeFile(output, `${JSON.stringify(repaired, null, 2)}\n`)
  for (const edge of dropped) console.log(`dropped phantom self-call ${edge.source} at ${edge.source_file}:${edge.source_location}`)
  console.log(`Repaired extraction: ${original.nodes.length} → ${repaired.nodes.length} nodes; ${original.edges.length} → ${repaired.edges.length} edges`)
}
