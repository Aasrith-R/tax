export type VatDirection = 'input' | 'output'

export interface Operation {
  id: string
  date: string // ISO string
  amount: number
  vat_rate: number
  vat_amount: number
  counterparty: string
  source: string
  direction: VatDirection
  errors?: string[]
  company?: string // Наша компания (ООО)
  payment_name?: string // Наименование платежа
  additional_info?: Record<string, any> // Дополнительная информация для tooltip
}

export interface VatTotals {
  input_vat: number
  output_vat: number
  net_vat: number
}

export interface VatPayload {
  operations: Operation[]
  totals: VatTotals
  generated_at: string
}
