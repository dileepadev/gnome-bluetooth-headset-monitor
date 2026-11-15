// SPDX-License-Identifier: MIT
import assert from 'node:assert/strict';
import {BATTERY_WAIT_MS, LATE_BATTERY_WINDOW_MS, NotificationPolicy} from '../notificationPolicy.js';

function fixture() {
    let nextId = 0;
    const timers = new Map();
    const delays = [];
    const messages = [];
    const policy = new NotificationPolicy({
        schedule: (delay, callback) => { timers.set(++nextId, callback); delays.push(delay); return nextId; },
        cancel: id => timers.delete(id),
        notify: (event, device) => messages.push({event, ...device}),
    });
    const update = (devices, options = {}) => policy.update(devices,
        {ready: true, notifications: true, threshold: 15, ...options});
    const flush = () => {
        for (const [id, callback] of [...timers]) { timers.delete(id); callback(); }
    };
    return {policy, timers, delays, messages, update, flush};
}
const headset = (battery = null, name = 'Headset', path = '/a') => ({path, name, battery});
{
    const f = fixture();
    f.update([headset(50)]);
    assert.equal(f.messages.length, 0, 'Existing startup connection stays quiet');
    f.update([], {ready: false});
    f.update([headset(50)]);
    assert.equal(f.messages.length, 0, 'Service restart establishes a quiet new baseline');
    f.update([]);
    assert.equal(f.messages.at(-1).event, 'disconnected');
}
{
    const f = fixture();
    f.update([]);
    f.update([headset()]);
    const staleCallback = [...f.timers.values()][0];
    f.update([]);
    assert.equal(f.timers.size, 0, 'Disconnect cancels pending notification');
    f.update([headset()]);
    assert.equal(f.timers.size, 1, 'Reconnect owns one new timer');
    staleCallback();
    assert.equal(f.timers.size, 1, 'A stale callback cannot delete the replacement timer');
    f.update([headset(42, 'Renamed')]);
    f.flush();
    assert.equal(f.messages.at(-1).event, 'connected');
    assert.equal(f.messages.at(-1).name, 'Renamed');
    assert.equal(f.messages.at(-1).battery, 42);
}
for (const cause of ['mute', 'service-loss', 'destroy']) {
    const f = fixture();
    f.update([]);
    f.update([headset()]);
    const late = [...f.timers.values()][0];
    if (cause === 'mute') f.update([headset()], {notifications: false});
    if (cause === 'service-loss') f.update([], {ready: false});
    if (cause === 'destroy') f.policy.destroy();
    assert.equal(f.timers.size, 0, cause);
    late();
    assert.equal(f.messages.length, 0, cause);
}
{
    const f = fixture();
    f.update([headset(15)]);
    assert.equal(f.messages.length, 1, 'Low battery is reported at startup and at threshold');
    f.update([headset(null)]);
    f.update([headset(0)]);
    assert.equal(f.messages.length, 1, 'Missing readings do not rearm a warning');
    f.update([], {ready: false});
    f.update([headset(0)]);
    assert.equal(f.messages.length, 1, 'Service recovery does not repeat an existing battery warning');
    f.update([headset(16)]);
    f.update([headset(15)]);
    assert.equal(f.messages.length, 2, 'Recovery above threshold rearms');
    f.update([headset(15)], {threshold: 10});
    f.update([headset(15)], {threshold: 20});
    assert.equal(f.messages.length, 3, 'Threshold changes follow the same rearming policy');
}
{
    const f = fixture();
    f.update([headset(10)], {notifications: false});
    assert.equal(f.messages.length, 0);
    f.update([headset(10)]);
    assert.equal(f.messages[0].event, 'low-battery', 'Unreported low battery is delivered when unmuted');
    f.update([headset(10), headset(null, 'Second', '/b')]);
    f.policy.destroy();
    f.policy.destroy();
    f.update([]);
    assert.equal(f.timers.size, 0);
}
// A battery that arrives while waiting is included right away.
{
    const f = fixture();
    f.update([]);
    f.update([headset()]);
    assert.equal(f.messages.length, 0, 'Connection without a battery waits');
    assert.equal(f.delays.at(-1), BATTERY_WAIT_MS);
    f.update([headset(90)]);
    assert.deepEqual(f.messages.map(m => [m.event, m.battery]), [['connected', 90]], 'Notified as soon as the battery arrives');
    assert.equal(f.timers.size, 0, 'The wait is cancelled');
    f.update([headset(89)]);
    assert.equal(f.messages.length, 1, 'Later battery changes do not notify again');
}
// A battery that arrives after the notification updates it in place, once.
{
    const f = fixture();
    f.update([]);
    f.update([headset()]);
    f.flush();
    assert.deepEqual(f.messages.map(m => [m.event, m.battery]), [['connected', null]]);
    assert.equal(f.delays.at(-1), LATE_BATTERY_WINDOW_MS, 'A late-battery window follows');
    f.update([headset()]);
    f.update([headset(90)]);
    assert.deepEqual(f.messages.map(m => [m.event, m.battery]), [['connected', null], ['battery-update', 90]]);
    assert.equal(f.timers.size, 0);
    f.update([headset(80)]);
    assert.equal(f.messages.length, 2, 'Only the first reading updates the notification');
}
// After the window, or after a disconnect, a late battery changes nothing.
for (const cause of ['window', 'disconnect', 'mute']) {
    const f = fixture();
    f.update([]);
    f.update([headset()]);
    f.flush();
    if (cause === 'window')
        f.flush();
    if (cause === 'disconnect') {
        f.update([]);
        f.update([headset()]);
        f.timers.clear();
    }
    if (cause === 'mute')
        f.update([headset()], {notifications: false});
    const before = f.messages.length;
    f.update([headset(70)]);
    assert.equal(f.messages.filter(m => m.event === 'battery-update').length, 0, cause);
    assert.ok(f.messages.length >= before, cause);
}
console.log('Notification startup/recovery, reconnects, cancellation, preferences, battery policy, waiting for a late battery, and in-place battery updates passed');
