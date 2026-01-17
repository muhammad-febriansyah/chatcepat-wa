# 📚 Group Scraping Guide - Scrape Grup WhatsApp

## 🎯 Fitur Group Scraping

Sistem ini dapat scraping informasi detail dari semua grup WhatsApp yang Anda ikuti, termasuk:

- ✅ Nama grup
- ✅ Deskripsi grup
- ✅ Jumlah member
- ✅ Jumlah admin
- ✅ Owner grup
- ✅ Waktu pembuatan
- ✅ Status grup (announce/locked)
- ✅ Metadata tambahan

---

## 🛡️ Mekanisme Anti-Ban (Sama dengan Contact Scraping)

### Rate Limiting
```javascript
✅ Maksimal 5x scraping per hari
✅ Cooldown 1 jam antar scraping
✅ Smart delays antar group
```

### Smart Processing
```javascript
✅ Random delay 2-5 detik antar group
✅ Batch save untuk menghindari spike
✅ Natural human-like behavior
```

---

## 🚀 API Endpoints

### 1. **Scrape Groups** (dengan rate limiting)
```http
POST /api/groups/:sessionId/scrape
```

**Response Success:**
```json
{
  "success": true,
  "message": "Groups scraped successfully",
  "data": {
    "totalScraped": 25,
    "totalSaved": 25,
    "groups": [
      {
        "id": 1,
        "userId": 1,
        "whatsappSessionId": 1,
        "groupJid": "120363xxxxxx@g.us",
        "name": "Group Kerja",
        "description": "Group untuk diskusi pekerjaan",
        "ownerJid": "6281234567890@s.whatsapp.net",
        "participantsCount": 250,
        "adminsCount": 5,
        "isAnnounce": false,
        "isLocked": false,
        "metadata": {
          "size": 250,
          "creation": 1234567890,
          "inviteCode": "ABC123XYZ"
        },
        "createdAt": "2024-01-09T10:00:00Z",
        "updatedAt": "2024-01-09T10:00:00Z"
      }
    ]
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

### 2. **Get Scraped Groups**
```http
GET /api/groups/:sessionId
```

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "groupJid": "120363xxxxxx@g.us",
      "name": "Family Group",
      "description": "Our family group",
      "participantsCount": 50,
      "adminsCount": 2,
      "isAnnounce": false,
      "isLocked": false,
      "createdAt": "2024-01-09T10:00:00Z"
    },
    {
      "id": 2,
      "groupJid": "120363yyyyyy@g.us",
      "name": "Work Team",
      "description": "Work discussions",
      "participantsCount": 250,
      "adminsCount": 8,
      "isAnnounce": true,
      "isLocked": false,
      "createdAt": "2024-01-09T10:00:00Z"
    }
  ]
}
```

---

## 💡 Cara Menggunakan

### 1. Scrape Groups dari Session Aktif

**cURL:**
```bash
curl -X POST http://localhost:3000/api/groups/session-123/scrape
```

**JavaScript/Axios:**
```javascript
const response = await axios.post(
  'http://localhost:3000/api/groups/session-123/scrape'
);

console.log('Total groups:', response.data.data.totalScraped);
console.log('Groups:', response.data.data.groups);
```

**Log yang muncul di server:**
```
🔍 Starting group scraping for user 1, session session-123
📊 Found 25 groups
📁 Scraped group: Family Group (50 members)
⏳ Waiting 3521ms before processing next group...
📁 Scraped group: Work Team (250 members)
⏳ Waiting 2891ms before processing next group...
💾 Saving 25 groups in batches of 50...
✅ Total saved: 25 groups
```

---

### 2. Ambil List Groups yang Sudah Di-Scrape

**cURL:**
```bash
curl http://localhost:3000/api/groups/session-123
```

**JavaScript/Axios:**
```javascript
const response = await axios.get(
  'http://localhost:3000/api/groups/session-123'
);

const groups = response.data.data;
console.log(`Found ${groups.length} groups`);

// Filter grup besar (> 100 member)
const largeGroups = groups.filter(g => g.participantsCount > 100);
console.log(`Large groups: ${largeGroups.length}`);

// Filter grup dengan banyak admin
const groupsWithManyAdmins = groups.filter(g => g.adminsCount > 5);
console.log(`Groups with many admins: ${groupsWithManyAdmins.length}`);
```

