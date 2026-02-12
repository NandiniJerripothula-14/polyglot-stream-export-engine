require('dotenv').config();

const express = require('express');
const path = require('path');
const { Pool } = require('pg');
const { v4: uuidv4 } = require('uuid');

// Initialize Express app
const app = express();
const PORT = process.env.PORT || 8080;

// Middleware
app.use(express.json());

// Database connection pool
const pool = new Pool({
  user: process.env.POSTGRES_USER || 'user',
  password: process.env.POSTGRES_PASSWORD || 'password',
  host: process.env.POSTGRES_HOST || 'localhost',
  port: process.env.POSTGRES_PORT || 5432,
  database: process.env.POSTGRES_DB || 'exports_db',
  max: 5,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

// In-memory job store
const exportJobs = new Map();

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Import routes
const exportsRouter = require('./routes/exports')(pool, exportJobs);

// Mount routes
app.use('/exports', exportsRouter);

// Global error handler
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(err.status || 500).json({
    error: err.message || 'Internal Server Error',
    requestId: req.id,
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Start server
pool.on('error', (err) => {
  console.error('Unexpected error on idle client', err);
});

const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Polyglot Stream Export Engine listening on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
});

// Graceful shutdown
const gracefulShutdown = async () => {
  console.log('Shutting down gracefully...');
  server.close(async () => {
    await pool.end();
    console.log('Database pool closed');
    process.exit(0);
  });

  // Force shutdown after 10 seconds
  setTimeout(() => {
    console.error('Forced shutdown');
    process.exit(1);
  }, 10000);
};

process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

module.exports = app;
