import * as core from '@actions/core'
import * as github from '@actions/github'
import { PushEvent } from '@octokit/webhooks-definitions/schema'

export function getBranchName(branchInput?: string): string {
  if (branchInput && branchInput.trim() !== '') {
    return branchInput.trim()
  }
  const pullRequest = github.context.payload.pull_request
  if (pullRequest) {
    const branchName = pullRequest?.head?.ref
    if (!branchName) {
      throw new Error(
        `Unable find pull request ref: ${JSON.stringify(pullRequest, undefined, 2)}`
      )
    }
    return branchName
  }
  const regex = /refs\/(heads|tags)\/(.*)/
  const ref = github.context.ref
  const result = regex.exec(ref)
  if (!result || result.length < 3) {
    throw new Error(`Failed to parse GitHub ref: ${ref}`)
  }
  return result[2]
}

export function getInferredName(): string {
  const ctx = github.context
  const prTitle = ctx.payload.pull_request?.title
  if (prTitle) return String(prTitle)
  if (ctx.eventName === 'push') {
    const pushPayload = ctx.payload as PushEvent
    const commitMessage = pushPayload.head_commit?.message
    if (commitMessage) return commitMessage
  }
  return ctx.sha
}

export function validateAppInputs(
  appFile: string,
  appBinaryId: string,
  deviceOs: string
): void {
  const hasAppFile = appFile !== ''
  const hasAppBinaryId = appBinaryId !== ''
  if (deviceOs === 'web' && (hasAppFile || hasAppBinaryId)) {
    throw new Error('For web tests, neither app-file nor app-binary-id should be provided')
  }
  if (deviceOs !== 'web' && hasAppFile === hasAppBinaryId) {
    throw new Error('Either app-file or app-binary-id must be used (but not both) for mobile tests')
  }
}

export function parseEnv(lines: string[]): string {
  const validated = lines.map((line) => {
    const parts = line.split('=')
    if (parts.length < 2) {
      throw new Error(`Invalid env parameter: ${line}`)
    }
    return line
  })
  return validated.join('\n')
}

export async function main(): Promise<void> {
  try {
    const branchInput = core.getInput('branch') || undefined
    const branch = getBranchName(branchInput)
    core.exportVariable('MDEV_BRANCH', branch)
    const nameInput = core.getInput('name')
    const name = nameInput || getInferredName()
    core.exportVariable('MDEV_NAME', name)
    const appFile = core.getInput('app-file')
    const appBinaryId = core.getInput('app-binary-id')
    const deviceOs = core.getInput('device-os')
    validateAppInputs(appFile, appBinaryId, deviceOs)
    const envLines = core.getMultilineInput('env')
    const envSerialized = parseEnv(envLines)
    core.exportVariable('MDEV_ENV', envSerialized)
    core.exportVariable('MDEV_INCLUDE_TAGS', core.getInput('include-tags'))
    core.exportVariable('MDEV_EXCLUDE_TAGS', core.getInput('exclude-tags'))
    const androidApiLevel = core.getInput('android-api-level')
    if (androidApiLevel) {
      core.warning(
        "'android-api-level' is deprecated and will be removed in a future release. " +
          "Use 'device-os' instead (e.g. device-os: android-33)."
      )
      core.exportVariable('MDEV_ANDROID_API_LEVEL', androidApiLevel)
    }
    const iosVersion = core.getInput('ios-version')
    if (iosVersion) {
      core.warning(
        "'ios-version' is deprecated and will be removed in a future release. " +
          "Use 'device-os' instead (e.g. device-os: iOS-18-2)."
      )
      core.exportVariable('MDEV_IOS_VERSION', iosVersion)
    }
  } catch (e: any) {
    core.setFailed(e.message)
  }
}

if (require.main === module) {
  main().catch((e) => {
    core.setFailed(`Maestro Cloud Action prelude failed: ${e.message}`)
  })
}
