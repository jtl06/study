FROM node:22-bookworm-slim

WORKDIR /app

COPY web/package.json web/package-lock.json ./
RUN npm ci

COPY web/. ./
RUN npm run railway:build

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

CMD ["npm", "run", "railway:start"]
