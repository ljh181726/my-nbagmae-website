FROM node:20-alpine

# Expose port 7860 (Hugging Face default)
EXPOSE 7860

# Set production environment
ENV PORT=7860 \
    NODE_ENV=production

# Create and grant permissions to a non-root user (UID 1000)
RUN mkdir -p /app && chown -R 1000:1000 /app
WORKDIR /app

# Copy package manifests and install dependencies
COPY --chown=1000:1000 package.json ./
RUN npm install --omit=dev

# Copy application source code
COPY --chown=1000:1000 . .

# Switch to the non-root user
USER 1000

# Start Express & Socket.io server
CMD ["node", "src/server.js"]
