# DINOCO System Upgrade Guide

> สิ่งที่ต้องทำบน Server / WordPress เพื่อ activate modules ใหม่

---

## สรุป: อะไรต้องลง อะไรไม่ต้อง

| Module | ต้องลงปลั๊กอิน? | ต้องทำบน Server? | ค่าใช้จ่าย |
|--------|----------------|-----------------|-----------|
| Snippet 13: Debt Transaction | ❌ ไม่ต้อง | ❌ ไม่ต้อง | ฟรี |
| Snippet 14: State Machine | ❌ ไม่ต้อง | ❌ ไม่ต้อง | ฟรี |
| Snippet 15: Custom Tables + JWT | ❌ ไม่ต้อง | ❌ ไม่ต้อง (auto-migrate) | ฟรี |
| AI Provider Abstraction | ❌ ไม่ต้อง | ❌ ไม่ต้อง | ฟรี |
| Cron → WP-CLI | ❌ ไม่ต้อง | ✅ ตั้ง crontab | ฟรี |
| Frontend → Vite/Tailwind | ✅ ลง Node.js บนเครื่อง dev | ❌ ไม่ต้อง (build แล้ว upload) | ฟรี |
| Print → WebSocket | ❌ ไม่ต้อง | ✅ ลง Pusher SDK บน RPi | ฟรี (free tier) |

---

## 1. Deploy Snippets ใหม่ (ทำใน WordPress)

### ขั้นตอน:
1. ไปที่ WordPress Admin → **Code Snippets** → **Add New**
2. สร้าง snippet ใหม่ 4 ตัว:

| ไฟล์ | ชื่อ Snippet | ลำดับ Priority |
|------|------------|---------------|
| `[B2B] Snippet 13: Debt Transaction Manager` | B2B Debt Transaction | **1** (ก่อน Snippet 2) |
| `[B2B] Snippet 14: Order State Machine` | B2B Order FSM | **1** (ก่อน Snippet 2) |
| `[B2B] Snippet 15: Custom Tables & JWT Session` | B2B Custom Tables & JWT | **1** (ก่อน Snippet 3) |
| `[Admin System] AI Provider Abstraction` | AI Provider Layer | **5** (ก่อน AI Control) |

3. Copy code จากแต่ละไฟล์ → paste ใน snippet → **Save & Activate**
4. ตาราง `dinoco_products` จะถูกสร้างอัตโนมัติเมื่อ activate
5. ข้อมูลจาก `dinoco_product_catalog` (wp_options) จะถูก migrate อัตโนมัติ

---

## 2. Server Cron (Bangmod Cloud)

### ✅ มีอยู่แล้ว — ไม่ต้องทำอะไรเพิ่ม

Bangmod Cloud ตั้ง cron ไว้แล้ว:
```
*/5 * * * *  curl -s -o /dev/null "https://dinoco.in.th/wp-cron.php?doing_wp_cron"
```

ทำงานทุก 5 นาที — เพียงพอสำหรับทุก cron job ในระบบ

### แนะนำ: เพิ่ม DISABLE_WP_CRON

เพิ่มใน `wp-config.php` เพื่อป้องกัน pseudo-cron ทำงานซ้ำกับ server cron:
```php
define('DISABLE_WP_CRON', true);
```

---

## 3. Frontend Build Step (Vite + Tailwind)

### เมื่อไหร่ต้องทำ:
- ทำเมื่อต้องการ **แยก CSS/JS ออกจาก PHP** (phase 2)
- ตอนนี้ inline CSS ยังใช้ได้ ไม่ urgent

### ต้องลงบนเครื่อง Dev (ไม่ใช่ Server):

```bash
# ลง Node.js (ถ้ายังไม่มี)
# macOS:
brew install node

# หรือดาวน์โหลดจาก https://nodejs.org/

# ตรวจสอบ
node -v  # ≥18.0
npm -v   # ≥9.0
```

### Setup Project:

