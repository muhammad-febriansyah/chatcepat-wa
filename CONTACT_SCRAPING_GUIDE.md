# 📚 Contact Scraping Guide - Anti-Ban Mechanisms

## ⚠️ Mekanisme Perlindungan Dari Blokir WhatsApp

Sistem ini telah dilengkapi dengan berbagai mekanisme untuk **menghindari deteksi dan blokir** dari WhatsApp:

---

## 🛡️ 1. Rate Limiting (Pembatasan Kecepatan)

### Konfigurasi Default (`src/shared/config/scraping.ts`)

```typescript
{
  rateLimit: {
    maxScrapesPerDay: 5,           // Maksimal 5x scraping per hari
    cooldownBetweenScrapes: 3600000, // Cooldown 1 jam antar scraping
    maxContactsPerScrape: 500,      // Maksimal 500 kontak per scraping
  }
}
```

### Cara Kerja:
- ✅ **Daily Limit**: Hanya bisa scraping **5 kali per hari** per user
- ✅ **Cooldown Period**: Harus menunggu **1 jam** setelah scraping terakhir
- ✅ **Contact Limit**: Maksimal **500 kontak** per session untuk menghindari spam detection

---

## ⏱️ 2. Smart Delays (Jeda Otomatis)

### Random Delay Antar Group
```typescript
{
  delays: {
    minDelayBetweenGroups: 2000,  // Min 2 detik
    maxDelayBetweenGroups: 5000,  // Max 5 detik
    batchSaveDelay: 3000,          // 3 detik antar batch
  }
}
```

### Cara Kerja:
- 🤖 **Random Human-Like Behavior**: Delay acak 2-5 detik antar group
- 💾 **Batch Save Delay**: Jeda 3 detik saat save ke database
- 🎯 **Natural Pattern**: Meniru perilaku manusia saat browsing

---

## 📊 3. Batch Processing

### Proses Save Bertahap
```typescript
{
  batch: {
    contactsPerBatch: 50,  // Save 50 kontak per batch
  }
}
```

### Cara Kerja:
- 📦 Kontak disimpan dalam **batch 50 kontak**
- ⏳ Ada **delay 3 detik** antar batch
- 🔄 Menghindari overload database dan network spike

---

## 📝 4. Logging & Monitoring

### Tracking Scraping Activity
Setiap scraping dicatat di tabel `scraping_logs`:
- ✅ User ID & Session ID
- ✅ Total kontak yang di-scrape
- ✅ Status (in_progress, completed, failed)
- ✅ Timestamp mulai & selesai
- ✅ Error message (jika gagal)

---

## 🚀 API Endpoints

### 1. **Scrape Contacts** (dengan rate limiting)
```http
POST /api/contacts/:sessionId/scrape
```

**Response Success:**
```json
{
  "success": true,
  "message": "Contacts scraped successfully",
  "data": {
    "totalScraped": 250,
    "totalSaved": 245,
    "contacts": [...]
  }
}
```

**Response Rate Limited (429):**
```json
{
  "success": false,
  "error": "Please wait 45 minutes before scraping again. This helps prevent your account from being blocked."
}
```

---

### 2. **Check Scraping Status** (cek bisa scrape atau tidak)
```http
GET /api/contacts/:sessionId/status
```

**Response:**
```json
{
  "success": true,
  "data": {
    "canScrape": true,
    "remainingScrapesToday": 3,
    "nextAvailableAt": null
  }
}
```

**Response (Cooldown Active):**
```json
{
  "success": true,
  "data": {
    "canScrape": false,
    "reason": "Cooldown period active",
    "remainingScrapesToday": 3,
    "nextAvailableAt": "2024-01-09T12:00:00Z"
  }
}
```

---

### 3. **Get Scraping History**
```http
GET /api/contacts/history/all
```

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "userId": 1,
      "whatsappSessionId": 1,
      "totalScraped": 250,
      "status": "completed",
      "errorMessage": null,
      "startedAt": "2024-01-09T10:00:00Z",
      "completedAt": "2024-01-09T10:05:30Z"
    }
  ]
}
```

---

### 4. **Get Session Contacts**
```http
GET /api/contacts/:sessionId
```

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "userId": 1,
      "phoneNumber": "6281234567890",
      "displayName": null,
      "metadata": {
        "fromGroup": "Group Kerja",
        "jid": "6281234567890@s.whatsapp.net"
      },
      "createdAt": "2024-01-09T10:00:00Z"
    }
  ]
}
```

---

## 🎯 Best Practices

