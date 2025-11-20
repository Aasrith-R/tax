import type { Operation, VatTotals, VatDirection } from '../types/operation'

export function normalizeVatRate(raw: unknown): number {
  const n = Number(raw)
  if (!Number.isFinite(n) || n < 0) return 0
  // If user provided 10 or 20, treat it as percentage
  if (n > 1) return n / 100
  return n
}

export function detectDirection(amount: number): VatDirection {
  return amount < 0 ? 'input' : 'output'
}

export function computeVatAmount(amount: number, vatRate: number, existing?: unknown): number {
  const fromFile = Number(existing)
  if (Number.isFinite(fromFile) && fromFile !== 0) return fromFile
  return amount * vatRate
}

export function validateOperation(op: Operation): string[] {
  const errors: string[] = []

  if (!op.date || Number.isNaN(Date.parse(op.date))) {
    errors.push('Некорректная или пустая дата')
  }
  if (!Number.isFinite(op.amount)) {
    errors.push('Сумма не является числом')
  }
  if (!Number.isFinite(op.vat_rate) || op.vat_rate < 0 || op.vat_rate > 1) {
    errors.push('Ставка НДС должна быть в диапазоне от 0 до 100%')
  }
  if (!Number.isFinite(op.vat_amount)) {
    errors.push('Сумма НДС не является числом')
  }

  if (!op.counterparty) {
    errors.push('Контрагент не указан')
  }

  return errors
}

export function calculateTotals(operations: Operation[]): VatTotals {
  return operations.reduce<VatTotals>(
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
