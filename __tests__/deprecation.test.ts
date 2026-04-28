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
    process.env[`INPUT_${k.toUpperCase().replace(/ /g, '_')}`] = v
  }
}

describe('getParameters deprecation behaviour', () => {
  let warnSpy: jest.SpyInstance

  beforeEach(() => {
    ;(github as any).context = mockContext
    warnSpy = jest.spyOn(core, 'warning').mockImplementation(() => {})
  })

  afterEach(() => {
    warnSpy.mockRestore()
  })

  const baseInputs = {
    'api-key': 'k',
    'project-id': 'p',
    'app-file': 'app.zip',
  }

  it('does not warn when no deprecated inputs are set', async () => {
    setInputs(baseInputs)
    const params = await getParameters()
    expect(warnSpy).not.toHaveBeenCalled()
    expect(params.androidApiLevel).toBeUndefined()
    expect(params.iOSVersion).toBeUndefined()
  })

  it('warns and still forwards android-api-level', async () => {
    setInputs({ ...baseInputs, 'android-api-level': '29' })
    const params = await getParameters()
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("'android-api-level' is deprecated")
    )
    expect(params.androidApiLevel).toBe(29)
  })

  it('warns and still forwards ios-version', async () => {
    setInputs({ ...baseInputs, 'ios-version': '17' })
    const params = await getParameters()
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("'ios-version' is deprecated")
    )
    expect(params.iOSVersion).toBe(17)
  })

  it('forwards device-os and device-model unchanged', async () => {
    setInputs({
      ...baseInputs,
      'device-os': 'iOS-18-2',
      'device-model': 'iPhone-11',
    })
    const params = await getParameters()
    expect(params.deviceOs).toBe('iOS-18-2')
    expect(params.deviceModel).toBe('iPhone-11')
    expect(warnSpy).not.toHaveBeenCalled()
  })

  it('accepts android device-os values', async () => {
    setInputs({
      ...baseInputs,
      'device-os': 'android-33',
      'device-model': 'pixel_6',
    })
    const params = await getParameters()
    expect(params.deviceOs).toBe('android-33')
    expect(params.deviceModel).toBe('pixel_6')
  })

  it('allows web flow without app-file', async () => {
    setInputs({
      'api-key': 'k',
      'project-id': 'p',
      'device-os': 'web',
    })
    const params = await getParameters()
    expect(params.deviceOs).toBe('web')
    expect(params.appFilePath).toBe('')
  })
})
