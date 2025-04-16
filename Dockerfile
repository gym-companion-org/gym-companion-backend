# Base image
FROM node:20-alpine

# Set working directory
WORKDIR /app

# Copy package files and install dependencies
COPY package*.json ./
RUN npm install

# Install ts-node + typescript globally (optional, but useful for dev)
RUN npm install -g ts-node typescript

# Copy the rest of the app
COPY . .

# Expose the backend port
EXPOSE 5000

# Start the app
CMD ["ts-node", "src/index.ts"]
