# Use Node 20 as the base
FROM node:20-slim

# Install system dependencies (including Python)
RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    python3-venv \
    python-is-python3 \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

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