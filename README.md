# DRef

DRef (Domain Reference) is an open specification for declaring a domain: its models, the
rules their properties must follow, and the mappings that turn another system's data into
those models. One document says it once; a validator checks any data against it, in Java
or in TypeScript.

Documentation: **[dref.dev](https://dref.dev)**

## In this repository

| Folder | What | Published as |
| --- | --- | --- |
| [`dref-spec`](dref-spec) | The specification: its text, the schema of a domain document, the transformation catalog and example domain documents. The source of truth | shown at dref.dev |
| [`dref-java`](dref-java) | The Java validator and mapper | `dev.dref:dref-validator` on Maven Central |
| [`dref-ts`](dref-ts) | The TypeScript validator | `@dref/validator` on npm |
| [`dref-react`](dref-react) | React components to compose and edit a domain document | `@dref/react` on npm |

The specification comes first: a rule or a transformation is added to `dref-spec`,
then to each implementation, in the same change.
[CONTRIBUTING.md](CONTRIBUTING.md) lists what must stay in step.

## Built on regl

A DRef rule is a [regl](https://regl.dev) rule: DRef adds the domain around it (models,
scopes, mappings), regl defines the rules. `dref-java` depends on `dev.regl:regl-java` and
validates with it. `dref-ts` has no dependency: it evaluates the same rules itself, from
the same catalog.

## Build and test

```bash
(cd dref-java && mvn test)
(cd dref-ts && npm install && npm run build && npm test)
(cd dref-react && npm install && npm run build && npm test)
(cd dref-spec && npm install && npm run validate)
```

`dref-react` uses the built `dref-ts`, and `dref-spec` validates its example documents
with it: build `dref-ts` first.

## Releasing

`dref-java` is published to Maven Central as `dev.dref:dref-validator`, through the
Sonatype Central Portal.

1. **Once**: the namespace `dev.dref` is verified in the
   [Central Portal](https://central.sonatype.com/) with a TXT record on `dref.dev`, and
   the repository has the secrets `CENTRAL_TOKEN_USER`, `CENTRAL_TOKEN_PASSWORD` (a user
   token of the Portal), `MAVEN_GPG_PRIVATE_KEY` and `MAVEN_GPG_PASSPHRASE` (the signing
   key).
2. `dev.regl:regl-java`, which it depends on, is on Maven Central in the version
   `dref-java/pom.xml` names.
3. Set the version in `dref-java/pom.xml`, commit, and push a tag: `git tag v0.1.0 && git
   push origin v0.1.0`. The workflow `.github/workflows/publish.yml` runs
   `mvn -Prelease clean deploy`: sources, javadoc, signatures, upload.

By hand, with a `central` server in `~/.m2/settings.xml` holding the Portal token and a GPG
key in your keyring:

```bash
(cd dref-java && mvn -Prelease -DskipTests clean deploy)
```

`dref-ts` and `dref-react` are the npm packages `@dref/validator` and `@dref/react`:
`npm publish` in `dref-ts`, then in `dref-react` once its dependency on `@dref/validator`
names that version in place of `file:../dref-ts`.

See [CONTRIBUTING.md](CONTRIBUTING.md) to work on DRef and [SECURITY.md](SECURITY.md) to
report a vulnerability.

## License

Apache-2.0 © 2026 [STRIMS AB](https://strims.se). See [LICENSE](LICENSE) and [NOTICE](NOTICE).
