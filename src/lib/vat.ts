import type { Operation, VatTotals, VatDirection } from '../types/operation'

// --- Helpers for Sber-style VAT parsing ------------------------------------

const ZERO_VAT_PHRASES = [
  'без ндс',
  'ндс не облагается',
  'ндс не предусмотрен',
  'ндс не взимается',
  'ндс нет',
  'без налога (ндс)',
]

function hasZeroVat(text: string): boolean {
  const t = text.toLowerCase()
  return ZERO_VAT_PHRASES.some(p => t.includes(p))
}

/**
 * Normalize Russian-style numbers:
 *  - "202-83"   -> 202.83
 *  - "68 925,92"-> 68925.92
 *  - "35516.67" -> 35516.67
 */
function normalizeRussianNumber(raw: string): number | null {
  const cleaned = raw.replace(/\s+/g, '').replace(/[-,]/g, '.')
  const n = Number(cleaned)
  return Number.isFinite(n) ? n : null
}

/**
 * Extract VAT amount from a payment description.
 * Works for phrases like:
 *  - "В т.ч. НДС (20%) 202-83 руб."
 *  - "В том числе НДС 20 % - 21035.60 рублей."
 *  - "НДС 20% включенный в сумму - 68925,92"
 *
 * Returns 0 if:
 *  - text contains "Без НДС" / "НДС не облагается" / etc.
 *  - we don’t find any plausible VAT number near "НДС".
 */
export function extractVatFromDescription(description: unknown): number {
  if (typeof description !== 'string') return 0
  if (!description) return 0

  if (hasZeroVat(description)) {
    return 0
  }

  const text = description
  const m = text.toLowerCase().indexOf('ндс')
  if (m === -1) {
    return 0
  }

  // Look only in a short window after "НДС" to avoid catching dates like 2017-06-05
  const window = 80
  const tail = text.slice(m + 3, m + 3 + window)

  const re = /(\d[\d\s]*[.,-]\d{2})/g
  let match: RegExpExecArray | null
  const candidates: string[] = []

  while ((match = re.exec(tail)) !== null) {
    const token = match[1]
    const noSpaces = token.replace(/\s+/g, '')

    // Filter out things that look like dates: "2017-06" followed by '-' (for "-05")
    const afterIndex = match.index + token.length
    const afterChar = tail[afterIndex]
    if (/^\d{4}-\d{2}$/.test(noSpaces) && afterChar === '-') {
      continue
    }

    candidates.push(token)
  }

  if (candidates.length === 0) return 0

  // In practice VAT amount is the last number after НДС in the window
  const rawNum = candidates[candidates.length - 1]
  const value = normalizeRussianNumber(rawNum)
  return value ?? 0
}

// --- VAT rate normalization --------------------------------------------------

export function normalizeVatRate(raw: unknown): number {
  if (raw == null) return 0

  if (typeof raw === 'string') {
    const trimmed = raw.trim()
    if (!trimmed) return 0

    const withoutPercent = trimmed.replace('%', '').replace(',', '.')
    const n = Number(withoutPercent)
    if (!Number.isFinite(n) || n < 0) return 0

    return n > 1 ? n / 100 : n
  }

  const n = Number(raw)
  if (!Number.isFinite(n) || n < 0) return 0
  if (n > 1) return n / 100
  return n
}

// --- Direction detection -----------------------------------------------------

/**
 * Prefer using Sber operation code (ВО):
 *  - '01' / '17' -> input (you pay, expenses/commissions)
 *  - '02'        -> output (you receive)
 *
 * Fallback: use sign of amount if operationCode is not provided.
 */
export function detectDirection(amount: number, operationCode?: string | null): VatDirection {
  if (operationCode === '01' || operationCode === '17') return 'input'
  if (operationCode === '02') return 'output'

  // Legacy behaviour (for generic CSV): positive = output, negative = input
  if (amount < 0) return 'input'
  if (amount > 0) return 'output'

  // Zero should normally be filtered out earlier
  return 'output'
}

// --- VAT amount calculation --------------------------------------------------

/**
 * Compute VAT amount with three tiers of logic:
 * 1) If existing is a number (already extracted) -> use its absolute value.
 * 2) If existing is a string (e.g. full payment description) ->
 *    try to extract VAT from text (Russian formats, "В т.ч. НДС ...").
 * 3) Otherwise fall back to amount * vatRate (for generic uploads with explicit rate).
 */
export function computeVatAmount(
  amount: number,
  vatRate: number,
  existing?: unknown,
): number {
  // 1) If caller already passed a numeric VAT (e.g. separate column)
  if (typeof existing === 'number') {
    if (Number.isFinite(existing) && existing !== 0) {
      return Math.abs(existing)
    }
  }

  // 2) If caller passed a string (e.g. Назначение платежа or "VAT" column with Russian format)
  if (typeof existing === 'string' && existing.trim()) {
    // Try to parse full description if it contains НДС
    if (existing.toLowerCase().includes('ндс')) {
      const fromDesc = extractVatFromDescription(existing)
      if (fromDesc > 0) {
        return fromDesc
      }
    }

    // Otherwise try to parse the string as a Russian-style number directly
    const candidate = normalizeRussianNumber(existing)
    if (candidate !== null && candidate !== 0) {
      return Math.abs(candidate)
    }
  }

  // 3) Fallback: calculate VAT as amount * rate (for non-Sber CSVs with explicit rates)
  const rate = normalizeVatRate(vatRate)
  if (rate <= 0) return 0

  const calculatedVat = Math.abs(amount * rate)
  return Math.round(calculatedVat * 100) / 100
}

// --- Validation --------------------------------------------------------------

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
  } else if (Math.abs(op.amount) > 1_000_000_000) {
    errors.push('Сумма выглядит нереалистично большой')
  }

  // VAT rate validation (soft — Sber statements usually don’t have a real rate column)
  const normalizedRate = normalizeVatRate(op.vat_rate as unknown)
  if (normalizedRate < 0 || normalizedRate > 1) {
    errors.push('Ставка НДС должна быть в диапазоне от 0 до 100%')
  } else {
    op.vat_rate = normalizedRate
  }

  // VAT amount validation
  if (!Number.isFinite(op.vat_amount)) {
    // Only complain if there *should* be VAT (non-zero rate)
    if (op.vat_rate && op.vat_rate > 0) {
      errors.push('Сумма НДС не является числом')
    } else {
      op.vat_amount = 0
    }
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

// --- Totals & summary --------------------------------------------------------

export function calculateTotals(operations: Operation[]): VatTotals {
  const validOperations = operations.filter(op => !op.errors || op.errors.length === 0)

  const totals = validOperations.reduce<VatTotals>(
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

  return totals
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
      type: 'payment',
    }
  } else if (totals.net_vat < 0) {
    return {
      description: 'НДС к возмещению из бюджета',
      amount: Math.abs(totals.net_vat),
      type: 'refund',
    }
  } else {
    return {
      description: 'НДС не начислен',
      amount: 0,
      type: 'payment',
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
