# Phase 6 LT-3 — Implementation Plan (staging-first)

[← LT-3 mega spec](./PHASE-6-LT-3-DINOCO-HOME-V2-AND-ECOMMERCE-WIDGET.md) · [← Specs index](./)

> **Status**: PLAN · Boss directive 2026-05-18: "วางแผนเป็น plan.md มา แยก staging ก่อน เช่น staging.dinoco.in.th"
> **Effort estimate**: ~8 weeks (revised post-pivot) · ~340-400 dev hours
> **Production target**: TBD (boss กำหนดวัน — minimum 8 wks ของ dev + 1 wk soft launch)
> **Pre-req**: VAT compliance ครบก่อน (boss decision A 2026-05-18)

---

## 1. Strategy — Staging-first deploy

### 1.1 Why staging-first

- Boss can preview ทุกอย่างก่อน customer เห็น
- DNS cutover ไม่ใช่ launch day risk (DNS = pre-staged)
- Bugs caught บน staging ก่อน production data exposure
- Customer support ไม่ confused ระหว่าง dev

### 1.2 Environments matrix

| Environment | URL | Purpose | Data |
|---|---|---|---|
| **Dev (local)** | `localhost:3000` | Developer machines + Vite HMR | Mock data |
| **Staging** | `staging.dinoco.in.th` | Boss preview + UAT + load test | Read-only replica ของ production WP |
| **Production** | `dinoco.in.th` | Live customers | Live WP backend |

### 1.3 Data flow

```
[Customer browser] → Vercel Edge (Next.js SSR/ISR)
                         ↓
                    [WP REST API at dinoco.in.th/wp-json/]
                         ↓
                    [WP MySQL]

Staging same flow but Vercel preview deploy + same WP backend
(read endpoints) + sandbox/dummy write endpoints
```

**Important**: staging shares production WP **read endpoints** (catalog, dealers, models, content) but has **dummy write paths** (lead-coord posts to test queue, not real openclawminicrm)

---

## 2. Phasing (8 weeks)

### Phase LT-3.1 — Foundation + Staging Setup (Week 1-2)

**Goals**:
- Vercel account + project setup
- DNS: `staging.dinoco.in.th` CNAME → Vercel
- Next.js 14 App Router scaffold
- Tailwind + design tokens (reuse `liff-src/b2b/catalog/tokens.css`)
- LINE OAuth callback route (Next.js)
- WP REST proxy route (avoid CORS)
- TypeScript strict + ESLint + Prettier
- i18n setup (next-intl, th/en/zh)

**Deliverables**:
- `https://staging.dinoco.in.th` accessible (blank Next.js + DINOCO logo)
- LINE Login working (callback → WP user sync)
- Reverse proxy: `staging.dinoco.in.th/wp-json/*` → production WP backend

**Effort**: 80 hours
**Boss involvement**: ~1 hour (review staging URL + LINE login test)

---

### Phase LT-3.2 — Home Page Content (Week 3-4)

**Goals**:
- Home V2 sections per spec §6 (hero, featured products, models, brand story, testimonials, dealer locator, warranty check, LINE OA prompt)
- Mobile-first responsive
- Performance: LCP < 2.5s on 3G
- Accessibility WCAG 2.1 AA
- i18n complete (th/en/zh)

**Deliverables**:
- `staging.dinoco.in.th/` = complete home
- All sections functional (some with mock data — featured curation pending admin tool)
- Lighthouse score ≥ 90 mobile

**Effort**: 80 hours
**Boss involvement**: ~2-3 hours (UI review iterations)

---

### Phase LT-3.3 — Catalog + Product Detail (Week 5)

**Goals**:
- `/shop` landing with filters
- `/shop/category/{slug}` + `/shop/model/{slug}`
- `/product/{sku}` detail page
- Related products
- "ติดต่อตัวแทน" CTA buttons (UI only — backend in 3.4)

**Deliverables**:
- Browse → product detail → contact button visible
- Search + filter functional
- SEO meta tags + structured data

**Effort**: 60 hours
**Boss involvement**: ~1 hour

---

### Phase LT-3.4 — Lead-Gen Flow (Week 6)

**Goals**:
- Contact form modal spec §19.2 (9 fields + PDPA consent)
- `POST /wp-json/dinoco-leads/v1/dealer-coord` endpoint
- openclawminicrm integration `/api/leads/dealer-coord`
- Dealer matching algorithm (region + product carry + load balance)
- LINE Flex push (dealer + customer per §19.5)
- Lead status flow (8 states)
- Admin source filter `dinoco_home_v2`

