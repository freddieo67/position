# Använd en lättvikts-version av Node.js
FROM node:20-alpine

# Sätt arbetsmappen i containern
WORKDIR /app

# Kopiera först in package.json för att installera beroenden
COPY package*.json ./
RUN npm install

# Kopiera in resten av koden
COPY . .

# Berätta för Cloud Run vilken port vi lyssnar på
ENV PORT=8080
EXPOSE 8080

# Starta servern
CMD ["npx", "tsx", "src/index.ts"]
