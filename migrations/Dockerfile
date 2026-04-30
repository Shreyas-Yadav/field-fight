FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY migrate.js .
COPY sql ./sql
CMD ["npm", "run", "migrate"]
