import type { Operation, VatTotals, VatDirection } from '../types/operation'

export function normalizeVatRate(raw: unknown): number {
  const n = Number(raw)
  if (!Number.isFinite(n) || n < 0) return 0
  // If user provided 10 or 20, treat it as percentage
  if (n > 1) return n / 100
  return n
}

export function detectDirection(amount: number): VatDirection {
  // Positive amounts typically represent sales/revenue (output VAT)
  // Negative amounts typically represent purchases/expenses (input VAT)
  if (amount < 0) return 'input'
  if (amount > 0) return 'output'
  
  // For zero amounts, default to output but this should be caught by validation
  return 'output'
}

export function computeVatAmount(amount: number, vatRate: number, existing?: unknown): number {
  const fromFile = Number(existing)
  if (Number.isFinite(fromFile) && fromFile !== 0) {
    return Math.abs(fromFile) // Ensure VAT amount is always positive
  }

  // Calculate VAT based on GROSS amount (bank statements usually contain gross sums)
  if (!Number.isFinite(amount) || vatRate <= 0) {
    return 0
  }

  // VAT = Gross * (rate / (1 + rate))
  const calculatedVat = Math.abs(amount * (vatRate / (1 + vatRate)))

  // Handle rounding to 2 decimal places (kopecks)
  return Math.round(calculatedVat * 100) / 100
}

export function validateOperation(op: Operation): string[] {
  const errors: string[] = []

  // Date validation
  if (!op.date || Number.isNaN(Date.parse(op.date))) {
    errors.push('Некорректная или пустая дата')
  } else {
    const date = new Date(op.date)
    const now = new Date()
    if (date > now) {
      errors.push('Дата не может быть в будущем')
    }
    if (date.getFullYear() < 2000) {
      errors.push('Дата слишком старая (до 2000 года)')
    }
  }

  // Amount validation
  if (!Number.isFinite(op.amount)) {
    errors.push('Сумма не является числом')
  } else if (op.amount === 0) {
    errors.push('Сумма не может быть нулевой')
  } else if (Math.abs(op.amount) > 1000000000) { // 1 billion
    errors.push('Сумма выглядит нереалистично большой')
  }

  // VAT rate validation
  if (!Number.isFinite(op.vat_rate) || op.vat_rate < 0 || op.vat_rate > 1) {
    errors.push('Ставка НДС должна быть в диапазоне от 0 до 100%')
  } else {
    // Check for common VAT rates
    const commonRates = [0, 0.1, 0.2] // 0%, 10%, 20%
    if (!commonRates.includes(op.vat_rate) && op.vat_rate !== 0) {
      // Don't treat uncommon VAT rates as errors for bank statements
      // errors.push('Нестандартная ставка НДС (обычно 0%, 10% или 20%)')
    }
  }

  // VAT amount validation
  if (!Number.isFinite(op.vat_amount)) {
    errors.push('Сумма НДС не является числом')
  } else if (op.vat_amount < 0) {
    errors.push('Сумма НДС не может быть отрицательной')
  }

  // Counterparty validation
  if (!op.counterparty) {
    errors.push('Контрагент не указан')
  } else if (op.counterparty.length < 2) {
    errors.push('Наименование контрагента слишком короткое')
  } else if (op.counterparty.length > 200) {
    errors.push('Наименование контрагента слишком длинное')
  } else if (/^\d+$/.test(op.counterparty)) {
    errors.push('Наименование контрагента не может состоять только из цифр')
  }

  return errors
}

export function calculateTotals(operations: Operation[]): VatTotals {
  const validOperations = operations.filter(op => !op.errors || op.errors.length === 0)
  const invalidOperations = operations.filter(op => op.errors && op.errors.length > 0)
  
  // Debug logging
  console.log('Total operations:', operations.length)
  console.log('Valid operations:', validOperations.length)
  console.log('Invalid operations:', invalidOperations.length)
  
  if (invalidOperations.length > 0) {
    console.log('Sample errors:', invalidOperations.slice(0, 3).map(op => ({ id: op.id, errors: op.errors })))
  }
  
  return validOperations.reduce<VatTotals>(
    (acc, op) => {
      if (op.direction === 'input') {
        acc.input_vat += op.vat_amount
      } else {
        acc.output_vat += op.vat_amount
      }
      acc.net_vat = acc.output_vat - acc.input_vat
      return acc
    },
    { input_vat: 0, output_vat: 0, net_vat: 0 },
  )
}

export function getVatSummary(totals: VatTotals): {
  description: string
  amount: number
  type: 'payment' | 'refund'
} {
  if (totals.net_vat > 0) {
    return {
      description: 'НДС к уплате в бюджет',
      amount: totals.net_vat,
      type: 'payment'
    }
  } else if (totals.net_vat < 0) {
    return {
      description: 'НДС к возмещению из бюджета',
      amount: Math.abs(totals.net_vat),
      type: 'refund'
    }
  } else {
    return {
      description: 'НДС не начислен',
      amount: 0,
      type: 'payment'
    }
  }
}

export function groupNetVatByMonth(operations: Operation[]): { month: string; net_vat: number }[] {
  const map = new Map<string, number>()

  for (const op of operations) {
    if (!op.date || Number.isNaN(Date.parse(op.date))) continue
    const d = new Date(op.date)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    const sign = op.direction === 'input' ? -1 : 1
    const current = map.get(key) ?? 0
    map.set(key, current + sign * op.vat_amount)
  }

  return Array.from(map.entries())
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([month, net_vat]) => ({ month, net_vat }))
}
