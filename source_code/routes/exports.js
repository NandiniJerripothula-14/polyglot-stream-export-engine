const express = require('express');
const { v4: uuidv4 } = require('uuid');
const zlib = require('zlib');
const fs = require('fs');
const path = require('path');
const os = require('os');

const { streamToCSV } = require('../streaming/csvWriter');
const { streamToJSON } = require('../streaming/jsonWriter');
const { streamToXML } = require('../streaming/xmlWriter');
const { streamToParquet } = require('../streaming/parquetWriter');
const { runBenchmark } = require('../utils/benchmark');

module.exports = function (pool, exportJobs) {
  const router = express.Router();

  // Validation middleware for export format
  const validateExportRequest = (req, res, next) => {
    const { format, columns, compression } = req.body;

    if (!format || !['csv', 'json', 'xml', 'parquet'].includes(format)) {
      return res.status(400).json({
        error: 'Invalid format. Must be one of: csv, json, xml, parquet',
      });
    }

    if (!Array.isArray(columns) || columns.length === 0) {
      return res.status(400).json({
        error: 'columns must be a non-empty array of {source, target} objects',
      });
    }

    // Validate column structure
    for (const col of columns) {
      if (!col.source || !col.target || typeof col.source !== 'string' || typeof col.target !== 'string') {
        return res.status(400).json({
          error: 'Each column must have source and target as strings',
        });
      }
    }

    if (compression && !['gzip'].includes(compression)) {
      return res.status(400).json({
        error: 'compression must be "gzip" or undefined',
      });
    }

    // Gzip only for text formats
    if (compression === 'gzip' && ['parquet'].includes(format)) {
      return res.status(400).json({
        error: 'compression is not supported for parquet format',
      });
    }

    next();
  };

  // POST /exports - Create export job
  router.post('/', validateExportRequest, (req, res) => {
    const { format, columns, compression } = req.body;
    const exportId = uuidv4();

    const job = {
      exportId,
      format,
      columns,
      compression: compression || null,
      status: 'pending',
      createdAt: new Date(),
      startedAt: null,
      completedAt: null,
    };

    exportJobs.set(exportId, job);

    res.status(201).json({
      exportId,
      status: job.status,
    });
  });

  // GET /exports/benchmark - Performance benchmark (must be before /:exportId)
  router.get('/benchmark', async (req, res) => {
    try {
      const results = await runBenchmark(pool);
      res.status(200).json(results);
    } catch (err) {
      console.error('Benchmark error:', err);
      res.status(500).json({ error: 'Benchmark failed', message: err.message });
    }
  });

  // GET /exports/:exportId/download - Download exported data
  router.get('/:exportId/download', async (req, res) => {
    const { exportId } = req.params;

    const job = exportJobs.get(exportId);
    if (!job) {
      return res.status(404).json({ error: 'Export job not found' });
    }

    job.status = 'processing';
    job.startedAt = new Date();

    try {
      const { format, columns, compression } = job;

      // Set response headers
      res.setHeader('Content-Disposition', `attachment; filename="export-${exportId}.${format === 'parquet' ? 'parquet' : format}"`);

      switch (format) {
        case 'csv':
          await handleCsvDownload(res, compression, columns);
          break;
        case 'json':
          await handleJsonDownload(res, compression, columns);
          break;
        case 'xml':
          await handleXmlDownload(res, compression, columns);
          break;
        case 'parquet':
          await handleParquetDownload(res, columns);
          break;
        default:
          res.status(400).json({ error: 'Unsupported format' });
      }

      job.status = 'completed';
      job.completedAt = new Date();
    } catch (err) {
      console.error(`Export error for job ${exportId}:`, err);
      job.status = 'failed';
      job.error = err.message;

      if (!res.headersSent) {
        res.status(500).json({ error: 'Export failed', message: err.message });
      } else {
        res.end();
      }
    }
  });

  // Helper functions
  async function handleCsvDownload(res, compression, columns) {
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');

    let outputStream = res;
    if (compression === 'gzip') {
      res.setHeader('Content-Encoding', 'gzip');
      outputStream = zlib.createGzip();
      outputStream.pipe(res);
    }

    const client = await pool.connect();
    try {
      await streamToCSV(client, columns, outputStream);
    } finally {
      client.release();
    }
  }

  async function handleJsonDownload(res, compression, columns) {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');

    let outputStream = res;
    if (compression === 'gzip') {
      res.setHeader('Content-Encoding', 'gzip');
      outputStream = zlib.createGzip();
      outputStream.pipe(res);
    }

    const client = await pool.connect();
    try {
      await streamToJSON(client, columns, outputStream);
    } finally {
      client.release();
    }
  }

  async function handleXmlDownload(res, compression, columns) {
    res.setHeader('Content-Type', 'application/xml; charset=utf-8');

    let outputStream = res;
    if (compression === 'gzip') {
      res.setHeader('Content-Encoding', 'gzip');
      outputStream = zlib.createGzip();
      outputStream.pipe(res);
    }

    const client = await pool.connect();
    try {
      await streamToXML(client, columns, outputStream);
    } finally {
      client.release();
    }
  }

  async function handleParquetDownload(res, columns) {
    res.setHeader('Content-Type', 'application/octet-stream');

    const tempFile = path.join(os.tmpdir(), `export-${uuidv4()}.parquet`);

    try {
      const client = await pool.connect();
      try {
        await streamToParquet(client, columns, tempFile);
      } finally {
        client.release();
      }

      // Stream the file to response
      const fileStream = fs.createReadStream(tempFile, { highWaterMark: 64 * 1024 });

      return new Promise((resolve, reject) => {
        fileStream.on('error', reject);
        res.on('finish', () => {
          fs.unlink(tempFile, (err) => {
            if (err) console.error('Error cleaning up temp file:', err);
            resolve();
          });
        });

        fileStream.pipe(res);
      });
    } catch (err) {
      // Clean up temp file on error
      fs.unlink(tempFile, (e) => {
        if (e) console.error('Error cleaning up temp file:', e);
      });
      throw err;
    }
  }

  return router;
};
