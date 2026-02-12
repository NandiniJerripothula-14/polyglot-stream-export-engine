/**
 * Streams CSV data from database to response
 * Handles nested JSONB by serializing as JSON strings
 */
async function streamToCSV(client, columnMap, outputStream, batchSize = 10000) {
  const columnList = columnMap.map(col => col.source).join(', ');

  // Write header
  const headerLine = columnMap.map(col => col.target).join(',') + '\n';
  outputStream.write(headerLine);

  const query = `SELECT ${columnList} FROM records ORDER BY id`;
  const queryStream = client.query(query);

  return new Promise((resolve, reject) => {
    let lineBuffer = '';
    let batchCount = 0;

    queryStream.on('row', (row) => {
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

      lineBuffer += csvLine + '\n';
      batchCount++;

      if (batchCount % 1000 === 0) {
        outputStream.write(lineBuffer);
        lineBuffer = '';
      }
    });

    queryStream.on('error', reject);
    queryStream.on('end', () => {
      if (lineBuffer.length > 0) {
        outputStream.write(lineBuffer);
      }
      outputStream.end();
      resolve();
    });
  });
}

module.exports = {
  streamToCSV,
};
