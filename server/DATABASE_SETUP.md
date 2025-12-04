# Настройка базы данных

## Шаг 1: Создание базы данных

На хостинге Beget вам нужно создать базу данных PostgreSQL через панель управления.

1. Войдите в панель управления Beget
2. Перейдите в раздел "Базы данных" → "PostgreSQL"
3. Создайте новую базу данных (например, `napoykmf_tax`)
4. Запишите:
   - Имя базы данных
   - Имя пользователя
   - Пароль
   - Хост (обычно `localhost`)
   - Порт (обычно `5432`)

## Шаг 2: Настройка .env

Откройте файл `server/.env` и обновите `DATABASE_URL`:

```env
DATABASE_URL="postgresql://username:password@localhost:5432/database_name?schema=public"
```

**Пример:**
```env
DATABASE_URL="postgresql://napoykmf:mypassword123@localhost:5432/napoykmf_tax?schema=public"
```

**Важно:** Замените:
- `username` - ваше имя пользователя PostgreSQL
- `password` - ваш пароль PostgreSQL
- `database_name` - имя созданной базы данных

## Шаг 3: Генерация JWT секрета

Сгенерируйте безопасный секретный ключ для JWT:

```bash
# Linux/Mac
openssl rand -base64 32

# Или используйте онлайн генератор
```

Обновите в `.env`:
```env
JWT_SECRET="your-generated-secret-key-here-min-32-chars"
```

## Шаг 4: Запуск миграций

После настройки `.env`, выполните:

```bash
cd server
npm run prisma:generate
npm run prisma:migrate
```

Или используйте скрипт:
```bash
cd server
./setup-db.sh
```

## Проверка подключения

Если миграции прошли успешно, база данных настроена правильно!

Для просмотра базы данных:
```bash
npm run prisma:studio
```

## Устранение проблем

### Ошибка: "Environment variable not found: DATABASE_URL"
- Убедитесь, что файл `.env` существует в папке `server/`
- Проверьте, что `DATABASE_URL` указан правильно

### Ошибка: "Connection refused" или "Database does not exist"
- Проверьте, что база данных создана в панели Beget
- Убедитесь, что имя базы данных в `DATABASE_URL` совпадает с созданной
- Проверьте правильность пароля

### Ошибка: "Password authentication failed"
- Проверьте пароль в `DATABASE_URL`
- Убедитесь, что используете правильного пользователя

