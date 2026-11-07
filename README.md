# Ecommerce Microservices Platform

> An event-driven ecommerce backend built as a set of NestJS microservices in an Nx monorepo. Services communicate over gRPC and Kafka, persist to PostgreSQL, index products in Elasticsearch, and process payments through Stripe.

## Overview

This repository contains a modular ecommerce platform split into focused services:

| Service | Responsibility | Protocols | Port |
|---|---|---|---|
| `api-gateway` | Public REST entry point; proxies product and order operations | HTTP | `3000` |
| `account-service` | Customer accounts and profiles | HTTP + gRPC | `3001` / `50051` |
| `product-service` | Product catalog, stock management, and search indexing | gRPC + Kafka | `3002` / `50052` |
| `order-service` | Order creation, status lifecycle, payment result handling | HTTP + gRPC + Kafka | `3003` / `50053` |
| `payment-service` | Payment lifecycle, Stripe integration, webhook handling | HTTP + Kafka | `3004` |

Supporting infrastructure is provided through Docker Compose:

- **PostgreSQL** for account, order, and payment data
- **Apache Kafka** for asynchronous domain events
- **Elasticsearch** for full-text product search

## Architecture

```text
                    +-------------+
                    | API Gateway |  :3000
                    +------+------+
                           |
           +---------------+---------------+
           |               |               |
           v               v               v
   +---------------+ +-----------+ +-------------+
   | Account Svc   | | Product   | | Order Svc   |
   | gRPC :50051   | | gRPC :50052| gRPC :50053|
   +-------+-------+ +-----+-----+ +------+------+
           |               |              |
           v               v              v
        Postgres        Kafka          Postgres
                           |              |
                           v              v
                    Product Search   Payment Svc
                    (Elasticsearch)   :3004
```

Domain events flow through Kafka topics such as `order.created`, `payment.captured`, `payment.failed`, `product.created`, and `product.updated`.

## Tech Stack

- **Runtime:** Node.js 22, TypeScript
- **Framework:** NestJS
- **Monorepo:** Nx
- **RPC:** gRPC with shared protobuf contracts (`libs/contracts`)
- **Messaging:** Kafka (KafkaJS)
- **Databases:** PostgreSQL (`pg`)
- **Search:** Elasticsearch
- **Payments:** Stripe
- **Containerization:** Docker / Docker Compose

## Prerequisites

- Node.js 22+
- npm 10+
- Docker and Docker Compose

## Getting Started

### 1. Install dependencies

```sh
npm install
```

### 2. Start infrastructure

```sh
docker compose up -d postgres kafka elasticsearch
```

Kafka topics are created automatically by the `kafka-topic-init` service.

### 3. Run services locally

In separate terminals:

```sh
npx nx serve account-service
npx nx serve product-service
npx nx serve order-service
npx nx serve payment-service
npx nx serve api-gateway
```

Or build and run everything with Docker:

```sh
docker compose up --build
```

### 4. Explore the API

The API gateway is available at `http://localhost:3000/api`.

Example endpoints:

```sh
# Search products
curl "http://localhost:3000/api/products/search?q=shirt"

# List products
curl "http://localhost:3000/api/products"

# Create an order
curl -X POST http://localhost:3000/api/orders \
  -H "Content-Type: application/json" \
  -d '{"accountId":"...","items":[{"productId":"...","quantity":1}],"shippingAddress":{...}}'
```

## Environment Variables

Key variables used by the services (see `docker-compose.yml` for full defaults):

| Variable | Service | Description |
|---|---|---|
| `PORT` | all | HTTP port |
| `DATABASE_URL` | account, order, payment | PostgreSQL connection string |
| `KAFKA_BROKERS` | product, order, payment, gateway | Kafka broker list |
| `ELASTICSEARCH_URL` | product, gateway | Elasticsearch endpoint |
| `PRODUCT_SERVICE_URL` | order, gateway | Product gRPC address |
| `ORDER_SERVICE_URL` | gateway | Order gRPC address |
| `ACCOUNT_SERVICE_URL` | gateway | Account gRPC address |
| `STRIPE_GATEWAY` | payment | `fake` or Stripe-backed gateway |
| `STRIPE_WEBHOOK_SECRET` | payment | Stripe webhook signing secret |

## Development Commands

```sh
# Build a service
npx nx build <service-name>

# Run tests
npx nx test <service-name>

# Lint
npx nx lint <service-name>

# Regenerate protobuf TypeScript bindings
npm run proto:generate

# Verify generated contracts are up to date
npm run proto:check

# Visualize the project graph
npx nx graph
```

## Contracts

Shared protobuf definitions live in `libs/contracts/proto`. TypeScript bindings are generated with `ts-proto` and consumed by all services, keeping request/response shapes in sync across the platform.

## Testing

Each service includes unit tests (Jest) and an e2e package. Run a service's tests with:

```sh
npx nx test <service-name>
```

## Project Structure

```text
ecommerce-platform/
├── apps/                 # Microservices and e2e suites
├── libs/contracts/       # Shared protobuf contracts
├── tools/                # Build and code-generation scripts
├── docker-compose.yml    # Infrastructure and service orchestration
├── Dockerfile            # Multi-service container image
└── nx.json               # Nx workspace configuration
```

## License

This project is licensed under the MIT License (see `package.json`).
```

Wait there is no LICENSE file. The root package.json says MIT. Should I remove license section or mention MIT without link? Better change to "This project is licensed under the MIT License." without link, or create LICENSE? Not necessary. Let's adjust to avoid broken link.<|end|><|start|>start to=edit<|channel|>analysis <|constrain|>xml<|message|><rfl:parameter name="path">
/home/sohaibbkt/dev/ecommerce-platform/README.md