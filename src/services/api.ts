import type { Operation as FrontendOperation } from '../types/operation'

// Auto-detect API URL based on environment
const getApiBaseUrl = () => {
  // In production, use relative URL (same domain)
  if (import.meta.env.PROD) {
    return '/api'
  }
  // In development, use environment variable or default
  return import.meta.env.VITE_API_URL || 'http://127.0.0.1:8080/api'
}

const API_BASE_URL = getApiBaseUrl()

export interface User {
  id: string
  email: string
  name: string | null
  createdAt: string
}

export interface AuthResponse {
  user: User
  token: string
}

export interface Report {
  id: string
  userId: string
  title: string
  status: 'READY' | 'REQUIRES_REVIEW'
  totals: {
    input_vat: number
    output_vat: number
    net_vat: number
  }
  createdAt: string
  updatedAt: string
  operations?: Operation[]
  _count?: {
    operations: number
  }
}

export interface Operation {
  id: string
  reportId: string
  date: string
  amount: number
  vatRate: number
  vatAmount: number
  counterparty: string
  source: string
  direction: 'input' | 'output'
  errors?: string[] | null
}

// Token management
export function getToken(): string | null {
  return localStorage.getItem('auth_token')
}

export function setToken(token: string): void {
  localStorage.setItem('auth_token', token)
}

export function removeToken(): void {
  localStorage.removeItem('auth_token')
}

// API request helper
async function apiRequest<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const token = getToken()
  const headers = new Headers(options.headers)
  headers.set('Content-Type', 'application/json')

  if (token) {
    headers.set('Authorization', `Bearer ${token}`)
  }

  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    ...options,
    headers,
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Ошибка сервера' }))
    throw new Error(error.error || `HTTP ${response.status}`)
  }

  return response.json()
}

// Auth API
export const authApi = {
  async register(email: string, password: string, name?: string): Promise<AuthResponse> {
    return apiRequest<AuthResponse>('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email, password, name }),
    })
  },

  async login(email: string, password: string): Promise<AuthResponse> {
    return apiRequest<AuthResponse>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    })
  },

  async getCurrentUser(): Promise<{ user: User }> {
    return apiRequest<{ user: User }>('/auth/me')
  },
}

// Reports API
export const reportsApi = {
  async getAll(): Promise<{ reports: Report[] }> {
    return apiRequest<{ reports: Report[] }>('/reports')
  },

  async getById(id: string): Promise<{ report: Report }> {
    return apiRequest<{ report: Report }>(`/reports/${id}`)
  },

  async create(
    title: string,
    operations: FrontendOperation[],
    totals: { input_vat: number; output_vat: number; net_vat: number }
  ): Promise<{ report: Report }> {
    return apiRequest<{ report: Report }>('/reports', {
      method: 'POST',
      body: JSON.stringify({
        title,
        operations: operations.map(op => ({
          date: op.date,
          amount: op.amount,
          vatRate: op.vat_rate,
          vatAmount: op.vat_amount,
          counterparty: op.counterparty,
          source: op.source,
          direction: op.direction,
          errors: op.errors,
        })),
        totals,
      }),
    })
  },

  async updateStatus(id: string, status: 'READY' | 'REQUIRES_REVIEW'): Promise<{ report: Report }> {
    return apiRequest<{ report: Report }>(`/reports/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    })
  },

  async delete(id: string): Promise<{ message: string }> {
    return apiRequest<{ message: string }>(`/reports/${id}`, {
      method: 'DELETE',
    })
  },
}

