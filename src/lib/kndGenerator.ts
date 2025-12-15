import { PDFDocument } from 'pdf-lib'
import type { Report } from '../services/api'
import type { InvoiceData } from '../components/reports/KNDModal'

/**
 * Insert spaces between every character so each digit goes into its own square in PDF
 * Example: "7701234567" -> "7 7 0 1 2 3 4 5 6 7"
 */
function spaced(value: string): string {
  return value.split('').join('  ')
}

/**
 * Format number for PDF field (2 decimal places)
 * Example: 1234567.89 -> "1234567.89"
 */
function formatNumber(value: number): string {
  return value.toFixed(2)
}

/**
 * Safely get a text field, return null if it doesn't exist
 */
function getTextFieldSafe(form: any, fieldName: string) {
  try {
    return form.getTextField(fieldName)
  } catch (error) {
    return null
  }
}

/**
 * Parse invoice number and date from source field
 * Examples:
 *   "2237 от 31.05.2025" -> { invoiceNumber: "2237", day: "31", month: "05", year: "2025", correctionDay: null, correctionMonth: null, correctionYear: null }
 *   "2237/ИСП1 от 15.06.2025" -> { invoiceNumber: "2237", day: null, month: null, year: null, correctionDay: "15", correctionMonth: "06", correctionYear: "2025" }
 */
function parseInvoiceSource(source: string): {
  invoiceNumber: string
  day: string | null
  month: string | null
  year: string | null
  correctionDay: string | null
  correctionMonth: string | null
  correctionYear: string | null
} {
  // Match format: "number от DD.MM.YYYY" or "number/ИСП... от DD.MM.YYYY"
  const mainMatch = source.match(/^(.+?)\s+от\s+(\d{2})\.(\d{2})\.(\d{4})$/);
  
  if (mainMatch) {
    const invoicePart = mainMatch[1].trim();
    const day = mainMatch[2];
    const month = mainMatch[3];
    const year = mainMatch[4];
    
    // Check if this is a correction invoice (contains /ИСП)
    if (invoicePart.includes('/ИСП')) {
      // Extract base invoice number (before /ИСП)
      const baseInvoiceNumber = invoicePart.split('/')[0].trim();
      // Date after "от" is the correction date
      return {
        invoiceNumber: baseInvoiceNumber,
        day: null, // Original date not in this field
        month: null,
        year: null,
        correctionDay: day,
        correctionMonth: month,
        correctionYear: year
      };
    } else {
      // Regular invoice
      return {
        invoiceNumber: invoicePart,
        day,
        month,
        year,
        correctionDay: null,
        correctionMonth: null,
        correctionYear: null
      };
    }
  }
  
  // If no match, return the source as invoice number
  return {
    invoiceNumber: source,
    day: null,
    month: null,
    year: null,
    correctionDay: null,
    correctionMonth: null,
    correctionYear: null
  };
}

