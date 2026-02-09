# Use Node 20 as the base
FROM node:20-slim

# Install the Gemini CLI globally so your backend can find it
RUN npm install -g @google/gemini-cli

# Set the working directory
WORKDIR /app

# Copy package files and install dependencies for the root (frontend)
COPY package*.json ./
RUN npm install

# Copy server package files and install dependencies for the backend
COPY server/package*.json ./server/
RUN npm --prefix server install

# Copy the rest of the source code
COPY . .

# Build the frontend (Vite) and the backend (TypeScript)
RUN npm run build
RUN npm --prefix server run build

# Cloud Run uses the PORT environment variable
ENV PORT=8080
EXPOSE 8080

# Start the compiled backend server
CMD ["node", "server/dist/index.js"]