import fetch, { FetchError, fileFromSync, FormData } from 'node-fetch';

export enum BenchmarkStatus {
  PENDING = 'PENDING',
  RUNNING = 'RUNNING',
  SUCCESS = 'SUCCESS',
  ERROR = 'ERROR',
  CANCELED = 'CANCELED',
  WARNING = 'WARNING',
}

export type UploadRequest = {
  benchmarkName?: string
  repoOwner?: string
  repoName?: string
  pullRequestId?: string
  branch?: string,
  commitSha?: string,
  env?: { [key: string]: string },
  agent: string,
  androidApiLevel?: number,
}

// irrelevant data has been factored out from this model
export type UploadResponse = {
  uploadId: string,
  teamId: string,
  targetId: string
}

export class UploadStatusError {
  constructor(public status: number, public text: string) { }
}

export type Flow = {
  name: string,
  status: BenchmarkStatus
}

export type UploadStatusResponse = {
  uploadId: string,
  status: BenchmarkStatus,
  completed: boolean,
  flows: Flow[]
}

export default class ApiClient {

  constructor(
    private apiKey: string,
    private apiUrl: string
  ) { }

  async uploadRequest(
    request: UploadRequest,
    appFile: string,
    workspaceZip: string | null,
    mappingFile: string | null,
  ): Promise<UploadResponse> {
    const formData = new FormData()

    formData.set('request', JSON.stringify(request))
    formData.set(
      'app_binary',
      fileFromSync(appFile)
    )

    if (workspaceZip) {
      formData.set(
        'workspace',
        fileFromSync(workspaceZip)
      );
    }

    if (mappingFile) {
      formData.set(
        'mapping',
        fileFromSync(mappingFile)
      )
    }

    const res = await fetch(`${this.apiUrl}/v2/upload`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: formData
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Request to ${res.url} failed (${res.status}): ${body}`);
    }
    return await res.json() as UploadResponse;
  }

  async getUploadStatus(
    uploadId: string,
  ): Promise<UploadStatusResponse> {
    const res = await fetch(`${this.apiUrl}/v2/upload/${uploadId}/status`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
      },
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Request to ${res.url} failed (${res.status}): ${body}`);
    }

    if (res.status >= 400) {
      const text = await res.text();
      Promise.reject(new UploadStatusError(res.status, text));
    }

    return await res.json() as UploadStatusResponse;
  }
}
