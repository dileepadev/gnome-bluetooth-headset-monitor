// SPDX-License-Identifier: MIT
import assert from 'node:assert/strict';
import {connectionErrorReason, normalizePairedDevice, panelBattery} from '../devices.js';

const uuid = short => `0000${short}-0000-1000-8000-00805f9b34fb`;
const paired = {Connected: false, Paired: true, Alias: 'Buds', UUIDs: [uuid('110b')]};
assert.deepEqual(normalizePairedDevice('/buds', paired), {path: '/buds', name: 'Buds'});
assert.deepEqual(normalizePairedDevice('/buds', {...paired, Paired: false, Bonded: true}), {path: '/buds', name: 'Buds'});
assert.equal(normalizePairedDevice('/buds', {...paired, Connected: true}), null, 'Connected devices are listed elsewhere');
assert.equal(normalizePairedDevice('/buds', {...paired, Paired: false}), null, 'Unpaired devices are not offered');
assert.equal(normalizePairedDevice('/mouse', {...paired, UUIDs: [uuid('1124')]}), null, 'Only audio devices');
assert.equal(normalizePairedDevice('/x', {...paired, UUIDs: null}), null);
assert.equal(normalizePairedDevice('/x', {...paired, Alias: '', Name: null}).name, null);

const devices = [{name: 'A', battery: 80}, {name: 'B', battery: null}, {name: 'C', battery: 12}];
assert.deepEqual(panelBattery(devices, 15), {percent: 12, low: true, device: devices[2]});
assert.equal(panelBattery(devices.slice(0, 1), 15).low, false);
assert.equal(panelBattery([{battery: 15}], 15).low, true, 'At the threshold counts as low');
assert.equal(panelBattery([{battery: null}], 15), null);
assert.equal(panelBattery([], 15), null);

assert.equal(connectionErrorReason(new Error('GDBus.Error:org.bluez.Error.NotReady: Resource Not Ready')), 'off');
assert.equal(connectionErrorReason(new Error('GDBus.Error:org.bluez.Error.InProgress: In Progress')), 'busy');
assert.equal(connectionErrorReason(new Error('GDBus.Error:org.bluez.Error.Failed: br-connection-page-timeout')), 'unreachable');
assert.equal(connectionErrorReason(new Error('GDBus.Error:org.bluez.Error.AlreadyConnected: Already Connected')), 'connected');
assert.equal(connectionErrorReason(new Error('something else')), 'failed');
assert.equal(connectionErrorReason(null), 'failed');
console.log('Paired devices, panel battery, and connection error reasons passed');
