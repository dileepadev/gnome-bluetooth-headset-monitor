// SPDX-License-Identifier: MIT

import GLib from 'gi://GLib';
import {Extension, gettext as _} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as MessageTray from 'resource:///org/gnome/shell/ui/messageTray.js';

import {BluetoothManager} from './bluetoothManager.js';
import {NotificationPolicy} from './notificationPolicy.js';
import {HeadsetPanelIndicator} from './ui/panelIndicator.js';

export default class BluetoothHeadsetMonitorExtension extends Extension {
    enable() {
        try {
            this._settings = this.getSettings();
            this._bluetoothManager = new BluetoothManager();
            this._notifications = new NotificationPolicy({
                schedule: (delay, callback) => GLib.timeout_add(GLib.PRIORITY_DEFAULT, delay, () => {
                    callback();
                    return GLib.SOURCE_REMOVE;
                }),
                cancel: sourceId => GLib.Source.remove(sourceId),
                notify: (event, device) => this._notify(event, device),
            });
            this._indicator = new HeadsetPanelIndicator(this._bluetoothManager, this._settings);
            this._devicesChangedId = this._bluetoothManager.connect('devices-changed', () => this._syncNotifications());
            this._settingsChangedIds = ['battery-warning-threshold', 'show-notifications'].map(key =>
                this._settings.connect(`changed::${key}`, () => this._syncNotifications()));
            Main.panel.addToStatusArea(this.uuid, this._indicator, 0, 'right');
            this._syncNotifications();
        } catch (error) {
            this.disable();
            throw error;
        }
    }

    disable() {
        for (const [notification, signalId] of this._connectionNotifications?.values() ?? [])
            notification.disconnect(signalId);
        this._connectionNotifications = null;
        if (this._devicesChangedId)
            this._bluetoothManager.disconnect(this._devicesChangedId);
        this._devicesChangedId = 0;
        for (const signalId of this._settingsChangedIds ?? [])
            this._settings.disconnect(signalId);
        this._settingsChangedIds = [];
        this._notifications?.destroy();
        this._notifications = null;
        this._indicator?.destroy();
        this._indicator = null;
        this._bluetoothManager?.destroy();
        this._bluetoothManager = null;
        this._settings = null;
    }

    _syncNotifications() {
        this._notifications.update(this._bluetoothManager.getConnectedHeadsets(), {
            ready: this._bluetoothManager.ready,
            notifications: this._settings.get_boolean('show-notifications'),
            threshold: this._settings.get_int('battery-warning-threshold'),
        });
    }

    _notify(event, device) {
        const name = device.name ?? _('Unknown device');
        const battery = device.battery === null ? _('Battery: Unknown')
            : _('Battery: %d%%').format(device.battery);
        if (event === 'connected') {
            this._notifyConnected(device.path, _('%s connected').format(name), battery);
        } else if (event === 'battery-update') {
            // The battery arrived after the notification: update it in place.
            const [notification] = this._connectionNotifications?.get(device.path) ?? [];
            if (notification)
                notification.body = battery;
        } else if (event === 'disconnected')
            Main.notify(_('%s disconnected').format(name));
        else if (event === 'low-battery')
            Main.notify(_('%s battery low').format(name), _('%d%% remaining').format(device.battery));
    }

    _notifyConnected(path, title, body) {
        // Same as Main.notify(), but keeps the notification so a battery reading
        // that arrives later can update it instead of adding a second popup.
        const source = MessageTray.getSystemSource();
        const notification = new MessageTray.Notification({source, title, body, isTransient: true});
        this._connectionNotifications ??= new Map();
        const previous = this._connectionNotifications.get(path);
        if (previous)
            previous[0].disconnect(previous[1]);
        const signalId = notification.connect('destroy', () => {
            if (this._connectionNotifications?.get(path)?.[0] === notification)
                this._connectionNotifications.delete(path);
        });
        this._connectionNotifications.set(path, [notification, signalId]);
        source.addNotification(notification);
    }
}
