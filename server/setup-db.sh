#!/bin/bash

# Script to help set up the database for the tax application

echo "=== Database Setup Helper ==="
echo ""

# Check if .env exists
if [ ! -f .env ]; then
    echo "❌ Error: .env file not found!"
    exit 1
fi

# Load .env variables
source .env 2>/dev/null || true

# Check if DATABASE_URL is set
if [ -z "$DATABASE_URL" ] || [[ "$DATABASE_URL" == *"YOUR_PASSWORD"* ]]; then
    echo "⚠️  Warning: DATABASE_URL is not configured properly in .env"
    echo ""
    echo "Please update .env with your PostgreSQL credentials:"
    echo "  DATABASE_URL=\"postgresql://username:password@host:port/database?schema=public\""
    echo ""
    echo "For Beget hosting, you can:"
    echo "  1. Create a database through Beget control panel"
    echo "  2. Use the credentials provided by Beget"
    echo ""
    echo "Example format:"
    echo "  DATABASE_URL=\"postgresql://napoykmf:your_password@localhost:5432/napoykmf_tax?schema=public\""
    echo ""
    exit 1
fi

echo "✓ .env file found"
echo ""

# Try to extract database name from DATABASE_URL
DB_NAME=$(echo $DATABASE_URL | sed -n 's/.*\/\([^?]*\).*/\1/p')

if [ -z "$DB_NAME" ]; then
    echo "❌ Could not extract database name from DATABASE_URL"
    exit 1
fi

echo "Database name: $DB_NAME"
echo ""

# Check if we can connect (this will fail if DB doesn't exist, but that's OK)
echo "Attempting to connect to database..."
echo ""

# Run Prisma migrations
echo "Running Prisma migrations..."
npm run prisma:migrate

if [ $? -eq 0 ]; then
    echo ""
    echo "✅ Database setup completed successfully!"
    echo ""
    echo "You can now start the server with:"
    echo "  npm run dev"
else
    echo ""
    echo "❌ Migration failed. Please check:"
    echo "  1. Database exists and is accessible"
    echo "  2. DATABASE_URL in .env is correct"
    echo "  3. PostgreSQL server is running"
    exit 1
fi

