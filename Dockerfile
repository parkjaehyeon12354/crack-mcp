# Cloud Run image for the remote connector (src/http.ts). Node 24 runs the .ts files directly.
FROM node:24-slim
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY src ./src
ENV NODE_ENV=production
CMD ["node", "src/http.ts"]
