import * as core from '@actions/core'
import * as github from '@actions/github'
import { getParameters } from '../params'

jest.mock('@actions/github')

const mockContext = {
  payload: {},
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
    process.env[`INPUT_${k.toUpperCase()}`] = v
  }
}

describe('app-file / app-binary-id / device-os: web validation', () => {
  beforeEach(() => {
    ;(github as any).context = mockContext
    jest.spyOn(core, 'warning').mockImplementation(() => {})
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  const required = { 'api-key': 'k', 'project-id': 'p' }

  it('mobile run: accepts app-file alone', async () => {
    setInputs({ ...required, 'app-file': 'app.apk' })
    await expect(getParameters()).resolves.toBeDefined()
  })

  it('mobile run: accepts app-binary-id alone', async () => {
    setInputs({ ...required, 'app-binary-id': 'ab_123' })
    await expect(getParameters()).resolves.toBeDefined()
  })

  it('mobile run: rejects when both app-file and app-binary-id are set', async () => {
    setInputs({
      ...required,
      'app-file': 'app.apk',
      'app-binary-id': 'ab_123',
    })
    await expect(getParameters()).rejects.toThrow(
      /Either app-file or app-binary-id must be used \(but not both\) for mobile tests/
    )
  })

  it('mobile run: rejects when neither is set', async () => {
    setInputs(required)
    await expect(getParameters()).rejects.toThrow(
      /Either app-file or app-binary-id must be used \(but not both\) for mobile tests/
    )
  })

  it('web run: accepts neither app-file nor app-binary-id', async () => {
    setInputs({ ...required, 'device-os': 'web' })
    const params = await getParameters()
    expect(params.deviceOs).toBe('web')
  })

  it('web run: rejects when app-file is provided', async () => {
    setInputs({ ...required, 'device-os': 'web', 'app-file': 'app.apk' })
    await expect(getParameters()).rejects.toThrow(
      /For web tests, neither app-file nor app-binary-id should be provided/
    )
  })

  it('web run: rejects when app-binary-id is provided', async () => {
    setInputs({
      ...required,
      'device-os': 'web',
      'app-binary-id': 'ab_123',
    })
    await expect(getParameters()).rejects.toThrow(
      /For web tests, neither app-file nor app-binary-id should be provided/
    )
  })
})
