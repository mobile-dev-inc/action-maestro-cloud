import { buildUploadRequest } from '../uploadRequest'
import { Params } from '../params'

const baseParams: Params = {
  projectId: 'proj_test',
  apiKey: 'rb_test',
  apiUrl: 'https://api.example/v2/project/proj_test',
  name: 'Run name',
  appFilePath: 'app.apk',
  mappingFile: null,
  workspaceFolder: null,
  branchName: 'main',
  commitSha: 'sha123',
  repoName: 'r',
  repoOwner: 'o',
  pullRequestId: undefined,
  env: {},
  async: false,
  includeTags: [],
  excludeTags: [],
  appBinaryId: '',
  deviceLocale: undefined,
  deviceModel: undefined,
  deviceOs: undefined,
}

describe('buildUploadRequest', () => {
  it('forwards iOSVersion when set (deprecated but still honoured)', () => {
    const req = buildUploadRequest({ ...baseParams, iOSVersion: 17 })
    expect(req.iOSVersion).toBe(17)
  })

  it('omits iOSVersion when not set', () => {
    const req = buildUploadRequest(baseParams)
    expect(req.iOSVersion).toBeUndefined()
  })

  it('forwards androidApiLevel when set', () => {
    const req = buildUploadRequest({ ...baseParams, androidApiLevel: 29 })
    expect(req.androidApiLevel).toBe(29)
  })

  it('omits androidApiLevel when not set', () => {
    const req = buildUploadRequest(baseParams)
    expect(req.androidApiLevel).toBeUndefined()
  })

  it('forwards device-os and device-model verbatim', () => {
    const req = buildUploadRequest({
      ...baseParams,
      deviceOs: 'iOS-18-2',
      deviceModel: 'iPhone-11',
    })
    expect(req.deviceOs).toBe('iOS-18-2')
    expect(req.deviceModel).toBe('iPhone-11')
  })

  it('accepts android-style device-os values', () => {
    const req = buildUploadRequest({
      ...baseParams,
      deviceOs: 'android-33',
      deviceModel: 'pixel_6',
    })
    expect(req.deviceOs).toBe('android-33')
    expect(req.deviceModel).toBe('pixel_6')
  })

  it('uses agent=github', () => {
    expect(buildUploadRequest(baseParams).agent).toBe('github')
  })

  it('coerces empty appBinaryId to undefined', () => {
    const req = buildUploadRequest({ ...baseParams, appBinaryId: '' })
    expect(req.appBinaryId).toBeUndefined()
  })

  it('forwards non-empty appBinaryId', () => {
    const req = buildUploadRequest({ ...baseParams, appBinaryId: 'ab_123' })
    expect(req.appBinaryId).toBe('ab_123')
  })

  it('forwards include-tags and exclude-tags', () => {
    const req = buildUploadRequest({
      ...baseParams,
      includeTags: ['dev', 'pr'],
      excludeTags: ['flaky'],
    })
    expect(req.includeTags).toEqual(['dev', 'pr'])
    expect(req.excludeTags).toEqual(['flaky'])
  })

  it('serializes deprecated fields with the legacy wire-format keys', () => {
    const req = buildUploadRequest({
      ...baseParams,
      androidApiLevel: 30,
      iOSVersion: 17,
    })
    const json = JSON.stringify(req)
    expect(json).toContain('"androidApiLevel":30')
    expect(json).toContain('"iOSVersion":17')
  })
})
