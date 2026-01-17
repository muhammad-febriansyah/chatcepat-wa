// 🛡️ KONFIGURASI ANTI-BAN
// Pilih salah satu profil di bawah sesuai kebutuhan

// ⭐ PROFIL AMAN (RECOMMENDED) - Untuk akun penting
// Risiko banned: < 1% | Total: 600 kontak/hari
export const scrapingConfig = {
  rateLimit: {
    maxScrapesPerDay: 3,                     // 3x per hari
    cooldownBetweenScrapes: 2 * 60 * 60 * 1000, // 2 jam
    maxContactsPerScrape: 200,               // 200 kontak per scrape
  },
  delays: {
    minDelayBetweenGroups: 5000,            // 5 detik
    maxDelayBetweenGroups: 12000,           // 12 detik (random human-like)
    batchSaveDelay: 5000,                    // 5 detik
  },
  batch: {
    contactsPerBatch: 30,                    // Save 30 kontak per batch
  },
  retry: {
    maxRetries: 3,
    retryDelay: 5000,
  },
};

// 🔹 PROFIL SEIMBANG (DEFAULT) - Untuk akun yang cukup aman
// Risiko banned: 2-5% | Total: 1,500 kontak/hari
// export const scrapingConfig = {
//   rateLimit: {
//     maxScrapesPerDay: 5,
//     cooldownBetweenScrapes: 60 * 60 * 1000, // 1 jam
//     maxContactsPerScrape: 300,
//   },
//   delays: {
//     minDelayBetweenGroups: 3000,
//     maxDelayBetweenGroups: 8000,
//     batchSaveDelay: 4000,
//   },
//   batch: {
//     contactsPerBatch: 40,
//   },
//   retry: {
//     maxRetries: 3,
//     retryDelay: 5000,
//   },
// };

// ⚠️ PROFIL AGRESIF (HIGH RISK) - HANYA untuk nomor testing/cadangan
// Risiko banned: 15-30% | Total: 4,000 kontak/hari
// export const scrapingConfig = {
//   rateLimit: {
//     maxScrapesPerDay: 8,
//     cooldownBetweenScrapes: 30 * 60 * 1000, // 30 menit
//     maxContactsPerScrape: 500,
//   },
//   delays: {
//     minDelayBetweenGroups: 2000,
//     maxDelayBetweenGroups: 5000,
//     batchSaveDelay: 3000,
//   },
//   batch: {
//     contactsPerBatch: 50,
//   },
//   retry: {
//     maxRetries: 3,
//     retryDelay: 5000,
//   },
// };
