// __tests__/prelude.test.ts
import * as core from '@actions/core'
import * as github from '@actions/github'
import { main } from '../prelude'

jest.mock('@actions/github')

const required = {
  'api-key': 'k',
  'project-id': 'p',
}

const baseContext = {
  payload: {} as any,
  ref: 'refs/heads/main',
  eventName: 'push',
  repo: { owner: 'mobile-dev-inc', repo: 'action-maestro-cloud' },
  sha: 'abc123',
}

const setInputs = (inputs: Record<string, string>) => {
  for (const k of Object.keys(process.env)) {
    if (k.startsWith('INPUT_')) delete process.env[k]
  }
  for (const [k, v] of Object.entries(inputs)) {
    process.env[`INPUT_${k.toUpperCase().replace(/-/g, '_')}`] = v
  }
}

describe('prelude', () => {
  let exportedVars: Record<string, string>
  let warnings: string[]
  let failures: string[]

  beforeEach(() => {
    ;(github as any).context = JSON.parse(JSON.stringify(baseContext))
    exportedVars = {}
    warnings = []
    failures = []
    jest.spyOn(core, 'exportVariable').mockImplementation((k, v) => {
      exportedVars[k] = String(v)
    })
    jest.spyOn(core, 'warning').mockImplementation((m) => {
      warnings.push(typeof m === 'string' ? m : m.message)
    })
    jest.spyOn(core, 'setFailed').mockImplementation((m) => {
      failures.push(typeof m === 'string' ? m : m.message)
    })
  })

  afterEach(() => {
    jest.restoreAllMocks()
    for (const k of Object.keys(process.env)) {
      if (k.startsWith('INPUT_')) delete process.env[k]
    }
  })

  it('runs without throwing on minimal inputs', async () => {
    setInputs({ ...required, 'app-file': 'app.apk' })
    await main()
    expect(failures).toEqual([])
  })
})
