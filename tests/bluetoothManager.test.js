// SPDX-License-Identifier: MIT
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import {BluetoothManager} from '../bluetoothManager.js';
import {connectionErrorReason} from '../devices.js';
import {NotificationPolicy} from '../notificationPolicy.js';

function check(value, message) {
    if (!value)
        throw new Error(message);
}
function pause(ms = 10) {
    return new Promise(resolve => {
        GLib.timeout_add(GLib.PRIORITY_DEFAULT, ms, () => {
            resolve();
            return GLib.SOURCE_REMOVE;
        });
    });
}
async function until(predicate, message) {
    for (let i = 0; i < 200; i++) {
        if (predicate())
            return;
        await pause();
    }
    throw new Error(`Timed out: ${message}`);
}

const DEVICE = 'org.bluez.Device1';
const BATTERY = 'org.bluez.Battery1';
const MANAGER = 'org.freedesktop.DBus.ObjectManager';
const OBJECT_MANAGER_XML = `<node><interface name="${MANAGER}">
    <method name="GetManagedObjects"><arg type="a{oa{sa{sv}}}" direction="out"/></method>
    <signal name="InterfacesAdded"><arg type="o"/><arg type="a{sa{sv}}"/></signal>
    <signal name="InterfacesRemoved"><arg type="o"/><arg type="as"/></signal>
</interface></node>`;
const DEVICE_XML = `<node><interface name="${DEVICE}">
    <property name="Connected" type="b" access="read"/>
    <property name="UUIDs" type="as" access="read"/>
    <property name="Alias" type="s" access="read"/>
    <property name="Address" type="s" access="read"/>
    <property name="RSSI" type="n" access="read"/>
    <property name="Paired" type="b" access="read"/>
    <method name="Connect"/>
    <method name="Disconnect"/>
</interface></node>`;
const BATTERY_XML = `<node><interface name="${BATTERY}">
    <property name="Percentage" type="y" access="read"/>
</interface></node>`;
const devicePath = '/org/bluez/hci0/dev_00_11_22_33_44_55';
const headset = {Connected: true, UUIDs: ['0000110b-0000-1000-8000-00805f9b34fb'],
    Alias: 'Test headset', Address: '00:11:22:33:44:55', RSSI: -60, Paired: true};
const battery = {Percentage: 80};
function deviceProperties(device = headset) {
    return {Connected: new GLib.Variant('b', device.Connected), UUIDs: new GLib.Variant('as', device.UUIDs),
        Alias: new GLib.Variant('s', device.Alias), Address: new GLib.Variant('s', device.Address),
        RSSI: new GLib.Variant('n', device.RSSI), Paired: new GLib.Variant('b', device.Paired ?? false)};
}

const loop = new GLib.MainLoop(null, false);
// Spawn a private daemon directly: Gio.TestDBus teardown can wait on GJS
// wrapper garbage collection, and must never select the user's session bus.
const busDirectory = GLib.dir_make_tmp('headset-monitor-test-XXXXXX');
const configPath = `${busDirectory}/bus.conf`;
GLib.file_set_contents(configPath, `<busconfig><type>session</type>
    <listen>unix:tmpdir=${busDirectory}</listen><auth>EXTERNAL</auth>
    <policy context="default"><allow send_destination="*"/><allow receive_sender="*"/>
    <allow own="*"/></policy></busconfig>`);
const daemon = Gio.Subprocess.new([GLib.getenv('G_TEST_DBUS_DAEMON') ?? 'dbus-daemon',
    '--nofork', '--print-address=1', `--config-file=${configPath}`], Gio.SubprocessFlags.STDOUT_PIPE);
const daemonOutput = new Gio.DataInputStream({base_stream: daemon.get_stdout_pipe()});
const [busAddress] = daemonOutput.read_line_utf8(null);
check(busAddress, 'Private bus must provide its address');
const connect = () => Gio.DBusConnection.new_for_address_sync(busAddress,
    Gio.DBusConnectionFlags.AUTHENTICATION_CLIENT | Gio.DBusConnectionFlags.MESSAGE_BUS_CONNECTION,
    null, null);
