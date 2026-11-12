# dref-validator

TypeScript reference implementation of the DRef domain-modeling & validation specification,
published to npm as **@dref/validator**. Lightweight, zero-dependency, built for frontend
forms, input validation, and node services.

The canonical specification, rule/transformation catalogs and domain documents live in
**dref-spec**, in this repository (the source of truth). This library mirrors that
catalog in code; see the keep-in-sync rules below.

## Installation

```bash
npm install @dref/validator
```

## Quickstart

```typescript
import { validateInstance, DomainModel } from '@dref/validator';

const customerModel: DomainModel = {
  name: 'Customer',
  authority: 'client',
  properties: [
    {
      name: 'email',
      type: 'String',
      required: true,
      key: true,
      rules: [{ type: 'email' }, { type: 'lowercase' }, { type: 'trimmed' }]
    },
    {
      name: 'age',
      type: 'Number',
      rules: [{ type: 'positiveInteger' }, { type: 'greaterThanOrEqual', param: 18 }]
    }
  ]
};

const input = { email: 'user@example.com', age: 24 };
const { isValid, errors } = validateInstance(input, customerModel);

if (!isValid) {
  console.error('Validation failed:', errors);
}
```

## Mapping foreign payloads

```typescript
import { mapInstance } from '@dref/validator';

// A mapping definition hangs off a model's `mapsFrom` array in the domain
// document (target model is the model that owns it — no mapsTo needed).
const mapping = {
  name: 'Stripe PaymentIntent',
  provider: 'Stripe',
  fields: [
    'id',
    'status',
    { from: 'order_id', to: 'orderId' },
    { from: 'amount', transform: [{ type: 'divide', param: 100 }] },
    { from: 'description', transform: ['trim', 'lowerCase'] }
  ]
};

// The mapper does not validate the payload — validate it against its
// own model document first, then map.
const { isValid, errors, instance } = mapInstance(stripePayload, mapping);

// `from` may also be an array of source fields: the transform chain starts
// from their present values (absent sources skipped), e.g. joining names:
//   { from: ['first_name', 'last_name'], to: 'fullName',
//     transform: [{ type: 'join', param: ' ' }] }
// Without a transform the target receives the array of present values as a list.
```

## Domain validation

```typescript
import { validateDomain, validateModel, resolveModels } from '@dref/validator';

// validateDomain(document):       validates a whole Domain Document envelope
// validateModel(model):           validates a model (after resolving default field types)
// resolveModels(domain):          expands defaults.fields into concrete models
// validateMappingDefinition(m):   validates a mapsFrom mapping definition
```

## Rule / Transformation Catalog Keep-in-Sync

Every rule (type, parameter type, or name change) inherited from the Regl specification
must be reflected in `src/types.ts` (rule unions) and `src/validator.ts`, with test coverage
in `test/validator.test.mjs`. The `warnOnly` severity flag mirrors `DrefRule.warnOnly` and the
`errors` vs `warnings` split in validation results.

Every transformation in `dref-spec/transformations-catalog.json` must be reflected in
`src/types.ts` (`TransformType` union) and `src/mapper.ts`, with test coverage in
`test/mapper.test.mjs`.

## Build & Test

```bash
npm run build   # tsc -> dist/
npm test        # node --test test/*.test.mjs
```

## Publishing

Bump `version` in `package.json` and publish when `dref-spec` is the
reference for the change set:

```bash
npm publish
```

## License

Apache-2.0 — see [LICENSE](LICENSE) and [NOTICE](NOTICE).
