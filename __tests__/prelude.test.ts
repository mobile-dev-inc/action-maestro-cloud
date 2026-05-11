// __tests__/prelude.test.ts
import * as core from '@actions/core'
import * as github from '@actions/github'
import * as glob from '@actions/glob'
import { main } from '../prelude'

jest.mock('@actions/github')
jest.mock('@actions/glob')

// Default glob mock: identity match — returns the input pattern as a single
// resolved path. Tests that exercise glob behavior override this per-case.
const mockGlobIdentity = () => {
  ;(glob.create as jest.Mock).mockImplementation(async (pattern: string) => ({
    glob: async () => [pattern],
  }))
}

// Re-applied before every test (overrides from glob-specific tests would
// otherwise leak into later cases).
beforeEach(mockGlobIdentity)

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
    process.env[`INPUT_${k.replace(/ /g, '_').toUpperCase()}`] = v
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

  it('falls through whitespace-only branch input to ref parsing', async () => {
    setInputs({ ...required, 'app-file': 'app.apk', branch: '   ' })
    await main()
    expect(exportedVars.MDEV_BRANCH).toBe('main')
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

describe('name resolution', () => {
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

  it('uses explicit name input when provided', async () => {
    setInputs({ ...required, 'app-file': 'app.apk', name: 'My Run' })
    await main()
    expect(exportedVars.MDEV_NAME).toBe('My Run')
  })

  it('falls back to PR title', async () => {
    ;(github as any).context.payload = {
      pull_request: { title: 'PR title here', head: { ref: 'b', sha: 's' } },
    }
    setInputs({ ...required, 'app-file': 'app.apk' })
    await main()
    expect(exportedVars.MDEV_NAME).toBe('PR title here')
  })

  it('falls back to push commit message', async () => {
    ;(github as any).context.eventName = 'push'
    ;(github as any).context.payload = {
      head_commit: { message: 'commit subject' },
    }
    setInputs({ ...required, 'app-file': 'app.apk' })
    await main()
    expect(exportedVars.MDEV_NAME).toBe('commit subject')
  })

  it('falls back to SHA when no other source', async () => {
    ;(github as any).context.eventName = 'push'
    ;(github as any).context.payload = {}
    ;(github as any).context.sha = 'deadbeef'
    setInputs({ ...required, 'app-file': 'app.apk' })
    await main()
    expect(exportedVars.MDEV_NAME).toBe('deadbeef')
  })
})

describe('input validation', () => {
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

  it('mobile: rejects when both app-file and app-binary-id given', async () => {
    setInputs({ ...required, 'app-file': 'a.apk', 'app-binary-id': 'b' })
    await main()
    expect(failures[0]).toMatch(/Either app-file or app-binary-id must be used \(but not both\)/)
  })

  it('mobile: rejects when neither app-file nor app-binary-id given', async () => {
    setInputs({ ...required })
    await main()
    expect(failures[0]).toMatch(/Either app-file or app-binary-id must be used \(but not both\)/)
  })

  it('mobile: accepts app-file alone', async () => {
    setInputs({ ...required, 'app-file': 'a.apk' })
    await main()
    expect(failures).toEqual([])
  })

  it('mobile: accepts app-binary-id alone', async () => {
    setInputs({ ...required, 'app-binary-id': 'bin_x' })
    await main()
    expect(failures).toEqual([])
  })

  it('web: rejects app-file', async () => {
    setInputs({ ...required, 'device-os': 'web', 'app-file': 'a.apk' })
    await main()
    expect(failures[0]).toMatch(/For web tests, neither app-file nor app-binary-id should be provided/)
  })

  it('web: rejects app-binary-id', async () => {
    setInputs({ ...required, 'device-os': 'web', 'app-binary-id': 'bin_x' })
    await main()
    expect(failures[0]).toMatch(/For web tests, neither app-file nor app-binary-id should be provided/)
  })

  it('web: accepts neither', async () => {
    setInputs({ ...required, 'device-os': 'web' })
    await main()
    expect(failures).toEqual([])
  })
})

describe('env parsing', () => {
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

  it('writes empty string when env not set', async () => {
    setInputs({ ...required, 'app-file': 'a.apk' })
    await main()
    expect(exportedVars.MDEV_ENV ?? '').toBe('')
  })

  it('parses single KEY=VAL', async () => {
    setInputs({ ...required, 'app-file': 'a.apk', env: 'FOO=bar' })
    await main()
    expect(exportedVars.MDEV_ENV).toBe('FOO=bar')
  })

  it('parses multiple lines', async () => {
    setInputs({ ...required, 'app-file': 'a.apk', env: 'A=1\nB=2' })
    await main()
    expect(exportedVars.MDEV_ENV).toBe('A=1\nB=2')
  })

  it('preserves "=" in values', async () => {
    setInputs({ ...required, 'app-file': 'a.apk', env: 'TOKEN=foo=bar=baz' })
    await main()
    expect(exportedVars.MDEV_ENV).toBe('TOKEN=foo=bar=baz')
  })

  it('fails on malformed line (no equals)', async () => {
    setInputs({ ...required, 'app-file': 'a.apk', env: 'NOEQUALS' })
    await main()
    expect(failures[0]).toMatch(/Invalid env parameter: NOEQUALS/)
  })
})

describe('tag passthrough', () => {
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

  it('forwards include-tags verbatim', async () => {
    setInputs({ ...required, 'app-file': 'a.apk', 'include-tags': 'dev,smoke' })
    await main()
    expect(exportedVars.MDEV_INCLUDE_TAGS).toBe('dev,smoke')
  })

  it('forwards exclude-tags verbatim', async () => {
    setInputs({ ...required, 'app-file': 'a.apk', 'exclude-tags': 'flaky' })
    await main()
    expect(exportedVars.MDEV_EXCLUDE_TAGS).toBe('flaky')
  })

  it('writes empty string when tags not set', async () => {
    setInputs({ ...required, 'app-file': 'a.apk' })
    await main()
    expect(exportedVars.MDEV_INCLUDE_TAGS ?? '').toBe('')
    expect(exportedVars.MDEV_EXCLUDE_TAGS ?? '').toBe('')
  })
})

describe('deprecated inputs', () => {
  let exportedVars: Record<string, string>
  let failures: string[]

  beforeEach(() => {
    ;(github as any).context = JSON.parse(JSON.stringify(baseContext))
    exportedVars = {}
    failures = []
    jest.spyOn(core, 'exportVariable').mockImplementation((k, v) => {
      exportedVars[k] = String(v)
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

  it('forwards android-api-level', async () => {
    setInputs({ ...required, 'app-file': 'a.apk', 'android-api-level': '29' })
    await main()
    expect(exportedVars.MDEV_ANDROID_API_LEVEL).toBe('29')
  })

  it('forwards ios-version', async () => {
    setInputs({ ...required, 'app-file': 'a.apk', 'ios-version': '17' })
    await main()
    expect(exportedVars.MDEV_IOS_VERSION).toBe('17')
  })

  it('exports deprecated MDEV_* vars as empty when inputs are absent', async () => {
    // Empty exports are deliberate: they overwrite any stale value left by a
    // prior step's invocation in the same job ($GITHUB_ENV is cumulative).
    setInputs({ ...required, 'app-file': 'a.apk' })
    await main()
    expect(exportedVars.MDEV_ANDROID_API_LEVEL).toBe('')
    expect(exportedVars.MDEV_IOS_VERSION).toBe('')
  })
})

describe('remaining MDEV exports', () => {
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

  it('forwards api/project/name primitives', async () => {
    setInputs({
      'api-key': 'rb_xyz',
      'project-id': 'proj_abc',
      'api-url': 'https://example.com',
      'app-file': 'a.apk',
    })
    await main()
    expect(exportedVars.MDEV_API_KEY).toBe('rb_xyz')
    expect(exportedVars.MDEV_PROJECT_ID).toBe('proj_abc')
    expect(exportedVars.MDEV_API_URL).toBe('https://example.com')
  })

  it('forwards files', async () => {
    setInputs({
      ...required,
      'app-file': 'app.apk',
      'mapping-file': 'mapping.txt',
    })
    await main()
    expect(exportedVars.MDEV_APP_FILE).toBe('app.apk')
    expect(exportedVars.MDEV_MAPPING_FILE).toBe('mapping.txt')
  })

  it('forwards device knobs', async () => {
    setInputs({
      ...required,
      'app-file': 'a.apk',
      'device-os': 'iOS-18-2',
      'device-locale': 'de_DE',
      'device-model': 'iPhone-11',
    })
    await main()
    expect(exportedVars.MDEV_DEVICE_OS).toBe('iOS-18-2')
    expect(exportedVars.MDEV_DEVICE_LOCALE).toBe('de_DE')
    expect(exportedVars.MDEV_DEVICE_MODEL).toBe('iPhone-11')
  })

  it('forwards async true; omits when false-y', async () => {
    setInputs({ ...required, 'app-file': 'a.apk', async: 'true' })
    await main()
    expect(exportedVars.MDEV_ASYNC).toBe('true')
  })

  it('does not set MDEV_ASYNC when async is false', async () => {
    setInputs({ ...required, 'app-file': 'a.apk', async: 'false' })
    await main()
    expect(exportedVars.MDEV_ASYNC ?? '').toBe('')
  })

  it('forwards timeout and workspace', async () => {
    setInputs({
      ...required,
      'app-file': 'a.apk',
      timeout: '90',
      workspace: 'flows/',
    })
    await main()
    expect(exportedVars.MDEV_TIMEOUT).toBe('90')
    expect(exportedVars.MDEV_WORKSPACE).toBe('flows/')
  })

  it('forwards repo metadata from github.context', async () => {
    setInputs({ ...required, 'app-file': 'a.apk' })
    await main()
    expect(exportedVars.MDEV_REPO_OWNER).toBe('mobile-dev-inc')
    expect(exportedVars.MDEV_REPO_NAME).toBe('action-maestro-cloud')
  })

  it('forwards PR id and commit SHA when PR event', async () => {
    ;(github as any).context.payload = {
      pull_request: { number: 42, head: { ref: 'feat', sha: 'shashashash' } },
    }
    setInputs({ ...required, 'app-file': 'a.apk' })
    await main()
    expect(exportedVars.MDEV_PR_ID).toBe('42')
    expect(exportedVars.MDEV_COMMIT_SHA).toBe('shashashash')
  })

  it('omits PR id and commit SHA on push', async () => {
    setInputs({ ...required, 'app-file': 'a.apk' })
    await main()
    expect(exportedVars.MDEV_PR_ID ?? '').toBe('')
    expect(exportedVars.MDEV_COMMIT_SHA ?? '').toBe('')
  })
})

describe('glob expansion for app-file and mapping-file', () => {
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
    for (const k of Object.keys(process.env)) {
      if (k.startsWith('INPUT_')) delete process.env[k]
    }
  })

  it('expands a glob pattern to its single matching path', async () => {
    ;(glob.create as jest.Mock).mockImplementation(async () => ({
      glob: async () => ['/work/app/build/outputs/apk/debug/app-debug.apk'],
    }))
    setInputs({
      ...required,
      'app-file': 'app/build/outputs/apk/debug/*.apk',
    })
    await main()
    expect(exportedVars.MDEV_APP_FILE).toBe(
      '/work/app/build/outputs/apk/debug/app-debug.apk'
    )
    expect(failures).toEqual([])
  })

  it('warns and uses first match when glob matches multiple files', async () => {
    ;(glob.create as jest.Mock).mockImplementation(async () => ({
      glob: async () => ['/work/a.apk', '/work/b.apk', '/work/c.apk'],
    }))
    setInputs({ ...required, 'app-file': '*.apk' })
    await main()
    expect(exportedVars.MDEV_APP_FILE).toBe('/work/a.apk')
    expect(
      warnings.some((w) => /matched 3 files/.test(w) && /a\.apk/.test(w))
    ).toBe(true)
  })

  it('fails when glob matches no files', async () => {
    ;(glob.create as jest.Mock).mockImplementation(async () => ({
      glob: async () => [],
    }))
    setInputs({ ...required, 'app-file': 'no-such-file-*.apk' })
    await main()
    expect(failures.some((f) => /matched no files/.test(f))).toBe(true)
    expect(exportedVars.MDEV_APP_FILE).toBeUndefined()
  })

  it('expands mapping-file too', async () => {
    ;(glob.create as jest.Mock).mockImplementation(async (pattern: string) => ({
      // Only the mapping pattern returns the resolved path; app-file uses
      // the default identity mock.
      glob: async () =>
        pattern === '**/mapping.txt'
          ? ['/work/build/outputs/mapping/release/mapping.txt']
          : [pattern],
    }))
    setInputs({
      ...required,
      'app-file': 'a.apk',
      'mapping-file': '**/mapping.txt',
    })
    await main()
    expect(exportedVars.MDEV_MAPPING_FILE).toBe(
      '/work/build/outputs/mapping/release/mapping.txt'
    )
  })

  it('error message names which input failed', async () => {
    ;(glob.create as jest.Mock).mockImplementation(async () => ({
      glob: async () => [],
    }))
    setInputs({ ...required, 'app-file': 'missing.apk' })
    await main()
    expect(failures.some((f) => /'app-file'/.test(f))).toBe(true)
  })
})

// Regression test for the cross-step env leak: $GITHUB_ENV is cumulative
// across steps in the same job, so any MDEV_* variable that prelude
// conditionally skips would otherwise carry over a stale value from a
// previous step. The fix is to always export every MDEV_* variable; absent
// inputs export as ''. Verified end-to-end against the iOS-after-Android
// 400 we hit in validate-local (Android binary id leaking into iOS upload).
describe('overwrite behavior across invocations', () => {
  let exportedVars: Record<string, string>

  beforeEach(() => {
    ;(github as any).context = JSON.parse(JSON.stringify(baseContext))
    exportedVars = {}
    jest.spyOn(core, 'exportVariable').mockImplementation((k, v) => {
      exportedVars[k] = String(v)
    })
    jest.spyOn(core, 'warning').mockImplementation(() => {})
    jest.spyOn(core, 'setFailed').mockImplementation(() => {})
  })

  afterEach(() => {
    for (const k of Object.keys(process.env)) {
      if (k.startsWith('INPUT_')) delete process.env[k]
    }
  })

  it('every MDEV_* var is written on every run (empty when input absent)', async () => {
    setInputs({ ...required, 'app-file': 'a.apk' })
    await main()
    // The full set of MDEV_* keys the action contracts on. If a key is
    // missing here, an earlier step's value could leak into this run.
    const expectedKeys = [
      'MDEV_API_KEY', 'MDEV_PROJECT_ID', 'MDEV_API_URL',
      'MDEV_BRANCH', 'MDEV_NAME', 'MDEV_ENV',
      'MDEV_INCLUDE_TAGS', 'MDEV_EXCLUDE_TAGS',
      'MDEV_ANDROID_API_LEVEL', 'MDEV_IOS_VERSION',
      'MDEV_APP_FILE', 'MDEV_APP_BINARY_ID', 'MDEV_MAPPING_FILE',
      'MDEV_DEVICE_OS', 'MDEV_DEVICE_LOCALE', 'MDEV_DEVICE_MODEL',
      'MDEV_ASYNC', 'MDEV_TIMEOUT', 'MDEV_WORKSPACE',
      'MDEV_REPO_OWNER', 'MDEV_REPO_NAME',
      'MDEV_PR_ID', 'MDEV_COMMIT_SHA',
    ]
    for (const key of expectedKeys) {
      expect(exportedVars).toHaveProperty(key)
    }
  })

  it('app-binary-id absent overwrites any prior export with empty', async () => {
    // Mirrors the validate-local sequence: chained step set MDEV_APP_BINARY_ID,
    // next step uses app-file alone. The next step's prelude must clear it.
    setInputs({ ...required, 'app-file': 'wikipedia.zip' })
    await main()
    expect(exportedVars.MDEV_APP_BINARY_ID).toBe('')
    expect(exportedVars.MDEV_APP_FILE).toBe('wikipedia.zip')
  })

  it('app-file absent overwrites any prior export with empty', async () => {
    // Inverse: chained-binary-id step must clear a previous MDEV_APP_FILE.
    setInputs({ ...required, 'app-binary-id': 'app_xyz' })
    await main()
    expect(exportedVars.MDEV_APP_FILE).toBe('')
    expect(exportedVars.MDEV_APP_BINARY_ID).toBe('app_xyz')
  })
})
