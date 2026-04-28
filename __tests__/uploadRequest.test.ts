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
  it('maps a fully-populated Params to the wire-format request', () => {
    const req = buildUploadRequest({
      ...baseParams,
      androidApiLevel: 30,
      iOSVersion: 17,
      includeTags: ['dev'],
      excludeTags: ['flaky'],
      appBinaryId: 'ab_123',
      deviceLocale: 'en_US',
      deviceModel: 'iPhone-11',
      deviceOs: 'iOS-18-2',
    })
    expect(req).toEqual({
      benchmarkName: 'Run name',
      projectId: 'proj_test',
      repoOwner: 'o',
      repoName: 'r',
      agent: 'github',
      branch: 'main',
      commitSha: 'sha123',
      pullRequestId: undefined,
      env: {},
      androidApiLevel: 30,
      iOSVersion: 17,
      includeTags: ['dev'],
      excludeTags: ['flaky'],
      appBinaryId: 'ab_123',
      deviceLocale: 'en_US',
      deviceModel: 'iPhone-11',
      deviceOs: 'iOS-18-2',
    })
    const json = JSON.stringify(req)
    expect(json).toContain('"androidApiLevel":30')
    expect(json).toContain('"iOSVersion":17')
  })

  it.each([
    ['appBinaryId', 'appBinaryId'],
    ['deviceLocale', 'deviceLocale'],
    ['deviceModel', 'deviceModel'],
    ['deviceOs', 'deviceOs'],
  ])('coerces empty %s to undefined', (field) => {
    const req = buildUploadRequest({ ...baseParams, [field]: '' })
    expect((req as any)[field]).toBeUndefined()
  })

  it('omits androidApiLevel and iOSVersion when not set', () => {
    const req = buildUploadRequest(baseParams)
    expect(req.androidApiLevel).toBeUndefined()
    expect(req.iOSVersion).toBeUndefined()
  })
})
