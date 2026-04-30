import * as fs from 'fs'
import * as core from '@actions/core'

export interface FlowResult {
  name: string
  status: string
  errors: string[]
}

const ENTITY_DECODE: Record<string, string> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&apos;': "'",
  '&#39;': "'",
}

function decodeEntities(s: string): string {
  return s.replace(/&(?:amp|lt|gt|quot|apos|#39);/g, (m) => ENTITY_DECODE[m])
}

export function parseJunit(xml: string): FlowResult[] {
  const flows: FlowResult[] = []
  const testcaseRegex = /<testcase\b([^>]*?)(?:\/>|>([\s\S]*?)<\/testcase>)/g
  let match: RegExpExecArray | null
  while ((match = testcaseRegex.exec(xml)) !== null) {
    const attrs = match[1]
    const inner = match[2] || ''
    const nameMatch = attrs.match(/\bname="([^"]*)"/)
    const statusMatch = attrs.match(/\bstatus="([^"]*)"/)
    if (!nameMatch || !statusMatch) continue
    const flow: FlowResult = {
      name: decodeEntities(nameMatch[1]),
      status: statusMatch[1],
      errors: [],
    }
    const failureMatch = inner.match(/<failure[^>]*>([\s\S]*?)<\/failure>/)
    if (failureMatch) {
      flow.errors = [decodeEntities(failureMatch[1]).trim()]
    }
    flows.push(flow)
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
