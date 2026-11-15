// SPDX-License-Identifier: MIT
import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';

import {ExtensionPreferences, gettext as _} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

import {createAboutPage} from './about.js';

export default class BluetoothHeadsetMonitorPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const settings = this.getSettings();

        const page = new Adw.PreferencesPage({
            title: _('Bluetooth Headset Monitor'),
            icon_name: 'audio-headphones-symbolic',
        });

        const generalGroup = new Adw.PreferencesGroup({
            title: _('Behavior'),
            description: _('Control notifications and which device details appear in the panel menu.'),
        });

        const notificationsRow = new Adw.SwitchRow({
            title: _('Show notifications'),
            subtitle: _('Notify when headsets connect, disconnect, or reach the low battery threshold.'),
        });
        settings.bind('show-notifications', notificationsRow, 'active', Gio.SettingsBindFlags.DEFAULT);
        generalGroup.add(notificationsRow);

        const addressRow = new Adw.SwitchRow({
            title: _('Show device address'),
            subtitle: _('Include the Bluetooth MAC address in each device entry.'),
        });
        settings.bind('show-device-address', addressRow, 'active', Gio.SettingsBindFlags.DEFAULT);
        generalGroup.add(addressRow);

        const rssiRow = new Adw.SwitchRow({
            title: _('Show signal strength'),
            subtitle: _('Display RSSI in dBm when BlueZ reports it.'),
        });
        settings.bind('show-rssi', rssiRow, 'active', Gio.SettingsBindFlags.DEFAULT);
        generalGroup.add(rssiRow);

        const panelGroup = new Adw.PreferencesGroup({
            title: _('Top bar'),
        });
        const batteryRow = new Adw.SwitchRow({
            title: _('Show battery in the top bar'),
            subtitle: _('Shows the lowest headset battery next to the icon, highlighted at or below the warning threshold.'),
        });
        settings.bind('show-battery-in-panel', batteryRow, 'active', Gio.SettingsBindFlags.DEFAULT);
        panelGroup.add(batteryRow);
        const disconnectedRow = new Adw.SwitchRow({
            title: _('Show when no headset is connected'),
            subtitle: _('Keeps a dimmed icon in the top bar so paired headsets can be connected from its menu.'),
        });
        settings.bind('show-when-disconnected', disconnectedRow, 'active', Gio.SettingsBindFlags.DEFAULT);
        panelGroup.add(disconnectedRow);

        const thresholdGroup = new Adw.PreferencesGroup({
            title: _('Low battery'),
        });

        // Same spin row style as the other preferences (libadwaita 1.4+).
        const thresholdRow = new Adw.SpinRow({
            title: _('Battery warning threshold'),
            subtitle: _('Send a low battery notification when a connected device reaches this percentage.'),
            adjustment: new Gtk.Adjustment({lower: 1, upper: 100, step_increment: 1, page_increment: 5}),
        });
        settings.bind('battery-warning-threshold', thresholdRow, 'value', Gio.SettingsBindFlags.DEFAULT);
        thresholdGroup.add(thresholdRow);

        page.add(generalGroup);
        page.add(panelGroup);
        page.add(thresholdGroup);

        window.add(page);
        window.add(createAboutPage({
            metadata: this.metadata,
            iconName: 'audio-headset-symbolic',
            description: _('Shows connected Bluetooth headsets in the GNOME top bar with battery levels, connection notifications, low battery warnings, and one-click connect and disconnect.'),
            privacy: _('Reads device information from BlueZ on this computer. Nothing is stored or sent over the network.'),
            developer: 'Dileepa Bandara',
            _,
        }));
        window.set_default_size(680, 520);
    }
}
