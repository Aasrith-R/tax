import type { Operation, VatPayload, VatTotals } from '../types/operation'

export type { Operation, VatTotals, VatPayload }

export function buildVatPayload(operations: Operation[]): VatPayload {
  const totals: VatTotals = operations.reduce(
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

  return {
    operations,
    totals,
    generated_at: new Date().toISOString(),
  }
}
