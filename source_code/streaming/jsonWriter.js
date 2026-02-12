/**
 * Streams JSON array data from database to response
 */
async function streamToJSON(client, columnMap, outputStream, batchSize = 10000) {
  const columnList = columnMap.map(col => col.source).join(', ');

  outputStream.write('[');

  const query = `SELECT ${columnList} FROM records ORDER BY id`;
  const queryStream = client.query(query);

  return new Promise((resolve, reject) => {
    let firstRow = true;
    let rowBuffer = [];
    let batchCount = 0;

    queryStream.on('row', (row) => {
      const jsonObj = {};
      columnMap.forEach(({ source, target }) => {
        jsonObj[target] = row[source];
      });

      const prefix = firstRow ? '' : ',';
      firstRow = false;

      rowBuffer.push(prefix + JSON.stringify(jsonObj));
      batchCount++;

      if (batchCount % 1000 === 0) {
        outputStream.write(rowBuffer.join(''));
        rowBuffer = [];
      }
    });

    queryStream.on('error', reject);
    queryStream.on('end', () => {
      if (rowBuffer.length > 0) {
        outputStream.write(rowBuffer.join(''));
      }

      outputStream.write(']');
      outputStream.end();
      resolve();
    });
  });
}

module.exports = {
  streamToJSON,
};
