/**
 * Drift detector — Phase 6 W19+ R3 Gap 2 closure.
 *
 * WP-side fires dinoco_sn_pool_status_changed action on every state mutation
 * (activate/swap/void/recall/transfer). OpenClaw agent has POST /webhook/sn-event
 * ready (sn-webhook.js V.1.0 R3) but until V.0.49 nothing called it — chatbot's
 * 60s sn_lookup cache stayed stale. This detector pins the listener wiring.
 */

const fs = require('fs');
const path = require('path');

const SN_REST = path.join(__dirname, '..', '..', '[System] DINOCO SN REST API');

describe('SN agent webhook fire — Phase 6 W19+ (V.0.49)', () => {
  let content;
  beforeAll(() => {
    content = fs.readFileSync(SN_REST, 'utf8');
  });

  test('listener registered on dinoco_sn_pool_status_changed @ priority 8', () => {
    expect(content).toMatch(/add_action\(\s*'dinoco_sn_pool_status_changed',\s*'dinoco_sn_fire_agent_webhook',\s*8/);
  });

  test('has_action guard prevents double-registration', () => {
    expect(content).toMatch(/has_action\(\s*'dinoco_sn_pool_status_changed',\s*'dinoco_sn_fire_agent_webhook'\s*\)/);
  });

  test('flag-gated default OFF (dinoco_sn_agent_webhook_enabled)', () => {
    expect(content).toMatch(/get_option\(\s*'dinoco_sn_agent_webhook_enabled',\s*0\s*\)/);
  });

  test('uses LIFF_AI_AGENT_KEY bearer auth + LIFF_AI_AGENT_URL base', () => {
    expect(content).toMatch(/LIFF_AI_AGENT_KEY/);
    expect(content).toMatch(/LIFF_AI_AGENT_URL/);
  });

  test('POSTs to /webhook/sn-event with non-blocking + 5s timeout', () => {
    expect(content).toMatch(/\/webhook\/sn-event/);
    expect(content).toMatch(/'blocking'\s*=>\s*false/);
    expect(content).toMatch(/'timeout'\s*=>\s*5/);
  });

  test('Throwable catch never blocks mutation paths', () => {
    expect(content).toMatch(/dinoco_sn_fire_agent_webhook[\s\S]{200,1800}catch\s*\(\s*\\Throwable\s+\$e\s*\)/);
  });

  test('Bearer header + Content-Type JSON', () => {
    expect(content).toMatch(/'Authorization'\s*=>\s*'Bearer\s*'\s*\.\s*\$key/);
    expect(content).toMatch(/'Content-Type'\s*=>\s*'application\/json'/);
  });

  test('payload includes sn + from + to + source=wp', () => {
    expect(content).toMatch(/'sn'\s*=>\s*\(string\)\s*\$sn/);
    expect(content).toMatch(/'from'\s*=>\s*\(string\)\s*\$from/);
    expect(content).toMatch(/'to'\s*=>\s*\(string\)\s*\$to/);
    expect(content).toMatch(/'source'\s*=>\s*'wp'/);
  });

  test('version header bumped to V.0.49', () => {
    expect(content).toMatch(/Version: V\.0\.49.*agent webhook fire/);
  });
});
