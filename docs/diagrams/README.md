# Documentation diagrams

The [architecture diagram](architecture.svg) is generated from
[`architecture.d2`](architecture.d2) with D2 v0.9.0 and its bundled TALA layout
engine. The SVG is checked in so documentation readers do not need diagram tools.

After installing [D2](https://d2lang.com/tour/install), confirm that `d2 layout`
lists TALA. From the repository root, format, validate, and render the diagram:

```sh
d2 fmt docs/diagrams/architecture.d2
d2 validate docs/diagrams/architecture.d2
d2 --layout=tala docs/diagrams/architecture.d2 docs/diagrams/architecture.svg
```

The source pins the theme, padding and TALA seeds. Use D2 v0.9.0 to reproduce the
checked-in rendering. When updating the diagram, commit both the `.d2` source and
the rendered SVG. Dashed arrows indicate optional external integrations.