export async function generateKNDPDF(report: Report, inn: string, kpp: string, invoiceData?: InvoiceData[]): Promise<Blob> {
  console.log('\n🚀 generateKNDPDF called with:')
  console.log('  - Invoice data:', invoiceData ? `Yes (${invoiceData.length} items)` : 'No')
  console.log('  - Invoice data content:', invoiceData)
  console.log('  - Operations count:', report.operations?.length || 0)
  
  // Load the template PDF
  const templateResponse = await fetch('/Налоговая декларация form.pdf')
  const templateBytes = await templateResponse.arrayBuffer()

  // Load the PDF document
  const pdfDoc = await PDFDocument.load(templateBytes)
  
  // Load and register fontkit for custom font embedding
  console.log('\n🔤 Loading Cyrillic font...')
  
  // Dynamically import fontkit to handle Vite bundling correctly
  const fontkitModule = await import('@pdf-lib/fontkit')
  let fontkit: any = fontkitModule.default || fontkitModule
  
  // Debug: log fontkit structure to understand its shape
  console.log('  Fontkit type:', typeof fontkit)
  console.log('  Fontkit keys:', fontkit && typeof fontkit === 'object' ? Object.keys(fontkit) : 'N/A')
  
  // pdf-lib expects fontkit.create to be a function
  // If fontkit itself is the create function, wrap it
  if (typeof fontkit === 'function' && !fontkit.create) {
    const createFn = fontkit
    fontkit = { create: createFn }
  } else if (fontkit && typeof fontkit === 'object' && !fontkit.create && typeof (fontkit as any).default === 'function') {
    // Handle nested default export
    const createFn = (fontkit as any).default
    fontkit = { create: createFn }
  }
  
  // Register fontkit with the PDF document
  pdfDoc.registerFontkit(fontkit)
  
  // Load and embed Cyrillic font
  const fontResponse = await fetch('/Roboto-Regular.ttf')
  const fontBytes = await fontResponse.arrayBuffer()
  const cyrillicFont = await pdfDoc.embedFont(fontBytes, { subset: true })
  console.log('  ✅ Cyrillic font embedded successfully')
  
  // Get form - we'll update field appearances AFTER filling all fields
  const form = pdfDoc.getForm()
  
  // DEBUG: List ALL fields to find invoice-related fields
  console.log('\n🔍 DEBUG: Listing ALL PDF form fields...')
  const allFields = form.getFields()
  console.log(`Total fields in PDF: ${allFields.length}`)
  
  // List ALL field names
  const allFieldNames = allFields.map(f => f.getName())
  console.log('All field names (first 50):', allFieldNames.slice(0, 50))
  
  // Find fields that contain "invoice" or "020" or "030" or "050" or "row" or "correction"
  const invoiceRelatedFields = allFieldNames.filter(name => 
    name.toLowerCase().includes('invoice') || 
    name.includes('020') || 
    name.includes('030') || 
    name.includes('050') ||
    name.includes('row') ||
    name.toLowerCase().includes('correction')
  )
  console.log('Invoice-related fields found:', invoiceRelatedFields)
  
  // Find fields specifically for correction invoice number
  const correctionInvoiceFields = allFieldNames.filter(name => 
    (name.toLowerCase().includes('correction') && name.toLowerCase().includes('invoice')) ||
    (name.toLowerCase().includes('correction') && name.toLowerCase().includes('number'))
  )
  console.log('Correction invoice number fields found:', correctionInvoiceFields)
  
  // Also check for fields with "row_1" or "1" pattern
  const row1Fields = allFieldNames.filter(name => 
    name.includes('row_1') || 
    name.includes('row1') ||
    (name.includes('1') && (name.includes('020') || name.includes('030') || name.includes('050')))
  )
  console.log('Row 1 related fields found:', row1Fields)
  
  if (invoiceData && invoiceData.length > 0) {
    console.log('\n✅ Invoice data available:', invoiceData)
  } else {
    console.log('\n❌ No invoice data provided!')
  }

  // Fill INN in all possible fields (INN, INN#1-INN#26)
  // Use spaced() so each digit goes into its own square
  const innFields = ['INN', ...Array.from({ length: 26 }, (_, i) => `INN#${i + 1}`)]
  innFields.forEach((fieldName) => {
    const field = getTextFieldSafe(form, fieldName)
    if (field) {
      field.setText(spaced(inn))
    }
  })

  // Fill KPP in all possible fields (KPP, KPP#1-KPP#26)
  // Use spaced() so each digit goes into its own square
  const kppFields = ['KPP', ...Array.from({ length: 26 }, (_, i) => `KPP#${i + 1}`)]
  kppFields.forEach((fieldName) => {
    const field = getTextFieldSafe(form, fieldName)
    if (field) {
      field.setText(spaced(kpp))
    }
  })

  // CorrectionNumber - номер корректировки (0 for initial submission)
  const correctionNumberField = getTextFieldSafe(form, 'CorrectionNumber')
  if (correctionNumberField) {
    correctionNumberField.setText(spaced('0'))
  }

  // TaxPeriod - налоговый период (3 = Q3)
  const taxPeriodField = getTextFieldSafe(form, 'TaxPeriod')
  if (taxPeriodField) {
    taxPeriodField.setText(spaced('3'))
  }

  // ReportYear - отчетный год (2025)
  const reportYearField = getTextFieldSafe(form, 'ReportYear')
  if (reportYearField) {
    reportYearField.setText(spaced('2025'))
  }

  // Extract totals from report
  const { output_vat, input_vat } = report.totals

  // 2.2. Общая сумма исчисленного налога (строка 118)
  // Formula: сумма всего исходящего НДС
  const r3_118 = output_vat
  const field118 = getTextFieldSafe(form, 'r3_118_tax_calculated_total')
  if (field118) {
    field118.setText(spaced(formatNumber(r3_118)))
  }

  // 2.3. Налоговые вычеты (строка 120)
  // Formula: сумма входящего НДС по операциям, которые допускаются к вычету
  const r3_120 = input_vat
  const field120 = getTextFieldSafe(form, 'r3_120_input_vat_deductible')
  if (field120) {
    field120.setText(spaced(formatNumber(r3_120)))
  }

  // 2.4. Общая сумма налога, подлежащая вычету (строка 190)
  // На стартовом этапе = то же, что и стр.120
  const r3_190 = input_vat
  const field190 = getTextFieldSafe(form, 'r3_190_vat_deductions_total')
  if (field190) {
    field190.setText(spaced(formatNumber(r3_190)))
  }

  // 2.5. Итог к уплате / к возмещению (строки 200/210)
  // Formula: r3_118 - r3_190
  const calculation = r3_118 - r3_190

  // Calculate values once
  const r3_200_value = calculation >= 0 ? formatNumber(calculation) : '0.00'
  const r3_210_value = calculation < 0 ? formatNumber(Math.abs(calculation)) : '0.00'

  // Строка 200 — Итого сумма налога, подлежащая уплате (если результат ≥ 0)
  const field200 = getTextFieldSafe(form, 'r3_200_vat_to_pay_total')
  if (field200) {
    field200.setText(spaced(r3_200_value))
  }

  // Строка 210 — Итого сумма налога, исчисленная к возмещению (если результат < 0, берём модуль)
  const field210 = getTextFieldSafe(form, 'r3_210_vat_to_refund_total')
  if (field210) {
    field210.setText(spaced(r3_210_value))
  }

  // Строка 040 — Сумма налога, подлежащая уплате в бюджет
  // Значение из r3_200_vat_to_pay_total
  const field040 = getTextFieldSafe(form, 'r1_040_vat_to_pay')
  if (field040) {
    field040.setText(spaced(r3_200_value))
  }

  // Строка 050 — Сумма налога, исчисленная к возмещению
  // Значение из r3_210_vat_to_refund_total
  const field050 = getTextFieldSafe(form, 'r1_050_vat_to_refund')
  if (field050) {
    field050.setText(spaced(r3_210_value))
  }

  // Process operations and fill invoice fields
  if (report.operations && report.operations.length > 0) {
    console.log('\n🔧 KND PDF Generation - Invoice Fields:')
    console.log('Invoice data provided:', invoiceData ? `Yes (${invoiceData.length} items)` : 'No')
    console.log('Invoice data content:', invoiceData)
    console.log('Operations count:', report.operations.length)
    
    if (invoiceData && invoiceData.length > 0) {
      console.log('⚠️  Note: Invoice data will be mapped by index to operations')
      console.log('   First operation will use invoiceData[0], second will use invoiceData[1], etc.')
      console.log('   invoiceData[0]:', invoiceData[0])
      if (invoiceData.length !== report.operations.length) {
        console.log(`   ⚠️  WARNING: Mismatch! Invoice data has ${invoiceData.length} items, but there are ${report.operations.length} operations`)
        console.log(`   Will use invoice data for first ${Math.min(invoiceData.length, report.operations.length)} operations`)
      }
    } else {
      console.log('   ⚠️  No invoice data provided - will parse from operation.source')
    }
    
    report.operations.forEach((operation, index) => {
      const rowNumber = index + 1; // Row numbers start from 1
      
      // Use invoiceData if provided, otherwise parse from operation.source
      let parsed: {
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
      };

      // For TEST: Only use invoice data for the FIRST operation (row 1)
      if (invoiceData && invoiceData.length > 0 && index === 0) {
        // Use data from uploaded Purchase Book for first operation only
        const invoice = invoiceData[0];
        console.log(`\n✅ Row ${rowNumber} (operation index ${index}) - Using uploaded invoice data from row 17:`, invoice)
        parsed = {
          invoiceNumber: invoice.invoiceNumber,
          day: invoice.day,
          month: invoice.month,
          year: invoice.year,
          correctionDay: invoice.correctionDay,
          correctionMonth: invoice.correctionMonth,
          correctionYear: invoice.correctionYear,
          correctionInvoiceNumber: invoice.correctionInvoiceNumber || null,
          sellerName: invoice.sellerName || null,
          sellerInn: invoice.sellerInn || null,
          sellerKpp: invoice.sellerKpp || null
        };
      } else {
        // Fall back to parsing from operation.source
        if (index === 0) {
          console.log(`\n⚠️ Row ${rowNumber} (operation index ${index}) - No invoice data available, parsing from operation.source:`, operation.source)
          console.log(`   Invoice data check: invoiceData=${!!invoiceData}, length=${invoiceData?.length || 0}, index=${index}`)
        }
        const parsedFromSource = parseInvoiceSource(operation.source);
        parsed = {
          ...parsedFromSource,
          correctionInvoiceNumber: null,
          sellerName: null,
          sellerInn: null,
          sellerKpp: null
        };
        if (index === 0) {
          console.log(`Row ${rowNumber} - Parsed result:`, parsed)
        }
      }
      
      console.log(`Row ${rowNumber} - Final parsed data:`, {
        invoiceNumber: parsed.invoiceNumber,
        day: parsed.day,
        month: parsed.month,
        year: parsed.year,
        correctionDay: parsed.correctionDay,
        correctionMonth: parsed.correctionMonth,
        correctionYear: parsed.correctionYear,
        correctionInvoiceNumber: parsed.correctionInvoiceNumber,
        sellerName: parsed.sellerName,
        sellerInn: parsed.sellerInn,
        sellerKpp: parsed.sellerKpp
      })

      // Fill invoice number (строка 020)
      // PDF fields use _X suffix - use as-is for row 1
      const invoiceNumberFieldName = rowNumber === 1 ? 'invoice_number_020_row_X' : `invoice_number_020_row_${rowNumber}`
      const invoiceNumberField = getTextFieldSafe(form, invoiceNumberFieldName);
      if (invoiceNumberField && parsed.invoiceNumber) {
        console.log(`  ✓ Filling ${invoiceNumberFieldName} = "${parsed.invoiceNumber}"`)
        invoiceNumberField.setText(spaced(parsed.invoiceNumber));
      } else if (rowNumber === 1) {
        console.log(`  ✗ Field ${invoiceNumberFieldName} NOT FOUND`)
      }

      // Fill invoice date - день, месяц, год (строка 030)
      if (parsed.day && parsed.month && parsed.year) {
        const dayFieldName = rowNumber === 1 ? 'invoice_1date_030_row_X' : `invoice_1date_030_row_${rowNumber}`
        const monthFieldName = rowNumber === 1 ? 'invoice_2date_030_row_X' : `invoice_2date_030_row_${rowNumber}`
        const yearFieldName = rowNumber === 1 ? 'invoice_3date_030_row_X' : `invoice_3date_030_row_${rowNumber}`
        
        const dayField = getTextFieldSafe(form, dayFieldName);
        const monthField = getTextFieldSafe(form, monthFieldName);
        const yearField = getTextFieldSafe(form, yearFieldName);
        
        if (dayField) {
          console.log(`  ✓ Filling ${dayFieldName} = "${parsed.day}"`)
          dayField.setText(spaced(parsed.day));
        } else if (rowNumber === 1) {
          console.log(`  ✗ Field ${dayFieldName} NOT FOUND`)
        }
        
        if (monthField) {
          console.log(`  ✓ Filling ${monthFieldName} = "${parsed.month}"`)
          monthField.setText(spaced(parsed.month));
        } else if (rowNumber === 1) {
          console.log(`  ✗ Field ${monthFieldName} NOT FOUND`)
        }
        
        if (yearField) {
          console.log(`  ✓ Filling ${yearFieldName} = "${parsed.year}"`)
          yearField.setText(spaced(parsed.year));
        } else if (rowNumber === 1) {
          console.log(`  ✗ Field ${yearFieldName} NOT FOUND`)
        }
      }

      // Fill correction date - день, месяц, год (строка 050)
      const correctionDayFieldName = rowNumber === 1 ? 'invoice_1date_050_row_X' : `invoice_1date_050_row_${rowNumber}`
      const correctionMonthFieldName = rowNumber === 1 ? 'invoice_2date_050_row_X' : `invoice_2date_050_row_${rowNumber}`
      const correctionYearFieldName = rowNumber === 1 ? 'invoice_3date_050_row_X' : `invoice_3date_050_row_${rowNumber}`
      
      const correctionDayField = getTextFieldSafe(form, correctionDayFieldName);
      const correctionMonthField = getTextFieldSafe(form, correctionMonthFieldName);
      const correctionYearField = getTextFieldSafe(form, correctionYearFieldName);
      
      if (parsed.correctionDay && parsed.correctionMonth && parsed.correctionYear) {
        if (correctionDayField) {
          console.log(`  ✓ Filling ${correctionDayFieldName} = "${parsed.correctionDay}"`)
          correctionDayField.setText(spaced(parsed.correctionDay));
        } else if (rowNumber === 1) {
          console.log(`  ✗ Field ${correctionDayFieldName} NOT FOUND`)
        }
        if (correctionMonthField) {
          console.log(`  ✓ Filling ${correctionMonthFieldName} = "${parsed.correctionMonth}"`)
          correctionMonthField.setText(spaced(parsed.correctionMonth));
        } else if (rowNumber === 1) {
          console.log(`  ✗ Field ${correctionMonthFieldName} NOT FOUND`)
        }
        if (correctionYearField) {
          console.log(`  ✓ Filling ${correctionYearFieldName} = "${parsed.correctionYear}"`)
          correctionYearField.setText(spaced(parsed.correctionYear));
        } else if (rowNumber === 1) {
          console.log(`  ✗ Field ${correctionYearFieldName} NOT FOUND`)
        }
      } else if (rowNumber === 1) {
        console.log(`  ⚠ No correction date data (day: ${parsed.correctionDay}, month: ${parsed.correctionMonth}, year: ${parsed.correctionYear})`)
        console.log(`  🔍 Checking if fields exist: day=${!!correctionDayField}, month=${!!correctionMonthField}, year=${!!correctionYearField}`)
      }

      // Fill correction invoice number (Номер корректировочного счета-фактуры продавца)
      // Try common field name patterns
      const correctionInvoiceNumberFieldNames = [
        rowNumber === 1 ? 'correction_invoice_number_row_X' : `correction_invoice_number_row_${rowNumber}`,
        rowNumber === 1 ? 'invoice_correction_number_row_X' : `invoice_correction_number_row_${rowNumber}`,
        rowNumber === 1 ? 'correction_invoice_number_040_row_X' : `correction_invoice_number_040_row_${rowNumber}`,
        rowNumber === 1 ? 'invoice_correction_number_040_row_X' : `invoice_correction_number_040_row_${rowNumber}`,
      ]
      
      let correctionInvoiceNumberField = null
      let correctionInvoiceNumberFieldName = null
      
      for (const fieldName of correctionInvoiceNumberFieldNames) {
        correctionInvoiceNumberField = getTextFieldSafe(form, fieldName)
        if (correctionInvoiceNumberField) {
          correctionInvoiceNumberFieldName = fieldName
          break
        }
      }
      
      if (parsed.correctionInvoiceNumber && correctionInvoiceNumberField) {
        console.log(`  ✓ Filling ${correctionInvoiceNumberFieldName} = "${parsed.correctionInvoiceNumber}"`)
        correctionInvoiceNumberField.setText(spaced(parsed.correctionInvoiceNumber));
      } else if (rowNumber === 1 && parsed.correctionInvoiceNumber) {
        console.log(`  ✗ Correction invoice number field NOT FOUND (tried: ${correctionInvoiceNumberFieldNames.join(', ')})`)
      }

      // Fill seller name (строка 060)
      const sellerNameFieldName = rowNumber === 1 ? 'seller_name_060_row_X' : `seller_name_060_row_${rowNumber}`
      const sellerNameField = getTextFieldSafe(form, sellerNameFieldName);
      
      console.log(`\n🔍 Row ${rowNumber} - Seller name field:`)
      console.log(`  Field name: ${sellerNameFieldName}`)
      console.log(`  Field exists: ${!!sellerNameField}`)
      console.log(`  Parsed seller name:`, parsed.sellerName || '(null/empty)')
      console.log(`  Seller name type:`, typeof parsed.sellerName)
      console.log(`  Seller name length:`, parsed.sellerName?.length || 0)
      
      if (parsed.sellerName && sellerNameField) {
        console.log(`  ✅ Filling ${sellerNameFieldName} = "${parsed.sellerName}"`)
        sellerNameField.setText(parsed.sellerName);
        // Update appearance with Cyrillic font after setting text
        sellerNameField.updateAppearances(cyrillicFont);
        console.log(`  ✅ Field filled and appearance updated with Cyrillic font`)
      } else if (rowNumber === 1 && parsed.sellerName) {
        console.log(`  ❌ Field ${sellerNameFieldName} NOT FOUND in PDF`)
        // Try alternative field names
        const alternatives = [
          'seller_name_060_row_1',
          'seller_name_row_X',
          'seller_name_row_1',
          'name_060_row_X',
          'name_060_row_1'
        ]
        console.log(`  🔍 Trying alternative field names:`)
        for (const altName of alternatives) {
          const altField = getTextFieldSafe(form, altName)
          if (altField) {
            console.log(`    ✓ Found alternative: ${altName}`)
            altField.setText(parsed.sellerName)
            // Update appearance with Cyrillic font
            altField.updateAppearances(cyrillicFont)
            break
          }
        }
      } else if (rowNumber === 1) {
        console.log(`  ⚠️ No seller name data available in parsed data`)
        console.log(`  Full parsed object:`, JSON.stringify(parsed, null, 2))
      }

      // Fill seller INN and KPP (строка 130)
      const sellerInnFieldName = rowNumber === 1 ? 'seller_inn_130_row_X' : `seller_inn_130_row_${rowNumber}`
      const sellerKppFieldName = rowNumber === 1 ? 'seller_kpp_130_row_X' : `seller_kpp_130_row_${rowNumber}`
      
      const sellerInnField = getTextFieldSafe(form, sellerInnFieldName);
      const sellerKppField = getTextFieldSafe(form, sellerKppFieldName);
      
      if (parsed.sellerInn && sellerInnField) {
        console.log(`  ✓ Filling ${sellerInnFieldName} = "${parsed.sellerInn}"`)
        sellerInnField.setText(spaced(parsed.sellerInn));
      } else if (rowNumber === 1 && parsed.sellerInn) {
        console.log(`  ✗ Field ${sellerInnFieldName} NOT FOUND`)
      }
      
      if (parsed.sellerKpp && sellerKppField) {
        console.log(`  ✓ Filling ${sellerKppFieldName} = "${parsed.sellerKpp}"`)
        sellerKppField.setText(spaced(parsed.sellerKpp));
      } else if (rowNumber === 1 && parsed.sellerKpp) {
        console.log(`  ✗ Field ${sellerKppFieldName} NOT FOUND`)
      }
    });
  }

  // Update all field appearances to use Cyrillic font AFTER all fields are filled
  // This ensures fields with Cyrillic text use the correct font
  console.log('\n🔤 Updating all field appearances with Cyrillic font...')
  try {
    form.updateFieldAppearances(cyrillicFont)
    console.log('  ✅ All PDF form fields updated to use Cyrillic font')
  } catch (error) {
    console.warn('  ⚠️ Error updating field appearances:', error)
    // Continue anyway - some fields might still work
  }

  // Flatten the form so the filled text becomes permanent
  form.flatten()

  // Save the PDF
  const pdfBytes = await pdfDoc.save()

  // Return as Blob for download
  // pdf-lib returns Uint8Array which is compatible with Blob at runtime
  return new Blob([pdfBytes as unknown as BlobPart], { type: 'application/pdf' })
}

export function downloadPDF(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

