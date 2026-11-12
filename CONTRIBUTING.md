# Contributing to DRef

Bug reports, proposals and pull requests are welcome.

## The specification comes first

`dref-spec` is the source of truth: the specification (`SPECIFICATION.md`,
`specification.json`), the schema every domain document follows (`domain.schema.json`),
the transformation catalog and the example domain documents. The implementations follow
it, and a change reaches all of them together, never one alone.

Validation rules are not DRef's own: they are [regl](https://regl.dev)'s, defined in
regl's `regl-spec/catalog.json`. DRef adds the domain around them (models, scopes,
defaults, mappings).

### When regl adds or changes a rule

| Where | What |
| --- | --- |
| `dref-spec/specification.json`, `SPECIFICATION.md` | where they name the rule |
| `dref-spec/domain.schema.json` | the rule item |
| `dref-java` | nothing to mirror by hand: `Property.Builder` implements regl's `AllRules`, annotations go through `Rules.fromAnnotation`, and `DrefValidator` validates with regl's `Schema`. Add a test in `DrefValidatorTest` |
| `dref-ts` | `src/types.ts` (the rule unions and parameter types), `src/validator.ts`, and a test in `test/validator.test.mjs` |

A rule's severity follows too: a rule marked `warnOnly` gives a warning, not an error, in
both implementations' results and in `domain.schema.json`.

### When a transformation is added or changed

| Where | What |
| --- | --- |
| `dref-spec/transformations-catalog.json` | the transformation |
| `dref-java` | `TransformType.java`, its implementation in `DrefMapper.java`, a test in `DrefMapperTest` |
| `dref-ts` | the `TransformType` union in `src/types.ts`, its implementation in `src/mapper.ts`, a test in `test/mapper.test.mjs` |

Mappings live inside domain documents, in each model's `mapsFrom`: there is no mapping
document of its own. `DrefDomain.parseMapping` is public so that code holding a mapping
definition outside a document reads it with the same parser.

## The site

dref.dev is kept apart from this repository. It shows `dref-spec` as it is (the
specification, the schema, the catalogs, the example domains) and regl's rule catalog,
which it copies when it is built: a change here reaches it at its next build. What is
written there by hand is the texts of a new rule or transformation.

## The React composer (`dref-react`)

Every change to a domain document goes through the composer functions of
`@dref/validator` (`addProperty`, `updateProperty`, `addMapping`…), never by editing the
draft directly. Every text a user sees comes from `src/labels.ts`, and the styles from
`src/styles.ts`.

## Build and test

Java 17 or later and Maven for `dref-java`; Node.js for the rest. Until
`dev.regl:regl-java` is on Maven Central, check regl out next to this repository
(`../regl`) and install it: `(cd ../regl/regl-java && mvn install -DskipTests)`.

```bash
(cd dref-java && mvn verify)
(cd dref-ts && npm install && npm run build && npm test)
(cd dref-react && npm install && npm run build && npm test)
(cd dref-spec && npm install && npm run validate)
```

Build `dref-ts` first: `dref-react` uses it built, and `dref-spec` validates with it.
`npm run validate` checks every example domain document against the schema and with the
validator. `.github/workflows/ci.yml` runs the same on every push.

## Pull requests

- One subject per pull request, with the tests that show it.
- A change to the specification comes with the change to each implementation.

## Releasing

See [Releasing](README.md#releasing) in the README.

## Security

See [SECURITY.md](SECURITY.md).
