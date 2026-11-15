# Changelog

All notable changes to this project are documented in this file.

Changes are organized into the following categories:

- **Added:** New features or functionality introduced to the project.
- **Changed:** Modifications to existing functionality that do not add new features.
- **Fixed:** Bug fixes that resolve issues or correct unintended behavior.
- **Removed:** Features or components that have been removed from the project.
- **Security:** Protections and fixes for vulnerabilities or privacy.
- **Development:** Tests, tooling, documentation, and licensing.

## [Unreleased]

## [v1.1.0] - 2026-11-15

Version 1.1.0 (`version-name` in metadata; the integer `version` is managed by extensions.gnome.org). Tracked in [issue #2](https://github.com/dileepadev/gnome-bluetooth-headset-monitor/issues/2).

### Added

- **Battery in the top bar** (on by default): the lowest battery among connected headsets next to the icon, red and bold at or below the low battery threshold; the button's accessible name lists every headset's level.
- **Connect and Disconnect** from the menu for paired audio devices, through BlueZ asynchronously, with a "Connecting…" state and short failure reasons (Bluetooth off, headset unreachable, attempt in progress).
- **Show when no headset is connected** (off by default, keeping the previous hidden behaviour): a dimmed icon stays so paired headsets can be connected from the menu.
- **About page** in preferences: version 1.1.0, description, project, issue, and license links, and a privacy summary.

### Changed

- Initialize BlueZ asynchronously with cancellation; recover automatically when the service appears or restarts.
- Coalesce relevant device events, suppress unchanged updates, and reuse device menu rows instead of rebuilding the menu; Connect/Disconnect items are rebuilt only when they change, so keyboard focus survives battery and signal updates.
- Label advertised audio capabilities as supported profiles; exclude AVRCP-only devices from the headset filter.
- Use GNOME 51 widget orientation with a fallback for GNOME 46, and add GNOME 51 to development metadata for runtime validation.
- Use desktop application activation for Bluetooth Settings, with feedback when unavailable.
- Make user-facing text translatable and inherit theme text colors in device details.
- Preferences: the battery warning threshold uses the same spin row style as the other settings, and the page tab has a headphones icon (it showed a blank square).

### Fixed

- The "connected" notification sometimes said "Battery: Unknown" although the battery appeared moments later (it waited a fixed 1.5 seconds). It now waits up to 8 seconds and is sent as soon as the battery arrives; a battery that arrives later, within a minute, updates the same notification in place.
- Panel spacing matches AppIndicator icons in Ubuntu's compact mode: the icon sits in a `panel-status-indicators-box` and the button uses 10px horizontal padding, instead of the wider bare status-icon spacing.
- Device details in the menu are no longer drawn dimmed.
- Cancel delayed connection notifications on disconnect, mute, service loss, and disable; use the current name and battery when notifying.
- Keep service startup/recovery quiet for connection changes and preserve low-battery warning history across missing readings and service restarts.
- Validate battery boundaries, optional properties, and UUIDs; preserve a valid 0% reading.
- Bind the preferences threshold directly to its setting without retaining widgets through settings callbacks.

### Security

- No device data is stored or sent anywhere; BlueZ error details are mapped to short reasons rather than shown raw.
- About page rows render plain text (no Pango markup).
- GitHub Actions are pinned to commit SHAs with `persist-credentials: false`; `npm audit` reports no vulnerabilities in the development dependencies.

### Development

- Licensing: the project is MIT. The GPL-2.0-or-later scaffold text in `extension.js` (which contradicted its MIT SPDX line and the LICENSE) is replaced, and all source, test, and script files carry `SPDX-License-Identifier: MIT`.
- Tests: device normalization, paired devices, panel battery, connection error reasons, notification policy (including waiting for a late battery and in-place updates), schema bindings, and a mock-BlueZ integration test covering startup/cancellation, property and interface changes, recovery, paired listing, Connect/Disconnect, and error mapping. The integration test uses `dbus-daemon`, or a compatible launcher in `G_TEST_DBUS_DAEMON`.
- Headless GNOME 51 checks with a mock BlueZ: panel battery and low highlight, Connect/Disconnect, dimmed icon, late-battery notifications (3 and 10 seconds), and preferences render without extension errors.
- Deterministic ZIP packaging with freshly compiled schemas and packaged settings validation; Makefile (`make schemas`, `make check`, `make pack`). CI installs the GTK 4 GJS bindings needed by the settings test.
- Translation script includes `about.js`, and `scripts/check.py` fails if a file with translatable text is missing from it. The committed `.pot` predates the v1.1.0 strings and must be regenerated with GNU gettext.
- README: source installation with `make schemas` and a symlink, behavior and limitations, and new dark-mode screenshots (Dash-to-Panel top bar, synthetic devices).
- The bundled headset icon (a copy of Yaru's `audio-headset-symbolic`) is removed; the indicator uses the icon theme's headset icon, so no third-party asset is shipped.
- Confirmed working in daily use with a real headset on a GNOME 51 desktop. GNOME 46 and 50 stay listed in metadata but were not separately re-tested for this release.

## [v1.0.1] - 2026-07-31

### Changed - v1.0.1

- Renamed the repository to `gnome-bluetooth-headset-monitor`.
- Updated the extension metadata to target GNOME Shell `46`, `50`, and `50.1`.

## [v1.0.0] - 2026-06-03

### Added - v1.0.0

- Initial public release of the *gnome-bluetooth-headset-monitor* repository.
<!-- e.g., -->
<!-- Unreleased -->
<!-- v2.0.0 -->
<!-- v1.1.0 -->
<!-- v1.0.0 -->
<!-- v0.0.1 -->

[Unreleased]: https://github.com/dileepadev/gnome-bluetooth-headset-monitor/compare/v1.1.0...HEAD
[v1.1.0]: https://github.com/dileepadev/gnome-bluetooth-headset-monitor/releases/tag/v1.1.0
[v1.0.1]: https://github.com/dileepadev/gnome-bluetooth-headset-monitor/releases/tag/v1.0.1
[v1.0.0]: https://github.com/dileepadev/gnome-bluetooth-headset-monitor/releases/tag/v1.0.0
