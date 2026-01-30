# Fix: Timestamp Bug (Unix Epoch Date Issue)

## Masalah
Tanggal pembuatan (created_at) di database menunjukkan **1 Januari 1970 pukul 07:00**, yang merupakan Unix epoch date. Ini terjadi karena field `created_at` dan `updated_at` tidak diset saat insert data baru.

## Root Cause
Query INSERT di beberapa repository tidak menyertakan kolom `created_at` dan `updated_at`, sehingga nilai default di database (yang mungkin NULL atau 0) menyebabkan tanggal menjadi Unix epoch.

## Solusi yang Telah Diterapkan

### 1. Perubahan Kode Backend

File-file yang diperbaiki:

#### ✅ SessionRepository.ts
- **Lokasi**: `src/infrastructure/database/mysql/repositories/SessionRepository.ts`
- **Method**: `create()`
- **Perubahan**: Menambahkan `created_at, updated_at` ke INSERT statement dengan nilai `NOW()`

#### ✅ MessageRepository.ts
- **Lokasi**: `src/infrastructure/database/mysql/repositories/MessageRepository.ts`
- **Method**: `create()`
- **Perubahan**: Menambahkan `created_at, updated_at` ke INSERT statement dengan nilai `NOW()`

#### ✅ ContactRepository.ts
- **Lokasi**: `src/infrastructure/database/mysql/repositories/ContactRepository.ts`
- **Method**: `create()` dan `createBulk()`
- **Perubahan**: Menambahkan `created_at, updated_at` ke INSERT statement dengan nilai `NOW()`

#### ✅ GroupRepository.ts
- **Lokasi**: `src/infrastructure/database/mysql/repositories/GroupRepository.ts`
- **Method**: `create()` dan `createBulk()`
- **Perubahan**: Menambahkan `created_at, updated_at` ke INSERT statement dengan nilai `NOW()`

#### ✅ RateLimitRepository.ts
- **Lokasi**: `src/infrastructure/database/mysql/repositories/RateLimitRepository.ts`
- **Method**: `getOrCreate()`
- **Perubahan**: Menambahkan `created_at, updated_at` ke INSERT statement dengan nilai `NOW()`

#### ✅ SessionController.ts (Bonus Fix)
- **Lokasi**: `src/interface-adapters/http/controllers/SessionController.ts`
- **Method**: `updateSettings()`
- **Perubahan**: Memperbaiki TypeScript compile error terkait return type

### 2. Migration Script untuk Data Existing

File migration telah dibuat untuk memperbaiki data yang sudah ada di database:

**File**: `database/migrations/fix_created_at_timestamps.sql`

Migration ini akan:
- Update semua record dengan `created_at` NULL atau tanggal 1970
- Menggunakan timestamp lain yang tersedia (updated_at, sent_at, dll) sebagai fallback
- Apply ke semua tabel: whatsapp_sessions, whatsapp_messages, whatsapp_contacts, whatsapp_groups, broadcast_campaigns, whatsapp_rate_limits

## Cara Menerapkan Fix

### Step 1: Deploy Kode Backend
```bash
cd /applications/javascript/chatcepat-wa

# Build TypeScript
npm run build

# Restart aplikasi
pm2 restart chatcepat-wa-gateway
# atau
npm start
```

### Step 2: Jalankan Migration untuk Fix Data Existing
```bash
# Login ke MySQL
mysql -u your_username -p your_database_name

# Jalankan migration script
source database/migrations/fix_created_at_timestamps.sql
# atau
mysql -u your_username -p your_database_name < database/migrations/fix_created_at_timestamps.sql
```

### Step 3: Verifikasi
Cek apakah tanggal sudah benar:
```sql
-- Cek session terbaru
SELECT id, session_id, name, created_at, updated_at
FROM whatsapp_sessions
ORDER BY id DESC
LIMIT 10;

-- Pastikan tidak ada lagi tanggal 1970
SELECT COUNT(*) as broken_records
FROM whatsapp_sessions
WHERE YEAR(created_at) = 1970;
```

## Testing

### Test Create Session Baru
```bash
curl -X POST http://localhost:3000/api/sessions \
  -H "Content-Type: application/json" \
  -d '{
    "userId": 1,
    "name": "Test Session",
    "webhookUrl": "https://example.com/webhook"
  }'
```

Pastikan response menunjukkan `created_at` dengan tanggal yang benar (bukan 1970).

## Checklist
- [x] Fix SessionRepository.ts
- [x] Fix MessageRepository.ts
- [x] Fix ContactRepository.ts
- [x] Fix GroupRepository.ts
- [x] Fix RateLimitRepository.ts
- [x] Fix TypeScript compile errors
- [x] Build berhasil tanpa error
- [x] Buat migration script untuk fix data existing
- [ ] Deploy ke production
- [ ] Jalankan migration di production database
- [ ] Verifikasi tanggal sudah benar di production

## Notes
- Perubahan ini **backward compatible** - tidak akan break aplikasi yang sedang berjalan
- Migration script aman dijalankan multiple times (idempotent)
- Session baru yang dibuat setelah fix akan otomatis memiliki created_at yang benar
- Data lama perlu di-migrate menggunakan SQL script yang disediakan
