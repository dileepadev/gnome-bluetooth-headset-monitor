// SPDX-License-Identifier: MIT
import Clutter from 'gi://Clutter';
import GObject from 'gi://GObject';
import St from 'gi://St';

import {gettext as _} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

export const DeviceMenuItem = GObject.registerClass(
class DeviceMenuItem extends PopupMenu.PopupBaseMenuItem {
    _init(device, options = {}) {
        // Reactive (but inert, see activate()) because non-activatable menu
        // items are drawn dimmed as insensitive, which hurts legibility.
        super._init({reactive: true, can_focus: false, hover: false});
        this._nameLabel = new St.Label({
            style_class: 'bluetooth-headset-monitor-device-name',
            x_expand: true,
            x_align: Clutter.ActorAlign.START,
        });
        this._detailLabel = new St.Label({
            style_class: 'bluetooth-headset-monitor-device-details',
            x_expand: true,
            x_align: Clutter.ActorAlign.START,
        });
        this._detailLabel.clutter_text.line_wrap = true;
        const content = new St.BoxLayout({
            x_expand: true,
            style_class: 'bluetooth-headset-monitor-device',
        });
        // orientation appeared in GNOME 48; vertical was removed in GNOME 51.
        if ('orientation' in content)
            content.orientation = Clutter.Orientation.VERTICAL;
        else
            content.vertical = true;
        content.add_child(this._nameLabel);
        content.add_child(this._detailLabel);
        this.add_child(content);
        this.updateDevice(device, options);
    }

    activate() {
        // Information only: keep the menu open and do nothing.
    }

    updateDevice(device, options = {}) {
        const name = device.name ?? _('Unknown device');
        const lines = [
            device.battery === null ? _('Battery: Unknown') : _('Battery: %d%%').format(device.battery),
            _('Status: Connected'),
            _('Supported profiles: %s').format(device.profiles),
        ];
        if (options.showAddress && device.address !== null)
            lines.push(_('Address: %s').format(device.address));
        if (options.showRssi && device.rssi !== null)
            lines.push(_('Signal: %d dBm').format(device.rssi));
        const details = lines.join('\n');
        if (this._nameLabel.text !== name)
            this._nameLabel.text = name;
        if (this._detailLabel.text !== details)
            this._detailLabel.text = details;
        this.accessible_name = `${name}\n${details}`;
    }
});
