import assert from 'node:assert/strict';
import test from 'node:test';

import { createDiscoverySosStack } from './discovery-sos-stack-harness.ts';

test('real-stack discovery checkpoint: verified facility, distance ordering, capacity freshness, and list fallback (AC-01..04)', async () => {
  const stack = await createDiscoverySosStack();
  try {
    // 1. Proximity search in English (en-EG)
    const enResponse = await stack.app.inject({
      method: 'GET',
      url: '/v1/discovery/facilities?type=hospital&near=30.1005,31.2005&radius=25000',
      headers: { 'accept-language': 'en-EG' },
    });
    assert.equal(enResponse.statusCode, 200, enResponse.body);
    const enBody = enResponse.json();
    assert.ok(Array.isArray(enBody.data));
    assert.equal(enBody.data.length, 3); // Nearest fresh, farther fresh, and stale hospital

    // Confirm deterministic distance ordering
    const [h1, h2, h3] = enBody.data;
    assert.equal(h1.facility_id, stack.ids.facilities.nearestFreshHospital);
    assert.equal(h1.facility_type, 'hospital');
    assert.equal(h1.name, 'Synthetic Hospital A');
    assert.deepEqual(h1.services, ['emergency_care', 'general_hospital']);
    assert.deepEqual(h1.rating_summary, { count: 0, average: null, state: 'unavailable' });
    assert.equal(h1.operational_signal.signal, 'available');
    assert.equal(h1.operational_signal.count_band, 'five_to_nine');
    assert.equal(h1.operational_signal.freshness, 'fresh');
    assert.ok(h1.distance_m > 0);

    assert.equal(h2.facility_id, stack.ids.facilities.fartherFreshHospital);
    assert.equal(h2.name, 'Synthetic Hospital B');
    assert.equal(h2.operational_signal.signal, 'limited');
    assert.equal(h2.operational_signal.count_band, 'one_to_four');
    assert.equal(h2.operational_signal.freshness, 'fresh');
    assert.ok(h2.distance_m > h1.distance_m);

    assert.equal(h3.facility_id, stack.ids.facilities.staleHospital);
    assert.equal(h3.name, 'Synthetic Stale Hospital');
    assert.equal(h3.operational_signal.freshness, 'stale');
    assert.equal(h3.operational_signal.count_band, 'one_to_four');
    assert.ok(h3.distance_m > h2.distance_m);

    // Confirm suspended and unlicensed facilities are excluded
    const facilityIds = enBody.data.map((f: { facility_id: string }) => f.facility_id);
    assert.ok(!facilityIds.includes(stack.ids.facilities.suspendedHospital));
    assert.ok(!facilityIds.includes(stack.ids.facilities.unlicensedHospital));

    // 2. Proximity search in Arabic (ar-EG)
    const arResponse = await stack.app.inject({
      method: 'GET',
      url: '/v1/discovery/facilities?type=hospital&near=30.1005,31.2005&radius=25000',
      headers: { 'accept-language': 'ar-EG' },
    });
    assert.equal(arResponse.statusCode, 200, arResponse.body);
    const arBody = arResponse.json();
    assert.equal(arBody.data[0].name, 'مستشفى اصطناعي ألف');
    assert.equal(arResponse.headers['content-language'], 'ar-EG');

    // 3. Location-denied / Manual area search fallback (without coordinates)
    const areaResponse = await stack.app.inject({
      method: 'GET',
      url: '/v1/discovery/facilities?area=Synthetic%20Cairo',
      headers: { 'accept-language': 'en-EG' },
    });
    assert.equal(areaResponse.statusCode, 200, areaResponse.body);
    const areaBody = areaResponse.json();
    assert.ok(areaBody.data.length >= 3);
    for (const facility of areaBody.data) {
      assert.equal(facility.distance_m, null); // List fallback has no distance calculation
    }

    // 4. Pagination / cursor behavior
    const pageOne = await stack.app.inject({
      method: 'GET',
      url: '/v1/discovery/facilities?type=hospital&near=30.1005,31.2005&radius=25000&limit=1',
      headers: { 'accept-language': 'en-EG' },
    });
    assert.equal(pageOne.statusCode, 200, pageOne.body);
    const pageOneBody = pageOne.json();
    assert.equal(pageOneBody.data.length, 1);
    assert.equal(pageOneBody.data[0].facility_id, stack.ids.facilities.nearestFreshHospital);
    assert.ok(pageOneBody.meta.next_cursor);

    const pageTwo = await stack.app.inject({
      method: 'GET',
      url: `/v1/discovery/facilities?type=hospital&near=30.1005,31.2005&radius=25000&limit=1&cursor=${pageOneBody.meta.next_cursor}`,
      headers: { 'accept-language': 'en-EG' },
    });
    assert.equal(pageTwo.statusCode, 200, pageTwo.body);
    const pageTwoBody = pageTwo.json();
    assert.equal(pageTwoBody.data.length, 1);
    assert.equal(pageTwoBody.data[0].facility_id, stack.ids.facilities.fartherFreshHospital);

    // 5. Aggregate capacity endpoint
    const freshCap = await stack.app.inject({
      method: 'GET',
      url: `/v1/discovery/hospitals/${stack.ids.facilities.nearestFreshHospital}/capacity`,
    });
    assert.equal(freshCap.statusCode, 200, freshCap.body);
    assert.deepEqual(freshCap.json(), {
      facility_id: stack.ids.facilities.nearestFreshHospital,
      capacity: {
        signal: 'available',
        count_band: 'five_to_nine',
        freshness: 'fresh',
        observed_at: freshCap.json().capacity.observed_at,
        fresh_until: freshCap.json().capacity.fresh_until,
      },
    });

    const staleCap = await stack.app.inject({
      method: 'GET',
      url: `/v1/discovery/hospitals/${stack.ids.facilities.staleHospital}/capacity`,
    });
    assert.equal(staleCap.statusCode, 200, staleCap.body);
    assert.equal(staleCap.json().capacity.freshness, 'stale');
    assert.equal(staleCap.json().capacity.count_band, 'one_to_four');

    // 6. Capacity queries for non-hospital / unlicensed return 404
    const clinicCap = await stack.app.inject({
      method: 'GET',
      url: `/v1/discovery/hospitals/${stack.ids.facilities.activeClinic}/capacity`,
    });
    assert.equal(clinicCap.statusCode, 404);

    const unlicensedCap = await stack.app.inject({
      method: 'GET',
      url: `/v1/discovery/hospitals/${stack.ids.facilities.unlicensedHospital}/capacity`,
    });
    assert.equal(unlicensedCap.statusCode, 404);

    // 7. Assert absence of bed reservation / ambulance dispatch wording
    const allDiscoveryText =
      JSON.stringify(enBody) + JSON.stringify(arBody) + JSON.stringify(freshCap.json());
    assert.doesNotMatch(allDiscoveryText, /bed.?reserv|ambulance.?dispatch|guaranteed.?bed/i);
    assert.doesNotMatch(allDiscoveryText, /available_count|emergency_available_count/i);

    // 8. Assert search coordinates were not persisted in database
    const [incidents] = await stack.owner<any[]>`select count(*)::int from platform.sos_incidents`;
    assert.equal(incidents.count, 0);
  } finally {
    await stack.close();
  }
});
