# dref-validator (Java)

Domain model & validation library with one dependency, regl's rule engine (`dev.regl:regl-java`, itself dependency-free). Define a model with the fluent
`Property.Builder`, validate instances from maps or annotated POJOs, and map foreign payloads onto
your domain models. Java 17+.

Java reference implementation of the [DRef specification](https://dref.dev). The canonical
spec, catalogs and domain documents live in [`dref-spec`](../dref-spec), in this repository.

```xml
<dependency>
    <groupId>dev.dref</groupId>
    <artifactId>dref-validator</artifactId>
    <version>0.1.0</version>
</dependency>
```

```groovy
implementation 'dev.dref:dref-validator:0.1.0'
```

---

## 1. Defining a Model

`DomainModel` carries the model name plus its `authority`, `ttl`, `count` and `properties`. The
architectural classification (entity / value / configuration) is **derived**, not declared:
a model that declares a `count` range is a configuration, an all-`immutable` model is a value,
anything else is an entity that must declare at least one `key` property. `model.classify()` returns
the `ModelType`.

```java
import dev.dref.*;
import java.util.List;

DomainModel customer = new DomainModel(
    "Customer",
    ModelAuthority.CLIENT,     // client | internal | external
    null,                      // ttl: null = lifecycle-manager-determined (persistent by default),
                               //      or a duration expression like "30d" (s m h d M y)
    new Range(0, null),        // instance count bounds (null side = unbounded)
    List.of(
        Property.builder("id", FieldType.STRING)
            .required(true)
            .key(true)
            .startsWith("c_")
            .immutable()
            .build(),
        Property.builder("email", FieldType.STRING)
            .required(true)
            .email()
            .build(),
        Property.builder("creditScore", FieldType.NUMBER)
            .greaterThan(300)
            .build(),
        Property.builder("tags", FieldType.STRING)
            .list(true)
            .unique()
            .maxLength(20)
            .build()
    )
);
```

Every constraint in the catalog has a builder method: `minLength`, `length`, `pattern`, `range`,
`positiveInteger`, `allowedValues`, `unique`, `email`, ... A model is immutable when every property
is `immutable`; uniqueness is defined by the composite `key` properties.

### Parsing a full domain document (`DrefDomain.from`)

`DrefDomain.from(Map)` reads a JSON-shaped Domain Document — `defaults`, `scopes`, `models` — in one
call. It expands **domain field types** (`defaults.fields`) into their concrete builtin-backed form at
parse time: a property whose `type` names a declared field type resolves to that field type's builtin
type, effective `list` flag, and constraints (field type constraints first, then the property's own).
An unresolvable reference — undeclared field type, unknown base, a cycle, or a name shadowing a builtin —
throws an `IllegalArgumentException`. The resolved definitions are exposed via `domain.fieldTypes()`.

```java
DrefDomain domain = DrefDomain.from(jsonMap);         // expands defaults.fields references
Map<String, DomainFieldType> fieldTypes = domain.fieldTypes(); // name -> resolved definition
DomainModel user = domain.model("User");
ValidationResult result = domain.validate();          // domain + every model (+ mapsFrom)
```

## 2. Validating Instances

### From a map

```java
Map<String, Object> data = Map.of(
    "id", "c_99814",
    "email", "ada@example.com",
    "creditScore", 750,
    "tags", List.of("vip", "imported")
);

// Validate the model definition itself, then an instance:
ValidationResult modelCheck = DrefValidator.validateModel(customer);
ValidationResult result = DrefValidator.validateInstance(data, customer);

if (!result.isValid()) {
    result.errors().forEach(e ->
        System.out.println(e.field() + ": [" + e.constraint() + "] " + e.message()));
}
```

Each value's runtime type is matched against the property's `FieldType` — a wrong scalar type is a `type`
error regardless of path (map, POJO, or per-list element), e.g. `"12.5"` on a `Number` property or `42`
on a `String` property. Temporal types accept a `String` or a parsed date/time value
(`java.time.*`); the domain-`formats` overload additionally checks temporal `String` lexically and, when
the domain declares an `epoch`/`epochMillis` format for a temporal type, accepts whole `Number`
values instead (a fractional number is a `format` error). Named formats `iso8601`/`epoch`/`epochMillis`
are honored for `date`, `time` and `dateTime` alike.

### Warn-only constraints

Tag a constraint with `.warnOnly()` (or `warnOnly: true` in a catalog document, or
`@Email(warnOnly = true)` in an annotated POJO) to loosen strictness: its failures are reported as
**warnings** and never fail validation.

```java
DomainModel customerModel = new DomainModel(
    "Customer", ModelAuthority.CLIENT, null, null,
    List.of(
        Property.builder("email", FieldType.STRING)
            .required(true)
            .email()
            .warnOnly()
            .build()
    )
);

ValidationResult result = DrefValidator.validateInstance(Map.of("email", "not-an-email"), customerModel);
result.isValid();        // true
result.errors();         // []
result.warnings();       // [ValidationError[field=email, constraint=email, ...]]
result.hasWarnings();    // true
```

### Failing loudly: exceptions and callbacks

Besides inspecting the returned `ValidationResult`, failures can be handled as an exception or in a
callback — pick whichever fits the call site:

```java
// Throw on failure (warnings never throw): DrefValidationException wraps the result.
try {
    DrefValidator.validateInstanceOrThrow(data, customerModel);
} catch (DrefValidationException e) {
    e.result().errors().forEach(err -> System.err.println(err.field() + ": " + err.message()));
}

// Or handle the failed result in a callback (invoked only when validation does not pass):
DrefValidator.validateInstance(data, customerModel, failed -> failed.errors().forEach(System.err::println));
```

The same trio — returned result, `*OrThrow`, and the `Consumer<ValidationResult>` overload — is
available for `validateModel`, `validateProperty`, both `validateInstance(Object, DomainModel)`
(introspection) and the one-call annotated `validateInstance(Object)` variants.

### Restricting writers per property (`authority`)

A property may declare which principal is allowed to **set** it via `Property.Builder.authority(...)`
(`client`, `internal`, or `external`). `validateWrite(data, model, writer)` runs full instance
validation and additionally fails every property present in the payload whose effective authority does
not match the writer — a property's effective authority is its own when declared, otherwise it inherits
the model's (which defaults to `internal` when omitted or `null`). Properties the payload leaves
untouched are unrestricted — so the same call guards both creates and updates. `validateInstance`
remains authority-agnostic.

```java
DomainModel userModel = new DomainModel(
    "User", ModelAuthority.CLIENT, null, null,
    List.of(
        Property.builder("username", FieldType.STRING).required(true).build(),
        Property.builder("emailVerified", FieldType.BOOLEAN)
            .authority(ModelAuthority.INTERNAL)   // only backend logic may set it
            .build()
    )
);

DrefValidator.validateWrite(Map.of("username", "ada"), userModel, ModelAuthority.CLIENT).isValid(); // true
DrefValidator.validateWrite(Map.of("username", "ada", "emailVerified", true),
    userModel, ModelAuthority.CLIENT).isValid();   // false — emailVerified is internal
```

In annotated POJOs, author by `@Property(authority = "internal")` (blank leaves the field inheriting
the model-level authority; a bare `@Model` defaults to `internal`). `validateWrite` is also available
for POJO instances and maps, with `OrThrow` and callback overloads mirroring `validateInstance`.

### From a POJO, by introspection

Values are read via getters (`getX()`, `isX()`), record accessors and public fields, then matched
against the model. Java values are additionally checked against the expected `FieldType` so a
`String` where a `Number` is expected is reported as a `type` error.

```java
record Customer(int id, String email) {}

DomainModel recordModel = new DomainModel(
    "Customer", ModelAuthority.CLIENT, null, null,
    List.of(
        Property.builder("id", FieldType.NUMBER).positiveInteger().build(),
        Property.builder("email", FieldType.STRING).required(true).email().build()
    )
);

DrefValidator.validateInstance(new Customer(42, "ada@example.com"), recordModel).isValid(); // true
DrefValidator.validateInstance(new Customer(42, "nope"), recordModel).isValid();            // false
```

### From an annotated POJO — the model described in the class

```java
import dev.dref.DomainModel;
import dev.dref.ModelAuthority;
import dev.dref.ValidationResult;
import dev.dref.annotation.Model;
import dev.dref.annotation.Property;
import dev.dref.constraints.Email;
import dev.dref.constraints.GreaterThan;
import dev.dref.constraints.StartsWith;

@Model(name = "Customer", authority = ModelAuthority.CLIENT, ttl = "30d")
class Customer {
    @Property(required = true, description = "Customer identifier")
    @StartsWith("c_")
    private String id;

    @Property(required = true)
    @Email
    private String email;

    @Property
    @GreaterThan(300)
    private int creditScore;

    Customer(String id, String email, int creditScore) {
        this.id = id;
        this.email = email;
        this.creditScore = creditScore;
    }

    public String getId() { return id; }
    public String getEmail() { return email; }
    public int getCreditScore() { return creditScore; }
}

// Build the model from the class...
DomainModel customerModel = DrefModel.build(Customer.class);

// ...or derive and validate in one call:
ValidationResult ok = DrefValidator.validateInstance(new Customer("c_1", "ada@example.com", 750));
```

`@Model` and `@Property` live in `dev.dref.annotation`; the 30+ constraint annotations live in
`dev.dref.constraints` — one per catalog constraint, mirroring the `Property.Builder` methods
(`@MinLength(2)`, `@Email`, `@Range(min = 1, max = 10)`, `@Unique`, `@AllowedValues({...})`,
`@Immutable`, `@PositiveInteger`, `@IsTrue`, ...). A `@Property(name = ...)` renames the model
property and is respected by introspection. The property `type` defaults to inference from the Java
type (`String`, `int`, `boolean`, `LocalDate` → `Date`, `Instant` → `DateTime`, `List<String>` →
`String` + `list`), or can be set explicitly: `@Property(type = FieldType.NUMBER)`.

> **Naming note:** `dev.dref.annotation.Property` (annotation) shadows the `dev.dref.Property` record
> (used by `Property.builder`) if you import both in one file. When a file uses both the annotation
> and the builder, keep `import dev.dref.Property;` and qualify the annotation
> `@dev.dref.annotation.Property(...)` (or vice-versa).

## 3. Mapping Foreign Payloads

A `MappingDocument` maps a foreign payload onto one of our models. Only the mapping is expressed —
validating the incoming object against its own model document is the caller's responsibility.

```java
import dev.dref.*;
import java.util.*;

ModelRef target = new ModelRef("PaymentIntent", "commerce");

MappingDocument mapping = MappingDocument.builder("Stripe PaymentIntent", target)
    .field("id")                                        // 1:1 identity copy
    .field("amount", "amountMinor")                     // renamed 1:1
    .field("status", "state",
        List.of(new Transform(TransformType.LOWER_CASE),
                new Transform(TransformType.REPLACE,
                    Map.of("pattern", "succeeded", "replacement", "paid"))))
    .field("created", "createdAt",
        List.of(new Transform(TransformType.FORMAT_DATE, "unix")))
    .build();

Map<String, Object> stripe = Map.of(
    "id", "pi_3O...",
    "amount", "1995",
    "status", "SUCCEEDED",
    "created", 1699899982
);

MappingResult result = DrefMapper.map(stripe, mapping);
if (result.isValid()) {
    Map<String, Object> paymentIntent = result.target();
}
```

- `formatDate` takes the **source** format (`"unix"` for epoch seconds/millis, a dref token pattern
  such as `"YYYY/MM/DD"` to parse strings, or blank for ISO). The **output** format is resolved from
  the target domain: the `defaults.formats` entry for the mapped property's field type
  (`Date`/`Time`/`DateTime`), falling back to ISO `YYYY-MM-DDTHH:mm:ssZ`. Named outputs are honored:
  `iso8601` renders that value kind's ISO pattern, while `epoch`/`epochMillis` map to whole-number
  Unix seconds / milliseconds. Pass the target model and domain formats to drive it:

```java
Formats commerceFormats = new Formats("YYYY-MM-DD", "HH:mm:ss", "YYYY-MM-DDTHH:mm:ssZ");
DrefMapper.map(stripe, mapping, null, paymentIntentModel, commerceFormats);
```

- Custom transforms resolve through a `customResolver`: `Function<String, Function<Object, Object>>`
  keyed by the free-text parameter.

```java
import java.util.function.Function;

Function<String, Function<Object, Object>> resolver = name -> value ->
    name.equals("com.acme.slug") ? String.valueOf(value).toLowerCase().replace(' ', '-') : value;

MappingResult result = DrefMapper.map(source, mapping, resolver);
```

---

See [SPECIFICATION.md](../dref-spec/SPECIFICATION.md) and
the [dref-spec README](../dref-spec/README.md) for the full
constraint and transformation catalogs.

## License

Apache-2.0 — see [LICENSE](LICENSE) and [NOTICE](NOTICE).
