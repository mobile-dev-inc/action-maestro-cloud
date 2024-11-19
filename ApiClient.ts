import fetch, { fileFromSync, FormData } from 'node-fetch'

export enum FlowStatus {
  PENDING = 'PENDING',
  PREPARING = 'PREPARING',
  INSTALLING = 'INSTALLING',
  RUNNING = 'RUNNING',
  SUCCESS = 'SUCCESS',
  ERROR = 'ERROR',
  CANCELED = 'CANCELED',
  WARNING = 'WARNING',
  STOPPED = 'STOPPED'
}

export enum UploadStatus {
  PENDING = 'PENDING',
  RUNNING = 'RUNNING',
  SUCCESS = 'SUCCESS',
  ERROR = 'ERROR',
  CANCELED = 'CANCELED',
  WARNING = 'WARNING',
  STOPPED = 'STOPPED'
}

export type CloudUploadRequest = {
  benchmarkName?: string
  repoOwner?: string
  repoName?: string
  pullRequestId?: string
  branch?: string
  commitSha?: string
  env?: { [key: string]: string }
  agent: string
  androidApiLevel?: number
  iOSVersion?: number
  includeTags: string[]
  excludeTags: string[]
  appBinaryId?: string
  deviceLocale?: string
}

export type RobinUploadRequest = {
  benchmarkName?: string
  projectId: string
  repoOwner?: string
  repoName?: string
  pullRequestId?: string
  branch?: string
  commitSha?: string
  env?: { [key: string]: string }
  agent: string
  androidApiLevel?: number
  iOSVersion?: number
  includeTags: string[]
  excludeTags: string[]
  appBinaryId?: string
  deviceLocale?: string
}

// irrelevant data has been factored out from this model
export type UploadResponse = {
  uploadId: string
  teamId: string
  targetId: string
  appBinaryId: string
}

export type RobinUploadResponse = {
  uploadId: string
  orgId: string
  appId: string
  appBinaryId: string
}

export class UploadStatusError {
  constructor(public status: number, public text: string) {}
}

export enum CancellationReason {
  BENCHMARK_DEPENDENCY_FAILED = 'BENCHMARK_DEPENDENCY_FAILED',
  INFRA_ERROR = 'INFRA_ERROR',
  OVERLAPPING_BENCHMARK = 'OVERLAPPING_BENCHMARK',
  TIMEOUT = 'TIMEOUT'
}

export type Flow = {
  name: string
  status: FlowStatus
  errors?: string[]
  cancellationReason?: CancellationReason
}

export type UploadStatusResponse = {
  uploadId: string
  status: UploadStatus
  completed: boolean
  flows: Flow[]
}

export default class ApiClient {
  constructor(
    private apiKey: string,
    private apiUrl: string,
    private projectId?: string
  ) {}

  async cloudUploadRequest(
    request: CloudUploadRequest,
    appFile: string | null,
    workspaceZip: string | null,
    mappingFile: string | null
  ): Promise<UploadResponse> {
    const formData = new FormData()
    if (appFile) {
      formData.set('app_binary', fileFromSync(appFile))
    }
    if (workspaceZip) {
      formData.set('workspace', fileFromSync(workspaceZip))
    }
    if (mappingFile) {
      formData.set('mapping', fileFromSync(mappingFile))
    }
    formData.set('request', JSON.stringify(request))
    const res = await fetch(`${this.apiUrl}/v2/upload`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`
      },
      body: formData
    })
    if (!res.ok) {
      const body = await res.text()
      throw new Error(`Request to ${res.url} failed (${res.status}): ${body}`)
    }
    return (await res.json()) as UploadResponse
  }

  async robinUploadRequest(
    request: RobinUploadRequest,
    appFile: string | null,
    workspaceZip: string | null,
    mappingFile: string | null
  ): Promise<RobinUploadResponse> {
    const formData = new FormData()

    if (appFile) {
      formData.set('app_binary', fileFromSync(appFile))
    }
    if (workspaceZip) {
      formData.set('workspace', fileFromSync(workspaceZip))
    }
    if (mappingFile) {
      formData.set('mapping', fileFromSync(mappingFile))
    }
    formData.set('request', JSON.stringify(request))

    const res = await fetch(`${this.apiUrl}/runMaestroTest`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`
      },
      body: formData
    })
    if (!res.ok) {
      const body = await res.text()
      throw new Error(`Request to ${res.url} failed (${res.status}): ${body}`)
    }
    return (await res.json()) as RobinUploadResponse
  }

  async getUploadStatus(uploadId: string): Promise<UploadStatusResponse> {
    // If Project Id exist - Hit robin
    if (!!this.projectId) {
      const res = await fetch(`${this.apiUrl}/upload/${uploadId}`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${this.apiKey}`
        }
      })
      if (!res.ok) {
        const body = await res.text()
        throw new Error(`Request to ${res.url} failed (${res.status}): ${body}`)
      }

      if (res.status >= 400) {
        const text = await res.text()
        Promise.reject(new UploadStatusError(res.status, text))
      }

      return (await res.json()) as UploadStatusResponse
    }
    // Else if no project id - Hit Cloud
    else {
      const res = await fetch(
        `${this.apiUrl}/v2/upload/${uploadId}/status?includeErrors=true`,
        {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${this.apiKey}`
          }
        }
      )
      if (!res.ok) {
        const body = await res.text()
        throw new Error(`Request to ${res.url} failed (${res.status}): ${body}`)
      }

      if (res.status >= 400) {
        const text = await res.text()
        Promise.reject(new UploadStatusError(res.status, text))
      }

      return (await res.json()) as UploadStatusResponse
    }
  }
}