**Deliverables**:
- End-to-end: customer clicks "ติดต่อตัวแทน" → form → submit → dealer LINE → customer LINE
- Working on staging with test dealers + test customer LINE

**Effort**: 60 hours
**Boss involvement**: ~2 hours (test flow + verify LINE Flex appearance)

---

### Phase LT-3.5 — Widget v1 (Week 7)

**Goals**:
- Embed code `<script src=...embed.js>` per spec §7.2
- Shadow DOM rendering
- Grid mode UI
- `GET /dinoco-widget/v1/embed/{dealer_id}/config`
- `GET /dinoco-widget/v1/products`
- Sample partner site (samples/partner-site.html)
- Dealer application form `/become-a-dealer`
- Admin approval workflow

**Deliverables**:
- Widget embeddable on sample partner site
- Dealer can apply + get approved + receive embed code

**Effort**: 80 hours
**Boss involvement**: ~1-2 hours (review widget look + dealer approval flow)

---

### Phase LT-3.6 — Tracking Widget + Polish (Week 8)

**Goals**:
- "🚚 ติดตามพัสดุ" section บน home (spec §19.7)
- Reuse existing `b2b/v1/flash-tracking` REST
- Final SEO audit + sitemap + robots.txt
- Performance audit (Web Vitals)
- Security audit (CSP + CORS)
- Cross-browser test (Chrome/Safari/Firefox/iOS/Android)
- Load test (k6 — simulate 100 concurrent users)

**Deliverables**:
- All staging features green
- Soft-launch ready
- Documentation complete

**Effort**: 40 hours
**Boss involvement**: ~3 hours (final review + sign-off)

---

### Phase LT-3.7 — Production Cutover (1 week buffer)

**Pre-cutover checklist** (boss sign-off):
- [ ] All staging tests pass
- [ ] Customer support team trained
- [ ] LINE OA bot ready for new flex push volume
- [ ] Sentry + monitoring active
- [ ] DNS TTL pre-lowered to 60s (24h before cutover)
- [ ] Backup current dinoco.in.th (full DINOCO COMMAND v6.8)
- [ ] Rollback plan documented + tested

**Cutover day (Sunday 02:00 ICT recommended)**:
1. Update DNS: `dinoco.in.th` A record → Vercel IP
2. Wait DNS propagation ~10 min (TTL 60s)
3. Smoke test 5 critical flows (home load + product browse + contact dealer + warranty check + LINE login)
4. Monitor Sentry + LINE OA quota next 24 hr
5. Customer-facing announcement (LINE OA broadcast + Facebook post)

**Rollback (ถ้าต้อง)**:
- DNS revert (60s TTL → ~10 min recovery)
- Old WordPress theme ยังอยู่ — fall back instant
- Postmortem next 24 hr

---

## 3. Risk register

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Vercel cost spike from traffic | Medium | Medium | Monitor weekly + cache-heavy strategy + set alert ฿X/day |
| LINE OA quota burn (Flex push) | Medium | High | Rate limit lead-coord 5/hr/IP + dedupe Flex per dealer 1-hr window |
| openclawminicrm overload | Low | High | Async queue + retry + circuit breaker |
| DNS cutover issue | Low | Critical | TTL pre-lower 24h + tested rollback + Sunday low-traffic window |
| Stale WP REST cache | Medium | Medium | Aggressive Next.js ISR revalidate + Vercel edge cache strategy |
| LINE login session lost cross-tab | Low | Medium | httpOnly cookie + 30-day rolling refresh |
| Customer confusion (new UI) | High | Low | LINE OA announcement + tutorial video + support ready |

---

## 4. Boss decision checkpoints (binding)

| Checkpoint | Question | When |
|---|---|---|
| **C1** | LT-3.1 kickoff approval — start dev? | Before Week 1 |
| **C2** | Hero section design (video / SVG / carousel) — choose | Week 2 |
| **C3** | Featured products manual curation — admin tool location (new snippet vs extend Inventory) | Week 3 |
| **C4** | LINE Flex templates approved (dealer + customer) — visual sign-off | Week 6 |
| **C5** | Dealer application form fields — approved | Week 7 |
| **C6** | Production cutover go/no-go | Week 8 end |
| **C7** | Sunday 02:00 ICT cutover datetime — confirm | 1 wk before C6 approval |

---

## 5. Out of scope (NOT in LT-3)

