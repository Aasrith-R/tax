import { Router } from 'express'
import { PrismaClient, ReportStatus } from '@prisma/client'
import { authenticateToken, AuthRequest } from '../middleware/auth.js'
import { z } from 'zod'

const prisma = new PrismaClient()
const router = Router()

// All routes require authentication
router.use(authenticateToken)

const createReportSchema = z.object({
  title: z.string().min(1, 'Название обязательно'),
  operations: z.array(z.object({
    date: z.string(),
    amount: z.number(),
    vatRate: z.number(),
    vatAmount: z.number(),
    counterparty: z.string(),
    source: z.string(),
    direction: z.enum(['input', 'output']),
    errors: z.array(z.string()).optional(),
    company: z.string().optional(),
    payment_name: z.string().optional(),
    additional_info: z.record(z.any()).optional()
  })),
  totals: z.object({
    input_vat: z.number(),
    output_vat: z.number(),
    net_vat: z.number()
  })
})

const updateReportStatusSchema = z.object({
  status: z.enum(['READY', 'REQUIRES_REVIEW'])
})

// Get all reports for current user
router.get('/', async (req: AuthRequest, res, next) => {
  try {
    const userId = req.userId!
    
    const reports = await prisma.report.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      include: {
        _count: {
          select: { operations: true }
        }
      }
    })

    res.json({ reports })
  } catch (error) {
    next(error)
  }
})

// Get single report with operations
router.get('/:id', async (req: AuthRequest, res, next) => {
  try {
    const userId = req.userId!
    const { id } = req.params

    const report = await prisma.report.findFirst({
      where: {
        id,
        userId
      },
      include: {
        operations: {
          orderBy: { date: 'desc' }
        }
      }
    })

    if (!report) {
      return res.status(404).json({ error: 'Отчет не найден' })
    }

    res.json({ report })
  } catch (error) {
    next(error)
  }
})

// Create new report
router.post('/', async (req: AuthRequest, res, next) => {
  console.log('=== RAW REQUEST DEBUG ===')
  console.log('Method:', req.method)
  console.log('URL:', req.url)
  console.log('Body keys:', Object.keys(req.body || {}))
  console.log('Body size:', JSON.stringify(req.body || {}).length)
  console.log('User ID from middleware:', req.userId)

  console.log('✅ User authenticated:', req.userId)

  try {
    // First, just try to validate the schema
    console.log('🔍 Validating schema...')
    const validationResult = createReportSchema.safeParse(req.body)

    if (!validationResult.success) {
      console.log('❌ Schema validation failed:', validationResult.error.errors)
      return res.status(400).json({
        error: 'Validation error',
        details: validationResult.error.errors
      })
    }

    console.log('✅ Schema validation passed')
    const { title, operations, totals } = validationResult.data
    console.log(`Title: "${title}"`)
    console.log(`Operations count: ${operations.length}`)

    // Check for too many operations
    if (operations.length > 5000) {
      console.log('❌ Too many operations:', operations.length)
      return res.status(400).json({ error: 'Слишком много операций (максимум 5000). Разделите данные на меньшие части.' })
    }

    // Warn about large datasets
    if (operations.length > 1000) {
      console.log(`⚠️ Large dataset: ${operations.length} operations`)
    }

    // Now try database operations
    console.log('🔍 Testing database connection...')
    const userCount = await prisma.user.count()
    console.log(`✅ Database OK, users: ${userCount}`)

    // Try creating the report
    console.log('📝 Creating report...')
    const report = await prisma.report.create({
      data: {
        userId: req.userId as string,
        title,
        status: ReportStatus.REQUIRES_REVIEW,
        totals: totals as any,
        operations: {
          create: operations.map((op, index) => {
            try {
              const date = new Date(op.date)
              if (isNaN(date.getTime())) {
                throw new Error(`Invalid date: ${op.date}`)
              }

              return {
                date,
                amount: op.amount,
                vatRate: op.vatRate,
                vatAmount: op.vatAmount,
                counterparty: op.counterparty,
                source: op.source,
                direction: op.direction,
                errors: op.errors ? (op.errors as any) : undefined,
                company: op.company || undefined,
                paymentName: op.payment_name || undefined,
                additionalInfo: op.additional_info ? (op.additional_info as any) : undefined
              }
            } catch (opError) {
              console.error(`Error processing operation ${index}:`, opError)
              throw opError
            }
          })
        }
      },
      include: {
        _count: {
          select: { operations: true }
        }
      }
    })

    console.log('✅ Report created:', report.id)
    res.status(201).json({ report })

  } catch (error) {
    console.error('❌ Error:', error)

    // Try to identify the specific error type
    if (error instanceof z.ZodError) {
      console.error('Zod validation error:', error.errors)
      return res.status(400).json({
        error: 'Validation error',
        details: error.errors
      })
    }

    if (error && typeof error === 'object' && 'code' in error) {
      console.error('Database error code:', (error as any).code)
    }

    // Return the full error for debugging
    res.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
      type: error?.constructor?.name || typeof error
    })
  }
})

// Update report status
router.patch('/:id/status', async (req: AuthRequest, res, next) => {
  try {
    const userId = req.userId!
    const { id } = req.params
    const { status } = updateReportStatusSchema.parse(req.body)

    const report = await prisma.report.findFirst({
      where: {
        id,
        userId
      }
    })

    if (!report) {
      return res.status(404).json({ error: 'Отчет не найден' })
    }

    const updatedReport = await prisma.report.update({
      where: { id },
      data: { status: status as ReportStatus }
    })

    res.json({ report: updatedReport })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors[0].message })
    }
    next(error)
  }
})

// Delete report
router.delete('/:id', async (req: AuthRequest, res, next) => {
  try {
    const userId = req.userId!
    const { id } = req.params

    const report = await prisma.report.findFirst({
      where: {
        id,
        userId
      }
    })

    if (!report) {
      return res.status(404).json({ error: 'Отчет не найден' })
    }

    await prisma.report.delete({
      where: { id }
    })

    res.json({ message: 'Отчет удален' })
  } catch (error) {
    next(error)
  }
})

export { router as reportsRouter }

