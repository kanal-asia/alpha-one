export type ProviderHealthState = 'unknown' | 'ok' | 'failed'

export interface ProviderConfigState {
  id: string
  name: string
  description: string
  enabled: boolean
  apiKeySet: boolean
  apiKeyMasked: string | null
  health: ProviderHealthState
  lastHealthCheck: string | null
  lastError: string | null
  modelCount: number | null
}

interface ProvidersResponse {
  providers: ProviderConfigState[]
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`/api/providers${path}`, {
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options,
  })
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: string }
    throw new Error(err.error ?? `HTTP ${res.status}`)
  }
  return res.json() as Promise<T>
}

export async function listProviders(): Promise<ProviderConfigState[]> {
  const data = await request<ProvidersResponse>('')
  return data.providers
}

export async function saveProviderKey(id: string, apiKey: string): Promise<ProviderConfigState[]> {
  const data = await request<ProvidersResponse>(`/${id}/key`, {
    method: 'POST',
    body: JSON.stringify({ apiKey }),
  })
  return data.providers
}

export async function deleteProviderKey(id: string): Promise<ProviderConfigState[]> {
  const data = await request<ProvidersResponse>(`/${id}/key`, { method: 'DELETE' })
  return data.providers
}

export async function validateProvider(id: string): Promise<{
  ok: boolean
  message: string
  latencyMs: number
  modelCount: number
  providers: ProviderConfigState[]
}> {
  return request(`/${id}/validate`, { method: 'POST' })
}

export async function toggleProvider(
  id: string,
  enabled: boolean
): Promise<ProviderConfigState[]> {
  const data = await request<ProvidersResponse>(`/${id}/toggle`, {
    method: 'POST',
    body: JSON.stringify({ enabled }),
  })
  return data.providers
}
