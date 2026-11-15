// SPDX-License-Identifier: MIT
import assert from 'node:assert/strict';
import {normalizeDevice, sameDevice} from '../devices.js';

const uuid = short => `0000${short}-0000-1000-8000-00805f9b34fb`;
const properties = {Connected: true, Alias: 'Headset', Address: '00:11:22:33:44:55', UUIDs: [uuid('110b')]};
const device = (extra = {}, battery = 50) => normalizeDevice('/headset', {...properties, ...extra}, battery);
assert.equal(device().profiles, 'A2DP');
assert.equal(device({Connected: false}), null);
assert.equal(device({Connected: 'true'}), null);
for (const UUIDs of [null, 'invalid', [], [null, 42], [uuid('110e')]])
    assert.equal(device({UUIDs}), null, 'Only supported headset/audio service UUIDs qualify');
assert.equal(device({UUIDs: [uuid('111e').toUpperCase(), uuid('110b'), uuid('110b')]}).profiles, 'A2DP, HFP');
for (const battery of [null, undefined, '50', -1, 101, 1.5, NaN, Infinity])
    assert.equal(normalizeDevice('/headset', properties, battery).battery, null);
for (const battery of [0, 1, 100])
    assert.equal(device({}, battery).battery, battery);
assert.equal(device({Alias: '', Name: 'Fallback'}).name, 'Fallback');
assert.equal(device({Alias: null}).name, null, 'Address stays opt-in even when a device has no name');
assert.equal(device({Alias: null, Address: null}).name, null);
for (const RSSI of [NaN, Infinity, -128, 21, '10', null])
    assert.equal(device({RSSI}).rssi, null);
assert.equal(device({RSSI: -65}).rssi, -65);
assert(sameDevice(device(), device()));
assert(!sameDevice(device(), device({}, 49)));
assert(!sameDevice(device(), device({Alias: 'Renamed'})));
assert(!sameDevice(device(), device({RSSI: -50})));
console.log('Device filtering, normalization, and change detection passed');
