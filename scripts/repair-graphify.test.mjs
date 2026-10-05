import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { isPhantomSelfCall, repairGraphify } from './repair-graphify.mjs'

const node = (id, label = id) => ({ id, label, file_type: 'code', source_file: `${id}.ts` })

test('declares imported external modules and the local CSS asset', () => {
  const result = repairGraphify({
    nodes: [node('claude_hooks_capture'), node('app_layout')],
    edges: [
      { source: 'claude_hooks_capture', target: 'json', relation: 'imports' },
      { source: 'claude_hooks_capture', target: 'ref_node_fs', relation: 'imports_from' },
      { source: 'claude_hooks_capture', target: 'ref_server_only', relation: 'imports_from' },
      { source: 'app_layout', target: 'app_globals', relation: 'imports_from' },
    ],
  })
  const byId = (id) => result.nodes.find((item) => item.id === id)
  assert.equal(byId('json').external, true)
  assert.equal(byId('ref_node_fs').external, true)
  assert.equal(byId('ref_node_fs').label, 'node:fs')
  assert.equal(byId('ref_server_only').label, 'server_only')
  assert.equal(byId('app_globals').source_file, 'app/globals.css')
  assert.equal(byId('app_globals').external, undefined)
  assert.equal(result.edges.length, 4)
})

// Fixture source file so the phantom-call rule reads real text (it must not depend on line numbers).
const root = mkdtempSync(join(tmpdir(), 'repair-graphify-'))
mkdirSync(join(root, 'lib'))
writeFileSync(join(root, 'lib/a.ts'), [
  'export async function getUser(db) {',            // L1
  '  const { data } = await db.auth.getUser()',      // L2 member call: phantom
  '  return getUser(db.parent)',                     // L3 bare call: real recursion
  '  const x = getUser(a) && db.getUser()',          // L4 mixed bare + member: keep
  '  return a?.getUser(1)',                          // L5 optional-chain member call: phantom
  '  errors.push(...getUser(a))',                    // L6 spread of a bare call: keep
  '}',
].join('\n'))
const selfCall = (location, over = {}) => ({
  source: 'getuser', target: 'getuser', relation: 'calls', source_file: 'lib/a.ts', source_location: location, ...over,
})

test('drops member-call self-loops and keeps real recursion', () => {
  const dropped = []
  const result = repairGraphify({
    nodes: [node('getuser', 'getUser()')],
    edges: [selfCall('L2'), selfCall('L3'), selfCall('L4'), selfCall('L5'), selfCall('L6')],
  }, root, (edge) => dropped.push(edge.source_location))
  assert.deepEqual(dropped, ['L2', 'L5'])
  // all kept self-loops share one endpoint pair, so they merge into a single edge that keeps every fact
  assert.equal(result.edges.length, 1)
  assert.deepEqual(result.edges[0].parallel_facts.map((fact) => fact.source_location), ['L3', 'L4', 'L6'])
})

test('phantom rule follows the text, not line numbers, and keeps when unsure', () => {
  const label = 'getUser()'
  assert.equal(isPhantomSelfCall(selfCall('L2'), label, root), true)
  assert.equal(isPhantomSelfCall(selfCall('L3'), label, root), false) // bare call
  assert.equal(isPhantomSelfCall(selfCall('L2'), '.getUser()', root), false) // method node (this.x() recursion is legit)
  assert.equal(isPhantomSelfCall(selfCall('L99'), label, root), false) // line out of range
  assert.equal(isPhantomSelfCall(selfCall('L2', { source_file: 'lib/missing.ts' }), label, root), false) // unreadable
  assert.equal(isPhantomSelfCall(selfCall('L2', { relation: 'imports' }), label, root), false) // not a call
  assert.equal(isPhantomSelfCall(selfCall('nowhere'), label, root), false) // no usable location
})

test('only self-loops are dropped, a member call between two nodes is left alone', () => {
  const result = repairGraphify({
    nodes: [node('getuser', 'getUser()'), node('other', 'other()')],
    edges: [selfCall('L2', { target: 'other' })],
  }, root)
  assert.equal(result.edges.length, 1)
})

test('keeps every parallel fact on one edge and adds no synthetic nodes', () => {
  const facts = [
    { source: 'file', target: 'helper', relation: 'contains', source_location: 'L1' },
    { source: 'file', target: 'helper', relation: 'calls', source_location: 'L3' },
    { source: 'file', target: 'helper', relation: 'calls', source_location: 'L8', context: 'call' },
    { source: 'helper', target: 'file', relation: 'references', source_location: 'L9' },
  ]
  const result = repairGraphify({ nodes: [node('file'), node('helper')], edges: facts })
  assert.equal(result.nodes.length, 2)
  assert.equal(result.edges.length, 1)
  const [edge] = result.edges
  assert.equal(edge.relation, 'calls') // the strongest relation survives as the primary
  assert.deepEqual(edge.parallel_facts, facts) // nothing is lost
  assert.deepEqual(repairGraphify(result), result) // idempotent
})

test('single edges pass through untouched', () => {
  const edge = { source: 'a', target: 'b', relation: 'calls', source_location: 'L1' }
  assert.deepEqual(repairGraphify({ nodes: [node('a'), node('b')], edges: [edge] }).edges, [edge])
})

test('keeps parallel evidence paths relative to the graph root', () => {
  const result = repairGraphify({
    nodes: [node('a'), node('b')],
    edges: [
      { source: 'a', target: 'b', relation: 'contains', source_file: '/repo/docs/plan.md' },
      { source: 'a', target: 'b', relation: 'calls', source_file: '/repo/docs/plan.md' },
    ],
  }, '/repo')
  assert.deepEqual(result.edges[0].parallel_facts.map((fact) => fact.source_file), ['docs/plan.md', 'docs/plan.md'])
})

test('rejects an unexplained missing endpoint', () => {
  assert.throws(() => repairGraphify({
    nodes: [node('caller')],
    edges: [{ source: 'caller', target: 'missing', relation: 'calls' }],
  }), /missing endpoint/)
  assert.throws(() => repairGraphify({
    nodes: [node('missing_source_target')],
    edges: [{ source: 'ghost', target: 'missing_source_target', relation: 'imports' }],
  }), /missing endpoint: ghost/)
  assert.throws(() => repairGraphify({
    nodes: [node('caller')],
    edges: [{ source: 'caller', target: '', relation: 'imports' }],
  }), /invalid endpoint/)
})
