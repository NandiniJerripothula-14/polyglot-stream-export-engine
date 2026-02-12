const fs = require('fs');
const path = require('path');
const os = require('os');
const { v4: uuidv4 } = require('uuid');
const { streamToParquet } = require('../streaming/parquetWriter');
const { streamToCSV } = require('../streaming/csvWriter');
const { streamToJSON } = require('../streaming/jsonWriter');
const { streamToXML } = require('../streaming/xmlWriter');

// Column mapping for benchmark
const BENCHMARK_COLUMNS = [
  { source: 'id', target: 'id' },
  { source: 'created_at', target: 'created_at' },
  { source: 'name', target: 'name' },
  { source: 'value', target: 'value' },
  { source: 'metadata', target: 'metadata' },
];

/**
 * Captures peak memory usage for a process
 */
class MemoryMonitor {
  constructor() {
    this.peakMemory = 0;
    this.interval = null;
  }

  start() {
    this.peakMemory = 0;
    this.interval = setInterval(() => {
      const usage = process.memoryUsage();
      const heapUsedMB = usage.heapUsed / 1024 / 1024;
      if (heapUsedMB > this.peakMemory) {
        this.peakMemory = heapUsedMB;
      }
    }, 100);
  }

  stop() {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
    return this.peakMemory;
  }
}

/**
 * Exports CSV and measures performance
 */
async function benchmarkCSV(pool) {
  const tempFile = path.join(os.tmpdir(), `benchmark-${uuidv4()}.csv`);
  const monitor = new MemoryMonitor();
  const startTime = Date.now();

  monitor.start();

  try {
    const client = await pool.connect();
    try {
      const output = fs.createWriteStream(tempFile, { highWaterMark: 64 * 1024 });
      await streamToCSV(client, BENCHMARK_COLUMNS, output);
    } finally {
      client.release();
    }

    const peakMemory = monitor.stop();
    const duration = (Date.now() - startTime) / 1000;
    const fileSize = fs.statSync(tempFile).size;

    fs.unlink(tempFile, (err) => {
      if (err) console.error('Error deleting temp file:', err);
    });

    return {
      format: 'csv',
      durationSeconds: parseFloat(duration.toFixed(2)),
      fileSizeBytes: fileSize,
      peakMemoryMB: parseFloat(peakMemory.toFixed(2)),
    };
  } catch (err) {
    monitor.stop();
    if (fs.existsSync(tempFile)) {
      fs.unlinkSync(tempFile);
    }
    throw err;
  }
}

/**
 * Exports JSON and measures performance
 */
async function benchmarkJSON(pool) {
  const tempFile = path.join(os.tmpdir(), `benchmark-${uuidv4()}.json`);
  const monitor = new MemoryMonitor();
  const startTime = Date.now();

  monitor.start();

  try {
    const client = await pool.connect();
    try {
      const output = fs.createWriteStream(tempFile, { highWaterMark: 64 * 1024 });
      await streamToJSON(client, BENCHMARK_COLUMNS, output);
    } finally {
      client.release();
    }

    const peakMemory = monitor.stop();
    const duration = (Date.now() - startTime) / 1000;
    const fileSize = fs.statSync(tempFile).size;

    fs.unlink(tempFile, (err) => {
      if (err) console.error('Error deleting temp file:', err);
    });

    return {
      format: 'json',
      durationSeconds: parseFloat(duration.toFixed(2)),
      fileSizeBytes: fileSize,
      peakMemoryMB: parseFloat(peakMemory.toFixed(2)),
    };
  } catch (err) {
    monitor.stop();
    if (fs.existsSync(tempFile)) {
      fs.unlinkSync(tempFile);
    }
    throw err;
  }
}

/**
 * Exports XML and measures performance
 */
async function benchmarkXML(pool) {
  const tempFile = path.join(os.tmpdir(), `benchmark-${uuidv4()}.xml`);
  const monitor = new MemoryMonitor();
  const startTime = Date.now();

  monitor.start();

  try {
    const client = await pool.connect();
    try {
      const output = fs.createWriteStream(tempFile, { highWaterMark: 64 * 1024 });
      await streamToXML(client, BENCHMARK_COLUMNS, output);
    } finally {
      client.release();
    }

    const peakMemory = monitor.stop();
    const duration = (Date.now() - startTime) / 1000;
    const fileSize = fs.statSync(tempFile).size;

    fs.unlink(tempFile, (err) => {
      if (err) console.error('Error deleting temp file:', err);
    });

    return {
      format: 'xml',
      durationSeconds: parseFloat(duration.toFixed(2)),
      fileSizeBytes: fileSize,
      peakMemoryMB: parseFloat(peakMemory.toFixed(2)),
    };
  } catch (err) {
    monitor.stop();
    if (fs.existsSync(tempFile)) {
      fs.unlinkSync(tempFile);
    }
    throw err;
  }
}

/**
 * Exports Parquet and measures performance
 */
async function benchmarkParquet(pool) {
  const tempFile = path.join(os.tmpdir(), `benchmark-${uuidv4()}.parquet`);
  const monitor = new MemoryMonitor();
  const startTime = Date.now();

  monitor.start();

  try {
    const client = await pool.connect();
    try {
      await streamToParquet(client, BENCHMARK_COLUMNS, tempFile);
    } finally {
      client.release();
    }

    const peakMemory = monitor.stop();
    const duration = (Date.now() - startTime) / 1000;
    const fileSize = fs.statSync(tempFile).size;

    fs.unlink(tempFile, (err) => {
      if (err) console.error('Error deleting temp file:', err);
    });

    return {
      format: 'parquet',
      durationSeconds: parseFloat(duration.toFixed(2)),
      fileSizeBytes: fileSize,
      peakMemoryMB: parseFloat(peakMemory.toFixed(2)),
    };
  } catch (err) {
    monitor.stop();
    if (fs.existsSync(tempFile)) {
      fs.unlinkSync(tempFile);
    }
    throw err;
  }
}

/**
 * Runs all benchmarks
 */
async function runBenchmark(pool) {
  console.log('Starting benchmarks...');

  try {
    const results = await Promise.all([benchmarkCSV(pool), benchmarkJSON(pool), benchmarkXML(pool), benchmarkParquet(pool)]);

    return {
      datasetRowCount: 10000000,
      results,
    };
  } catch (err) {
    console.error('Benchmark error:', err);
    throw err;
  }
}

module.exports = {
  runBenchmark,
  benchmarkCSV,
  benchmarkJSON,
  benchmarkXML,
  benchmarkParquet,
};
