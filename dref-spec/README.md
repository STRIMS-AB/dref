# dref-spec

The DRef specification, and the source of truth for everything else in this repository.

DRef (Domain Reference) is an open specification for declaring a domain: its models, the
rules their properties follow, and the mappings from other systems' data. The
implementations (`dref-java`, `dref-ts`, `dref-react`) follow what is written here, and
[dref.dev](https://dref.dev) shows these same files.

| File | What |
| --- | --- |
| [`SPECIFICATION.md`](SPECIFICATION.md) | the specification, to read |
| `specification.json` | the same in one JSON file, for tools |
| `domain.schema.json` | the JSON Schema every domain document follows, published as `https://dref.dev/schemas/v1/domain.json` |
| `transformations-catalog.json` | the transformations a mapping can apply |
| `domains/` | example domain documents: billing, commerce, identity, inventory |
| `scripts/validate.mjs` | checks the example documents |

Validation rules are [regl](https://regl.dev)'s: the specification refers to regl's
catalog and does not copy it.

## Checking the examples

```bash
(cd ../dref-ts && npm install && npm run build)
npm install
npm run validate
```

Every document of `domains/` is checked against `domain.schema.json` and with the
TypeScript validator, `@dref/validator` (`../dref-ts`).

## Changing the specification

A change here comes with the change to each implementation:
[CONTRIBUTING.md](../CONTRIBUTING.md) lists what must stay in step.

## License

Apache-2.0 © 2026 [STRIMS AB](https://strims.se). See [LICENSE](LICENSE) and [NOTICE](NOTICE).
