// SPDX-License-Identifier: MIT
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';

import {normalizeDevice, normalizePairedDevice, sameDevice} from './devices.js';

const BLUEZ_NAME = 'org.bluez';
const DEVICE_IFACE = 'org.bluez.Device1';
const BATTERY_IFACE = 'org.bluez.Battery1';
const DEVICE_PROPERTIES = ['Connected', 'UUIDs', 'Alias', 'Name', 'Address', 'RSSI', 'Paired', 'Bonded'];
const CONNECT_TIMEOUT_MS = 30000;

function cached(proxy, name) {
    return proxy?.get_cached_property(name)?.deepUnpack() ?? null;
}

export const BluetoothManager = GObject.registerClass({
    Signals: {'devices-changed': {}},
}, class BluetoothManager extends GObject.Object {
    _init({connection = null} = {}) {
        super._init();
        // An injected connection lets integration tests use a private bus.
        this._connection = connection;
        this._objectManager = null;
        this._managerSignals = [];
        this._devices = new Map();
        this._snapshot = [];
        this._paired = new Map();
        this._pairedSnapshot = [];
        this._dirtyPaths = new Set();
        this._updateSource = 0;
        this._cancellable = new Gio.Cancellable();
        this._initializing = false;
        this._destroyed = false;
        this.ready = false;
        this.refresh();
    }

    destroy() {
        this._destroyed = true;
        this._cancellable.cancel();
        this._cancelUpdate();
        for (const signalId of this._managerSignals)
            this._objectManager.disconnect(signalId);
        this._managerSignals = [];
        this._devices.clear();
        this._snapshot = [];
        this._paired.clear();
        this._pairedSnapshot = [];
        this._objectManager = null;
        this._connection = null;
        this.ready = false;
    }

    refresh() {
        if (this._destroyed)
            return;
        if (this._objectManager) {
            // Rescan the existing BlueZ cache; this does not perform discovery.
            this._rescan();
            return;
        }
        if (this._initializing)
            return;
        this._initializing = true;
        const connection = this._connection;
        const callback = (_source, result) => {
            let manager;
            try {
                manager = connection
                    ? Gio.DBusObjectManagerClient.new_finish(result)
                    : Gio.DBusObjectManagerClient.new_for_bus_finish(result);
            } catch (error) {
                if (!this._destroyed && !error.matches(Gio.IOErrorEnum, Gio.IOErrorEnum.CANCELLED))
                    console.error(`Bluetooth Headset Monitor: ${error.message}`);
            }
            this._initializing = false;
            if (this._destroyed || !manager)
                return;
            this._objectManager = manager;
            this._connectManager();
            this._ownerChanged();
        };
        const args = [Gio.DBusObjectManagerClientFlags.DO_NOT_AUTO_START,
            BLUEZ_NAME, '/', null, this._cancellable, callback];
        if (connection)
            Gio.DBusObjectManagerClient.new(connection, ...args);
        else
            Gio.DBusObjectManagerClient.new_for_bus(Gio.BusType.SYSTEM, ...args);
    }

    getConnectedHeadsets() {
        // Treat this shared, already-sorted snapshot as read-only.
        return this._snapshot;
    }

    /** Paired audio devices that are not connected (read-only snapshot). */
    getPairedHeadsets() {
        return this._pairedSnapshot;
    }

    _call(path, method) {
        const proxy = this._objectManager?.get_object(path)?.get_interface(DEVICE_IFACE);
        if (!proxy)
            return Promise.reject(new Error('Device not available'));
        return new Promise((resolve, reject) => {
            proxy.call(method, null, Gio.DBusCallFlags.NONE, CONNECT_TIMEOUT_MS, this._cancellable,
                (source, result) => {
                    try {
                        source.call_finish(result);
                        resolve();
                    } catch (error) {
                        reject(error);
                    }
                });
        });
    }

    /** Ask BlueZ to connect a paired device; resolves when connected or rejects. */
    connectDevice(path) {
        return this._call(path, 'Connect');
    }

    disconnectDevice(path) {
        return this._call(path, 'Disconnect');
    }

    _connectManager() {
        const manager = this._objectManager;
        this._managerSignals = [
            manager.connect('notify::name-owner', () => this._ownerChanged()),
            manager.connect('object-added', (_, object) => this._queuePath(object.get_object_path())),
            manager.connect('object-removed', (_, object) => this._queuePath(object.get_object_path())),
            manager.connect('interface-added', (_, object, iface) => {
                if ([DEVICE_IFACE, BATTERY_IFACE].includes(iface.get_interface_name()))
                    this._queuePath(object.get_object_path());
            }),
            manager.connect('interface-removed', (_, object, iface) => {
                if ([DEVICE_IFACE, BATTERY_IFACE].includes(iface.get_interface_name()))
                    this._queuePath(object.get_object_path());
            }),
            manager.connect('interface-proxy-properties-changed', (_, object, iface, changed, invalidated) => {
                const relevant = iface.get_interface_name() === DEVICE_IFACE ? DEVICE_PROPERTIES
                    : iface.get_interface_name() === BATTERY_IFACE ? ['Percentage'] : [];
                const keys = [...Object.keys(changed.deepUnpack()), ...invalidated];
                if (keys.some(key => relevant.includes(key)))
                    this._queuePath(object.get_object_path());
            }),
        ];
    }

    _ownerChanged() {
        // Gio sets name-owner to null BEFORE synthesizing removal/addition events,
        // and restores it only after the new owner's complete snapshot is ready.
        this._cancelUpdate();
        if (!this._objectManager.get_name_owner()) {
            this.ready = false;
            this._devices.clear();
            this._snapshot = [];
            this._paired.clear();
            this._pairedSnapshot = [];
            this.emit('devices-changed');
            return;
        }
        this._rescan(true);
    }

    _queuePath(path) {
        if (this._destroyed || !this._objectManager.get_name_owner())
            return;
        this._dirtyPaths.add(path);
        if (this._updateSource)
            return;
        this._updateSource = GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
            this._updateSource = 0;
            let changed = false;
            for (const dirtyPath of this._dirtyPaths)
                changed = this._updateDevice(dirtyPath) || changed;
            this._dirtyPaths.clear();
            if (changed)
                this._publish();
            return GLib.SOURCE_REMOVE;
        });
    }

    _rescan(force = false) {
        if (!this._objectManager.get_name_owner())
            return;
        this._cancelUpdate();
        const paths = new Set(this._objectManager.get_objects().map(object => object.get_object_path()));
        let changed = force || !this.ready;
        for (const map of [this._devices, this._paired]) {
            for (const path of map.keys()) {
                if (!paths.has(path)) {
                    map.delete(path);
                    changed = true;
                }
            }
        }
        for (const path of paths)
            changed = this._updateDevice(path) || changed;
        this.ready = true;
        if (changed)
            this._publish();
    }

    _updateDevice(path) {
        const object = this._objectManager.get_object(path);
        const proxy = object?.get_interface(DEVICE_IFACE);
        const properties = Object.fromEntries(DEVICE_PROPERTIES.map(key => [key, cached(proxy, key)]));
        const device = proxy ? normalizeDevice(path, properties,
            cached(object.get_interface(BATTERY_IFACE), 'Percentage')) : null;
        const paired = proxy ? normalizePairedDevice(path, properties) : null;
        const previousPaired = this._paired.get(path);
        let pairedChanged = false;
        if (paired && previousPaired?.name !== paired.name) {
            this._paired.set(path, paired);
            pairedChanged = true;
        } else if (!paired && previousPaired) {
            this._paired.delete(path);
            pairedChanged = true;
        }
        const previous = this._devices.get(path);
        if (!device)
            return this._devices.delete(path) || pairedChanged;
        if (previous && sameDevice(previous, device))
            return pairedChanged;
        this._devices.set(path, device);
        return true;
    }

    _publish() {
        const byName = (left, right) =>
            (left.name ?? '').localeCompare(right.name ?? '') || left.path.localeCompare(right.path);
        this._snapshot = [...this._devices.values()].sort(byName);
        this._pairedSnapshot = [...this._paired.values()].sort(byName);
        this.emit('devices-changed');
    }

    _cancelUpdate() {
        if (this._updateSource)
            GLib.Source.remove(this._updateSource);
        this._updateSource = 0;
        this._dirtyPaths.clear();
    }
});
