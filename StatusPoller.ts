import * as core from '@actions/core'
import ApiClient, { RunStatus, UploadStatus, CancellationReason, Flow, UploadStatusError } from './ApiClient'
import { canceled, err, info, success, warning } from './log'

const WAIT_TIMEOUT_MS = 1000 * 60 * 30 // 30 minutes
const INTERVAL_MS = 10000 // 10 seconds
const TERMINAL_STATUSES = new Set([RunStatus.SUCCESS, RunStatus.ERROR, RunStatus.STOPPED])

const isCompleted = (flow: Flow): boolean => TERMINAL_STATUSES.has(flow.status)

const renderError = (errors?: string[]): string => {
  if (!errors || errors.length === 0) return ''

  return ` (${errors[0]})`
}

const printFlowResult = (flow: Flow): void => {
  if (flow.status === RunStatus.SUCCESS) {
    success(`[Passed] ${flow.name}`)
  } else if (flow.status === RunStatus.ERROR) {
    err(`[Failed] ${flow.name}${renderError(flow.errors)}`)
  } else if (flow.status === RunStatus.STOPPED) {
    warning(`[Stopped] ${flow.name}`)
  }
}

const flowWord = (count: number): string => (count === 1 ? 'Flow' : 'Flows')

const getFailedFlowsCountStr = (flows: Flow[]): string => {
  const failedFlows = flows.filter((flow) => flow.status === RunStatus.ERROR)
  return `${failedFlows.length}/${flows.length} ${flowWord(flows.length)} Failed`
}

const printUploadResult = (status: UploadStatus, flows: Flow[]) => {
  if (status === UploadStatus.ERROR) {
    err(getFailedFlowsCountStr(flows))
  } else {
    const passedFlows = flows.filter((flow) => flow.status === RunStatus.SUCCESS)
    const stoppedFlows = flows.filter((flow) => flow.status === RunStatus.STOPPED)
    const failedFlows = flows.filter((flow) => flow.status === RunStatus.ERROR)

    success(`${passedFlows.length}/${flows.length} ${flowWord(flows.length)} Passed`)
    if (failedFlows.length > 0) {
      err(`${failedFlows.length}/${flows.length} ${flowWord(flows.length)} Failed`)
    }
    if (stoppedFlows.length > 0) {
      canceled(`${stoppedFlows.length}/${flows.length} ${flowWord(flows.length)} Stopped`)
    }
  }
}

export default class StatusPoller {
  timeout: NodeJS.Timeout | undefined
  completedFlows: { [flowName: string]: string } = {}
  stopped: Boolean = false

  constructor(private client: ApiClient, private uploadId: string, private consoleUrl: string) {}

  markFailed(msg: string) {
    core.setFailed(msg)
  }

  onError(errMsg: string, error?: any) {
    let msg = `${errMsg}`
    if (!!error) msg += ` - received error ${error}`
    msg += `. View the Upload in the console for more information: ${this.consoleUrl}`
    this.markFailed(msg)
  }

  async poll(sleep: number, prevErrorCount: number = 0) {
    if (this.stopped) {
      return
    }

    try {
      const { completed, status, flows } = await this.client.getUploadStatus(this.uploadId)
      for (const flow of flows.filter(isCompleted)) {
        if (!this.completedFlows[flow.name]) {
          printFlowResult(flow)
          this.completedFlows[flow.name] = flow.status
        }
      }

      if (completed) {
        this.teardown()

        console.log('')
        printUploadResult(status, flows)
        console.log('')
        info(`==== View details in the console ====\n`)
        info(`${this.consoleUrl}`)

        core.setOutput('MAESTRO_CLOUD_UPLOAD_STATUS', status)
        core.setOutput('MAESTRO_CLOUD_FLOW_RESULTS', flows)

        if (status === UploadStatus.ERROR) {
          const resultStr = getFailedFlowsCountStr(flows)
          console.log('')
          this.markFailed(resultStr)
        }
      } else {
        setTimeout(() => this.poll(sleep), sleep)
      }
    } catch (error) {
      if (error instanceof UploadStatusError) {
        if (error.status === 429) {
          // back off through extending sleep duration with 25%
          const newSleep = sleep * 1.25
          setTimeout(() => this.poll(newSleep, prevErrorCount), newSleep)
        } else if (error.status >= 500) {
          if (prevErrorCount < 3) {
            setTimeout(() => this.poll(sleep, prevErrorCount++), sleep)
          } else {
            this.onError(`Request to get status information failed with status code ${error.status}: ${error.text}`)
          }
        } else {
          this.onError('Could not get Upload status', error)
        }
      } else {
        this.onError('Could not get Upload status', error)
      }
    }
  }

  registerTimeout(timeoutInMinutes?: number) {
    this.timeout = setTimeout(
      () => {
        warning(
          `Timed out waiting for Upload to complete. View the Upload in the console for more information: ${this.consoleUrl}`
        )
        this.stopped = true
      },
      timeoutInMinutes ? timeoutInMinutes * 60 * 1000 : WAIT_TIMEOUT_MS
    )
  }

  teardown() {
    this.timeout && clearTimeout(this.timeout)
  }

  startPolling(timeout?: number) {
    try {
      this.poll(INTERVAL_MS)
      info('Waiting for analyses to complete...\n')
    } catch (err) {
      this.markFailed(err instanceof Error ? err.message : `${err} `)
    }

    this.registerTimeout(timeout)
  }
}
