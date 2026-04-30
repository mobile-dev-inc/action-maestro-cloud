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

export async function main(): Promise<void> {
  try {
    const branchInput = core.getInput('branch') || undefined
    const branch = getBranchName(branchInput)
    core.exportVariable('MDEV_BRANCH', branch)
    const nameInput = core.getInput('name')
    const name = nameInput || getInferredName()
    core.exportVariable('MDEV_NAME', name)
  } catch (e: any) {
    core.setFailed(e.message)
  }
}

if (require.main === module) {
  main().catch((e) => {
    core.setFailed(`Maestro Cloud Action prelude failed: ${e.message}`)
  })
}
