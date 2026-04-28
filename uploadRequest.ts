import type { UploadRequest } from './ApiClient'
import type { Params } from './params'

export const buildUploadRequest = (params: Params): UploadRequest => ({
  benchmarkName: params.name,
  projectId: params.projectId,
  repoOwner: params.repoOwner,
  repoName: params.repoName,
  agent: 'github',
  branch: params.branchName,
  commitSha: params.commitSha,
  pullRequestId: params.pullRequestId,
  env: params.env,
  androidApiLevel: params.androidApiLevel,
  iOSVersion: params.iOSVersion,
  includeTags: params.includeTags,
  excludeTags: params.excludeTags,
  appBinaryId: params.appBinaryId || undefined,
  deviceLocale: params.deviceLocale || undefined,
  deviceModel: params.deviceModel || undefined,
  deviceOs: params.deviceOs || undefined,
})
