# Development and validation

Extension UUID: `bluetooth-headset-monitor@dileepa.dev`.
Settings schema: `org.gnome.shell.extensions.gnome-bluetooth-headset-monitor`.

v1.1.0 is tracked in [issue #2](https://github.com/dileepadev/gnome-bluetooth-headset-monitor/issues/2).
It is tested on GNOME 51 (Wayland) with a real headset and, in headless sessions,
with a mock BlueZ; see Compatibility below.

## Architecture

- `bluetoothManager.js` creates a cancellable asynchronous BlueZ object manager.
  It watches manager-level signals, updates only affected device paths, coalesces
  event bursts in one idle source, and emits only meaningful snapshot changes.
  A service owner change clears the UI before rebuilding the new owner's complete
  snapshot. It neither auto-starts BlueZ nor polls for properties.
- `devices.js` normalizes cached `Device1`/`Battery1` properties and compares
  display state. UUIDs `0x1108`, `0x110b`, and `0x111e` indicate supported HSP,
  A2DP Audio Sink, and HFP capabilities. `0x110e` is AVRCP, not A2DP; AVRCP alone
  does not identify a headset. A sorted snapshot is shared read-only with consumers.
- `notificationPolicy.js` owns connection baselines, warning rearming, and pending
  timer identity. The extension injects timers and notification delivery, keeping
  this policy testable without GNOME Shell. Startup/recovery does not announce
  existing connections. Existing warnings survive temporary missing battery data
  and BlueZ restarts; confirmed disconnect or recovery above the current threshold
  rearms them. Startup may produce one low-battery warning per low device. Muting
  cancels queued messages; unmuting can report an as-yet unreported low battery.
- `extension.js` owns the settings, manager, indicator, and policy lifetimes.
  `disable()` is synchronous and also handles incomplete initialization.
- `ui/panelIndicator.js` keeps static actions and reconciles device rows by object
  path. Rows update in place and retain menu focus/state across property changes.
  The Settings action activates `gnome-bluetooth-panel.desktop` through Shell.
- `ui/deviceMenuItem.js` formats device details. It selects `orientation` when
  available (GNOME 48+) and uses `vertical` on older Shell versions. Text inherits
  the theme color. Missing names are translated rather than exposing an address
  when the address preference is off.
- `prefs.js` uses GTK/libadwaita only. A GSettings binding connects the threshold
  to the adjustment directly, avoiding settings callbacks retaining widgets.

The extension UUID and settings schema/path are unchanged. Battery remains
BlueZ-only; RSSI may be cached/unavailable. Supported profiles do not identify the
active profile or codec. Refresh rescans cached devices; it does not start discovery.

## Local workflow

For development from a source checkout, compile schemas and symlink the checkout
under the UUID directory:

```bash
make schemas
mkdir -p ~/.local/share/gnome-shell/extensions
ln -s "$PWD" ~/.local/share/gnome-shell/extensions/bluetooth-headset-monitor@dileepa.dev
gnome-extensions info bluetooth-headset-monitor@dileepa.dev
gnome-extensions prefs bluetooth-headset-monitor@dileepa.dev
gnome-extensions disable bluetooth-headset-monitor@dileepa.dev
gnome-extensions enable bluetooth-headset-monitor@dileepa.dev
```

After JS changes, log out/in to get a fresh module import. `Alt + F2`, `r` applies
only to supported X11 sessions, not Wayland. Keep Shell version validation enabled.
Use Looking Glass (`Alt + F2`, `lg`) and Shell logs to inspect errors:

```bash
journalctl -f -o cat /usr/bin/gnome-shell
```

## Automated checks and packaging

Requirements: Node.js 22.13+ (or a newer supported release), npm, Python 3, GJS,
GTK 4 introspection data, `glib-compile-schemas`, `dbus-daemon`, and GNU gettext.
On Debian/Ubuntu the native tools are provided by `gjs`, `gir1.2-gtk-4.0`,
`libglib2.0-bin`, `dbus-daemon`, and `gettext` (names may differ elsewhere).

```bash
npm ci
npm run check
npm run pack
sh scripts/update-translations.sh
```

`npm run check` runs linting, syntax checks, device/policy regression tests,
private-bus GJS integration tests, metadata/schema validation, reproducible ZIP
comparison, and an in-memory preferences binding check against packaged schemas.
`npm test` runs just the portable device/policy tests. All BlueZ integration data
comes from a private daemon and mock service, never the user's Bluetooth service.
The private test daemon needs permission to create a local Unix socket. Tests can
select a nonstandard daemon path with `G_TEST_DBUS_DAEMON`.

The package script writes `dist/bluetooth-headset-monitor@dileepa.dev.shell-extension.zip`.
It includes runtime modules/UI, metadata, stylesheet, icon, LICENSE, schema source,
freshly compiled schemas, and compiled `po/*.po` catalogs. The same inputs and
toolchain produce the same ZIP bytes. npm tools, tests, docs, and CI files are
excluded. GNU gettext is needed when packaging translated catalogs.

ESLint is a development dependency. Its minimatch dependency is temporarily
pinned to 11.0.1 via an override to address
[GHSA-g3hv-75wg-m249](https://github.com/advisories/GHSA-g3hv-75wg-m249).
Revisit the override once upstream ESLint accepts the patched major version;
verify lint behavior when changing it. No npm dependencies ship in the extension.

## Current automated evidence

Local checks were run with GJS 1.90.0 and Node.js 26.13.1 on Ubuntu 26.10.
GNOME Shell 51.0 is installed in the environment; that fact and headless tests do
not demonstrate that the extension has been exercised inside a live Shell.
The tests cover startup cancellation, absent BlueZ, service acquisition/recovery,
property changes, unchanged-event suppression, Battery1 removal/reappearance,
object removal, notification baselines/cancellation/rearming, and schema binding.

## Compatibility

Tested on GNOME 51 (Wayland), in daily use on a desktop and in isolated headless sessions. GNOME 46 and 50 stay listed in metadata but were not separately re-tested for this release. The real-headset desktop runs covered the panel battery, spacing, and
connection notifications; Connect/Disconnect, recovery, and late-battery timing
are covered by the mock-BlueZ integration test and headless GNOME 51 runs.

## Release review still required

Licensing is decided: the project is MIT (see `LICENSE`). The GPL-2.0-or-later
prose in `extension.js` came from the `gnome-extensions create` scaffold and has
been replaced by `// SPDX-License-Identifier: MIT`; every source file now carries
that header. MIT is GPL-compatible, as extensions.gnome.org requires.

Still to do before release: verify the bundled headset icon's origin and license,
and preserve any attribution it requires.

Keep metadata's integer `version` unchanged until the release, then follow
[VERSIONING.md](../VERSIONING.md).

## Battery label, connections, and About

- `devices.js` adds `normalizePairedDevice()` (paired or bonded audio devices that
  are not connected), `panelBattery()` (lowest known battery and whether it is at
  or below the threshold), and `connectionErrorReason()` (maps BlueZ errors such
  as `NotReady` or `br-connection-page-timeout` to short user-facing reasons).
- `BluetoothManager` tracks paired devices alongside connected ones
  (`getPairedHeadsets()`) and calls `Device1.Connect`/`Disconnect` asynchronously
  with a 30-second timeout (`connectDevice()`, `disconnectDevice()`).
- New keys: `show-battery-in-panel` (default true) and `show-when-disconnected`
  (default false, keeping the previous hidden-when-disconnected behaviour).
- `about.js` is the shared About page used by all three extensions.
- `tests/bluetoothManager.test.js` starts its own bus with `dbus-daemon`; set
  `G_TEST_DBUS_DAEMON` to a compatible launcher on systems that only ship
  dbus-broker.

## Connection notification timing

Headsets often expose `org.bluez.Battery1` a few seconds after `Connected`
becomes true (for example after the hands-free profile reports it), and the
delay varies. `NotificationPolicy` therefore waits up to `BATTERY_WAIT_MS`
(8 s) and notifies as soon as a battery appears. If the battery is still
unknown, it notifies with "Battery: Unknown" and, for `LATE_BATTERY_WINDOW_MS`
(60 s), a later reading emits `battery-update`; `extension.js` keeps the
connection notification (built like `Main.notify()`) and sets its `body`, which
GNOME Shell binds to the visible banner and list entry. Disconnect, mute,
service loss, and disable cancel both timers.
