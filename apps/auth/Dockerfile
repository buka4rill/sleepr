FROM node:alpine AS development

WORKDIR /usr/src/app

COPY package.json ./
COPY pnpm-lock.yaml ./
COPY pnpm-workspace.yaml ./
COPY tsconfig.json tsconfig.json

RUN npm install -g corepack@latest && corepack enable && corepack prepare --activate

COPY apps/auth apps/auth
COPY libs libs

RUN pnpm install -r

RUN pnpm run build auth

FROM node:alpine AS production

ARG NODE_ENV=production
ENV NODE_ENV=${NODE_ENV}

WORKDIR /usr/src/app

COPY package.json ./
COPY pnpm-lock.yaml ./
COPY pnpm-workspace.yaml ./
COPY apps/auth/package.json apps/auth/package.json
COPY libs/common/package.json libs/common/package.json

RUN npm install -g corepack@latest && corepack enable && corepack prepare --activate

RUN pnpm install --prod --filter sleepr --filter auth...

COPY --from=development /usr/src/app/dist ./dist

CMD ["node", "dist/apps/auth/main"]