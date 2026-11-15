// SPDX-License-Identifier: MIT
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk?version=4.0';

function check(value, message) {
    if (!value)
        throw new Error(message);
}
const source = Gio.SettingsSchemaSource.new_from_directory(ARGV[0] ?? 'schemas',
    Gio.SettingsSchemaSource.get_default(), false);
const schema = source.lookup('org.gnome.shell.extensions.gnome-bluetooth-headset-monitor', false);
check(schema, 'Packaged settings schema must exist');
const settings = new Gio.Settings({settings_schema: schema, backend: Gio.memory_settings_backend_new()});
check(settings.get_boolean('show-notifications'), 'Notifications enabled by default');
check(!settings.get_boolean('show-rssi') && !settings.get_boolean('show-device-address'), 'Optional details hidden');
check(settings.get_int('battery-warning-threshold') === 15, 'Default threshold');
const adjustment = new Gtk.Adjustment({lower: 1, upper: 100, step_increment: 1});
settings.bind('battery-warning-threshold', adjustment, 'value', Gio.SettingsBindFlags.DEFAULT);
adjustment.value = 20;
check(settings.get_int('battery-warning-threshold') === 20, 'UI change writes integer setting');
settings.set_int('battery-warning-threshold', 100);
check(adjustment.value === 100, 'External setting updates the adjustment');
settings.set_int('battery-warning-threshold', 1);
check(adjustment.value === 1, 'Minimum threshold is preserved');
Gio.Settings.unbind(adjustment, 'value');
print('Schema defaults and bidirectional threshold binding passed');