const server = connect();
const client = connect();
const objects = {};
const exported = [];
const root = Gio.DBusExportedObject.wrapJSObject(OBJECT_MANAGER_XML, {
    GetManagedObjects: () => objects,
});
root.export(server, '/');
function addDevice(path = devicePath, device = headset) {
    objects[path] = {[DEVICE]: deviceProperties(device)};
    const proxy = Gio.DBusExportedObject.wrapJSObject(DEVICE_XML, device);
    proxy.export(server, path);
    exported.push(proxy);
    root.emit_signal('InterfacesAdded', new GLib.Variant('(oa{sa{sv}})', [path, objects[path]]));
    return proxy;
}
function addBattery(path = devicePath, data = battery) {
    objects[path][BATTERY] = {Percentage: new GLib.Variant('y', data.Percentage)};
    const proxy = Gio.DBusExportedObject.wrapJSObject(BATTERY_XML, data);
    proxy.export(server, path);
    exported.push(proxy);
    root.emit_signal('InterfacesAdded', new GLib.Variant('(oa{sa{sv}})',
        [path, {[BATTERY]: objects[path][BATTERY]}]));
    return proxy;
}
const requestName = method => server.call_sync('org.freedesktop.DBus', '/org/freedesktop/DBus',
    'org.freedesktop.DBus', method,
    method === 'RequestName' ? new GLib.Variant('(su)', ['org.bluez', 0]) : new GLib.Variant('(s)', ['org.bluez']),
    null, Gio.DBusCallFlags.NONE, 2000, null);
