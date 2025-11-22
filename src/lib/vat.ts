import type { Operation, VatTotals, VatDirection } from '../types/operation'

// --- Helpers for Sber-style VAT parsing ------------------------------------

const ZERO_VAT_PHRASES = [
  'без ндс',
  'ндс не облагается',
  'ндс не предусмотрен',
  'ндс не взимается',
  'ндс нет',
  'без налога (ндс)',
  'ндс не облагается',
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
 *  - we don't find any plausible VAT number near "НДС".
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
  const window = 120
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
 * CRITICAL FIX: Proper direction detection for VAT purposes
 * 
 * For VAT reporting:
 * - INPUT VAT (deductible): VAT you PAID on purchases/expenses (debit operations, code '01')
 * - OUTPUT VAT (payable): VAT you COLLECTED from customers (credit operations, code '02')
 * 
 * SberBank operation codes:
 *  - '01' -> Debit (outgoing payment - you paid VAT) = INPUT VAT
 *  - '02' -> Credit (incoming payment - you collected VAT) = OUTPUT VAT
 *  - '17' -> Internal bank fees/commissions = INPUT VAT (but usually no VAT)
 */
export function detectDirection(amount: number, operationCode?: string | null): VatDirection {
  // Use operation code if available (most reliable for Sber statements)
  if (operationCode === '01' || operationCode === '17') {
    return 'input'  // You paid expenses -> Input VAT (deductible)
  }
  if (operationCode === '02') {
    return 'output' // You received income -> Output VAT (payable)
  }
  
  // Fallback to amount sign (for non-Sber files)
  // NEGATIVE amount = expense = INPUT VAT (you paid)
  // POSITIVE amount = income = OUTPUT VAT (you collected)
  return amount < 0 ? 'input' : 'output'
}

// --- VAT amount calculation --------------------------------------------------

/**
 * CRITICAL FIX: Compute VAT amount with proper absolute value handling
 * 
 * Compute VAT amount with three tiers of logic:
 * 1) If existing is a number (already extracted) -> use its absolute value.
 * 2) If existing is a string (e.g. full payment description) ->
 *    try to extract VAT from text (Russian formats, "В т.ч. НДС ...").
 * 3) Otherwise fall back to |amount| * vatRate (for generic uploads with explicit rate).
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

  // 3) Fallback: calculate VAT as |amount| * rate (for non-Sber CSVs with explicit rates)
  const rate = normalizeVatRate(vatRate)
  if (rate <= 0) return 0
  
  // CRITICAL: Use absolute value of amount
  const calculatedVat = Math.abs(amount) * rate
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

  // VAT rate validation (soft — Sber statements usually don't have a real rate column)
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

/**
 * CRITICAL FIX: Corrected VAT totals calculation
 * 
 * For Russian VAT reporting:
 * - Input VAT (Входящий НДС): VAT you PAID on purchases = DEDUCTIBLE
 * - Output VAT (Исходящий НДС): VAT you COLLECTED from sales = PAYABLE
 * - Net VAT = Output VAT - Input VAT
 *   - If positive: you owe the budget
 *   - If negative: budget owes you (refund)
 */
export function calculateTotals(operations: Operation[]): VatTotals {
  const validOperations = operations.filter(op => !op.errors || op.errors.length === 0)
  
  const totals = validOperations.reduce<VatTotals>(
    (acc, op) => {
      // Skip operations with zero VAT
      if (!op.vat_amount || op.vat_amount === 0) {
        return acc
      }
      
      if (op.direction === 'input') {
        // Input VAT: VAT you paid (deductible)
        acc.input_vat += Math.abs(op.vat_amount)
      } else {
        // Output VAT: VAT you collected (payable)
        acc.output_vat += Math.abs(op.vat_amount)
      }
      
      return acc
    },
    { input_vat: 0, output_vat: 0, net_vat: 0 },
  )
  
  // Net VAT = Output (collected) - Input (paid)
  // Positive = you owe budget
  // Negative = budget owes you
  totals.net_vat = totals.output_vat - totals.input_vat
  
  // Round to 2 decimal places
  totals.input_vat = Math.round(totals.input_vat * 100) / 100
  totals.output_vat = Math.round(totals.output_vat * 100) / 100
  totals.net_vat = Math.round(totals.net_vat * 100) / 100

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
  const map = new Map<string, { input: number; output: number }>()
  
  for (const op of operations) {
    if (!op.date || Number.isNaN(Date.parse(op.date))) continue
    if (!op.vat_amount || op.vat_amount === 0) continue
    
    const d = new Date(op.date)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    
    const current = map.get(key) ?? { input: 0, output: 0 }
    
    if (op.direction === 'input') {
      current.input += Math.abs(op.vat_amount)
    } else {
      current.output += Math.abs(op.vat_amount)
    }
    
    map.set(key, current)
  }
  
  return Array.from(map.entries())
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([month, { input, output }]) => ({ 
      month, 
      net_vat: Math.round((output - input) * 100) / 100 
    }))
}