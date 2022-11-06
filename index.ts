import * as core from '@actions/core'
import ApiClient, { UploadRequest } from './ApiClient'
import { validateAppFile } from './app_file';
import { zipFolder, zipIfFolder } from './archive_utils';
import { getParameters } from './params';
import { existsSync } from 'fs';
import StatusPoller from './StatusPoller';
import { err, info } from './log';

const knownAppTypes = ['ANDROID_APK', 'IOS_BUNDLE']

const createWorkspaceZip = async (workspaceFolder: string | null): Promise<string | null> => {
  let resolvedWorkspaceFolder = workspaceFolder
  if (resolvedWorkspaceFolder === null) {
    if (existsSync('.maestro')) {
      resolvedWorkspaceFolder = '.maestro'
    } else if (existsSync('.mobiledev')) {
      resolvedWorkspaceFolder = '.mobiledev'
    } else {
      err(`Default workspace directory does not exist: .maestro/`)
      return null
    }
  } else if (!existsSync(resolvedWorkspaceFolder)) {
    err(`Workspace directory does not exist: ${resolvedWorkspaceFolder}`)
    return null
  }
  info("Packaging .mobiledev folder")
  await zipFolder(resolvedWorkspaceFolder, 'workspace.zip');
  return 'workspace.zip'
}

export const getConsoleUrl = (uploadId: string, teamId: string, appId: string): string => {
  return `https://console.mobile.dev/uploads/${uploadId}?teamId=${teamId}&appId=${appId}`
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
    repoOwner,
    repoName,
    pullRequestId,
    env,
    async
  } = await getParameters()

  const appFile = await validateAppFile(
    await zipIfFolder(appFilePath)
  );
  if (!knownAppTypes.includes(appFile.type)) {
    throw new Error(`Unsupported app file type: ${appFile.type}`)
  }

  const workspaceZip = await createWorkspaceZip(workspaceFolder)

  const client = new ApiClient(apiKey, apiUrl)

  info("Uploading to Maestro Cloud")
  const request: UploadRequest = {
    benchmarkName: name,
    branch: branchName,
    repoOwner: repoOwner,
    repoName: repoName,
    pullRequestId: pullRequestId,
    env: env,
    agent: 'gh-action'
  }

  const { uploadId, teamId, targetId: appId } = await client.uploadRequest(
    request,
    appFile.path,
    workspaceZip,
    mappingFile && await zipIfFolder(mappingFile),
  )
  const consoleUrl = getConsoleUrl(uploadId, teamId, appId)
  info(`Visit the web console for more details about the upload: ${consoleUrl}\n`)

  !async && new StatusPoller(client, uploadId, consoleUrl).startPolling()
}

run().catch(e => {
  core.setFailed(`Error running Maestro Cloud Upload Action: ${e.message}`)
})
