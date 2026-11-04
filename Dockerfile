FROM node:22-alpine

WORKDIR /app

# Copy the whole workspace first so npm workspaces can be linked.
COPY . .

RUN npm ci

# Sync Nx project references and build the requested app.
ARG APP_NAME
RUN npx nx sync && npx nx build ${APP_NAME}

ENV NODE_ENV=production

CMD ["sh", "-c", "node apps/${APP_NAME}/dist/main.js"]