#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
xgettext --language=JavaScript --from-code=UTF-8 --keyword=_ \
    --add-comments=Translators --copyright-holder='Dileepa Bandara' \
    --package-name=bluetooth-headset-monitor --package-version=1.1.0 \
    --output=po/bluetooth-headset-monitor.pot \
    extension.js prefs.js about.js ui/deviceMenuItem.js ui/panelIndicator.js
xgettext --from-code=UTF-8 --join-existing \
    --copyright-holder='Dileepa Bandara' \
    --package-name=bluetooth-headset-monitor --package-version=1.1.0 \
    --output=po/bluetooth-headset-monitor.pot \
    schemas/org.gnome.shell.extensions.gnome-bluetooth-headset-monitor.gschema.xml
