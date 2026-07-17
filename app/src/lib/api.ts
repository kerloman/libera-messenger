// Thin fetch wrapper for the Libera REST API. Throws Error with the server's
// human-readable message on failure.
export class ApiError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const isForm = body instanceof FormData
  const res = await fetch('/api' + path, {
    method,
    credentials: 'include',
    headers: isForm || body === undefined ? {} : { 'content-type': 'application/json' },
    body: isForm ? body : body === undefined ? undefined : JSON.stringify(body),
  })
  let json: { error?: string } & T
  try {
    json = await res.json()
  } catch {
    throw new ApiError('Server unavailable. Is the backend running?', res.status)
  }
  if (!res.ok) throw new ApiError(json?.error ?? `Request failed (${res.status})`, res.status)
  return json
}

export const api = {
  get: <T>(p: string) => request<T>('GET', p),
  post: <T>(p: string, b?: unknown) => request<T>('POST', p, b),
  patch: <T>(p: string, b?: unknown) => request<T>('PATCH', p, b),
  del: <T>(p: string) => request<T>('DELETE', p),
}
