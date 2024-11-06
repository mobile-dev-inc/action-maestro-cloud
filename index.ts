import * as core from '@actions/core'
import ApiClient, {
  CloudUploadRequest,
  UploadResponse,
  RobinUploadRequest,
  RobinUploadResponse,
} from './ApiClient'
import { validateAppFile } from './app_file'
import { zipFolder, zipIfFolder } from './archive_utils'
import { getParameters } from './params'
import { existsSync, readdirSync } from 'fs'
import StatusPoller from './StatusPoller'
import { info } from './log'

const knownAppTypes = ['ANDROID_APK', 'IOS_BUNDLE']

const listFilesInDirectory = () => {
  const files = readdirSync('.', { withFileTypes: true })

  console.log('Directory contents:')
  for (const f of files) {
    console.log(f.isDirectory() ? `${f.name}/` : f.name)
  }
}

const createWorkspaceZip = async (
  workspaceFolder: string | null
): Promise<string | null> => {
  let resolvedWorkspaceFolder = workspaceFolder
  if (resolvedWorkspaceFolder === null || workspaceFolder?.length === 0) {
    if (existsSync('.maestro')) {
      resolvedWorkspaceFolder = '.maestro'
      info('Packaging .maestro folder')
    } else if (existsSync('.mobiledev')) {
      resolvedWorkspaceFolder = '.mobiledev'
      info('Packaging .mobiledev folder')
    } else {
      listFilesInDirectory()
      throw new Error('Default workspace directory does not exist: .maestro/')
    }
  } else if (!existsSync(resolvedWorkspaceFolder)) {
    throw new Error(
      `Workspace directory does not exist: ${resolvedWorkspaceFolder}`
    )
  }
  await zipFolder(resolvedWorkspaceFolder, 'workspace.zip')
  return 'workspace.zip'
}

const run = async () => {
  const {
    apiKey,
    apiUrl,
    name,
    appFilePath,
    mappingFile,
    workspaceFolder,
    branchName,
    commitSha,
    repoOwner,
    repoName,
    pullRequestId,
    env,
    async,
    androidApiLevel,
    iOSVersion,
    includeTags,
    excludeTags,
    appBinaryId,
    deviceLocale,
    timeout,
    projectId,
  } = await getParameters()

  let appFile = null
  if (appFilePath !== '') {
    appFile = await validateAppFile(await zipIfFolder(appFilePath))
    if (!knownAppTypes.includes(appFile.type)) {
      throw new Error(`Unsupported app file type: ${appFile.type}`)
    }
  }

  const workspaceZip = await createWorkspaceZip(workspaceFolder)

  const client = new ApiClient(apiKey, apiUrl, projectId)

  if (!!projectId) {
    /**
     * If project Exist - Its Robin
     */
    info('Uploading to Robin')
    const request: RobinUploadRequest = {
      benchmarkName: name,
      projectId: projectId,
      repoOwner: repoOwner,
      repoName: repoName,
      agent: 'github',
      branch: branchName,
      commitSha: commitSha,
      pullRequestId: pullRequestId,
      env: env,
      androidApiLevel: androidApiLevel,
      iOSVersion: iOSVersion,
      includeTags: includeTags,
      excludeTags: excludeTags,
      appBinaryId: appBinaryId || undefined,
      deviceLocale: deviceLocale || undefined,
    }
    const {
      uploadId,
      orgId,
      appId,
      appBinaryId: appBinaryIdResponse,
    }: RobinUploadResponse = await client.robinUploadRequest(
      request,
      appFile && appFile.path,
      workspaceZip,
      mappingFile && (await zipIfFolder(mappingFile))
    )
    const consoleUrl = `https://app.robintest.com/project/${projectId}/maestro-test/app/${appId}/upload/${uploadId}`
    core.setOutput('ROBIN_CONSOLE_URL', consoleUrl)
    core.setOutput('ROBIN_APP_BINARY_ID', appBinaryIdResponse)
    !async &&
      new StatusPoller(client, uploadId, consoleUrl).startPolling(timeout)
  } else {
    /**
     * If project Exist - Its Cloud
     */
    info('Uploading to Maestro Cloud')
    const request: CloudUploadRequest = {
      benchmarkName: name,
      repoOwner: repoOwner,
      repoName: repoName,
      agent: 'github',
      branch: branchName,
      commitSha: commitSha,
      pullRequestId: pullRequestId,
      env: env,
      androidApiLevel: androidApiLevel,
      iOSVersion: iOSVersion,
      includeTags: includeTags,
      excludeTags: excludeTags,
      appBinaryId: appBinaryId || undefined,
      deviceLocale: deviceLocale || undefined,
    }
    const {
      uploadId,
      teamId,
      appBinaryId: appBinaryIdResponse,
    }: UploadResponse = await client.cloudUploadRequest(
      request,
      appFile && appFile.path,
      workspaceZip,
      mappingFile && (await zipIfFolder(mappingFile))
    )
    const consoleUrl = `https://console.mobile.dev/uploads/${uploadId}?teamId=${teamId}&appId=${appBinaryIdResponse}`
    info(
      `Visit the web console for more details about the upload: ${consoleUrl}\n`
    )
    core.setOutput('MAESTRO_CLOUD_CONSOLE_URL', consoleUrl)
    core.setOutput('MAESTRO_CLOUD_APP_BINARY_ID', appBinaryId)
    !async &&
      new StatusPoller(client, uploadId, consoleUrl).startPolling(timeout)
  }
}

run().catch((e) => {
  core.setFailed(`Error running Maestro Cloud Upload Action: ${e.message}`)
})
