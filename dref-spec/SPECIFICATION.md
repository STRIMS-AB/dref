# DRef Specification — Open Domain Model, Validation & Mapping Contract

**Version:** 1.0.0  
**Authority:** [dref.dev](https://dref.dev)  
**Standard URI:** `https://dref.dev/schemas/v1/specification.json`

---

## 1. Overview

**DRef** (Domain Reference) is an open specification for declaring domains, organizing their models (with
optional scope membership), and attaching structural governance rules and field-level validation rules.

A DRef **Domain Document** serves as:
1. The **contract definition** across APIs, distributed services, databases, and client runtimes.
2. The **declarative rulebook** for input validation, schema enforcement, and edge boundary checks.
3. The **single source of truth** for data models, defining ownership, mutability, lifecycle retention (TTL), and structural bounds.
4. The home of **incoming mapping definitions** (`mapsFrom`) that describe how foreign payloads are imported onto a model.

---

## 2. Model Definition & Metadata (`MODEL`)

A **Model** represents a discrete domain concept (e.g. `Customer`, `PaymentIntent`, `AuditLog`, `SystemConfig`).
Models are declared at the top level of a Domain Document (never nested); they may optionally reference a
**Scope** by name through the `scope` attribute (see §5). Each model defines its authority, lifecycle,
structural rules, and — for externally-fed models — the mapping definitions used to import foreign
payloads. Its **architectural classification** (entity / value / configuration) is *derived* from that
structure, never declared (see §2.2).

The `scope` attribute, when present, references a scope declared in the document's sibling `scopes` array;
it is a lightweight membership marker, not an ownership container. A model is addressed as
`<domain>/<scope>/<model>` when needed outside the document; an unscoped model is addressed as `<domain>/<model>`.

```json
{
  "name": "PaymentIntent",
  "scope": "orders",
  "authority": "external",
  "mapsFrom": [
    {
      "name": "Stripe PaymentIntent",
      "provider": "Stripe",
      "version": "1.0.0",
      "fields": [
        "id",
        "status",
        { "from": "order_id", "to": "orderId" },
        { "from": "amount", "transform": [{ "type": "divide", "param": 100 }] }
      ]
    }
  ],
  "properties": [
    { "name": "id", "type": "String", "required": true, "key": true }
  ]
}
```

### 2.1 Model Attributes Specification

| Attribute | Type | Values / Format | Description |
| :--- | :--- | :--- | :--- |
| **`name`** | `string` | PascalCase Alphanumeric | Unique model identifier within the domain namespace. |
| **`authority`** | `enum` | `client`, `internal`, `external` | Originating source of truth / authority for instance creation (defaults to `internal` when omitted). |
| **`ttl`** | `string` | `<integer><unit>` — `s`, `m`, `h`, `d`, `M`, `y` | Retention duration expression. An omitted `ttl` is lifecycle-manager-determined (persistent by default) and is not modelled in DRef. |
| **`count`** | `range` | `{ min?, max? }` | Inclusive instance-count range. Either bound optional; absent means unbounded instance count. `min` defaults to `0` when omitted. |
| **`scope`** | `string` | Lowercase kebab-case `^[a-z0-9_-]+$` | Optional reference to a Scope declared in the document's `scopes` array. Referencing an undeclared scope is invalid. |
| **`mapsFrom`** | `array` | Mapping Definition[] | Incoming mapping definitions describing how foreign payloads are imported onto this model (see §6). |
| **`properties`** | `array` | Property[] | The model's properties with their types and rules. |

### 2.2 Model Classification (derived)

A model's architectural classification is **derived, not declared** — the document carries **no `type`
attribute**. Validators and tooling classify a model from its structure alone:

- **`configuration`** — the model declares a `count` range, typically `{ "max": 1 }`, with a fixed
  property set governing operational or application runtime parameters (e.g. `GatewaySettings`,
  `RateLimitRule`).
- **`value`** — *every* property declares the `immutable` rule, so the object is identified
  entirely by its attributes rather than identity (e.g. `Money`, `Address`, `GeoCoordinates`).
  Announcing a `key` alongside all-`immutable` properties captures **append-only / event** intent
  (e.g. `PaymentProcessed`, `UserLoggedIn`) — an event-style model is simply a value with a key.
- **`entity`** — anything else: a model with at least one mutable property and its own identity and
  lifecycle (e.g. `Customer`, `Order`, `Account`).

Mutability follows the same derivation: a model instance is immutable when *every* property declares the
`immutable` rule; an entity's uniqueness is defined by its composite `key` properties. Neither is a
first-class model attribute.

The classification is machine-checked where it applies: a model that is neither a configuration nor a
value is treated as an **entity**, which **must declare at least one `key: true` property**. The rule is
mirrored by `validateModel` in the TypeScript and Java reference implementations.

### 2.3 Model Authority (`authority`)

Authority appears at two levels with different jobs:

- **Model-level** (this table's `authority`): who owns the record — the originating source of truth for instance creation. It is runtime/ownership metadata the domain document records but DRef does not enforce structurally. It **defaults to `internal` when omitted**.
  - **`client`**: Created or supplied directly by external users or frontend client applications.
  - **`internal`**: Generated and managed strictly by internal backend microservices or core business logic.
  - **`external`**: Ingested or synced from third-party external platforms (e.g. Stripe, ERP, CRM).
- **Property-level** (`authority` on each property): which principal is permitted to **set** that field's value. Omitted properties **inherit the model-level authority** (which itself defaults to `internal` when the model omits it). Property-level authority carries enforcement teeth via `validateWrite` (see §5.3): validation of a write fails on every property present in the payload whose *effective* authority (its own, or inherited) does not match the writer, e.g. a `client` writer attempting to set an `internal` field. `validateInstance` remains authority-agnostic.

### 2.4 Model Retention (`ttl`)
- `ttl` is an **expression** of an integer and a unit — `s` (seconds), `m` (minutes), `h` (hours),
  `d` (days), `M` (months), `y` (years): e.g. `"5s"`, `"2m"`, `"24h"`, `"30d"`, `"1M"`. It is not an
  enum of fixed values.
- A model with **no** `ttl` (null) is governed by the lifecycle manager — which is currently outside
  DRef's scope — and may be treated as persistent by default. DRef only models explicit retention
  durations; the value `persistent` is not part of the language.

### 2.5 Model Instance Count (`count`)

`count` bounds the total number of instances permitted for a model. It is an inclusive range
`{ min, max }` where either bound may be omitted:

- **`min` defaults to `0`** when omitted, so `{ "max": 1000000 }` and `{ "min": 0, "max": 1000000 }`
  are equivalent.
- An **absent `count`** means the instance count is **unbounded** (same as `{ "min": 0 }`).
- The default `{ "min": 0, "max": Infinity }` is therefore never written explicitly — catalog
  documents omit `count` entirely except when a bound is actually constraining.

```json
{ "name": "GatewaySettings", "count": { "max": 1 } }
```

---

## 3. Field Types & Primitive Catalog

Every property on a model has an explicit data type. A property's `type` is either a **builtin**
(`"String"`, `"Number"`, `"Integer"`, `"Boolean"`, `"Date"`, `"DateTime"`, `"Time"`) or a **domain field type** declared
under `defaults.fields` (see §5.1.1), which expands to one of the builtins:

| Field Type | Syntax | Description | Example |
| :--- | :--- | :--- | :--- |
| **String** | `"String"` | UTF-8 character string | `"user@example.com"`, `"acme_inc"` |
| **Number** | `"Number"` | 64-bit IEEE floating-point | `42`, `19.99`, `-3.5` |
| **Integer** | `"Integer"` | A whole number — a `Number` with no fractional part. Not a class: `1.0` and `1e3` qualify, `80.5` does not. | `42`, `1.0`, `2147483648` |
| **Boolean** | `"Boolean"` | Binary flag | `true`, `false` |
| **DateTime** | `"DateTime"` | ISO-8601 UTC timestamp | `"2026-09-08T10:00:00Z"` |
| **Date** | `"Date"` | Calendar date (`YYYY-MM-DD`) | `"2026-09-08"` |
| **Time** | `"Time"` | Wall-clock time (`HH:mm:ss`) | `"14:30:00"` |

A property becomes a **list** of any of these with the `"list": true` attribute (§2.5 / §5.1); collection
elements share the property's field type. Beyond the builtin and domain field types, a property's `type`
may be a **model reference** — see §3.1.

Accepted **runtime values** for `Date`/`Time`/`DateTime` properties are governed by the domain's
`defaults.formats` (§5.1): either a `String` whose lexical form matches the declared format, or — when
the domain declares the named `epoch`/`epochMillis` form — a whole-number of Unix seconds/milliseconds.

### 3.1 Model References (`#Model`)

A property whose `type` is `#ModelName` is a **model reference** — a cross-model link (foreign key)
to the named model, which must be declared in the same domain document. This is the DRef-native way
to express the relationships that turn a set of models into a connected graph; the `#`-prefixed
namespace is reserved exclusively for model references and may not be used for domain field types
(§5.1.1).

```json
{
  "models": [
    { "name": "Category", "properties": [
      { "name": "id", "type": "String", "key": true },
      { "name": "name", "type": "String" }
    ]},
    { "name": "Product", "properties": [
      { "name": "id", "type": "String", "key": true },
      { "name": "categoryId", "type": "#Category", "required": true }
    ]}
  ]
}
```

Semantics:

- **Target** — the reference resolves to the referenced model's **key property** (§2); the model must
  declare exactly one key property for the link to be unambiguous.
- **Value** — a model-reference property holds the *referenced key's value* at runtime (a scalar:
  `String` or `Number`). For instance validation its value is checked against the referenced key's field
  type; `validateModel` / `validateDomain` never require the foreign instance to be present.
- **Cardinality** — a to-one link (`list` omitted/false) is a plain foreign key; `"list": true` makes it
  a to-many link (a collection of referenced keys).
- **Validation** — `validateDomain` reports `unknownModelReference` when the referenced model is not
  declared, and `modelReference` when the name is not a valid model identifier. References may point
  forward, backward, or to the containing model itself. `resolveModels` resolves a reference to the
  referenced key's scalar type so instance validation and mapping operate on the expanded property.

The referenced model's key property may equally be the target of the deep-query traversal described by
consumers; DRef only defines the link, not the traversal.

---

## 4. Field Validation & Rules

Rules in DRef are declarative validation rules attached to model properties to guarantee data integrity and business invariants.

### 4.1 Canonical Rule Inheritance from Regl

DRef does not maintain a separate, duplicate validation rule catalog. Instead, **DRef normatively adopts and inherits the generic rule catalog from the Regl Specification** ([`https://regl.dev/spec`](https://regl.dev/spec) / `regl-spec`).

All primitive rules targeting strings, numbers, booleans, collections, and dates/times are defined, typed, localized, and tested by Regl:
- **String rules**: `minLength`, `maxLength`, `length`, `pattern`, `contains`, `startsWith`, `endsWith`, `email`, `url`, `uuid`, `languageCode`, `lowercase`, `uppercase`, `trimmed`, `notEmpty`, `text`.
- **Number rules**: `greaterThan`, `greaterThanOrEqual`, `lessThan`, `lessThanOrEqual`, `positive`, `negative`, `positiveInteger`, `negativeInteger`, `multipleOf`, `precision`.
- **Temporal rules**: `dateFormat`, `isoDate`, `isoDateTime`, `isoTime`, `after`, `before`, `epoch`, `epochMillis`.
- **List / Collection rules**: `range`, `unique`.
- **Boolean rules**: `isTrue`, `isFalse`.
- **Universal rules**: `enum` (allowed values), `notNull` (presence).

Regl has no `integer` **rule**: whole-number-ness is its `INTEGER` *target type*, which DRef adopts
as the `"Integer"` field type in §3. A whole number is therefore a property's type, not something a
`Number` property opts into with a rule.

An `"Integer"` property still accepts every Number rule — an integer is a number with a whole-number
assertion laid on top, so a port is still bounded:

```json
{ "name": "port", "type": "Integer", "rules": [ { "type": "lessThan", "param": 65536 } ] }
```

For the authoritative specification of rule parameters, target types, scalar type guards, and localized messages, refer directly to the **Regl Specification**.

### 4.2 Severity

Every rule evaluation produces an issue at a **severity** level:

| Severity | Effect on validation |
| :--- | :--- |
| `error` | Blocking — the result is invalid when any error-severity issue is reported. This is the **default** for every rule. |
| `warning` | Non-blocking — reported on the result but never fails validation. |

A rule instance may set `"severity": "warn"` to demote its failures from errors to warnings:

```json
{
  "name": "email",
  "type": "String",
  "rules": [
    { "type": "email", "severity": "warn" }
  ]
}
```

The validation result separates **errors** (blocking) from **warnings** (warn-only); a result with only warnings is still valid:

```json
{
  "isValid": true,
  "errors": [],
  "warnings": [
    { "field": "email", "rule": "email", "message": "Value is not a valid email address." }
  ]
}
```

### 4.3 Cross-Field Parameter References (`$field`)

As a domain extension beyond literal parameters, DRef allows parameterized rules with a **scalar parameter** (`string`, `number`) to specify a cross-field reference. A parameter of the form `"$fieldName"` is resolved, during **instance validation**, against the value of the named **sibling property in the same model**:

```json
{
  "name": "endDate",
  "type": "Number",
  "rules": [{ "type": "greaterThan", "param": "$startDate" }]
}
```

`endDate > startDate` is evaluated dynamically per instance.

Resolution rules:
- **Unset sibling → the rule is skipped.** When the referenced property is absent, `null`, or an empty string in the instance, the reference rule is inert and produces no issue — consistent with how unset optional fields behave.
- **References only resolve in instance context.** `validateInstance` / `validateWrite` resolve them (including POJO paths and list-element rules); a standalone `validateProperty` call has no sibling data and skips reference rules.
- **String literals beginning with `$` are always references.** To match a literal `$`, encode it in a `pattern` regex that does not start with the sigil.

Model validation (`validateModel`) rejects malformed references:

| Error | Key |
| :--- | :--- |
| Empty reference (`"$"`) | `fieldRef` |
| Target property does not exist in the same model | `unknownFieldRef` |
| Target is the evaluated property itself | `selfFieldRef` |
| Target type incompatible with the rule's parameter (a number-parameter rule needs a `Number` sibling, a string-parameter rule a `String` sibling) | `fieldRefType` |

### 4.4 Domain Governance & Temporal Formats

In addition to generic Regl validation rules, DRef defines domain-level attributes that govern lifecycle, mutability, and formats:
- **`key: true`**: Identifies one or more properties forming the primary identity of an entity.
- **`immutable: true`**: Forbids modification of this property after initial creation (write-guard).
- **`authority`**: Specifies whether the property/model originates from `client`, `internal`, or `external` sources.
- **Domain Formats (`defaults.formats`)**: Binds domain-wide temporal rules (`Date`, `DateTime`, `Time`). When configured as `epoch` or `epochMillis`, temporal values are validated as whole-number timestamps since the Unix epoch rather than standard ISO strings.

### 4.5 Rules in Context — Worked Example

A complete model combining Regl rules with DRef domain metadata:

```json
{
  "name": "Customer",
  "authority": "client",
  "properties": [
    {
      "name": "email",
      "type": "String",
      "required": true,
      "key": true,
      "rules": [
        { "type": "email" },
        { "type": "lowercase" },
        { "type": "trimmed" }
      ]
    },
    {
      "name": "age",
      "type": "Number",
      "required": false,
      "rules": [
        { "type": "positiveInteger" },
        { "type": "greaterThanOrEqual", "param": 18 },
        { "type": "lessThan", "param": 150, "severity": "warn" }
      ]
    },
    {
      "name": "tags",
      "type": "String",
      "list": true,
      "required": false,
      "rules": [
        { "type": "range", "param": { "min": 1, "max": 5 } },
        { "type": "unique" },
        { "type": "trimmed" }
      ]
    }
  ]
}
```

Validating this instance:

```json
{
  "email": "USER@Example.com ",
  "age": 12,
  "tags": []
}
```

produces:

```json
{
  "isValid": false,
  "errors": [
    { "field": "email", "rule": "lowercase", "message": "Value must be all lowercase." },
    { "field": "email", "rule": "trimmed", "message": "Value must not have leading or trailing whitespace." },
    { "field": "age", "rule": "greaterThanOrEqual", "message": "Value must be greater than or equal to 18." },
    { "field": "tags", "rule": "range", "message": "List must have at least 1 items, found 0." }
  ],
  "warnings": [
    { "field": "email", "rule": "email", "message": "Value is not a valid email address." }
  ]
}
```

### 4.6 Extending the Catalog

Because DRef inherits its rules from Regl, custom rules are registered directly via Regl's extension points (`RuleEvaluators.register(...)` in Java, or the equivalent in TypeScript). They immediately become available across all DRef domain documents and builders without modifying the DRef specification.

---

## 5. Domain Documents

A **Domain Document** is the *primary artifact* in DRef. It defines a bounded business domain: its name,
conventions, the **scopes** that organize the domain (optional), and the models that make up the domain.
`scopes` and `models` are **siblings** at the top level; a model may reference a scope by name via its
`scope` attribute.

```json
{
  "$schema": "https://dref.dev/schemas/v1/domain.json",
  "name": "Commerce",
  "version": "1.0.0",
  "description": "Core e-commerce concepts",
  "defaults": {
    "formats": {
      "date": "YYYY-MM-DD",
      "time": "HH:mm:ss",
      "dateTime": "YYYY-MM-DDTHH:mm:ssZ"
    }
  },
  "scopes": [
    { "name": "catalog", "description": "Products and pricing" },
    { "name": "orders", "description": "Orders and payments" }
  ],
  "models": [
    {
      "name": "Product",
      "scope": "catalog",
      "authority": "internal",
      "properties": [
        { "name": "id", "type": "String", "required": true, "key": true },
        { "name": "title", "type": "String", "required": true }
      ]
    },
    {
      "name": "PaymentIntent",
      "scope": "orders",
      "authority": "external",
      "mapsFrom": [
        {
          "name": "Stripe PaymentIntent",
          "provider": "Stripe",
          "version": "1.0.0",
          "description": "Maps a Stripe PaymentIntent API object onto the DRef external PaymentIntent.",
          "fields": [
            "id",
            "status",
            { "from": "order_id", "to": "orderId" },
            { "from": "amount", "transform": [{ "type": "divide", "param": 100 }] }
          ]
        }
      ],
      "properties": [
        { "name": "id", "type": "String", "required": true, "key": true }
      ]
    },
    {
      "name": "SystemConfig",
      "authority": "internal",
      "count": { "max": 1 },
      "properties": [
        { "name": "key", "type": "String", "required": true }
      ]
    }
  ]
}
```

### 5.1 Domain Document Attributes

| Attribute | Required | Description |
| :--- | :--- | :--- |
| **`$schema`** | no | Schema URL. Points to `https://dref.dev/schemas/v1/domain.json` for machine-readable validation. |
| **`name`** | **yes** | Human-friendly domain name. |
| **`version`** | no | Semantic version of this domain document. |
| **`description`** | no | Short description of the domain's scope. |
| **`defaults`** | no | Domain-wide conventions. Extensible object — future global properties are siblings of `formats`. |
| **`defaults.formats`** | no | Lexical format conventions for the `Date`, `Time`, and `DateTime` field types within this domain. Each slot is a dref token pattern (`YYYY MM DD HH mm ss`), the named form `iso8601`, or the named epoch forms `epoch`/`epochMillis`. |
| **`defaults.fields`** | no | Domain field types — named, reusable field definitions referenced from a property's `type`. |
| **`scopes`** | no | Array of scopes that organize the domain's models. Optional — a document may declare models with no scope at all. |
| **`models`** | **yes** | Array of DRef models belonging to the domain. Models are declared at the top level and may reference a scope by name. |

The `defaults` block is intentionally extensible: future global properties — for example a domain-wide
`authority`, `ttl`, or default currency — are added as siblings of `formats`. The JSON Schema
(`catalog/domain.schema.json`) sets `additionalProperties: true` on `defaults` so new properties are
automatically permitted without a schema version bump.

Each of `date`, `time` and `dateTime` accepts one of three forms:

- **dref token pattern** — e.g. `"YYYY-MM-DD"`, `"HH:mm:ss"`, `"YYYY-MM-DDTHH:mm:ssZ"`. Values are
  `String`s parsed against the pattern.
- **`"iso8601"`** — the ISO-8601 representation of that value kind (`YYYY-MM-DD`, `HH:mm:ss`,
  `YYYY-MM-DDTHH:mm:ssZ` respectively).
- **`"epoch"` / `"epochMillis"`** — Unix seconds / milliseconds. Values are **whole `Number`s**, not
  strings; string values are rejected, and `formats.dateTime` is the conventional place for these.

Named forms are honored by both validators and mappers: a `Date`/`Time`/`DateTime` instance value is
accepted when it is a whole number under an `epoch`/`epochMillis` format (a fractional number is a
`format` error), and a `formatDate` transform emits a number for those formats. An absent slot falls
back to the ISO standard.

#### 5.1.1 Domain Field Types

`defaults.fields` declares named **domain field types** — reusable field definitions that a model's
property references via its `type` attribute. A declaration binds a base builtin type, an optional `list`
flag, and optional rules. Declaring a field type once and referencing it from many models keeps
strong invariants (e.g. *"an email is a trimmed, lowercase, valid email address"*) in one canonical place.

Each field type is an object:

| Attribute | Required | Description |
| :--- | :--- | :--- |
| **`type`** | **yes** | Base builtin field type (`String`, `Number`, `Integer`, `Boolean`, `Date`, `DateTime`, `Time`) **or** another declared field type. |
| **`list`** | no | When `true`, every property referencing this field type is a list. |
| **`rules`** | no | Rule catalog entries applied to every property referencing this field type. |

```json
{
  "$schema": "https://dref.dev/schemas/v1/domain.json",
  "name": "Identity & Access",
  "defaults": {
    "fields": {
      "emailAddress": {
        "type": "String",
        "rules": [
          { "type": "email" },
          { "type": "lowercase" },
          { "type": "trimmed" }
        ]
      },
      "userHandle": { "type": "emailAddress" }
    }
  },
  "models": [
    {
      "name": "User",
      "properties": [
        { "name": "id", "type": "String", "key": true },
        { "name": "email", "type": "emailAddress", "required": true }
      ]
    }
  ]
}
```

Rules:

- **Plain identifiers** — field type names match `^[a-zA-Z][a-zA-Z0-9_]*$`. The `#` prefix is reserved for
  model references; field types are domain-scoped and shadowing a builtin field type name is an error.
- **Pure expansion** — a field type reference is sugar for its resolved definition: the property becomes
  the base builtin `type`, its effective `list` flag is the property's `list` **or** the field type's, and
  its effective rules are the field type's rules (inherited first) **followed by** the
  property's own rules. Validators and mappers never see the reference — they operate on the
  expanded property.
- **Field types can build on field types** — e.g. `userHandle` above extends `emailAddress`. References
  are resolved depth-first and **cycles are invalid**.
- **Validation** — `validateDomain` reports an undeclared property field type reference, an undeclared
  field type base, a cycle, or a builtin shadow as validation errors. The Java parser expands field types
  at parse time (`DrefDomain.from`) and throws on an unresolvable reference, exactly like the TypeScript
  `resolveModels`/`resolveFieldTypes` helpers.
- **Machine-checked everywhere** — the JSON Schema enforces the object shape (including that a field type
  name does not match a builtin) and the validators enforce resolution; nothing is enforced by convention.

### 5.2 Scopes

A **Scope** groups related models — typically by bounded context or subdomain — within a document. Scopes
and models are siblings: a scope simply gives a name that models reference via their `scope` attribute. The
scope is a lightweight membership marker, **not** an ownership container — a model without a `scope`
attribute belongs to the domain directly. A model's scope reference must match a declared scope name; an
`unknown scope` reference is a validation error. Where a model needs to be addressed outside the document
(logs, APIs, mapping references) it is addressed as `<domain>/<scope>/<model>` (or `<domain>/<model>` when
unscoped).

| Attribute | Required | Description |
| :--- | :--- | :--- |
| **`name`** | **yes** | Lowercase kebab-case scope identifier matching `^[a-z0-9_-]+$` (e.g. `catalog`, `orders`). Unique within the domain. |
| **`description`** | no | Short description of this scope's purpose. |

### 5.3 Validating Instances and Writes

A document's models are enforced at runtime by the reference validators two ways:

- **`validateInstance(data, model)`** — authority-agnostic structural validation: scalar **type
  membership**, required/key fields, and every declared rule. Used to check records regardless of
  who supplies them. Both runtimes report a wrong scalar type as a `type` error before its rules
  are evaluated (e.g. a `Number` property holding `"12.5"` or a `Boolean` holding `"yes"`); temporal
  types accept a `String` or a parsed date/time value, and list properties type-check each element.
  With a domain's `defaults.formats` supplied to the domain-aware overloads, temporal properties declared
  as `epoch`/`epochMillis` accept whole `Number` values instead. The Java overload additionally checks
  that temporal `String` values match the declared lexical format (a miss is a `format` error); the
  TypeScript runtime defers lexical pattern checking to the domain document's `defaults.formats`.
- **`validateWrite(data, model, writer)`** — runs the full instance validation, then additionally fails
  each property **present in the payload** whose *effective* authority does not match `writer`
  (`client`, `internal` or `external`). A property's effective authority is its own `authority` when
  declared, otherwise the model's `authority` (which defaults to `internal` when omitted). Properties the
  payload does not set are unrestricted, so the same function guards both create and update writes;
  `immutable` and `authority` compose (authority is still meaningful at creation time). A `null` writer
  skips the authority check.

Reference implementations expose `OrThrow` variants and `onInvalid` callbacks mirroring `validateInstance`.

---

## 6. Foreign Mappings (`mapsFrom`)

A **Mapping Definition** describes how a *foreign* payload can be imported onto its containing model. It is
always embedded inside the model via the `mapsFrom` array — there are **no standalone mapping documents**.
A mapping contains only the mapping information: which incoming fields to read, which target properties to
write, and an optional transform chain per field. Validating the incoming object is **not** part of the
mapping — validate it against its own model document first.

### 6.1 Mapping Definition Attributes

| Attribute | Required | Description |
| :--- | :--- | :--- |
| **`name`** | **yes** | Source model name as presented by the provider (e.g. `Stripe PaymentIntent`). |
| **`provider`** | no | Origin system (e.g. `Stripe`). |
| **`version`** | no | Semantic version of the source model or its API. |
| **`description`** | no | Short description of what is being mapped. |
| **`fields`** | **yes** | Field mappings — the only behavioral content of the definition. |

### 6.2 Field Mappings

- **Bare string** — 1:1 copy: the source field is read and written onto a same-named target property, untouched.
- **Object** — `{ "from": ..., "to"?: ..., "transform"?: [...] }`. `from` is required — a source field, **or an array
  of source fields**: the transform chain then starts from the array of their **present values** in declared order
  (absent/`null` sources are skipped; when none is present the value is `null` and passes through the chain
  untouched), and `to` is then **required**. For a single `from`, `to` defaults to `from` when omitted; `transform`
  is a chain applied left to right — bare strings stand for parameterless transforms, objects are
  `{ "type": ..., "param": ... }`.

A multi-field `from` is typically combined with a `join` step (see the transformation catalog) to assemble one
string from several sources:

```json
{ "from": ["firstName", "lastName"], "to": "fullName", "transform": [{ "type": "join", "param": " " }] }
```

`join` skips absent/`null` sources (`["Ada", null]` + `" "` → `"Ada"`), and a multi-field `from` with **no**
transform copies the array of present values onto the target as a list.

### 6.3 Runtime Behaviour

The mapper is **pure**: 1) the field value is read from the incoming payload — or, for an array `from`, the array
of present source values is assembled; 2) its transform chain runs
left to right (`default` / `constant` / `custom` operate on missing values too); 3) the result is written to
the target property (`to`, or `from` when omitted). The mapper performs **no validation** of the incoming
object — validating it against its own model document is the caller's responsibility.

