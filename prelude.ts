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

// Always export every MDEV_* variable, falling back to empty string when the
// input is absent. core.exportVariable writes to $GITHUB_ENV, which persists
// across all subsequent steps in the same job — without this overwrite, a
// previous step's value (e.g. MDEV_APP_BINARY_ID from an earlier upload)
// would leak into a later step that doesn't re-set it. Empty strings are
// treated by run-cloud.sh's `${VAR:+--flag "$VAR"}` pattern as "skip the
// flag", so empty exports are equivalent to "not set" for the CLI.
function exportMdev(key: string, value: string | undefined | null): void {
  core.exportVariable(key, value || '')
}

export async function main(): Promise<void> {
  try {
    // 1. Required primitives + api-url
    exportMdev('MDEV_API_KEY', core.getInput('api-key'))
    exportMdev('MDEV_PROJECT_ID', core.getInput('project-id'))
    exportMdev('MDEV_API_URL', core.getInput('api-url'))

    // 2. Branch + name
    const branchInput = core.getInput('branch') || undefined
    exportMdev('MDEV_BRANCH', getBranchName(branchInput))

    const nameInput = core.getInput('name')
    exportMdev('MDEV_NAME', nameInput || getInferredName())

    // 3. App + device inputs + validation
    const appFile = core.getInput('app-file')
    const appBinaryId = core.getInput('app-binary-id')
    const deviceOs = core.getInput('device-os')
    const deviceLocale = core.getInput('device-locale')
    const deviceModel = core.getInput('device-model')
    validateAppInputs(appFile, appBinaryId, deviceOs)

    // 4. Env multiline
    const envLines = core.getMultilineInput('env')
    exportMdev('MDEV_ENV', parseEnv(envLines))

    // 5. Tag passthrough
    exportMdev('MDEV_INCLUDE_TAGS', core.getInput('include-tags'))
    exportMdev('MDEV_EXCLUDE_TAGS', core.getInput('exclude-tags'))

    // 6. Deprecated inputs (warnings come from action.yml deprecationMessage)
    exportMdev('MDEV_ANDROID_API_LEVEL', core.getInput('android-api-level'))
    exportMdev('MDEV_IOS_VERSION', core.getInput('ios-version'))

    // 7. Files (with glob expansion to preserve action's historical contract;
    // the Maestro CLI itself does not expand globs in --app-file / --mapping)
    exportMdev(
      'MDEV_APP_FILE',
      appFile ? await resolveFileGlob(appFile, 'app-file') : ''
    )
    exportMdev('MDEV_APP_BINARY_ID', appBinaryId)
    const mappingFile = core.getInput('mapping-file')
    exportMdev(
      'MDEV_MAPPING_FILE',
      mappingFile ? await resolveFileGlob(mappingFile, 'mapping-file') : ''
    )

    // 8. Device knobs (inputs already read in section 3)
    exportMdev('MDEV_DEVICE_OS', deviceOs)
    exportMdev('MDEV_DEVICE_LOCALE', deviceLocale)
    exportMdev('MDEV_DEVICE_MODEL', deviceModel)

    // 9. Async + timeout + workspace
    const async = core.getInput('async')
    exportMdev('MDEV_ASYNC', async === 'true' ? 'true' : '')
    exportMdev('MDEV_TIMEOUT', core.getInput('timeout'))
    exportMdev('MDEV_WORKSPACE', core.getInput('workspace'))

    // 10. GitHub context metadata
    const ctx = github.context
    exportMdev('MDEV_REPO_OWNER', ctx.repo.owner)
    exportMdev('MDEV_REPO_NAME', ctx.repo.repo)
    const pr = ctx.payload.pull_request as any
    exportMdev('MDEV_PR_ID', pr?.number !== undefined ? String(pr.number) : '')
    exportMdev('MDEV_COMMIT_SHA', pr?.head?.sha ? String(pr.head.sha) : '')
  } catch (e: any) {
    core.setFailed(e.message)
  }
}

if (require.main === module) {
  main().catch((e) => {
    core.setFailed(`Maestro Cloud Action prelude failed: ${e.message}`)
  })
}
