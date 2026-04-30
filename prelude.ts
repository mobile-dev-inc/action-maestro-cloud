// prelude.ts
import * as core from '@actions/core'
import * as github from '@actions/github'

export async function main(): Promise<void> {
  // Filled in by later tasks.
}

if (require.main === module) {
  main().catch((e) => {
    core.setFailed(`Maestro Cloud Action prelude failed: ${e.message}`)
  })
}
