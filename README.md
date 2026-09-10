# RPD Backend

Express + TypeScript API for the RPD Sangathan field app. PostgreSQL (PostGIS) runs in Docker. Database name: **rpd**.

## Stack

- Express 5, TypeScript, Prisma ORM
- Helmet, CORS, compression, rate limit, Zod
- ESLint + Prettier
- Postgres 16 + pgAdmin 4 (nearby booths use a Haversine query; PostGIS can be added later)

## Local setup

```bash
cd ~/Desktop/rpd_backend
cp .env.example .env
docker compose up -d
npm install
npx prisma migrate dev --name init
npm run prisma:seed
npm run dev
```

API: `http://localhost:4000`  
Health: `http://localhost:4000/health`  
pgAdmin: `http://localhost:5050` (admin@rpd.local / admin)

Connect pgAdmin to host `postgres`, db `rpd`, user `rpd`, password `rpd_dev_password`.

## Demo login

- Mobile: any 10-digit number starting 6–9 (seeded member: `9876543210`)
- OTP: the value of `OTP_DEV_CODE` in `.env` (development only; not returned by the API)

## Nearby booths

`GET /api/v1/booths/nearby?lat=28.6692&lng=77.4538&radiusKm=5`

Uses a Haversine distance query on `latitude` / `longitude`. The Flutter app stores the result in Hive and reads nearby booths locally afterwards.
