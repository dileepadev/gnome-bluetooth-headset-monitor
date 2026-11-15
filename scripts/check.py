#!/usr/bin/env python3
# SPDX-License-Identifier: MIT
"""Run the development checks; the BlueZ test uses its own private bus."""
import hashlib
import json
from pathlib import Path
import subprocess
import tempfile
import xml.etree.ElementTree as ET
import zipfile

from package import ROOT, RUNTIME_FILES, build


def run(*arguments):
    subprocess.run(arguments, check=True, cwd=ROOT)


metadata = json.loads((ROOT / 'metadata.json').read_text())
assert metadata['uuid'] == 'bluetooth-headset-monitor@dileepa.dev'
assert isinstance(metadata['version'], int) and metadata['version'] > 0
assert metadata['shell-version'] == ['46', '50', '51']
assert metadata['gettext-domain'] == 'bluetooth-headset-monitor'
# Every file with translatable text must be in the translation template script.
listed = (ROOT / 'scripts/update-translations.sh').read_text()
for source in [*ROOT.glob('*.js'), *ROOT.glob('ui/*.js')]:
    if "_('" in source.read_text():
        relative = source.relative_to(ROOT).as_posix()
        assert relative in listed, f'{relative} has translatable text but is not in scripts/update-translations.sh'
schema_file = 'schemas/org.gnome.shell.extensions.gnome-bluetooth-headset-monitor.gschema.xml'
schema = ET.parse(ROOT / schema_file).getroot().find('schema')
assert schema.attrib['id'] == metadata['settings-schema']
assert schema.attrib['path'] == '/org/gnome/shell/extensions/gnome-bluetooth-headset-monitor/'
run('npm', 'run', 'lint')
for source in [*ROOT.glob('*.js'), *ROOT.glob('*.mjs'), *ROOT.glob('ui/*.js'), *ROOT.glob('tests/*.js'), *ROOT.glob('tests/*.mjs')]:
    run('node', '--check', str(source))
run('npm', 'test')
run('gjs', '-m', 'tests/bluetoothManager.test.js')
with tempfile.TemporaryDirectory(prefix='headset-check-') as temporary:
    output = build(Path(temporary) / 'first')
    second = build(Path(temporary) / 'second')
    assert hashlib.sha256(output.read_bytes()).digest() == hashlib.sha256(second.read_bytes()).digest(), 'ZIP must be reproducible'
    with zipfile.ZipFile(output) as archive:
        expected = set(RUNTIME_FILES) | {schema_file, 'schemas/gschemas.compiled'}
        catalogs = [name for name in archive.namelist() if name.startswith('locale/') and name.endswith('.mo')]
        assert set(archive.namelist()) == expected | set(catalogs), 'Unexpected or missing ZIP content'
        archive.extractall(Path(temporary) / 'installed')
    compiled = Path(temporary) / 'installed/schemas/gschemas.compiled'
    assert compiled.read_bytes() == (ROOT / 'schemas/gschemas.compiled').read_bytes(), 'Tracked schema artifact is stale'
    run('gjs', '-m', 'tests/settings.test.js', str(compiled.parent))
run('git', 'diff', '--check')
print('All checks passed, including deterministic packaging and packaged schema verification')
