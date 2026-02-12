/**
 * Streams CSV data from database to response
 * Handles nested JSONB by serializing as JSON strings
 * Uses cursor-based batching for memory efficiency
 */
async function streamToCSV(client, columnMap, outputStream, batchSize = 10000) {
  const columnList = columnMap.map(col => col.source).join(', ');

  // Write header
  const headerLine = columnMap.map(col => col.target).join(',') + '\n';
  outputStream.write(headerLine);

  try {
    await client.query('BEGIN');
    await client.query(`DECLARE csv_cursor CURSOR FOR SELECT ${columnList} FROM records ORDER BY id`);

    let totalRows = 0;
    let hasMore = true;

    while (hasMore) {
      const result = await client.query(`FETCH ${batchSize} FROM csv_cursor`);
      const rows = result.rows;

      if (rows.length === 0) {
        hasMore = false;
        break;
      }

      let csvBatch = '';
      for (const row of rows) {
        const csvLine = columnMap
          .map(({ source, target }) => {
            let value = row[source];
            if (value && typeof value === 'object') {
              value = JSON.stringify(value);
            } else {
              value = value !== null ? String(value) : '';
            }

            // Escape CSV values
            if (value.includes(',') || value.includes('"') || value.includes('\n')) {
              return `"${value.replace(/"/g, '""')}"`;
            }
            return value;
          })
          .join(',');

        csvBatch += csvLine + '\n';
        totalRows++;
      }

      outputStream.write(csvBatch);
    }

    await client.query('CLOSE csv_cursor');
    await client.query('COMMIT');

    outputStream.end();
    console.log(`CSV export completed. Total rows: ${totalRows}`);
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch (rollbackErr) {
      // Ignore rollback errors
    }
    throw error;
  }
}

module.exports = {
  streamToCSV,
};