---

## 📊 Database Schema

### Table: `whatsapp_groups`

| Column | Type | Description |
|--------|------|-------------|
| id | BIGINT | Primary key |
| user_id | BIGINT | User yang scrape |
| whatsapp_session_id | BIGINT | Session ID |
| group_jid | VARCHAR(255) | Group JID (unique) |
| name | VARCHAR(255) | Nama grup |
| description | TEXT | Deskripsi grup |
| owner_jid | VARCHAR(255) | Owner grup |
| participants_count | INT | Jumlah member |
| admins_count | INT | Jumlah admin |
| is_announce | BOOLEAN | Apakah grup announce only |
| is_locked | BOOLEAN | Apakah grup locked |
| metadata | JSON | Data tambahan |
| created_at | TIMESTAMP | Waktu dibuat |
| updated_at | TIMESTAMP | Waktu diupdate |

**Unique Constraint:**
- `(user_id, whatsapp_session_id, group_jid)`

---

## 🎯 Use Cases

### 1. **Analisis Grup**
```javascript
// Get all groups
const groups = await getSessionGroups(sessionId);

// Statistik
const stats = {
  totalGroups: groups.length,
  totalMembers: groups.reduce((sum, g) => sum + g.participantsCount, 0),
  averageMembers: Math.round(
    groups.reduce((sum, g) => sum + g.participantsCount, 0) / groups.length
  ),
  largestGroup: groups.reduce((max, g) =>
    g.participantsCount > max.participantsCount ? g : max
  ),
};

console.log('Group Statistics:', stats);
```

### 2. **Filter Grup Berdasarkan Kriteria**
```javascript
// Grup dengan > 200 member (potensial untuk broadcast)
const targetGroups = groups.filter(g => g.participantsCount > 200);

// Grup yang bukan announce only (bisa kirim message)
const activeGroups = groups.filter(g => !g.isAnnounce);

// Grup dimana user adalah admin
const adminGroups = groups.filter(g =>
  g.metadata?.userIsAdmin === true
);
```

### 3. **Export Data Grup**
```javascript
// Export ke CSV
const csv = groups.map(g =>
  `${g.name},${g.participantsCount},${g.adminsCount},${g.isAnnounce}`
).join('\n');

console.log('Group Name,Members,Admins,Announce Only');
console.log(csv);
```

---

## 🔄 Integrasi dengan Contact Scraping

Scrape groups dulu, lalu scrape contacts dari groups:

```javascript
// 1. Scrape groups
const groupsResult = await axios.post(
  'http://localhost:3000/api/groups/session-123/scrape'
);

console.log(`Scraped ${groupsResult.data.data.totalScraped} groups`);

// 2. Tunggu cooldown (1 jam)
// atau gunakan session berbeda

// 3. Scrape contacts dari groups
const contactsResult = await axios.post(
  'http://localhost:3000/api/contacts/session-123/scrape'
);

console.log(`Scraped ${contactsResult.data.data.totalScraped} contacts`);

// 4. Analisis data
const groups = groupsResult.data.data.groups;
const contacts = contactsResult.data.data.contacts;

// Mapping contacts ke groups
const groupContacts = contacts.reduce((acc, contact) => {
  const groupName = contact.metadata?.fromGroup;
  if (!acc[groupName]) acc[groupName] = [];
  acc[groupName].push(contact);
  return acc;
}, {});

console.log('Contacts per group:', groupContacts);
```

---

## ⚠️ Best Practices

### ✅ DO:
1. **Scrape Secara Berkala**
   - Scrape groups 1x per minggu untuk update data
   - Monitor perubahan member count

2. **Analisis Sebelum Action**
   - Review data grup sebelum broadcast
   - Identifikasi grup paling aktif

3. **Respect Privacy**
   - Jangan share data grup ke pihak ketiga
   - Gunakan data hanya untuk keperluan bisnis

4. **Monitor Changes**
   - Track perubahan jumlah member
   - Detect groups yang di-leave

