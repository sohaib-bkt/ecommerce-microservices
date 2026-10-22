# @ecommerce-platform/contracts

Shared contracts for the ecommerce platform. This library is the single source
of truth for the wire format between services.

It holds two kinds of contract:

1. **gRPC service definitions** (`.proto` files) for synchronous RPC between
   services, compiled to TypeScript with [ts-proto](https://github.com/stephenh/ts-proto).
2. **Event schemas** for asynchronous messages published to the event bus,
   each with a runtime validator so producers and consumers cannot silently
   disagree.

## Layout

```
libs/contracts/
  proto/                       # .proto sources (the contract source of truth)
    common/v1/common.proto     # Money, Address, PageRequest, Timestamp
    account/v1/account.proto   # AccountService
    product/v1/product.proto   # ProductService
    order/v1/order.proto       # OrderService
    payment/v1/payment.proto   # PaymentService
  src/
    generated/                 # ts-proto output (do not edit by hand)
    lib/
      events/                  # event payloads + runtime schemas
      validation/schema.ts     # the dependency-free validator
  project.json
```

## Generating the proto code

The `.proto` files are the source of truth. After changing one, regenerate:

```bash
npm run proto:generate          # or: npx nx proto:generate contracts
```

This writes to `src/generated/` and copies the `.proto` files into `dist/proto`
so they remain available at runtime.

To verify in CI that the committed generated code matches the `.proto` sources:

```bash
npm run proto:check             # or: npx nx proto:check contracts
```

It generates into a temporary directory and fails if the result differs, without
writing to the workspace.

### Requirements

`protoc` must be available. The generator prefers a `protoc` binary shipped in
`node_modules/grpc-tools` and otherwise falls back to the one on `PATH`.

## Using the contracts

### gRPC types and service definitions

```ts
import { ecommerce } from '@ecommerce-platform/contracts';

const service = ecommerce.account.v1.AccountServiceDefinition;
// service.methods.getAccount.requestType / .responseType
```

The generated message types also provide `encode`, `decode`, `fromJSON`,
`toJSON`, `create` and `fromPartial`.

### Events

Every event shares the same envelope:

```ts
interface EventEnvelope<TType, TPayload> {
  id: string;          // unique per event; consumers use it to deduplicate
  type: TType;         // e.g. "OrderCreated"
  occurredAt: number;  // epoch milliseconds
  source: string;      // emitting service, e.g. "order-service"
  version: number;     // payload schema version
  payload: TPayload;
}
```

### Validating an event at runtime

Use the registry to validate a message without knowing which service produced it:

```ts
import { EVENT_SCHEMAS, parse } from '@ecommerce-platform/contracts';

const event = parse(rawMessage, EVENT_SCHEMAS.OrderCreated);
// throws SchemaValidationError if the payload does not match the contract
```

To handle an unknown event type generically:

```ts
import { getEventSchema, isEventType, parse } from '@ecommerce-platform/contracts';

if (!isEventType(message.type)) return; // unknown event, ignore
parse(message, getEventSchema(message.type));
```

### Loading the raw `.proto` files at runtime

```ts
import { loadProtoDefinitions } from '@ecommerce-platform/contracts';

const defs = loadProtoDefinitions(['account/v1/account.proto']);
```

This is only needed for tooling that is not codegen-based; prefer the generated
types.

## Adding a new event

1. Add the payload interface and its schema in the matching
   `src/lib/events/*.events.ts` file.
2. Register it in `src/lib/events/registry.ts`.
3. Add a test covering both a valid and an invalid payload.

The `registry.spec.ts` test asserts that every registered event is reachable
and validates its own envelope, so a forgotten registration fails the build.

## Adding a new `.proto` service

1. Create the `.proto` file under `proto/<domain>/v1/`.
2. Run `npm run proto:generate`.
3. Commit both the `.proto` file and the regenerated `src/generated/` output.
