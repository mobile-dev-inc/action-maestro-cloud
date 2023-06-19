import * as github from '@actions/github';
import * as core from '@actions/core';
import { AppFile, validateMappingFile } from './app_file';
import { PushEvent } from '@octokit/webhooks-definitions/schema'

export type Params = {
  apiKey: string,
  apiUrl: string,
  name: string,
  appFilePath: string,
  mappingFile: string | null,
  workspaceFolder: string | null,
  branchName: string
  commitSha?: string
  repoName: string
  repoOwner: string
  pullRequestId?: string,
  env?: { [key: string]: string },
  async?: boolean,
  androidApiLevel?: number,
  iOSVersion?: number,
  includeTags: string[],
  excludeTags: string[],
}

function getBranchName(): string {
  const pullRequest = github.context.payload.pull_request
  if (pullRequest) {
    const branchName = pullRequest?.head?.ref;
    if (!branchName) {
      throw new Error(`Unable find pull request ref: ${JSON.stringify(pullRequest, undefined, 2)}`)
    }
    return branchName
  }

  const regex = /refs\/(heads|tags)\/(.*)/
  const ref = github.context.ref
  let result = regex.exec(ref);
  if (!result || result.length < 3) {
    throw new Error(`Failed to parse GitHub ref: ${ref}`)
  }
  return result[2]
}

function getCommitSha(): string | undefined {
  return github.context.payload.pull_request?.head.sha
}

function getRepoName(): string {
  return github.context.repo.repo
}

function getRepoOwner(): string {
  return github.context.repo.owner
}

function getPullRequestId(): string | undefined {
  const pullRequestId = github.context.payload.pull_request?.number
  if (pullRequestId === undefined) return undefined
  return `${pullRequestId}`
}

function getPullRequestTitle(): string | undefined {
  const pullRequestTitle = github.context.payload.pull_request?.title
  if (pullRequestTitle === undefined) return undefined
  return `${pullRequestTitle}`
}

function getInferredName(): string {
  const pullRequestTitle = getPullRequestTitle()
  if (pullRequestTitle) return pullRequestTitle;

  if (github.context.eventName === 'push') {
    const pushPayload = github.context.payload as PushEvent
    const commitMessage = pushPayload.head_commit?.message;
    if (commitMessage) return commitMessage
  }

  return github.context.sha
}

function getAndroidApiLevel(apiLevel?: string): number | undefined {
  return apiLevel ? +apiLevel : undefined
}

function getIOSVersion(iosVersion?: string): number | undefined {
  return iosVersion ? +iosVersion : undefined
}

function parseTags(tags?: string): string[] {
  if (tags === undefined || tags === '') return []

  if (tags.includes(',')) {
    const arrayTags = tags.split(',')
      .map(it => it.trim())

    if (!Array.isArray(arrayTags))
      throw new Error("tags must be an Array.")

    return arrayTags
  }

  return [tags]
}

export async function getParameters(): Promise<Params> {
  const apiUrl = core.getInput('api-url', { required: false }) || 'https://api.mobile.dev'
  const name = core.getInput('name', { required: false }) || getInferredName()
  const apiKey = core.getInput('api-key', { required: true })
  const appFilePath = core.getInput('app-file', { required: true })
  const mappingFileInput = core.getInput('mapping-file', { required: false })
  const workspaceFolder = core.getInput('workspace', { required: false })
  const mappingFile = mappingFileInput && validateMappingFile(mappingFileInput)
  const async = core.getInput('async', { required: false }) === 'true'
  const androidApiLevelString = core.getInput('android-api-level', { required: false })
  const iOSVersionString = core.getInput('ios-version', { required: false })
  const includeTags = parseTags(core.getInput('include-tags', { required: false }))
  const excludeTags = parseTags(core.getInput('exclude-tags', { required: false }))

  var env: { [key: string]: string } = {}
  env = core.getMultilineInput('env', { required: false })
    .map(it => {
      const parts = it.split('=')

      if (parts.length < 2) {
        throw new Error(`Invalid env parameter: ${it}`)
      }

      return { key: parts[0], value: parts.slice(1).join('=') }
    })
    .reduce((map, entry) => {
      map[entry.key] = entry.value
      return map
    }, env)

  const branchName = getBranchName()
  const commitSha = getCommitSha()
  const repoOwner = getRepoOwner()
  const repoName = getRepoName()
  const pullRequestId = getPullRequestId()
  const androidApiLevel = getAndroidApiLevel(androidApiLevelString)
  const iOSVersion = getIOSVersion(iOSVersionString)
  
  return { 
    apiUrl, 
    name, 
    apiKey, 
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
    excludeTags 
  }
}