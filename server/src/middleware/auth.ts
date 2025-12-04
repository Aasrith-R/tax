import { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'

export interface AuthRequest extends Request {
  userId?: string
}

export function authenticateToken(req: AuthRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers['authorization']
  const token = authHeader && authHeader.split(' ')[1] // Bearer TOKEN

  if (!token) {
    return res.status(401).json({ error: 'Токен доступа отсутствует' })
  }

  const secret = process.env.JWT_SECRET
  if (!secret) {
    return res.status(500).json({ error: 'Ошибка конфигурации сервера' })
  }

  try {
    const decoded = jwt.verify(token, secret) as { userId: string }
    req.userId = decoded.userId
    next()
  } catch (error) {
    return res.status(403).json({ error: 'Недействительный токен' })
  }
}