```bash
cd /path/to/dinoco-project

# Init package.json
npm init -y

# ลง Vite + Tailwind
npm install -D vite tailwindcss @tailwindcss/vite

# สร้าง vite.config.js
cat > vite.config.js << 'EOF'
import { defineConfig } from 'vite'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [tailwindcss()],
  build: {
    outDir: 'dist',
    rollupOptions: {
      input: {
        main: 'src/css/main.css',
        b2c: 'src/js/b2c.js',
        b2b: 'src/js/b2b.js',
      },
      output: {
        entryFileNames: 'js/[name].js',
        assetFileNames: 'css/[name].[ext]',
      }
    }
  }
})
EOF

# สร้าง Tailwind config
cat > tailwind.config.js << 'EOF'
export default {
  content: ['./**/*.php', './src/**/*.js'],
  theme: {
    extend: {
      colors: {
        'dnc-green': '#06C755',
        'dnc-gold': '#c0a062',
        'dnc-dark': '#1a1a1a',
      },
      fontFamily: {
        'thai': ['Noto Sans Thai', 'Prompt', 'sans-serif'],
      }
    }
  }
}
EOF
```

### Workflow:
```bash
# Dev mode (hot reload)
npx vite

# Build for production
npx vite build

# Upload dist/ folder to server
```

---

## 4. Print System → WebSocket (Pusher)

### เมื่อไหร่ต้องทำ:
- ทำเมื่อต้องการ **real-time printing** แทน polling ทุก 10 วินาที
- ตอนนี้ polling ยังใช้ได้ ไม่ urgent

### ลงทะเบียน Pusher (ฟรี):

1. ไปที่ https://pusher.com → Sign up → Create app
2. เลือก: **Channels** → cluster: `ap1` (Asia Pacific)
3. จด credentials:
   - App ID
   - Key
   - Secret
   - Cluster

### เพิ่มใน wp-config.php:
```php
define('DINOCO_PUSHER_APP_ID', 'your_app_id');
define('DINOCO_PUSHER_KEY', 'your_key');
define('DINOCO_PUSHER_SECRET', 'your_secret');
define('DINOCO_PUSHER_CLUSTER', 'ap1');
```

### แก้ RPi Print Client:

ลง Pusher Python SDK บน Raspberry Pi:
```bash
pip install pusher pysher
```

แก้ `print_client.py` ให้ listen event แทน polling:
```python
import pysher

pusher = pysher.Pusher('YOUR_KEY', cluster='ap1')

def connect_handler(data):
    channel = pusher.subscribe('dinoco-print')
    channel.bind('new-job', handle_print_job)

pusher.connection.bind('pusher:connection_established', connect_handler)
pusher.connect()
```

### แก้ WordPress (Snippet 3):

ตอน queue print job เปลี่ยนจาก save meta → trigger Pusher event:
```php
// แทนที่ update_post_meta($id, 'print_status', 'queued')
// เพิ่ม:
$pusher_url = 'https://api-' . DINOCO_PUSHER_CLUSTER . '.pusher.com/apps/' . DINOCO_PUSHER_APP_ID . '/events';
wp_remote_post($pusher_url, [
    'headers' => ['Content-Type' => 'application/json'],
    'body' => json_encode([
        'name' => 'new-job',
        'channel' => 'dinoco-print',
        'data' => json_encode(['job_id' => $id, 'type' => 'invoice']),
    ]),
]);
```

---

## 5. AI Provider — เปลี่ยน Model

### เปลี่ยน provider:

เพิ่ม/แก้ใน `wp-config.php`:

```php
// เลือก 1 ใน 3:
define('DINOCO_AI_PROVIDER', 'gemini');   // default — ใช้ Gemini อยู่แล้ว
// define('DINOCO_AI_PROVIDER', 'openai');  // ถ้าจะใช้ GPT-4o
// define('DINOCO_AI_PROVIDER', 'claude');  // ถ้าจะใช้ Claude

// API keys (ใส่เฉพาะ provider ที่ใช้):
define('DINOCO_GEMINI_KEY', 'xxx');       // มีอยู่แล้ว
// define('DINOCO_OPENAI_KEY', 'sk-xxx'); // ถ้าใช้ OpenAI
// define('DINOCO_CLAUDE_KEY', 'sk-xxx'); // ถ้าใช้ Claude
```

