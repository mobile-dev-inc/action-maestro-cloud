import * as core from '@actions/core'
import ApiClient, { UploadRequest } from './ApiClient'
import { validateAppFile } from './app_file';
import { zipFolder, zipIfFolder } from './archive_utils';
import { getParameters } from './params';
import { existsSync, readdirSync } from 'fs';
import StatusPoller from './StatusPoller';
import { info } from './log';

const knownAppTypes = ['ANDROID_APK', 'IOS_BUNDLE']

const listFilesInDirectory = () => {
  const files = readdirSync('.', { withFileTypes: true })

  console.log("Directory contents:")
  for (const f of files) {
    console.log(f.isDirectory() ? `${f.name}/` : f.name)
  }
}

const createWorkspaceZip = async (workspaceFolder: string | null): Promise<string | null> => {
  let resolvedWorkspaceFolder = workspaceFolder
  if (resolvedWorkspaceFolder === null || workspaceFolder?.length === 0) {
    if (existsSync('.maestro')) {
      resolvedWorkspaceFolder = '.maestro'
      info("Packaging .maestro folder")
    } else if (existsSync('.mobiledev')) {
      resolvedWorkspaceFolder = '.mobiledev'
      info("Packaging .mobiledev folder")
    } else {
      listFilesInDirectory()
      throw new Error("Default workspace directory does not exist: .maestro/")
    }
  } else if (!existsSync(resolvedWorkspaceFolder)) {
    throw new Error(`Workspace directory does not exist: ${resolvedWorkspaceFolder}`)
  }
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
    async,
    androidApiLevel,
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
    agent: 'github',
    androidApiLevel: androidApiLevel,
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
