#!/usr/bin/env python3
# SPDX-License-Identifier: MIT
"""Build a deterministic development extension ZIP, with fresh compiled schemas."""
import argparse
import json
from pathlib import Path
import shutil
import subprocess
import tempfile
import zipfile

ROOT = Path(__file__).resolve().parents[1]
RUNTIME_FILES = [
    'extension.js', 'bluetoothManager.js', 'devices.js', 'notificationPolicy.js',
    'prefs.js', 'about.js', 'metadata.json', 'stylesheet.css', 'LICENSE',
    'ui/deviceMenuItem.js', 'ui/panelIndicator.js',
]


def build(output_directory):
    metadata = json.loads((ROOT / 'metadata.json').read_text())
    output_directory = Path(output_directory).resolve()
    output_directory.mkdir(parents=True, exist_ok=True)
    output = output_directory / f"{metadata['uuid']}.shell-extension.zip"
    with tempfile.TemporaryDirectory(prefix='headset-package-') as temporary:
        stage = Path(temporary)
        for filename in RUNTIME_FILES:
            target = stage / filename
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(ROOT / filename, target)
        shutil.copytree(ROOT / 'schemas', stage / 'schemas', ignore=shutil.ignore_patterns('gschemas.compiled'))
        subprocess.run(['glib-compile-schemas', '--strict', str(stage / 'schemas')], check=True)
        for catalog in sorted((ROOT / 'po').glob('*.po')):
            target = stage / 'locale' / catalog.stem / 'LC_MESSAGES' / f"{metadata['gettext-domain']}.mo"
            target.parent.mkdir(parents=True, exist_ok=True)
            subprocess.run(['msgfmt', '--check', '-o', str(target), str(catalog)], check=True)
        with zipfile.ZipFile(output, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
            for source in sorted(stage.rglob('*')):
                if not source.is_file():
                    continue
                info = zipfile.ZipInfo(source.relative_to(stage).as_posix(), date_time=(1980, 1, 1, 0, 0, 0))
                info.compress_type = zipfile.ZIP_DEFLATED
                info.create_system = 3
                info.external_attr = 0o100644 << 16
                archive.writestr(info, source.read_bytes(), compresslevel=9)
    return output


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output-dir', default=str(ROOT / 'dist'))
    print(build(parser.parse_args().output_dir))
