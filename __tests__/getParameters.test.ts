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

const required = { 'api-key': 'k', 'project-id': 'p' }

const setInputs = (inputs: Record<string, string>) => {
  for (const k of Object.keys(process.env)) {
    if (k.startsWith('INPUT_')) delete process.env[k]
  }
  for (const [k, v] of Object.entries(inputs)) {
    process.env[`INPUT_${k.toUpperCase()}`] = v
  }
}

describe('getParameters', () => {
  let warnSpy: jest.SpyInstance

  beforeEach(() => {
    ;(github as any).context = mockContext
    warnSpy = jest.spyOn(core, 'warning').mockImplementation(() => {})
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('happy path: no warnings, deprecated fields undefined', async () => {
    setInputs({ ...required, 'app-file': 'app.apk' })
    const params = await getParameters()
    expect(warnSpy).not.toHaveBeenCalled()
    expect(params.androidApiLevel).toBeUndefined()
    expect(params.iOSVersion).toBeUndefined()
  })

  describe.each([
    ['android-api-level', '29', 'androidApiLevel', 29],
    ['ios-version', '17', 'iOSVersion', 17],
  ])('deprecated input %s', (input, raw, field, expected) => {
    it('warns and still forwards', async () => {
      setInputs({ ...required, 'app-file': 'app.apk', [input]: raw })
      const params = await getParameters()
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining(`'${input}' is deprecated`)
      )
      expect((params as any)[field]).toBe(expected)
    })
  })

  describe.each([
    ['iOS', { 'device-os': 'iOS-18-2', 'device-model': 'iPhone-11' }, 'app.zip'],
    ['Android', { 'device-os': 'android-33', 'device-model': 'pixel_6' }, 'app.apk'],
  ])('device-os %s', (_label, devInputs, appFile) => {
    it('forwards device-os and device-model verbatim with no warnings', async () => {
      setInputs({ ...required, 'app-file': appFile, ...devInputs })
      const params = await getParameters()
      expect(params.deviceOs).toBe(devInputs['device-os'])
      expect(params.deviceModel).toBe(devInputs['device-model'])
      expect(warnSpy).not.toHaveBeenCalled()
    })
  })

  it('device-os: web allows omitting app-file', async () => {
    setInputs({ ...required, 'device-os': 'web' })
    const params = await getParameters()
    expect(params.deviceOs).toBe('web')
    expect(params.appFilePath).toBe('')
  })

  describe.each([
    [
      'mobile: rejects when both app-file and app-binary-id are set',
      { 'app-file': 'app.apk', 'app-binary-id': 'ab_123' },
      /Either app-file or app-binary-id must be used \(but not both\) for mobile tests/,
    ],
    [
      'mobile: rejects when neither is set',
      {},
      /Either app-file or app-binary-id must be used \(but not both\) for mobile tests/,
    ],
    [
      'web: rejects when app-file is provided',
      { 'device-os': 'web', 'app-file': 'app.apk' },
      /For web tests, neither app-file nor app-binary-id should be provided/,
    ],
    [
      'web: rejects when app-binary-id is provided',
      { 'device-os': 'web', 'app-binary-id': 'ab_123' },
      /For web tests, neither app-file nor app-binary-id should be provided/,
    ],
  ])('input validation: %s', (_label, inputs, error) => {
    it('throws', async () => {
      setInputs({ ...required, ...inputs })
      await expect(getParameters()).rejects.toThrow(error)
    })
  })

  it.each([
    ['app-file alone', { 'app-file': 'app.apk' }],
    ['app-binary-id alone', { 'app-binary-id': 'ab_123' }],
  ])('input validation: mobile happy path with %s', async (_label, inputs) => {
    setInputs({ ...required, ...inputs })
    await expect(getParameters()).resolves.toBeDefined()
  })
})
