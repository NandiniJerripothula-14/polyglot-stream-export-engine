/**
 * Streams JSON array data from database to response
 * Uses cursor-based batching for memory efficiency
 */
async function streamToJSON(client, columnMap, outputStream, batchSize = 10000) {
  const columnList = columnMap.map(col => col.source).join(', ');

  outputStream.write('[');

  try {
    await client.query('BEGIN');
    await client.query(`DECLARE json_cursor CURSOR FOR SELECT ${columnList} FROM records ORDER BY id`);

    let firstRow = true;
    let totalRows = 0;
    let hasMore = true;

    while (hasMore) {
      const result = await client.query(`FETCH ${batchSize} FROM json_cursor`);
      const rows = result.rows;

      if (rows.length === 0) {
        hasMore = false;
        break;
      }

      let jsonBatch = '';
      for (const row of rows) {
        const jsonObj = {};
        columnMap.forEach(({ source, target }) => {
          jsonObj[target] = row[source];
        });

        const prefix = firstRow ? '' : ',';
        firstRow = false;

        jsonBatch += prefix + JSON.stringify(jsonObj);
        totalRows++;
      }

      outputStream.write(jsonBatch);
    }

    await client.query('CLOSE json_cursor');
    await client.query('COMMIT');

    outputStream.write(']');
    outputStream.end();
    console.log(`JSON export completed. Total rows: ${totalRows}`);
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
  streamToJSON,
};