### การใช้งานใน code:

```php
// แทนที่ direct Gemini API call ด้วย:
$result = DINOCO_AI::chat(
    'คุณคือผู้ช่วย DINOCO...',        // system prompt
    [['role'=>'user', 'text'=>$msg]], // messages
    $function_tools,                  // function calling tools
    ['temperature' => 0.35]           // options
);

if ($result['success']) {
    $reply = $result['text'];
    $tool_calls = $result['tool_calls'];
}
```

---

## 6. Walk-in Distributor Feature (V.39.0)

### What's New
- ร้านตัวแทนหน้าโกดัง (Walk-in) สั่งของได้เหมือนเดิม แต่ **ข้ามเช็คสต็อก** + **ข้ามจัดส่ง** (auto-complete หลังจ่ายเงิน)
- เพิ่ม toggle `is_walkin` บน distributor CPT
- Order ที่สั่งจากร้าน Walk-in จะมี stamp `_b2b_is_walkin=1`
- ระบบเครดิต/หนี้/สลิปชำระ ทำงานเหมือนเดิม 100%

### How to Enable
1. ไปที่ **Admin Dashboard** → **B2B Admin Control** → เลือก distributor
2. เปิด toggle **"Walk-in (ร้านหน้าโกดัง)"**
3. เสร็จ -- ระบบจะ auto-detect เมื่อร้านนี้สั่งของ

### What Changes for Walk-in Orders
| ขั้นตอน | ปกติ | Walk-in |
|---------|------|---------|
| สั่งของ (draft) | เหมือนกัน | เหมือนกัน |
| ลูกค้ายืนยัน | → `checking_stock` | → `awaiting_confirm` (ข้ามเช็คสต็อก) |
| ยืนยันบิล | เหมือนกัน | เหมือนกัน |
| จ่ายเงิน | → `paid` → เลือกวิธีส่ง | → `paid` → **auto `completed`** (ข้ามจัดส่ง) |

### No Migration Needed
- ไม่ต้องสร้างตาราง/ฟิลด์ใหม่ — ACF field + post meta เท่านั้น
- ไม่ต้องแก้ wp-config.php
- Snippets อัพเดทผ่าน GitHub Sync ปกติ

### Files Changed
| File | Version | Change |
|------|---------|--------|
| **Snippet 1**: Core Utilities | V.39.0 | เพิ่ม `b2b_is_walkin_order()` helper |
| **Snippet 2**: Webhook Gateway | V.39.0 | เพิ่ม `b2b_walkin_auto_complete()` hook + skip stock check logic |
| **Snippet 9**: Admin Control | V.39.0 | เพิ่ม Walk-in toggle + badge ใน distributor management |
| **Snippet 14**: Order State Machine | V.39.0 | เพิ่ม `draft→awaiting_confirm` (system) + `paid→completed` เปลี่ยนเป็น `any` |

---

## Checklist สรุป

- [x] Deploy Snippet 13 (Debt Transaction) ใน WordPress Code Snippets ✅ 2026-03-27
- [x] Deploy Snippet 14 (State Machine) ใน WordPress Code Snippets ✅ 2026-03-27
- [x] Deploy Snippet 15 (Custom Tables + JWT) ใน WordPress Code Snippets ✅ 2026-03-27
- [x] Deploy AI Provider Abstraction ใน WordPress Code Snippets ✅ 2026-03-27
- [x] เพิ่ม `DISABLE_WP_CRON` ใน wp-config.php ✅ 2026-03-27
- [x] Server Cron — Bangmod Cloud มี crontab อยู่แล้ว (ทุก 5 นาที) ✅
- [x] ลง Node.js + Vite + Tailwind บนเครื่อง dev ✅ 2026-03-27
- [x] ลงทะเบียน Pusher + แก้ RPi client ✅ 2026-03-27 (WebSocket connected)
- [x] Walk-in Distributor Feature (V.39.0) — toggle + auto-complete flow ✅ 2026-04-02
