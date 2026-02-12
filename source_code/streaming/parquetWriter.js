const parquet = require('parquetjs');
const { Writable } = require('stream');

/**
 * Creates Parquet schema based on column map and sample data
 */
function createParquetSchema(columnMap, sampleData = {}) {
  const schemaObject = {};
  const schemaType = {};

  // Define schema based on columnMap
  // We need to infer types from sample data
  columnMap.forEach(({ source, target }) => {
    // Default to string, but try to infer from sample data
    let type = 'UTF8'; // parquetjs uses 'UTF8' for strings

    if (source in sampleData) {
      const value = sampleData[source];
      if (typeof value === 'number') {
        if (Number.isInteger(value)) {
          type = 'INT64';
        } else {
          type = 'DOUBLE';
        }
      } else if (typeof value === 'boolean') {
        type = 'BOOLEAN';
      } else if (value instanceof Date) {
        type = 'TIMESTAMP_MILLIS';
      }
    }

    schemaObject[target] = { type };
  });

  return new parquet.ParquetSchema(schemaObject);
}

/**
 * Streams data from database to Parquet file
 * Uses parquetjs's row-based writing API
 */
async function streamToParquet(client, columnMap, outputPath, batchSize = 1000) {
  const columnList = columnMap.map(col => col.source).join(', ');

  // First, fetch one row to infer schema
  const sampleResult = await client.query(`SELECT ${columnList} FROM records LIMIT 1`);
  const sampleData = sampleResult.rows[0] || {};

  // Create schema
  const schema = createParquetSchema(columnMap, sampleData);

  // Create parquet writer
  const writer = await parquet.ParquetWriter.openFile(schema, outputPath, {
    compression: 'SNAPPY',
    rowGroupSize: 10000,
    pageSize: 1024,
    useDataPageV2: false,
    enableDict: true, // Enable dictionary encoding for memory efficiency
  });

  return new Promise(async (resolve, reject) => {
    try {
      const query = `DECLARE parquet_cursor CURSOR FOR SELECT ${columnList} FROM records ORDER BY id`;
      await client.query('BEGIN');
      await client.query(query);

      let rowCount = 0;
      let hasMore = true;

      while (hasMore) {
        const result = await client.query(`FETCH ${batchSize} FROM parquet_cursor`);
        
        if (result.rows.length === 0) {
          hasMore = false;
        } else {
          for (const row of result.rows) {
            const parquetRow = {};
            columnMap.forEach(({ source, target }) => {
              let value = row[source];
              // For nested objects, store as JSON string in Parquet
              if (value && typeof value === 'object') {
                parquetRow[target] = JSON.stringify(value);
              } else {
                parquetRow[target] = value;
              }
            });

            await writer.appendRow(parquetRow);
            rowCount++;
          }
        }
      }

      await client.query('CLOSE parquet_cursor');
      await client.query('COMMIT');
      await writer.close();
      console.log(`Parquet export completed. Total rows: ${rowCount}`);
      resolve();

    } catch (err) {
      try {
        await client.query('ROLLBACK');
      } catch (rollbackErr) {
        // Ignore rollback errors
      }
      reject(err);
    }
  });
}

module.exports = {
  streamToParquet,
  createParquetSchema,
};
