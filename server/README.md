# Backend Server

Backend сервер для НДС калькулятора с аутентификацией и хранением отчетов.

## Технологии

- Node.js + Express.js
- TypeScript
- Prisma ORM
- PostgreSQL
- JWT для аутентификации
- bcrypt для хеширования паролей

## Установка

1. Установите зависимости:
```bash
cd server
npm install
```

2. Настройте базу данных:
   - Создайте PostgreSQL базу данных
   - Скопируйте `.env.example` в `.env`
   - Укажите `DATABASE_URL` в `.env`:
   ```
   DATABASE_URL="postgresql://user:password@localhost:5432/tax_db?schema=public"
   JWT_SECRET="your-secret-key-change-in-production"
   PORT=3001
   NODE_ENV=development
   ```

3. Запустите миграции Prisma:
```bash
npm run prisma:generate
npm run prisma:migrate
```

4. Запустите сервер:
```bash
npm run dev
```

Сервер будет доступен на `http://localhost:3001`

## API Endpoints

### Аутентификация

- `POST /api/auth/register` - Регистрация
- `POST /api/auth/login` - Вход
- `GET /api/auth/me` - Получить текущего пользователя

### Отчеты

- `GET /api/reports` - Получить все отчеты пользователя
- `GET /api/reports/:id` - Получить отчет с операциями
- `POST /api/reports` - Создать новый отчет
- `PATCH /api/reports/:id/status` - Обновить статус отчета
- `DELETE /api/reports/:id` - Удалить отчет

Все endpoints отчетов требуют аутентификации (JWT токен в заголовке `Authorization: Bearer <token>`).

## Миграции

Для создания новой миграции:
```bash
npm run prisma:migrate
```

Для просмотра базы данных:
```bash
npm run prisma:studio
```

## Структура базы данных

- **User** - Пользователи системы
- **Report** - Отчеты по НДС (связь с пользователем)
- **Operation** - Операции в отчетах (связь с отчетом)

Статусы отчета:
- `REQUIRES_REVIEW` - Требует просмотра (по умолчанию)
- `READY` - Готов

