FROM node:22.23.5-alpine@sha256:d6e6d1cae4ed0cda2dc336db1bbea6457c2b5d2a8bcd9ac1d80b909fe1c4f638

# Install pnpm
RUN npm install -g pnpm

WORKDIR /intuition-mcp-server

# Copy package files first for better layer caching
COPY package*.json pnpm-lock.yaml ./

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy the rest of the application
COPY . .

# Build the application
RUN pnpm run build

# Expose the port that the server will run on
EXPOSE 3001

# Start the server
CMD ["pnpm", "run", "start:http"]