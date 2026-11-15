// SPDX-License-Identifier: MIT
// Bluetooth service capabilities, not the currently negotiated audio profile.
const AUDIO_PROFILES = new Map([
    ['00001108-0000-1000-8000-00805f9b34fb', 'HSP'],
    ['0000110b-0000-1000-8000-00805f9b34fb', 'A2DP'],
    ['0000111e-0000-1000-8000-00805f9b34fb', 'HFP'],
]);

function textOrNull(value) {
    return typeof value === 'string' && value.trim() ? value : null;
}

export function normalizeDevice(path, properties, battery) {
    if (properties.Connected !== true)
        return null;

    const uuids = Array.isArray(properties.UUIDs)
        ? new Set(properties.UUIDs.filter(uuid => typeof uuid === 'string').map(uuid => uuid.toLowerCase()))
        : new Set();
    const profiles = [...AUDIO_PROFILES].filter(([uuid]) => uuids.has(uuid)).map(([, label]) => label);
    if (profiles.length === 0)
        return null;

    const address = textOrNull(properties.Address);
    return {
        path,
        name: textOrNull(properties.Alias) ?? textOrNull(properties.Name),
        address,
        battery: Number.isInteger(battery) && battery >= 0 && battery <= 100 ? battery : null,
        profiles: profiles.join(', '),
        rssi: Number.isInteger(properties.RSSI) && properties.RSSI >= -127 && properties.RSSI <= 20
            ? properties.RSSI : null,
    };
}

export function sameDevice(left, right) {
    return left?.path === right?.path && left?.name === right?.name &&
        left?.address === right?.address && left?.battery === right?.battery &&
        left?.profiles === right?.profiles && left?.rssi === right?.rssi;
}

/**
 * A paired audio device that is not connected (shown with a Connect action),
 * or null. Uses the same audio-service filter as connected headsets.
 */
export function normalizePairedDevice(path, properties) {
    if (properties.Connected === true || (properties.Paired !== true && properties.Bonded !== true))
        return null;
    const uuids = Array.isArray(properties.UUIDs)
        ? new Set(properties.UUIDs.filter(uuid => typeof uuid === 'string').map(uuid => uuid.toLowerCase()))
        : new Set();
    if (![...AUDIO_PROFILES.keys()].some(uuid => uuids.has(uuid)))
        return null;
    return {path, name: textOrNull(properties.Alias) ?? textOrNull(properties.Name)};
}

/**
 * What the panel shows next to the icon: the lowest known battery among
 * connected headsets (the one that needs charging first), or null.
 */
export function panelBattery(devices, threshold) {
    const known = devices.filter(device => device.battery !== null);
    if (!known.length)
        return null;
    const lowest = known.reduce((low, device) => device.battery < low.battery ? device : low);
    return {percent: lowest.battery, low: lowest.battery <= threshold, device: lowest};
}

/** Short reason for a failed BlueZ Connect/Disconnect call. */
export function connectionErrorReason(error) {
    const name = error?.message ?? '';
    if (/NotReady|org\.bluez\.Error\.Failed: Not Powered|Powered/i.test(name))
        return 'off';
    if (/InProgress/.test(name))
        return 'busy';
    if (/PageTimeout|Timeout|HostDown|ConnectionAttemptFailed|not available|NoReply|br-connection-page-timeout/i.test(name))
        return 'unreachable';
    if (/AlreadyConnected/.test(name))
        return 'connected';
    return 'failed';
}
