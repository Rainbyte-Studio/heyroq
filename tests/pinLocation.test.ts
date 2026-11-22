import assert from 'node:assert/strict';
import { test } from 'node:test';
import { identifyPinLocation, pinPositionDiffers } from '../src/services/pinLocation';

const point = { lat: 37.9715, lng: 23.7257 };

test('map location identification preserves coordinates and uses only real place names', async t => {
  let placeId = '';
  let fields: string[] = [];
  let geocodes = 0;
  const originalGoogle = globalThis.google;
  class Place {
    displayName = 'Acropolis Museum';
    formattedAddress = '15 Dionysiou Areopagitou';
    constructor({ id }: { id: string }) { placeId = id; }
    async fetchFields(request: { fields: string[] }) {
      fields = request.fields;
      if (placeId === 'denied') throw new Error('REQUEST_DENIED');
    }
  }
  class Geocoder {
    geocode(request: { location: typeof point }, callback: (results: unknown[], status: string) => void) {
      assert.deepEqual(request.location, point);
      geocodes++;
      callback([{ formatted_address: 'Athens, Greece' }], 'OK');
    }
  }
  Object.assign(globalThis, {
    google: { maps: { importLibrary: async (name: string) => name === 'places' ? { Place } : { Geocoder } } },
  });
  t.after(() => Object.assign(globalThis, { google: originalGoogle }));

  assert.deepEqual(await identifyPinLocation(point, 'google-poi'), {
    ...point, locationName: 'Acropolis Museum', address: '15 Dionysiou Areopagitou',
  });
  assert.equal(placeId, 'google-poi');
  assert.deepEqual(fields, ['displayName', 'formattedAddress']);
  assert.equal(geocodes, 0);
  for (const id of [undefined, 'denied']) {
    assert.deepEqual(await identifyPinLocation(point, id), {
      ...point, locationName: '', address: 'Athens, Greece',
    });
  }
  assert.equal(geocodes, 2);
  Object.assign(globalThis, { google: undefined });
  assert.deepEqual(await identifyPinLocation(point), { ...point, locationName: '' });
});

test('position conflicts ignore Places rounding but distinguish different locations', () => {
  assert.equal(pinPositionDiffers(point, { ...point, lat: point.lat + 0.0000004 }), false);
  assert.equal(pinPositionDiffers(point, { ...point, lng: point.lng + 0.002 }), true);
});
