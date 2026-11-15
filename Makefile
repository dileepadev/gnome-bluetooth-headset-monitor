.PHONY: check pack schemas

check:
	python3 scripts/check.py

pack:
	python3 scripts/package.py

schemas:
	glib-compile-schemas --strict schemas