The mapper is aware of the domain it is importing into: a `formatDate` step is parameterized only by its
**source** format (`"unix"` or a dref token pattern), and the **output** format is resolved from the
domain's `defaults.formats` for that field type, else the ISO standard (dref tokens `YYYY MM DD HH mm ss`).
Named outputs are honored too: `iso8601` renders that value kind's ISO pattern, while `epoch`/`epochMillis`
render whole-number Unix seconds / milliseconds (the mapped value is a `Number`, not a string).

Reference mappers: Java `DrefMapper.map(source, mapping[, customResolver])`,
TypeScript `mapInstance(source, mapping[, custom])` from `@dref/validator`. A `custom` transform is passed as a
`Function<Object,Object>` lambda in Java (or a resolver callback in TypeScript) keyed by the free-text reference
in the definition; class/function-name resolution is deferred.

**Transform languages** strings: `lowerCase`, `upperCase`, `trim`, `stripPrefix`, `stripSuffix` plus
`prefix`, `suffix`, `replace`, `substring`, `join` (array-level: joins a multi-field `from`); numbers: `multiply`,
`divide`, `abs`, `round`, `roundTo`; coercion: `toNumber`, `toString`, `toBoolean`; temporal: `formatDate`;
common: `default`, `constant`, `custom`.
The full catalog is published at `https://dref.dev/transformations-catalog.json`.

---

## 7. Machine-Readable Endpoints

Public artifacts hosted at `dref.dev`:

- **Complete Specification**: `https://dref.dev/specification.json`
- **Validation Rules Catalog** (Regl): `https://regl.dev/catalog.json`
- **Transformations Catalog**: `https://dref.dev/transformations-catalog.json`
- **Markdown Specification**: `https://dref.dev/SPECIFICATION.md`
- **Domain Document Schema** (v1): `https://dref.dev/schemas/v1/domain.json`

