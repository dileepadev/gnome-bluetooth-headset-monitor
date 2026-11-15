# Versioning and release process

Git releases use `MAJOR.MINOR.PATCH` tags, such as `v1.1.0`. The integer `version`
in `metadata.json` is the GNOME extension update identifier; it is not a SemVer
string. Check the previous distributed/published value before choosing its next
integer value. Keep the extension UUID and GSettings schema/path stable so
upgrades retain user preferences.

`package.json` and `package-lock.json` describe development tooling only. Do not
use `npm version` to version the GNOME extension. No npm dependencies ship in the
extension ZIP.

## Release steps

1. Complete the work in the release issue and confirm the extension works on the
   tested GNOME version.
2. Update the tested Shell versions in `metadata.json`, `README.md`, and
   `docs/DEVELOPMENT.md`. Use major Shell versions (`50` also covers `50.1`);
   do not advertise unverified compatibility as tested.
3. Set the next integer extension version, finalize `CHANGELOG.md`, and document
   known limitations and migration notes. Development builds keep the existing
   integer until the release.
4. Run `npm ci`, `npm run check`, and `npm run pack`. The packaging script freshly
   compiles schemas and any translation catalogs and includes only runtime files
   and applicable notices. Test clean install and upgrade from the resulting ZIP
   in live GNOME sessions, including persisted preferences.
5. Review and commit the release changes on the feature/release branch, then merge
   through the repository's PR process.
6. Tag the reviewed release as `v1.1.0` and publish a GitHub release with the
   matching changelog and `dist/*.shell-extension.zip` asset. Publish to
   extensions.gnome.org separately if that distribution channel is used.

The current v1.1.0 work is a development candidate. It does not create a tag,
publish a release, or establish GNOME 51 compatibility by static checks alone.

References: [GNOME extension metadata](https://gjs.guide/extensions/overview/anatomy.html#metadata-json-required)
and [release issue #2](https://github.com/dileepadev/gnome-bluetooth-headset-monitor/issues/2).
