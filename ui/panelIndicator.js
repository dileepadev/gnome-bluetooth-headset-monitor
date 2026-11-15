// SPDX-License-Identifier: MIT
import GObject from 'gi://GObject';
import Clutter from 'gi://Clutter';
import Shell from 'gi://Shell';
import St from 'gi://St';

import {gettext as _} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

import {connectionErrorReason, panelBattery} from '../devices.js';
import {DeviceMenuItem} from './deviceMenuItem.js';

export const HeadsetPanelIndicator = GObject.registerClass(
class HeadsetPanelIndicator extends PanelMenu.Button {
    _init(bluetoothManager, settings) {
        super._init(0.0, _('Bluetooth Headset Monitor'));
        this.add_style_class_name('bluetooth-headset-monitor-indicator');
        this._bluetoothManager = bluetoothManager;
        this._settings = settings;
        this._rows = new Map();
        // The theme's headset icon (Yaru and Adwaita both provide it), so the
        // indicator matches the rest of the top bar and nothing is bundled.
        this._icon = new St.Icon({icon_name: 'audio-headset-symbolic', style_class: 'system-status-icon'});
        // Same structure as GNOME's own status indicators and AppIndicator icons:
        // inside panel-status-indicators-box, themes drop the extra horizontal
        // padding they give a bare system-status-icon.
        const iconBox = new St.BoxLayout({style_class: 'panel-status-indicators-box'});
        iconBox.add_child(this._icon);
        this._batteryLabel = new St.Label({
            style_class: 'bluetooth-headset-monitor-panel-battery',
            y_align: Clutter.ActorAlign.CENTER,
            visible: false,
        });
        iconBox.add_child(this._batteryLabel);
        this.add_child(iconBox);
        this._pending = new Map(); // path -> 'connect' | 'disconnect'

        const header = new PopupMenu.PopupMenuItem(_('Bluetooth Headset Monitor'), {
            reactive: false, can_focus: false,
        });
        header.label.add_style_class_name('bluetooth-headset-monitor-menu-header');
        this.menu.addMenuItem(header);
        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
        this._deviceSection = new PopupMenu.PopupMenuSection();
        this.menu.addMenuItem(this._deviceSection);
        this._connectionSection = new PopupMenu.PopupMenuSection();
        this.menu.addMenuItem(this._connectionSection);
        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
        this.menu.addAction(_('Open Bluetooth Settings'), () => this._openSettings());
        this.menu.addAction(_('Refresh cached devices'), () => this._bluetoothManager.refresh());

        this._managerSignalId = bluetoothManager.connect('devices-changed', () => this.refresh());
        this._settingsSignalIds = ['show-device-address', 'show-rssi', 'show-battery-in-panel',
            'show-when-disconnected', 'battery-warning-threshold'].map(key =>
            settings.connect(`changed::${key}`, () => this.refresh()));
        this.refresh();
    }

    destroy() {
        if (this._managerSignalId)
            this._bluetoothManager.disconnect(this._managerSignalId);
        this._managerSignalId = 0;
        for (const signalId of this._settingsSignalIds.splice(0))
            this._settings.disconnect(signalId);
        this._rows.clear();
        super.destroy();
        this._bluetoothManager = null;
        this._settings = null;
    }

    refresh() {
        const devices = this._bluetoothManager.getConnectedHeadsets();
        const paired = this._bluetoothManager.getPairedHeadsets();
        const showDisconnected = this._settings.get_boolean('show-when-disconnected');
        this.visible = devices.length > 0 || (showDisconnected && paired.length > 0);
        this._icon.opacity = devices.length > 0 ? 255 : 128;
        this._updatePanelBattery(devices);
        this._updateConnections(devices, paired);
        const paths = new Set(devices.map(device => device.path));
        for (const [path, row] of this._rows) {
            if (!paths.has(path)) {
                row.destroy();
                this._rows.delete(path);
            }
        }
        const options = {
            showAddress: this._settings.get_boolean('show-device-address'),
            showRssi: this._settings.get_boolean('show-rssi'),
        };
        devices.forEach((device, index) => {
            let row = this._rows.get(device.path);
            if (!row) {
                row = new DeviceMenuItem(device, options);
                this._rows.set(device.path, row);
                this._deviceSection.addMenuItem(row);
            } else {
                row.updateDevice(device, options);
            }
            if (this._deviceSection.box.get_child_at_index(index) !== row)
                this._deviceSection.box.set_child_at_index(row, index);
        });
    }

    _updatePanelBattery(devices) {
        const battery = this._settings.get_boolean('show-battery-in-panel')
            ? panelBattery(devices, this._settings.get_int('battery-warning-threshold')) : null;
        this._batteryLabel.visible = battery !== null;
        if (battery) {
            this._batteryLabel.text = `${battery.percent}%`;
            this._batteryLabel[battery.low ? 'add_style_class_name' : 'remove_style_class_name']('low');
        }
        // Translators: accessible name of the panel button with battery levels.
        const levels = devices.filter(device => device.battery !== null)
            .map(device => `${device.name ?? _('Unknown device')} ${device.battery}%`).join(', ');
        this.accessible_name = levels ? `${_('Bluetooth Headset Monitor')}: ${levels}` : _('Bluetooth Headset Monitor');
    }

    _updateConnections(devices, paired) {
        // Rebuild only when the items change, so keyboard focus survives the
        // frequent property updates (battery, signal) BlueZ sends.
        const key = JSON.stringify([...devices.map(device => [device.path, device.name, 'disconnect']),
            ...paired.map(device => [device.path, device.name, 'connect']), [...this._pending]]);
        if (key === this._connectionsKey)
            return;
        this._connectionsKey = key;
        this._connectionSection.removeAll();
        const add = (device, action) => {
            const name = device.name ?? _('Unknown device');
            const pending = this._pending.get(device.path);
            const label = pending === 'connect' ? _('Connecting to %s…').format(name)
                : pending === 'disconnect' ? _('Disconnecting %s…').format(name)
                    : action === 'connect' ? _('Connect %s').format(name) : _('Disconnect %s').format(name);
            const item = new PopupMenu.PopupImageMenuItem(label,
                action === 'connect' ? 'bluetooth-active-symbolic' : 'bluetooth-disconnected-symbolic');
            item.setSensitive(!pending);
            item.connect('activate', () => this._toggleConnection(device, action));
            this._connectionSection.addMenuItem(item);
        };
        for (const device of devices)
            add(device, 'disconnect');
        for (const device of paired)
            add(device, 'connect');
    }

    async _toggleConnection(device, action) {
        if (this._pending.has(device.path))
            return;
        this._pending.set(device.path, action);
        this.refresh();
        const name = device.name ?? _('Unknown device');
        try {
            if (action === 'connect')
                await this._bluetoothManager.connectDevice(device.path);
            else
                await this._bluetoothManager.disconnectDevice(device.path);
        } catch (error) {
            if (!this._bluetoothManager)
                return; // Destroyed while waiting.
            const reason = connectionErrorReason(error);
            if (reason !== 'connected') {
                const body = {
                    off: _('Bluetooth is turned off.'),
                    busy: _('Another connection attempt is in progress.'),
                    unreachable: _('Make sure the headset is on and nearby.'),
                }[reason] ?? _('BlueZ reported an error.');
                Main.notifyError(action === 'connect' ? _('Could not connect to %s').format(name)
                    : _('Could not disconnect %s').format(name), body);
            }
        } finally {
            if (this._bluetoothManager) {
                this._pending.delete(device.path);
                this.refresh();
            }
        }
    }

    _openSettings() {
        const app = Shell.AppSystem.get_default().lookup_app('gnome-bluetooth-panel.desktop');
        if (!app) {
            Main.notifyError(_('Bluetooth Settings unavailable'), _('Install GNOME Settings to open the Bluetooth panel.'));
            return;
        }
        try {
            app.activate();
        } catch (error) {
            console.error(`Bluetooth Headset Monitor: ${error.message}`);
            Main.notifyError(_('Could not open Bluetooth Settings'), _('Try opening GNOME Settings from the application menu.'));
        }
    }
});
