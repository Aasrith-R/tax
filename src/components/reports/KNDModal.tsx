import { useState } from 'react'
import * as XLSX from 'xlsx'
import type { Report } from '../../services/api'

export interface InvoiceData {
  invoiceNumber: string
  day: string | null
  month: string | null
  year: string | null
  correctionDay: string | null
  correctionMonth: string | null
  correctionYear: string | null
  correctionInvoiceNumber: string | null
  sellerName: string | null
  sellerInn: string | null
  sellerKpp: string | null
}

interface KNDModalProps {
  report: Report
  isOpen: boolean
  onClose: () => void
  onGenerate: (inn: string, kpp: string, invoiceData?: InvoiceData[]) => void
}

export function KNDModal({ report, isOpen, onClose, onGenerate }: KNDModalProps) {
  const [inn, setInn] = useState('')
  const [kpp, setKpp] = useState('')
  const [errors, setErrors] = useState<{ inn?: string; kpp?: string }>({})
  const [invoiceData, setInvoiceData] = useState<InvoiceData[]>([])
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null)

  if (!isOpen) return null

  const validate = () => {
    const newErrors: { inn?: string; kpp?: string } = {}

    if (!inn.trim()) {
      newErrors.inn = 'ИНН обязателен для заполнения'
    } else if (!/^\d{10}$|^\d{12}$/.test(inn.trim())) {
      newErrors.inn = 'ИНН должен содержать 10 или 12 цифр'
    }

    if (!kpp.trim()) {
      newErrors.kpp = 'КПП обязателен для заполнения'
    } else if (!/^\d{9}$/.test(kpp.trim())) {
      newErrors.kpp = 'КПП должен содержать 9 цифр'
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (validate()) {
      onGenerate(inn.trim(), kpp.trim(), invoiceData.length > 0 ? invoiceData : undefined)
      // Reset form
      setInn('')
      setKpp('')
      setErrors({})
      setInvoiceData([])
      setUploadError(null)
      setUploadedFileName(null)
      onClose()
    }
  }

  const handleClose = () => {
    setInn('')
    setKpp('')
    setErrors({})
    setInvoiceData([])
    setUploadError(null)
    setUploadedFileName(null)
    onClose()
  }

  const handlePurchaseBookUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setUploadError(null)
    setUploadedFileName(file.name)

    const reader = new FileReader()
    reader.onload = () => {
      try {
        const data = new Uint8Array(reader.result as ArrayBuffer)
        const workbook = XLSX.read(data, { type: 'array' })
        const firstSheetName = workbook.SheetNames[0]
        const worksheet = workbook.Sheets[firstSheetName]
        const rows: any[] = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' })

        // Find header row (look for columns like "Номер и дата счета-фактуры продавца")
        let headerRowIndex = -1
        let invoiceDateCol = -1

        for (let i = 0; i < Math.min(10, rows.length); i++) {
          const row = rows[i]
          for (let j = 0; j < row.length; j++) {
            const cell = String(row[j] || '').toLowerCase()
            if (cell.includes('номер') && cell.includes('дата') && cell.includes('счета-фактуры')) {
              headerRowIndex = i
              invoiceDateCol = j
              // Invoice number might be in the same column or a separate one
              // Try to find a column with "номер" or check if it's in the same cell
              break
            }
          }
          if (headerRowIndex !== -1) break
        }

        if (headerRowIndex === -1 || invoiceDateCol === -1) {
          throw new Error('Не найдена колонка с номером и датой счета-фактуры')
        }

        console.log('📋 Purchase Book Parsing:')
        console.log('Header row index:', headerRowIndex)
        console.log('Invoice date column:', invoiceDateCol)

        // TEST MODE: Only parse row 17 (Excel row 17 = index 16 in 0-based)
        const targetRowIndex = 16 // Row 17 in Excel (0-based index 16)
        const parsedInvoices: InvoiceData[] = []
        
        console.log(`\n🧪 TEST MODE: Processing ONLY row 17 (Excel index ${targetRowIndex})`)
        
        if (targetRowIndex < rows.length) {
          const row = rows[targetRowIndex]
          
          // DEBUG: Print entire row 17 to see all columns
          console.log(`\n🔍 DEBUG: Row 17 (Excel row ${targetRowIndex + 1}) - All columns:`)
          console.log(`Row length: ${row.length} columns`)
          for (let i = 0; i < Math.min(row.length, 60); i++) {
            const cellValue = String(row[i] || '').trim()
            if (cellValue) {
              console.log(`  Column ${i + 1} (index ${i}): "${cellValue}"`)
            }
          }
          
          // Try to find seller name column dynamically by checking header row
          let sellerNameCol = -1
          if (headerRowIndex >= 0 && headerRowIndex < rows.length) {
            const headerRow = rows[headerRowIndex]
            for (let j = 0; j < headerRow.length; j++) {
              const headerCell = String(headerRow[j] || '').toLowerCase()
              // Look for columns with "наименование" (name) or "продавец" (seller)
              if ((headerCell.includes('наименование') || headerCell.includes('продавец')) && 
                  !headerCell.includes('инн') && !headerCell.includes('кпп')) {
                sellerNameCol = j
                console.log(`\n✅ Found seller name column by header: Column ${j + 1} (index ${j}), header: "${headerRow[j]}"`)
                break
              }
            }
          }
          
          // Fallback to column 48 (index 47) if not found dynamically
          if (sellerNameCol === -1) {
            sellerNameCol = 47 // Column 48 is index 47 (0-based)
            console.log(`\n⚠️ Seller name column not found in headers, using default: Column 48 (index 47)`)
          }
          
          const invoiceCell = String(row[invoiceDateCol] || '').trim()
          // Check column 36 (index 35) for correction date (R17C36)
          const correctionDateCol = 35 // Column 36 is index 35 (0-based)
          const correctionDateCell = String(row[correctionDateCol] || '').trim()
          // Check column 43 (index 42) - this might be seller name OR correction invoice number
          const column43Col = 42 // Column 43 is index 42 (0-based)
          const column43Cell = String(row[column43Col] || '').trim()
          
          // Check column 49 (index 48) for seller INN/KPP (R17C49)
          const sellerInnKppCol = 48 // Column 49 is index 48 (0-based)
          const sellerInnKppCell = String(row[sellerInnKppCol] || '').trim()
          
          // Determine seller name: Column 43 often contains seller name if it's text (not just numbers)
          let sellerNameCell = ''
          let sellerNameSourceCol = sellerNameCol
          let correctionInvoiceNumberCell = ''
          
          // If column 43 contains text that looks like a company name (not just numbers), use it as seller name
          if (column43Cell && column43Cell.length > 5 && !/^\d+$/.test(column43Cell) && !column43Cell.match(/^\d+\/\d+$/)) {
            sellerNameCell = column43Cell
            sellerNameSourceCol = column43Col
            console.log(`\n✅ Column 43 contains seller name (text, not a number): "${column43Cell}"`)
          } else {
            // Try the default/dynamic column
            sellerNameCell = String(row[sellerNameCol] || '').trim()
            if (column43Cell && /^\d+/.test(column43Cell)) {
              // If column 43 is a number, it might be correction invoice number
              correctionInvoiceNumberCell = column43Cell
            }
          }
          
          console.log(`\n📋 Row 17 - Extracted values:`)
          console.log(`  Invoice cell (col ${invoiceDateCol + 1}):`, invoiceCell)
          console.log(`  Correction date cell (col 36):`, correctionDateCell)
          console.log(`  Column 43 cell:`, column43Cell, column43Cell ? `(type: ${/^\d+$/.test(column43Cell) ? 'number' : 'text'})` : '(empty)')
          console.log(`  🔍 Seller name source: Column ${sellerNameSourceCol + 1} (index ${sellerNameSourceCol}), value:`, sellerNameCell || '(EMPTY)')
          console.log(`  Correction invoice number:`, correctionInvoiceNumberCell || '(not found)')
          console.log(`  Seller INN/KPP cell (col 49):`, sellerInnKppCell)

          if (invoiceCell) {
            // Parse format: "2237 от 31.05.2025" or "2237/ИСП1 от 15.06.2025"
            const match = invoiceCell.match(/^(.+?)\s+от\s+(\d{2})\.(\d{2})\.(\d{4})$/);
            
            if (match) {
              const invoicePart = match[1].trim();
              const day = match[2];
              const month = match[3];
              const year = match[4];
              
              console.log('  ✓ Match found:', { invoicePart, day, month, year })
              
              // Parse correction date from column 36 if available
              let correctionDay = null
              let correctionMonth = null
              let correctionYear = null
              
              if (correctionDateCell) {
                // Try to parse correction date format: "DD.MM.YYYY" or "от DD.MM.YYYY"
                const correctionMatch = correctionDateCell.match(/(?:от\s+)?(\d{2})\.(\d{2})\.(\d{4})/);
                if (correctionMatch) {
                  correctionDay = correctionMatch[1];
                  correctionMonth = correctionMatch[2];
                  correctionYear = correctionMatch[3];
                  console.log('  ✓ Correction date found:', { correctionDay, correctionMonth, correctionYear })
                }
              }
              
              // Parse correction invoice number - check if column 43 is a number, otherwise it's seller name
              let correctionInvoiceNumber = null
              
              if (correctionInvoiceNumberCell && /^\d+/.test(correctionInvoiceNumberCell)) {
                correctionInvoiceNumber = correctionInvoiceNumberCell.trim();
                console.log('  ✓ Correction invoice number found:', correctionInvoiceNumber)
              } else {
                console.log('  ⚠️ Column 43 contains seller name, not correction invoice number')
              }
              
              // Parse seller name from column if available
              let sellerName = null
              
              if (sellerNameCell) {
                sellerName = sellerNameCell.trim();
                console.log(`\n✅ Seller name extracted from column ${sellerNameSourceCol + 1} (index ${sellerNameSourceCol}):`, sellerName)
                console.log(`   Raw value: "${sellerNameCell}"`)
                console.log(`   Trimmed value: "${sellerName}"`)
                console.log(`   Length: ${sellerName.length} characters`)
              } else {
                console.log(`\n❌ Seller name cell is EMPTY`)
                console.log(`   Checked column ${sellerNameSourceCol + 1} (index ${sellerNameSourceCol})`)
                console.log(`   Trying nearby columns...`)
                // Try nearby columns
                for (let offset = -5; offset <= 5; offset++) {
                  const testCol = sellerNameSourceCol + offset
                  if (testCol >= 0 && testCol < row.length) {
                    const testValue = String(row[testCol] || '').trim()
                    if (testValue && testValue.length > 3) {
                      console.log(`   Column ${testCol + 1} (index ${testCol}): "${testValue}"`)
                    }
                  }
                }
              }
              
              // Parse seller INN/KPP from column 49 if available
              let sellerInn = null
              let sellerKpp = null
              
              if (sellerInnKppCell) {
                // Parse format: "INN/KPP" or "INN / KPP"
                const innKppMatch = sellerInnKppCell.match(/^(.+?)\s*\/\s*(.+?)$/);
                if (innKppMatch) {
                  sellerInn = innKppMatch[1].trim();
                  sellerKpp = innKppMatch[2].trim();
                  console.log('  ✓ Seller INN/KPP found:', { sellerInn, sellerKpp })
                } else {
                  // If no slash, try to extract just INN
                  sellerInn = sellerInnKppCell.trim();
                  console.log('  ⚠ Only INN found (no KPP):', sellerInn)
                }
              }
              
              if (invoicePart.includes('/ИСП')) {
                // Correction invoice
                const baseInvoiceNumber = invoicePart.split('/')[0].trim();
                const invoiceData: InvoiceData = {
                  invoiceNumber: baseInvoiceNumber,
                  day: null,
                  month: null,
                  year: null,
                  correctionDay: correctionDay || day,
                  correctionMonth: correctionMonth || month,
                  correctionYear: correctionYear || year,
                  correctionInvoiceNumber: correctionInvoiceNumber,
                  sellerName,
                  sellerInn,
                  sellerKpp
                };
                console.log('  → Correction invoice:', invoiceData)
                parsedInvoices.push(invoiceData);
              } else {
                // Regular invoice - but may have correction date in column 36
                const invoiceData: InvoiceData = {
                  invoiceNumber: invoicePart,
                  day,
                  month,
                  year,
                  correctionDay: correctionDay,
                  correctionMonth: correctionMonth,
                  correctionYear: correctionYear,
                  correctionInvoiceNumber: correctionInvoiceNumber,
                  sellerName,
                  sellerInn,
                  sellerKpp
                };
                console.log('  → Regular invoice:', invoiceData)
                parsedInvoices.push(invoiceData);
              }
            } else {
              console.log('  ✗ No match found for row 17')
            }
          } else {
            console.log('  ✗ Row 17 is empty')
          }
        } else {
          console.log(`  ✗ Row 17 not found (only ${rows.length} rows in file)`)
        }

        if (parsedInvoices.length === 0) {
          throw new Error('Не найдено ни одной записи с данными счета-фактуры')
        }

        console.log(`\n✅ Row 17 parsed: ${parsedInvoices.length > 0 ? 'SUCCESS' : 'FAILED'}`)
        
        if (parsedInvoices.length > 0) {
          const invoice = parsedInvoices[0]
          console.log('\n📦 Row 17 invoice data (FINAL):', invoice)
          console.log('\n📊 Will fill PDF fields (row 1):', {
            'invoice_number_020_row_1': `"${invoice.invoiceNumber}"`,
            'invoice_1date_030_row_1': `"${invoice.day || 'null'}"`,
            'invoice_2date_030_row_1': `"${invoice.month || 'null'}"`,
            'invoice_3date_030_row_1': `"${invoice.year || 'null'}"`,
            'invoice_1date_050_row_1': `"${invoice.correctionDay || 'null'}"`,
            'invoice_2date_050_row_1': `"${invoice.correctionMonth || 'null'}"`,
            'invoice_3date_050_row_1': `"${invoice.correctionYear || 'null'}"`,
            'seller_name_060_row_X': `"${invoice.sellerName || 'null/empty'}"`,
            'seller_inn_130_row_X': `"${invoice.sellerInn || 'null/empty'}"`,
            'seller_kpp_130_row_X': `"${invoice.sellerKpp || 'null/empty'}"`,
          })
          console.log('\n🔍 Seller name details:')
          console.log('  Value:', invoice.sellerName)
          console.log('  Type:', typeof invoice.sellerName)
          console.log('  Is null:', invoice.sellerName === null)
          console.log('  Is undefined:', invoice.sellerName === undefined)
          console.log('  Length:', invoice.sellerName?.length || 0)
          console.log('  JSON:', JSON.stringify(invoice.sellerName))
        } else {
          console.log('  ✗ No invoice data extracted from row 17')
        }

        console.log('\n💾 Setting invoiceData state with', parsedInvoices.length, 'items')
        setInvoiceData(parsedInvoices)
        setUploadError(null)
      } catch (err) {
        console.error('Error parsing Purchase Book:', err)
        setUploadError(err instanceof Error ? err.message : 'Ошибка при разборе файла')
        setInvoiceData([])
        setUploadedFileName(null)
      }
    }

    reader.readAsArrayBuffer(file)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
      <div className="bg-white rounded-xl shadow-xl max-w-md w-full mx-4">
        <div className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-slate-900">
              Конвертация в КНД 1151001
            </h3>
            <button
              onClick={handleClose}
              className="text-slate-400 hover:text-slate-600"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div className="mb-4 p-3 bg-slate-50 rounded-lg">
            <p className="text-sm text-slate-600 mb-1">Отчет:</p>
            <p className="font-medium text-slate-900">{report.title || 'Без названия'}</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="inn" className="block text-sm font-medium text-slate-700 mb-1">
                ИНН <span className="text-red-500">*</span>
              </label>
              <input
                id="inn"
                type="text"
                value={inn}
                onChange={(e) => {
                  setInn(e.target.value.replace(/\D/g, ''))
                  if (errors.inn) setErrors({ ...errors, inn: undefined })
                }}
                placeholder="123456789012"
                maxLength={12}
                className={`w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 ${
                  errors.inn
                    ? 'border-red-300 focus:ring-red-500'
                    : 'border-slate-300 focus:ring-sky-500'
                }`}
              />
              {errors.inn && (
                <p className="mt-1 text-xs text-red-600">{errors.inn}</p>
              )}
              <p className="mt-1 text-xs text-slate-500">10 или 12 цифр</p>
            </div>

            <div>
              <label htmlFor="kpp" className="block text-sm font-medium text-slate-700 mb-1">
                КПП <span className="text-red-500">*</span>
              </label>
              <input
                id="kpp"
                type="text"
                value={kpp}
                onChange={(e) => {
                  setKpp(e.target.value.replace(/\D/g, ''))
                  if (errors.kpp) setErrors({ ...errors, kpp: undefined })
                }}
                placeholder="123456789"
                maxLength={9}
                className={`w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 ${
                  errors.kpp
                    ? 'border-red-300 focus:ring-red-500'
                    : 'border-slate-300 focus:ring-sky-500'
                }`}
              />
              {errors.kpp && (
                <p className="mt-1 text-xs text-red-600">{errors.kpp}</p>
              )}
              <p className="mt-1 text-xs text-slate-500">9 цифр</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Книга покупок
              </label>
              <div className="space-y-2">
                <label className="flex cursor-pointer items-center justify-center rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors">
                  <svg className="mr-2 h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                  </svg>
                  <span>{uploadedFileName ? 'Изменить файл' : 'Загрузить файл Excel'}</span>
                  <input
                    type="file"
                    accept=".xls,.xlsx"
                    onChange={handlePurchaseBookUpload}
                    className="hidden"
                  />
                </label>
                {uploadedFileName && (
                  <p className="text-xs text-slate-600">
                    Загружено: {uploadedFileName} ({invoiceData.length} записей)
                  </p>
                )}
                {uploadError && (
                  <p className="text-xs text-red-600">{uploadError}</p>
                )}
                {invoiceData.length > 0 && !uploadError && (
                  <p className="text-xs text-emerald-600">
                    ✓ Данные счетов-фактур успешно загружены
                  </p>
                )}
              </div>
            </div>

            <div className="flex gap-3 pt-4">
              <button
                type="button"
                onClick={handleClose}
                className="flex-1 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Отмена
              </button>
              <button
                type="submit"
                className="flex-1 rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-700"
              >
                Сгенерировать КНД
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}

