FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN if [ -f package-lock.json ]; then npm ci --omit=dev; else npm install --omit=dev; fi
COPY app.js ./
USER node
EXPOSE 3000
CMD ["node", "app.js"]
