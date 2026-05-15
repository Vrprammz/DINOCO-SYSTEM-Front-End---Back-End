/**
 * Drift detector — Phase 6 W19+ F#13 Geographic Heatmap Leaflet wiring.
 *
 * Pins the Leaflet 1.9.4 CDN lazy-load contract in SN Manager Tab 8 so future
 * refactors don't accidentally regress back to the "Phase 4 W12 wires" stub.
 */

const fs = require('fs');
const path = require('path');

const SN_MANAGER = path.join(__dirname, '..', '..', '[Admin System] DINOCO Production SN Manager');

describe('SN Geo Heatmap — Leaflet wiring (V.0.61)', () => {
  let content;
  beforeAll(() => {
    content = fs.readFileSync(SN_MANAGER, 'utf8');
  });

  test('placeholder div has stable id for JS toggle', () => {
    expect(content).toMatch(/id="dnc-sn-geo-map-placeholder"/);
  });

  test('placeholder no longer says "Phase 4 W12 wires" in HTML', () => {
    // The old static placeholder text was the proxy "not done" indicator.
    // Render path now flips display via JS — replace text must change.
    const placeholderBlock = content.match(/id="dnc-sn-geo-map-placeholder"[\s\S]{0,400}/);
    expect(placeholderBlock).toBeTruthy();
    expect(placeholderBlock[0]).not.toMatch(/Phase 4 W12 wires/);
  });

  test('Leaflet 1.9.4 pinned to unpkg CDN (CSS + JS)', () => {
    expect(content).toMatch(/unpkg\.com\/leaflet@1\.9\.4\/dist\/leaflet\.css/);
    expect(content).toMatch(/unpkg\.com\/leaflet@1\.9\.4\/dist\/leaflet\.js/);
  });

  test('lazy-load promise + load-in-flight guard', () => {
    expect(content).toMatch(/window\.dncSnLoadLeaflet\s*=\s*function/);
    expect(content).toMatch(/_dncSnLeafletLoading/);
    expect(content).toMatch(/_dncSnLeafletLoaded/);
  });

  test('map renderer + marker layer + drill-down link', () => {
    expect(content).toMatch(/window\.dncSnGeoRenderMap\s*=\s*function/);
    expect(content).toMatch(/_dncSnGeoMarkerLayer/);
    expect(content).toMatch(/L\.circleMarker/);
    expect(content).toMatch(/dncSnGeoDrillDown/);
  });

  test('Thailand-centered initial view + OSM tiles', () => {
    expect(content).toMatch(/\[13\.7563,\s*100\.5018\]/);
    expect(content).toMatch(/tile\.openstreetmap\.org/);
  });

  test('gray-market markers use red #dc2626', () => {
    expect(content).toMatch(/isGray.*'#dc2626'/s);
  });

  test('invalidateSize called on subsequent loads to handle tab-switch', () => {
    expect(content).toMatch(/invalidateSize/);
  });

  test('renderer invoked after data fetch succeeds', () => {
    expect(content).toMatch(/window\.dncSnGeoRenderMap\(data\.rows\)/);
  });

  test('version header bumped to V.0.61', () => {
    expect(content).toMatch(/Version: V\.0\.61.*Leaflet map wire/);
  });
});
