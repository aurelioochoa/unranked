export class WorkerClient {
  closed = false
  private worker: Worker
  private pending = new Map<string, { resolve: (value: unknown) => void; reject: (error: Error) => void; progress?: (progress: number, label: string) => void }>()
  constructor(worker: Worker) {
    this.worker = worker
    worker.onmessage = ({ data }) => {
      const job = this.pending.get(data.id); if (!job) return
      if ('progress' in data) { job.progress?.(data.progress, data.label); return }
      this.pending.delete(data.id)
      if (data.error) job.reject(new Error(data.error)); else job.resolve(data.value)
    }
    worker.onerror = event => { this.dispose(new Error(event.message || 'Speech worker failed. Retry the model download.')) }
  }
  request<T>(type: string, payload: Record<string, unknown> = {}, progress?: (value: number, label: string) => void): Promise<T> {
    if (this.closed) return Promise.reject(new Error('Speech worker stopped; reload the models and retry.'))
    const id = crypto.randomUUID()
    return new Promise((resolve, reject) => { this.pending.set(id, { resolve: value => resolve(value as T), reject, progress }); this.worker.postMessage({ id, type, ...payload }) })
  }
  dispose(error = new Error('Speech operation cancelled')) { this.closed = true; this.worker.terminate(); for (const job of this.pending.values()) job.reject(error); this.pending.clear() }
}
