import * as core from '@actions/core'
import * as github from '@actions/github'
import * as glob from '@actions/glob'
import { PushEvent } from '@octokit/webhooks-definitions/schema'

// Resolve a path that may contain glob patterns (e.g. app/build/**/*.apk).
// Maintains the action's historical behavior: first match wins, multiple
// matches emit a warning. Throws if the pattern resolves to zero files —
// failing in prelude with a clear message beats letting the CLI bail later.
export async function resolveFileGlob(
  pattern: string,
  inputName: string
): Promise<string> {
  const globber = await glob.create(pattern)
  const matches = await globber.glob()
  if (matches.length === 0) {
    throw new Error(`'${inputName}' matched no files: ${pattern}`)
  }
  if (matches.length > 1) {
    core.warning(
      `'${inputName}' pattern matched ${matches.length} files; using ${matches[0]}`
    )
  }
  return matches[0]
}

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

function validateAppInputs(
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

function parseEnv(lines: string[]): string {
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
    // 1. Required primitives + api-url
    core.exportVariable('MDEV_API_KEY', core.getInput('api-key'))
    core.exportVariable('MDEV_PROJECT_ID', core.getInput('project-id'))
    const apiUrl = core.getInput('api-url')
    if (apiUrl) core.exportVariable('MDEV_API_URL', apiUrl)

    // 2. Branch + name
    const branchInput = core.getInput('branch') || undefined
    const branch = getBranchName(branchInput)
    core.exportVariable('MDEV_BRANCH', branch)

    const nameInput = core.getInput('name')
    const name = nameInput || getInferredName()
    core.exportVariable('MDEV_NAME', name)

    // 3. App + device inputs + validation
    const appFile = core.getInput('app-file')
    const appBinaryId = core.getInput('app-binary-id')
    const deviceOs = core.getInput('device-os')
    const deviceLocale = core.getInput('device-locale')
    const deviceModel = core.getInput('device-model')
    validateAppInputs(appFile, appBinaryId, deviceOs)

    // 4. Env multiline
    const envLines = core.getMultilineInput('env')
    const envSerialized = parseEnv(envLines)
    core.exportVariable('MDEV_ENV', envSerialized)

    // 5. Tag passthrough
    core.exportVariable('MDEV_INCLUDE_TAGS', core.getInput('include-tags'))
    core.exportVariable('MDEV_EXCLUDE_TAGS', core.getInput('exclude-tags'))

    // 6. Deprecated inputs (warnings come from action.yml deprecationMessage)
    const androidApiLevel = core.getInput('android-api-level')
    if (androidApiLevel) {
      core.exportVariable('MDEV_ANDROID_API_LEVEL', androidApiLevel)
    }
    const iosVersion = core.getInput('ios-version')
    if (iosVersion) {
      core.exportVariable('MDEV_IOS_VERSION', iosVersion)
    }

    // 7. Files (with glob expansion to preserve action's historical contract;
    // the Maestro CLI itself does not expand globs in --app-file / --mapping)
    if (appFile) {
      const resolvedAppFile = await resolveFileGlob(appFile, 'app-file')
      core.exportVariable('MDEV_APP_FILE', resolvedAppFile)
    }
    if (appBinaryId) core.exportVariable('MDEV_APP_BINARY_ID', appBinaryId)
    const mappingFile = core.getInput('mapping-file')
    if (mappingFile) {
      const resolvedMappingFile = await resolveFileGlob(mappingFile, 'mapping-file')
      core.exportVariable('MDEV_MAPPING_FILE', resolvedMappingFile)
    }

    // 8. Device knobs (inputs already read in section 3)
    if (deviceOs) core.exportVariable('MDEV_DEVICE_OS', deviceOs)
    if (deviceLocale) core.exportVariable('MDEV_DEVICE_LOCALE', deviceLocale)
    if (deviceModel) core.exportVariable('MDEV_DEVICE_MODEL', deviceModel)

    // 9. Async + timeout + workspace
    const async = core.getInput('async')
    if (async === 'true') core.exportVariable('MDEV_ASYNC', 'true')
    const timeout = core.getInput('timeout')
    if (timeout) core.exportVariable('MDEV_TIMEOUT', timeout)
    const workspace = core.getInput('workspace')
    if (workspace) core.exportVariable('MDEV_WORKSPACE', workspace)

    // 10. GitHub context metadata
    const ctx = github.context
    core.exportVariable('MDEV_REPO_OWNER', ctx.repo.owner)
    core.exportVariable('MDEV_REPO_NAME', ctx.repo.repo)
    const pr = ctx.payload.pull_request as any
    if (pr?.number !== undefined) {
      core.exportVariable('MDEV_PR_ID', String(pr.number))
    }
    if (pr?.head?.sha) {
      core.exportVariable('MDEV_COMMIT_SHA', String(pr.head.sha))
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
