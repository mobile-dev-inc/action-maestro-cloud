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

describe('branch resolution', () => {
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

  it('uses explicit branch input when provided', async () => {
    setInputs({ ...required, 'app-file': 'app.apk', branch: 'feature/foo' })
    await main()
    expect(exportedVars.MDEV_BRANCH).toBe('feature/foo')
  })

  it('trims whitespace from branch input', async () => {
    setInputs({ ...required, 'app-file': 'app.apk', branch: '  feature/foo  ' })
    await main()
    expect(exportedVars.MDEV_BRANCH).toBe('feature/foo')
  })

  it('falls back to PR head ref when no input', async () => {
    ;(github as any).context.payload = {
      pull_request: { head: { ref: 'feature/pr-branch', sha: 'abc123' } },
    }
    setInputs({ ...required, 'app-file': 'app.apk' })
    await main()
    expect(exportedVars.MDEV_BRANCH).toBe('feature/pr-branch')
  })

  it('throws when PR exists but head.ref missing', async () => {
    ;(github as any).context.payload = {
      pull_request: { head: { sha: 'abc123' } },
    }
    setInputs({ ...required, 'app-file': 'app.apk' })
    await main()
    expect(failures.length).toBe(1)
    expect(failures[0]).toMatch(/Unable find pull request ref/)
  })

  it('parses refs/heads format', async () => {
    ;(github as any).context.ref = 'refs/heads/feature/some-branch'
    setInputs({ ...required, 'app-file': 'app.apk' })
    await main()
    expect(exportedVars.MDEV_BRANCH).toBe('feature/some-branch')
  })

  it('parses refs/tags format', async () => {
    ;(github as any).context.ref = 'refs/tags/v1.2.3'
    setInputs({ ...required, 'app-file': 'app.apk' })
    await main()
    expect(exportedVars.MDEV_BRANCH).toBe('v1.2.3')
  })

  it('fails when ref format is invalid', async () => {
    ;(github as any).context.ref = 'invalid-ref-format'
    ;(github as any).context.payload = {}
    setInputs({ ...required, 'app-file': 'app.apk' })
    await main()
    expect(failures[0]).toMatch(/Failed to parse GitHub ref/)
  })

  it('input wins over PR context', async () => {
    ;(github as any).context.payload = {
      pull_request: { head: { ref: 'pr-branch', sha: 'abc123' } },
    }
    setInputs({ ...required, 'app-file': 'app.apk', branch: 'override' })
    await main()
    expect(exportedVars.MDEV_BRANCH).toBe('override')
  })
})
