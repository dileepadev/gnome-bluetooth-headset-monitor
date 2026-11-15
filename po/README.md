# Translations

Run `sh scripts/update-translations.sh` with GNU gettext installed to refresh
`bluetooth-headset-monitor.pot`. It extracts Shell, preferences, and schema text.
Create `po/<language>.po` from that template; the packaging script validates each
catalog with `msgfmt --check` and installs it under `locale/<language>/LC_MESSAGES/`.
The gettext domain is `bluetooth-headset-monitor`. No translated catalogs ship yet.
