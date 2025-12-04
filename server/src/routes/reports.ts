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
    errors: z.array(z.string()).optional()
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
  try {
    const userId = req.userId!
    const { title, operations, totals } = createReportSchema.parse(req.body)

    const report = await prisma.report.create({
      data: {
        userId,
        title,
        status: ReportStatus.REQUIRES_REVIEW,
        totals: totals as any,
        operations: {
          create: operations.map(op => ({
            date: new Date(op.date),
            amount: op.amount,
            vatRate: op.vatRate,
            vatAmount: op.vatAmount,
            counterparty: op.counterparty,
            source: op.source,
            direction: op.direction,
            errors: op.errors ? (op.errors as any) : null
          }))
        }
      },
      include: {
        _count: {
          select: { operations: true }
        }
      }
    })

    res.status(201).json({ report })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors[0].message })
    }
    next(error)
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