let manager;
let failure;
async function run() {
    const cancelled = new BluetoothManager({connection: client});
    cancelled.destroy();
    cancelled.destroy();
    await pause();
    check(!cancelled.ready && cancelled.getConnectedHeadsets().length === 0, 'Cancelled initialization stays destroyed');

    manager = new BluetoothManager({connection: client});
    manager.refresh();
    manager.refresh();
    let updates = 0;
    manager.connect('devices-changed', () => updates++);
    await pause(50);
    check(!manager.ready, 'Absent BlueZ does not start a service or report readiness');
    const notifications = [];
    const policy = new NotificationPolicy({
        schedule: () => { throw new Error('Known battery should not need timers'); },
        cancel: () => {}, notify: event => notifications.push(event),
    });
    manager.connect('devices-changed', () => policy.update(manager.getConnectedHeadsets(),
        {ready: manager.ready, notifications: true, threshold: 15}));
    const deviceProxy = addDevice();
    const batteryProxy = addBattery();
    requestName('RequestName');
    await until(() => manager.ready && manager.getConnectedHeadsets().length === 1, 'service startup snapshot');
    check(notifications.length === 0, 'Initial/recovered devices do not notify a connection');
    check(manager.getConnectedHeadsets()[0].battery === 80, 'Initial battery');
    const before = updates;
    for (let i = 0; i < 20; i++)
        deviceProxy.emit_property_changed('RSSI', new GLib.Variant('n', -60));
    await pause(80);
    check(updates === before, 'Unchanged properties do not emit device updates');
    manager.refresh();
    check(updates === before, 'Unchanged cache refresh stays quiet');
    battery.Percentage = 0;
    objects[devicePath][BATTERY].Percentage = new GLib.Variant('y', 0);
    batteryProxy.emit_property_changed('Percentage', new GLib.Variant('y', 0));
    await until(() => manager.getConnectedHeadsets()[0]?.battery === 0, 'battery update');
    check(notifications.at(-1) === 'low-battery', 'Valid zero battery warns');
    headset.Alias = 'Renamed headset';
    objects[devicePath][DEVICE].Alias = new GLib.Variant('s', headset.Alias);
    deviceProxy.emit_property_changed('Alias', new GLib.Variant('s', headset.Alias));
    await until(() => manager.getConnectedHeadsets()[0]?.name === headset.Alias, 'alias update');

    delete objects[devicePath][BATTERY];
    root.emit_signal('InterfacesRemoved', new GLib.Variant('(oas)', [devicePath, [BATTERY]]));
    batteryProxy.unexport();
    await until(() => manager.getConnectedHeadsets()[0]?.battery === null, 'battery removal');
    addBattery();
    await until(() => manager.getConnectedHeadsets()[0]?.battery === 0, 'battery reappearance');
    check(notifications.filter(event => event === 'low-battery').length === 1, 'Battery loss does not rearm');

    const messagesBeforeRestart = notifications.length;
    requestName('ReleaseName');
    await until(() => !manager.ready && manager.getConnectedHeadsets().length === 0, 'service loss');
    check(notifications.length === messagesBeforeRestart, 'Service loss does not notify disconnect');
    requestName('RequestName');
    await until(() => manager.ready && manager.getConnectedHeadsets().length === 1, 'service recovery');
    check(!notifications.includes('connected') && !notifications.includes('disconnected'), 'Recovery is quiet');
    check(notifications.length === messagesBeforeRestart, 'Recovery does not repeat a battery warning');

    const secondPath = '/org/bluez/hci1/dev_AA_BB_CC_DD_EE_FF';
    const secondDevice = {...headset, Alias: 'Other adapter', Connected: false};
    const second = addDevice(secondPath, secondDevice);
    addBattery(secondPath, {Percentage: 85});
    await pause(40);
    check(manager.getConnectedHeadsets().length === 1, 'Disconnected hotplug is filtered');
    secondDevice.Connected = true;
    second.emit_property_changed('Connected', new GLib.Variant('b', true));
    await until(() => manager.getConnectedHeadsets().length === 2, 'newly hotplugged device properties');
    check(manager.getConnectedHeadsets()[0].name === 'Other adapter', 'Multiple adapters are sorted by name');
    check(notifications.at(-1) === 'connected', 'Genuine new connection notifies');
    // Paired, disconnected headsets are offered for connection; Connect/Disconnect
    // go through BlueZ, and failures carry BlueZ's error name.
    const thirdPath = '/org/bluez/hci0/dev_12_34_56_78_9A_BC';
    let third;
    let failConnect = false;
    const thirdDevice = {...headset, Alias: 'Paired buds', Connected: false, Paired: true,
        ConnectAsync(_params, invocation) {
            if (failConnect) {
                invocation.return_dbus_error('org.bluez.Error.NotReady', 'Resource Not Ready');
                return;
            }
            thirdDevice.Connected = true;
            third.emit_property_changed('Connected', new GLib.Variant('b', true));
            invocation.return_value(null);
        },
        DisconnectAsync(_params, invocation) {
            thirdDevice.Connected = false;
            third.emit_property_changed('Connected', new GLib.Variant('b', false));
            invocation.return_value(null);
        },
    };
    third = addDevice(thirdPath, thirdDevice);
    addBattery(thirdPath, {Percentage: 64});
    await until(() => manager.getPairedHeadsets().some(device => device.path === thirdPath), 'paired headset listed');
    check(!manager.getPairedHeadsets().some(device => device.path === devicePath), 'Connected headsets are not offered');
    await manager.connectDevice(thirdPath);
    await until(() => manager.getConnectedHeadsets().some(device => device.path === thirdPath), 'connect via BlueZ');
    check(!manager.getPairedHeadsets().some(device => device.path === thirdPath), 'Connected device leaves the paired list');
    await manager.disconnectDevice(thirdPath);
    await until(() => manager.getPairedHeadsets().some(device => device.path === thirdPath), 'disconnect via BlueZ');
    failConnect = true;
    let failure;
    try {
        await manager.connectDevice(thirdPath);
    } catch (error) {
        failure = error;
    }
    check(connectionErrorReason(failure) === 'off', `BlueZ NotReady maps to "off" (${failure?.message})`);
    let missing;
    try {
        await manager.connectDevice('/org/bluez/hci0/dev_missing');
    } catch (error) {
        missing = error;
    }
    check(missing, 'Unknown devices are rejected');
    third.unexport();
    delete objects[thirdPath];
    root.emit_signal('InterfacesRemoved', new GLib.Variant('(oas)', [thirdPath, [DEVICE, BATTERY]]));
    await until(() => !manager.getPairedHeadsets().some(device => device.path === thirdPath), 'paired removal');

    second.unexport();
    delete objects[secondPath];
    root.emit_signal('InterfacesRemoved', new GLib.Variant('(oas)', [secondPath, [DEVICE]]));
    delete objects[devicePath];
    root.emit_signal('InterfacesRemoved', new GLib.Variant('(oas)', [devicePath, [DEVICE, BATTERY]]));
    await until(() => manager.getConnectedHeadsets().length === 0, 'object removal');
    check(notifications.at(-1) === 'disconnected', 'Real device removal notifies');
    policy.destroy();
    for (let i = 0; i < 3; i++) {
        const repeated = new BluetoothManager({connection: client});
        await until(() => repeated.ready, 'repeated lifecycle startup');
        repeated.destroy();
        repeated.destroy();
    }
    manager.destroy();
    const afterDestroy = updates;
    deviceProxy.emit_property_changed('RSSI', new GLib.Variant('n', -50));
    await pause(30);
    check(updates === afterDestroy, 'No callbacks after manager destruction');
    manager.refresh();
    check(!manager.ready, 'Destroyed manager cannot restart');
}
run().catch(error => { failure = error; }).finally(() => loop.quit());
loop.run();
manager?.destroy();
for (const proxy of exported) {
    if (proxy.get_connection())
        proxy.unexport();
}
root.unexport();
client.close_sync(null);
server.close_sync(null);
daemon.send_signal(15);
daemon.wait(null);
daemonOutput.close(null);
Gio.File.new_for_path(configPath).delete(null);
Gio.File.new_for_path(busDirectory).delete(null);
if (failure)
    throw failure;
print('Private BlueZ startup/cancellation, properties, interface changes, recovery, paired listing, connect/disconnect, error mapping, and cleanup passed');
