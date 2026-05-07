import * as fs from 'fs'
import * as core from '@actions/core'
import { XMLParser } from 'fast-xml-parser'

export interface FlowResult {
  name: string
  status: string
  errors: string[]
}

// Mirrors the terminal values of maestro-cli's UploadStatus.Status
// (maestro-cli/src/main/java/maestro/cli/api/ApiClient.kt). PENDING/PREPARING/
// INSTALLING/RUNNING are intermediate poll states and never reach a finished run.
export type UploadStatus = 'SUCCESS' | 'ERROR' | 'CANCELED' | 'WARNING' | 'STOPPED'

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '',
  parseAttributeValue: false,
  trimValues: true,
  // testsuite/testcase/failure can repeat. Forcing arrays makes shape predictable.
  isArray: (name) =>
    name === 'testsuite' || name === 'testcase' || name === 'failure',
})

function extractMessage(node: unknown): string {
  if (node === null || node === undefined) return ''
  if (typeof node === 'string') return node.trim()
  if (typeof node === 'object') {
    const obj = node as Record<string, unknown>
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
      // Maestro CLI's JUnit emitter only writes <failure> elements
      // (JUnitTestSuiteReporter.kt). It does not emit <error> or <skipped>.
      const errors = (tc.failure ?? [])
        .map(extractMessage)
        .filter((m: string) => m.length > 0)
      flows.push({
        name: String(tc.name),
        status: String(tc.status),
        errors,
      })
    }
  }
  return flows
}

export function deriveUploadStatus(
  flows: FlowResult[],
  exitCode: number
): UploadStatus {
  // No flows produced (junit missing or empty): trust the CLI exit code.
  if (flows.length === 0) return exitCode === 0 ? 'SUCCESS' : 'ERROR'
  if (flows.some((f) => f.errors.length > 0)) return 'ERROR'
  if (flows.some((f) => f.status === 'ERROR' || f.status === 'FAILURE')) return 'ERROR'
  if (flows.some((f) => f.status === 'STOPPED')) return 'STOPPED'
  if (flows.some((f) => f.status === 'CANCELED')) return 'CANCELED'
  if (flows.some((f) => f.status === 'WARNING')) return 'WARNING'
  return 'SUCCESS'
}

export async function main(): Promise<void> {
  const junitPath = process.argv[2]
  const exitCodeArg = process.argv[3]
  const flows =
    junitPath && fs.existsSync(junitPath)
      ? parseJunit(fs.readFileSync(junitPath, 'utf8'))
      : []
  core.setOutput('MAESTRO_CLOUD_FLOW_RESULTS', JSON.stringify(flows))
  // Exit code is only passed in non-async mode; in async mode the upload is
  // not awaited, so a terminal upload status doesn't exist yet.
  if (exitCodeArg !== undefined && exitCodeArg !== '') {
    const exitCode = Number(exitCodeArg)
    core.setOutput(
      'MAESTRO_CLOUD_UPLOAD_STATUS',
      deriveUploadStatus(flows, Number.isFinite(exitCode) ? exitCode : 1)
    )
  }
}

if (require.main === module) {
  main().catch((e) => {
    core.setFailed(`postprocess failed: ${e.message}`)
  })
}
