# Development Guide

This document collects the longer-form development and maintenance details that are not essential in the project README.

## Supported GNOME Versions

The extension metadata currently targets GNOME Shell `46`, `50`, and `50.1`.

## How It Works

The extension connects to the system D-Bus and creates a BlueZ object manager for `org.bluez`. It watches object and property changes to keep an in-memory list of connected Bluetooth audio devices.

Only devices that satisfy both of these conditions are shown:

1. `Connected === true`
2. The device advertises at least one supported audio UUID

The current audio UUID filter includes:

- `00001108-0000-1000-8000-00805f9b34fb` (`HSP`)
- `0000110b-0000-1000-8000-00805f9b34fb` (`A2DP`)
- `0000110e-0000-1000-8000-00805f9b34fb` (`A2DP`)
- `0000111e-0000-1000-8000-00805f9b34fb` (`HFP`)

## Menu Behavior

When one or more supported devices are connected, the top-panel icon appears using `icons/audio-headset-symbolic.svg` when that file exists. If the file is missing, the extension falls back to the themed symbolic icon `audio-headphones-symbolic`.

The popup menu contains:

1. A static header: `Bluetooth Headset Monitor`
2. One entry per connected device
3. `Open Bluetooth Settings`
4. `Refresh`

Each device entry shows:

- Name
- `Battery: <percentage>%` or `Battery: Unknown`
- `Status: Connected`
- `Profile: <label>`
- `Address: <MAC>` when enabled in preferences
- `Signal: <RSSI> dBm` when enabled in preferences and available from BlueZ

## Notifications

If notifications are enabled, the extension sends GNOME Shell notifications when:

- a new compatible device connects
- a previously connected compatible device disconnects
- a connected device battery falls to or below the configured threshold

## Preferences

The preferences window exposes the following GSettings keys:

- `show-notifications`
- `battery-warning-threshold`
- `show-rssi`
- `show-device-address`

## Project Structure

```text
gnome-bluetooth-headset-monitor@dileepa.dev/
├── bluetoothManager.js
├── extension.js
├── icons/
│   └── audio-headset-symbolic.svg
├── metadata.json
├── prefs.js
├── schemas/
│   └── org.gnome.shell.extensions.gnome-bluetooth-headset-monitor.gschema.xml
├── stylesheet.css
└── ui/
    ├── deviceMenuItem.js
    └── panelIndicator.js
```

## Architecture Overview

### `bluetoothManager.js`

Responsible for BlueZ integration.

### `extension.js`

Responsible for extension lifecycle and notification policy.

### `ui/panelIndicator.js`

Responsible for top-panel presence and popup menu rendering.

### `ui/deviceMenuItem.js`

Responsible for formatting a single device entry in the popup menu.

### `prefs.js`

Responsible for the libadwaita preferences UI.

## Development Workflow

Typical local workflow:

1. Edit the source files.
2. Run `glib-compile-schemas schemas` if the schema changed.
3. Reload GNOME Shell or disable and re-enable the extension.
4. Connect or disconnect a Bluetooth audio device to verify behavior.

Useful commands:

```bash
gnome-extensions info gnome-bluetooth-headset-monitor@dileepa.dev
gnome-extensions prefs gnome-bluetooth-headset-monitor@dileepa.dev
gnome-extensions disable gnome-bluetooth-headset-monitor@dileepa.dev
gnome-extensions enable gnome-bluetooth-headset-monitor@dileepa.dev
```

## Testing Checklist

Use this checklist when validating a release:

1. With no connected Bluetooth audio device, confirm the panel icon is hidden.
2. Connect a supported headset and confirm the icon appears.
3. Open the menu and verify device name, battery, status, and profile are shown.
4. If the device exposes battery data, confirm the value updates correctly.
5. Toggle `Show device address` in preferences and confirm the address appears or disappears.
6. Toggle `Show signal strength` and confirm RSSI appears only when BlueZ provides it.
7. Lower the battery threshold and confirm low-battery notification behavior.
8. Disconnect the device and confirm the icon disappears when no compatible device remains.

## Troubleshooting

### The icon never appears

Check the following:

- Bluetooth is enabled and the headset is actually connected.
- The device exposes one of the supported audio UUIDs.
- BlueZ is running on the system.
- The extension is enabled.

### Battery always shows `Unknown`

That means the device is not exposing `org.bluez.Battery1`, or BlueZ is not receiving battery information from it. This is device-dependent.

### RSSI does not appear

RSSI display requires both of these conditions:

1. `Show signal strength` is enabled in preferences
2. BlueZ exposes `RSSI` for the device

## Current Scope and Limits

This repository currently implements the core panel indicator, BlueZ-backed device discovery, device menu, notifications, and preferences described above.

The following ideas exist in the broader design but are not implemented as separate features yet:

- packaging assets such as screenshots
- richer profile detection beyond UUID mapping
- any optional fallback battery source outside BlueZ
