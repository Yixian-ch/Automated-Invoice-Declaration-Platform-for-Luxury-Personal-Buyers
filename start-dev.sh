#!/bin/bash
# Local development starter — kills old processes, then starts API + web side-by-side.
set -e

ROOT="$(cd "$(dirname "$0")" && pwd)"

echo "[dev] Killing old processes on 3000 / 3001..."
kill $(lsof -t -i:3000 2>/dev/null) 2>/dev/null || true
kill $(lsof -t -i:3001 2>/dev/null) 2>/dev/null || true
sleep 1

echo "[dev] Starting NestJS API on :3001 (NODE_ENV=development)..."
DATABASE_URL="postgresql://lidp:lidp_dev_secret@localhost:5432/lidp_db" \
  REDIS_URL="redis://localhost:6379" \
  FRONTEND_URL="http://localhost:3000" \
  API_URL="http://localhost:3001" \
  BYPASS_S3=true \
  BYPASS_OCR=false \
  BYPASS_KYC=true \
  BYPASS_EMAIL_VERIFICATION=true \
  NODE_ENV=development \
  npm --prefix "$ROOT/api" run start:dev &
API_PID=$!

echo "[dev] Starting Next.js web on :3000..."
npm --prefix "$ROOT/web" run dev &
WEB_PID=$!

echo "[dev] API PID=$API_PID  Web PID=$WEB_PID"
echo "[dev] Press Ctrl+C to stop both"
trap "kill $API_PID $WEB_PID 2>/dev/null" EXIT
wait
