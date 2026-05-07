import * as fs from 'fs'
import * as core from '@actions/core'
import { XMLParser } from 'fast-xml-parser'

export interface FlowResult {
  name: string
  status: string
  errors: string[]
}

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '',
  cdataPropName: '__cdata',
  parseAttributeValue: false,
  trimValues: true,
  // testsuite/testcase repeat; failure/error can repeat per testcase.
  // Forcing arrays makes the shape predictable.
  isArray: (name) =>
    name === 'testsuite' || name === 'testcase' || name === 'failure' || name === 'error',
})

function extractMessage(node: unknown): string {
  if (node === null || node === undefined) return ''
  if (typeof node === 'string') return node.trim()
  if (typeof node === 'object') {
    const obj = node as Record<string, unknown>
    if (typeof obj.__cdata === 'string') return obj.__cdata.trim()
    if (typeof obj['#text'] === 'string') return (obj['#text'] as string).trim()
    if (typeof obj.message === 'string') return (obj.message as string).trim()
  }
  return ''
}

export function parseJunit(xml: string): FlowResult[] {
  const doc = parser.parse(xml)
  const suites = doc?.testsuites?.testsuite ?? []
  const flows: FlowResult[] = []
  for (const suite of suites) {
    const cases = suite?.testcase ?? []
    for (const tc of cases) {
      if (!tc?.name || !tc?.status) continue
      const errors = [...(tc.failure ?? []), ...(tc.error ?? [])]
        .map(extractMessage)
        .filter((m) => m.length > 0)
      flows.push({ name: String(tc.name), status: String(tc.status), errors })
    }
  }
  return flows
}

export async function main(): Promise<void> {
  const junitPath = process.argv[2]
  if (!junitPath || !fs.existsSync(junitPath)) {
    core.setOutput('MAESTRO_CLOUD_FLOW_RESULTS', '[]')
    return
  }
  const xml = fs.readFileSync(junitPath, 'utf8')
  const flows = parseJunit(xml)
  core.setOutput('MAESTRO_CLOUD_FLOW_RESULTS', JSON.stringify(flows))
}

if (require.main === module) {
  main().catch((e) => {
    core.setFailed(`postprocess failed: ${e.message}`)
  })
}