### ❌ DON'T:
1. ❌ Scraping terlalu sering (> 5x per hari)
2. ❌ Spam ke semua grup hasil scraping
3. ❌ Share data grup tanpa izin
4. ❌ Bypass rate limiting

---

## 🔍 Troubleshooting

### Error: "Session is not active"
**Solusi:**
1. Reconnect WhatsApp session
2. Check QR code di `/api/sessions/:sessionId/qr`
3. Scan QR dengan WhatsApp mobile

### Error: "Please wait X minutes before scraping"
**Solusi:**
1. Tunggu sampai cooldown selesai
2. Check status di `/api/contacts/:sessionId/status`
3. Gunakan session berbeda jika urgent

### Groups tidak ke-detect
**Solusi:**
1. Pastikan session sudah connected
2. Pastikan ada groups di WhatsApp
3. Cek log error di console

---

## 📈 Performance Tips

### 1. Batch Processing
Groups di-save dalam batch 50 untuk efisiensi:
```javascript
// Default config
batch: {
  contactsPerBatch: 50  // berlaku untuk groups juga
}
```

### 2. Delayed Execution
Gunakan delay otomatis untuk menghindari spike:
```javascript
delays: {
  minDelayBetweenGroups: 2000,  // 2 detik
  maxDelayBetweenGroups: 5000,  // 5 detik
  batchSaveDelay: 3000           // 3 detik
}
```

### 3. Database Indexing
Database sudah dioptimasi dengan indexes:
- `idx_user_id` - Query by user
- `idx_session_id` - Query by session
- `idx_group_jid` - Lookup by JID
- `unique_user_session_group` - Prevent duplicates

---

## 🎓 Advanced Usage

### Query Complex
```sql
-- Grup dengan member terbanyak
SELECT name, participants_count
FROM whatsapp_groups
WHERE user_id = 1
ORDER BY participants_count DESC
LIMIT 10;

-- Total member dari semua grup
SELECT SUM(participants_count) as total_members
FROM whatsapp_groups
WHERE user_id = 1;

-- Grup yang announce only
SELECT name, participants_count
FROM whatsapp_groups
WHERE user_id = 1 AND is_announce = 1;

-- Grup dengan banyak admin
SELECT name, participants_count, admins_count
FROM whatsapp_groups
WHERE user_id = 1 AND admins_count > 5
ORDER BY admins_count DESC;
```

### Integration dengan CRM
```javascript
// Sync groups ke CRM
const groups = await getSessionGroups(sessionId);

for (const group of groups) {
  await crmService.createOrUpdateGroup({
    externalId: group.groupJid,
    name: group.name,
    memberCount: group.participantsCount,
    source: 'whatsapp',
    metadata: {
      adminsCount: group.adminsCount,
      isAnnounce: group.isAnnounce,
      lastSynced: new Date(),
    }
  });
}
```

---

## 📞 Summary

### Feature Comparison

| Feature | Contact Scraping | Group Scraping |
|---------|------------------|----------------|
| Rate Limit | 5x per hari | 5x per hari |
| Cooldown | 1 jam | 1 jam |
| Max per scrape | 500 contacts | Unlimited groups |
| Data saved | Phone, name, metadata | Group info, stats |
| Use case | Lead generation | Audience analysis |

### API Endpoints Summary

```bash
# Groups
POST   /api/groups/:sessionId/scrape    # Scrape groups
GET    /api/groups/:sessionId            # Get scraped groups

# Contacts (related)
POST   /api/contacts/:sessionId/scrape   # Scrape contacts
GET    /api/contacts/:sessionId          # Get scraped contacts

# Status & History (shared)
GET    /api/contacts/:sessionId/status   # Check scraping status
GET    /api/contacts/history/all         # Get scraping history
```

---

## 🎉 Kesimpulan

Fitur group scraping memungkinkan Anda untuk:
- ✅ Menganalisis semua grup yang Anda ikuti
- ✅ Mengidentifikasi grup potensial untuk broadcast
- ✅ Tracking perubahan member & admin
- ✅ Export data untuk analisis
- ✅ Integrasi dengan CRM

**Gunakan dengan bijak dan ikuti rate limiting untuk menghindari banned!**
