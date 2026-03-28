---
name: Always update .md docs after code changes
description: ทุกครั้งที่แก้ code เสร็จ ต้องอัพเดท .md ที่เกี่ยวข้องทันที ไม่ต้องให้ user บอก
type: feedback
---

ทุกครั้งที่แก้ code เสร็จ ต้องอัพเดท .md docs ที่เกี่ยวข้องทันทีโดยไม่ต้องให้ user บอก

**Why:** User ต้องคอยเตือนหลายครั้งว่า "อัพเดท .md ด้วย" — ไม่ควรต้องเตือน

**How to apply:** หลัง commit code fix ทุกครั้ง ตรวจว่า WORKFLOW-MAP.md, SYSTEM-ARCHITECTURE.md, DATA-MODEL.md, SYSTEM-DIAGRAMS.md, USER-JOURNEYS.md ต้องอัพเดทหรือไม่ ถ้าเกี่ยวข้อง → อัพเดทแล้ว commit พร้อมกัน หรือ commit ต่อทันที
