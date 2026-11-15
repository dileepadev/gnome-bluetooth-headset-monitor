// SPDX-License-Identifier: MIT
// Headsets often report their battery a few seconds after connecting (for
// example over the hands-free profile), and the delay varies per connection.
// Wait up to this long for it; notify as soon as it arrives.
export const BATTERY_WAIT_MS = 8000;
// If the battery arrives after the "connected" notification was shown, update
// that notification in place for this long instead of showing a new one.
export const LATE_BATTERY_WINDOW_MS = 60000;

// The runtime owns the timers and notification API; this class owns their policy.
export class NotificationPolicy {
    constructor({schedule, cancel, notify}) {
        this._schedule = schedule;
        this._cancel = cancel;
        this._notify = notify;
        this._devices = new Map();
        this._pending = new Map();
        this._awaitingBattery = new Map(); // path -> timer id ending the update window
        this._initialized = false;
        this._enabled = false;
        this._destroyed = false;
    }

    update(devices, {ready, notifications, threshold}) {
        if (this._destroyed)
            return;

        this._enabled = notifications;
        if (!ready) {
            this._cancelAll();
            // Retain warning history across service loss. Recovery establishes
            // a fresh connection baseline without repeating an existing warning.
            this._initialized = false;
            return;
        }
        if (!notifications)
            this._cancelAll();

        const next = new Map();
        for (const device of devices) {
            if (device.battery !== null && notifications) {
                // The battery arrived while the connection notification waited:
                // notify now, with the battery.
                if (this._pending.has(device.path)) {
                    this._cancelPending(device.path);
                    this._notify('connected', device);
                } else if (this._awaitingBattery.has(device.path)) {
                    // It arrived after the notification: update that notification.
                    this._cancelAwaiting(device.path);
                    this._notify('battery-update', device);
                }
            }
            const previous = this._devices.get(device.path);
            let warned = previous?.warned ?? false;
            // Missing battery information does not rearm a warning.
            if (device.battery !== null && device.battery > threshold)
                warned = false;
            if (notifications && device.battery !== null && device.battery <= threshold && !warned) {
                this._notify('low-battery', device);
                warned = true;
            }
            next.set(device.path, {...device, warned});
        }

        for (const [path, previous] of this._devices) {
            if (next.has(path))
                continue;
            this._cancelPending(path);
            this._cancelAwaiting(path);
            if (this._initialized && notifications)
                this._notify('disconnected', previous);
        }

        const previousDevices = this._devices;
        this._devices = next;
        if (this._initialized && notifications) {
            for (const device of devices) {
                if (previousDevices.has(device.path))
                    continue;
                if (device.battery !== null)
                    this._notify('connected', device);
                else
                    this._deferConnection(device.path);
            }
        }
        this._initialized = true;
    }

    destroy() {
        this._destroyed = true;
        this._cancelAll();
        this._devices.clear();
    }

    _deferConnection(path) {
        this._cancelPending(path);
        const pending = {id: null};
        this._pending.set(path, pending);
        pending.id = this._schedule(BATTERY_WAIT_MS, () => {
            if (this._pending.get(path) !== pending)
                return;
            this._pending.delete(path);
            const device = this._devices.get(path);
            if (this._destroyed || !this._enabled || !device)
                return;
            this._notify('connected', device);
            if (device.battery === null)
                this._awaitBattery(path);
        });
    }

    _awaitBattery(path) {
        this._cancelAwaiting(path);
        const awaiting = {id: null};
        this._awaitingBattery.set(path, awaiting);
        awaiting.id = this._schedule(LATE_BATTERY_WINDOW_MS, () => {
            if (this._awaitingBattery.get(path) === awaiting)
                this._awaitingBattery.delete(path);
        });
    }

    _cancelAwaiting(path) {
        const awaiting = this._awaitingBattery.get(path);
        if (!awaiting)
            return;
        this._awaitingBattery.delete(path);
        this._cancel(awaiting.id);
    }

    _cancelPending(path) {
        const pending = this._pending.get(path);
        if (!pending)
            return;
        this._pending.delete(path);
        this._cancel(pending.id);
    }

    _cancelAll() {
        for (const path of [...this._pending.keys()])
            this._cancelPending(path);
        for (const path of [...this._awaitingBattery.keys()])
            this._cancelAwaiting(path);
    }
}
