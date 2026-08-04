/* extension.js
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 2 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 *
 * SPDX-License-Identifier: MIT
 */
import GLib from 'gi://GLib';
import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import {BluetoothManager} from './bluetoothManager.js';
import {HeadsetPanelIndicator} from './ui/panelIndicator.js';

export default class BluetoothHeadsetMonitorExtension extends Extension {
    enable() {
        this._settings = this.getSettings();
        this._bluetoothManager = new BluetoothManager();
        const extensionPath = this.dir?.get_path?.() ?? this.path;
        this._indicator = new HeadsetPanelIndicator(
            this._bluetoothManager,
            this._settings,
            extensionPath
        );
        this._snapshot = new Map();
        this._pendingNotifications = new Map();
        this._initialized = false;
        this._devicesChangedId = this._bluetoothManager.connect('devices-changed', () => {
            this._handleDevicesChanged();
        });
        this._thresholdChangedId = this._settings.connect('changed::battery-warning-threshold', () => {
            this._handleDevicesChanged();
        });

        Main.panel.addToStatusArea(this.uuid, this._indicator, 0, 'right');
        this._handleDevicesChanged();
    }

    disable() {
        if (this._devicesChangedId) {
            this._bluetoothManager?.disconnect(this._devicesChangedId);
            this._devicesChangedId = 0;
        }

        if (this._thresholdChangedId) {
            this._settings?.disconnect(this._thresholdChangedId);
            this._thresholdChangedId = 0;
        }

        this._snapshot.clear();

        for (const timerId of this._pendingNotifications.values())
            GLib.Source.remove(timerId);
        this._pendingNotifications.clear();

        this._indicator?.destroy();
        this._indicator = null;

        this._bluetoothManager?.destroy();
        this._bluetoothManager = null;

        this._settings = null;
        this._initialized = false;
    }

    _handleDevicesChanged() {
        const devices = this._bluetoothManager.getConnectedHeadsets();
        const currentSnapshot = new Map();

        for (const device of devices) {
            const previous = this._snapshot.get(device.path);
            let lowBatteryNotified = previous?.lowBatteryNotified ?? false;

            if (this._initialized && !previous)
                this._notifyConnection(device);

            if (this._shouldNotifyLowBattery(device, lowBatteryNotified)) {
                this._notifyLowBattery(device);
                lowBatteryNotified = true;
            } else if (device.battery === null || device.battery > this._settings.get_int('battery-warning-threshold')) {
                lowBatteryNotified = false;
            }

            currentSnapshot.set(device.path, {
                battery: device.battery,
                lowBatteryNotified,
                name: device.name,
            });
        }

        if (this._initialized) {
            for (const [path, previous] of this._snapshot) {
                if (!currentSnapshot.has(path))
                    this._notifyDisconnection(previous.name);
            }
        }

        this._snapshot = currentSnapshot;
        this._initialized = true;
    }

    _shouldNotifyLowBattery(device, lowBatteryNotified) {
        if (!this._settings.get_boolean('show-notifications'))
            return false;

        if (device.battery === null || lowBatteryNotified)
            return false;

        return device.battery <= this._settings.get_int('battery-warning-threshold');
    }

    _notifyConnection(device) {
        if (!this._settings.get_boolean('show-notifications'))
            return;

        // Battery1 may not be populated yet; defer briefly to get accurate level
        if (device.battery === null) {
            const timerId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 1500, () => {
                this._pendingNotifications.delete(device.path);
                if (this._bluetoothManager.getDeviceName(device.path) === null)
                    return GLib.SOURCE_REMOVE;
                const battery = this._bluetoothManager.getDeviceBattery(device.path);
                const detail = battery === null
                    ? 'Battery: Unknown'
                    : `Battery: ${battery}%`;
                Main.notify(`${device.name} connected`, detail);
                return GLib.SOURCE_REMOVE;
            });
            this._pendingNotifications.set(device.path, timerId);
            return;
        }

        Main.notify(`${device.name} connected`, `Battery: ${device.battery}%`);
    }

    _notifyDisconnection(name) {
        if (!this._settings.get_boolean('show-notifications'))
            return;

        Main.notify(`${name} disconnected`);
    }

    _notifyLowBattery(device) {
        Main.notify(`${device.name} battery low`, `${device.battery}% remaining`);
    }
}