- ❌ E-commerce checkout (cut per boss 2026-05-18)
- ❌ Slip2GO payment integration on home
- ❌ Dealer mobile app (cut)
- ❌ Affiliate program (defer to LT-4)
- ❌ Commission ledger (cut with checkout)
- ❌ AI product recommendation (LT-4 candidate)
- ❌ Multi-vendor marketplace (boss controls catalog 100%)
- ❌ Real-time stock sync to widget (5-min cache enough Phase 1)

---

## 6. Dependencies (must complete BEFORE LT-3 kickoff)

| Dep | Status | Owner | Blocking? |
|---|---|---|---|
| F#8 Marketplace VAT compliance | 🟡 In progress (Step 1 constants done, Step 3-4 receipt + Flex + export TODO) | Me | Soft — only blocking if home links to marketplace from day 1 |
| Sentry activation | ⏳ Boss test in progress | Boss | No — can launch LT-3 without Sentry |
| SN notifications flag | ✅ Boss flipped today | Boss | No |
| DINOCO Inventory V.47.0 verified | ✅ Today | Boss | No |
| openclawminicrm has `/api/leads/dealer-coord` endpoint | ❌ Not implemented | openclaw dev | **Yes — blocks LT-3.4** |
| Tax info constants in production | 🟡 Snippet written, boss needs to paste | Boss | Only if marketplace launches with LT-3 |

---

## 7. Cost estimate

| Item | Cost (THB/mo) | Notes |
|---|---|---|
| Vercel Hobby plan | 0 | Free tier covers staging + initial launch |
| Vercel Pro (after launch) | ฿700/mo | If exceeds Hobby limits — assume Month 3+ |
| Domain `staging.dinoco.in.th` | 0 | Subdomain existing |
| LINE OA push quota (Premium upgrade) | ฿1,500/mo | Already paid (per CLAUDE.md) |
| Total Year 1 (estimated) | **฿8,400** | After Vercel free tier exhausted |

vs Original spec (with checkout): would add Stripe fees, dealer commission lookup overhead, payment infra hosting

---

## 8. Success criteria (post-launch 90 days)

| Metric | Target | Critical? |
|---|---|---|
| Monthly unique visitors | 15,000 | No |
| LINE Login conversion | 8% of visitors | No |
| "ติดต่อตัวแทน" form submit rate | 3% of visitors | **Yes** (primary KPI) |
| Dealer response time (avg) | < 2 hr | Yes |
| Lead → closed_won conversion | 10% | Yes |
| Lighthouse score mobile | ≥ 90 | Yes |
| LCP | ≤ 2.5s | Yes |
| Customer complaints (UI/UX) | < 10 in first 30 days | Yes |
| Bug reports critical | 0 | **Yes** |

---

## 9. Rollback plan (anytime in 90 days post-launch)

If critical issues:

1. **DNS rollback** (immediate, <10 min): point `dinoco.in.th` back to old WordPress theme
2. **WordPress theme reactivate**: same files preserved during launch
3. **LINE Flex announcement**: notify dealers + customers of temporary revert
4. **Postmortem**: 48-hour root cause analysis
5. **Re-launch criteria**: bug fixed + tested on staging + new go/no-go boss approval

---

## 10. Next actions (this week)

| Action | Owner | Deadline |
|---|---|---|
| Boss approves LT-3.1 kickoff (C1) | Boss | TBD |
| Boss decides cutover datetime (C7) | Boss | -1 wk from C6 |
| Provision Vercel account | Me / Boss | After C1 |
| Set up DNS `staging.dinoco.in.th` CNAME | Boss (hosting access) | Week 1 |
| Coordinate openclawminicrm dev for `/api/leads/dealer-coord` | Both | Week 4 |
| Boss approve 10 Q-LT-3-* design questions OR use defaults | Boss | Before Week 2 |

---

## 11. Related files

- [`PHASE-6-LT-3-DINOCO-HOME-V2-AND-ECOMMERCE-WIDGET.md`](./PHASE-6-LT-3-DINOCO-HOME-V2-AND-ECOMMERCE-WIDGET.md) — Mega spec (1700+ lines, includes §19 NEW Dealer Handoff Flow post-pivot)
- [`docs/runbooks/VAT-ACTIVATION-BOSS-GUIDE.md`](../runbooks/VAT-ACTIVATION-BOSS-GUIDE.md) — VAT compliance prerequisite
- [`docs/compliance/GDPR-PHASE-6-BOSS-DECISIONS.md`](../compliance/GDPR-PHASE-6-BOSS-DECISIONS.md) — privacy policy bindings
- `docs/sn-system/34-phase6-backlog-tracker.md` — Phase 6 status

## Sign-off

- Boss approval LT-3.1 kickoff: __________________ Date: __________
- Boss approval production cutover: __________________ Date: __________