### ✅ DO (Yang Harus Dilakukan):
1. **Cek Status Sebelum Scrape**
   ```bash
   GET /api/contacts/:sessionId/status
   ```

2. **Tunggu Cooldown Period**
   - Jangan scrape terlalu sering
   - Ikuti delay yang direkomendasikan

3. **Monitor Scraping History**
   ```bash
   GET /api/contacts/history/all
   ```

4. **Scrape Saat Jam Sibuk**
   - Scrape saat jam aktif (08:00 - 22:00)
   - Hindari scraping tengah malam

5. **Gunakan Delay Natural**
   - Biarkan system menambahkan delay otomatis
   - Jangan mencoba bypass rate limit

### ❌ DON'T (Yang Harus Dihindari):
1. ❌ Scraping terlalu sering (> 5x per hari)
2. ❌ Scraping berturut-turut tanpa delay
3. ❌ Scraping ribuan kontak sekaligus
4. ❌ Bypass rate limiting
5. ❌ Scraping saat tengah malam (00:00 - 06:00)

---

## 🔧 Kustomisasi Konfigurasi

Jika ingin mengubah rate limit, edit file:
```bash
/src/shared/config/scraping.ts
```

**Contoh - Lebih Konservatif (Lebih Aman):**
```typescript
export const scrapingConfig = {
  rateLimit: {
    maxScrapesPerDay: 3,            // 3x per hari
    cooldownBetweenScrapes: 2 * 60 * 60 * 1000, // 2 jam
    maxContactsPerScrape: 300,      // 300 kontak
  },
  delays: {
    minDelayBetweenGroups: 3000,   // 3 detik
    maxDelayBetweenGroups: 8000,   // 8 detik
    batchSaveDelay: 5000,           // 5 detik
  },
};
```

**Contoh - Lebih Agresif (Lebih Berisiko):**
```typescript
export const scrapingConfig = {
  rateLimit: {
    maxScrapesPerDay: 10,           // 10x per hari
    cooldownBetweenScrapes: 30 * 60 * 1000, // 30 menit
    maxContactsPerScrape: 1000,     // 1000 kontak
  },
  delays: {
    minDelayBetweenGroups: 1000,   // 1 detik
    maxDelayBetweenGroups: 3000,   // 3 detik
    batchSaveDelay: 2000,           // 2 detik
  },
};
```

> ⚠️ **Warning**: Setting yang lebih agresif meningkatkan risiko banned!

---

## 📈 Monitoring & Troubleshooting

### Cek Log Server
```bash
cd /Applications/javascript/chatcepat-wa
npm run dev
```

Log akan menampilkan:
- 🔍 Starting contact scraping
- 📊 Found X groups to process
- 📁 Processing group: [nama group]
- ⏳ Waiting Xms before processing next group
- 💾 Saving contacts in batches
- ✅ Total saved: X contacts

### Error Messages

**1. Cooldown Active**
```
"Please wait 45 minutes before scraping again"
```
**Solusi**: Tunggu sampai cooldown selesai

**2. Daily Limit Reached**
```
"Daily scraping limit reached (5 scrapes per day)"
```
**Solusi**: Tunggu sampai hari berikutnya

**3. Session Not Active**
```
"Session is not active"
```
**Solusi**: Koneksikan ulang WhatsApp session

---

## 🎓 Tips Menghindari Banned

1. **Gunakan Nomor Lama**
   - Hindari nomor baru (< 30 hari)
   - Gunakan nomor yang sudah punya riwayat chat

2. **Verifikasi Email**
   - Pastikan nomor WhatsApp sudah verify email

3. **Aktivitas Normal**
   - Gunakan nomor untuk chat normal juga
   - Jangan hanya untuk scraping

4. **Scraping Bertahap**
   - Jangan scrape semua group sekaligus
   - Scrape beberapa group per hari

5. **Monitor Status**
   - Cek status scraping secara berkala
   - Review history untuk pattern yang mencurigakan

---

## 📞 Support

Jika mengalami masalah atau akun terkena banned:
1. Stop semua scraping activity
2. Tunggu 24-48 jam
3. Gunakan setting lebih konservatif
4. Review scraping history untuk pattern yang salah

---

## 📌 Kesimpulan

Sistem ini dirancang untuk **melindungi akun WhatsApp** dari banned dengan:
- ✅ Rate limiting otomatis
- ✅ Random delays yang natural
- ✅ Batch processing
- ✅ Monitoring & logging
- ✅ Smart cooldown system

**Selalu ikuti best practices dan jangan memaksa bypass rate limit!**
