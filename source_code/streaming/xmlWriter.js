/**
 * Streams XML data from database to response
 * Uses cursor-based batching for memory efficiency
 */
async function streamToXML(client, columnMap, outputStream, batchSize = 10000) {
  const columnList = columnMap.map(col => col.source).join(', ');

  outputStream.write('<?xml version="1.0" encoding="UTF-8"?>\n<records>\n');

  try {
    await client.query('BEGIN');
    await client.query(`DECLARE xml_cursor CURSOR FOR SELECT ${columnList} FROM records ORDER BY id`);

    let totalRows = 0;
    let hasMore = true;

    while (hasMore) {
      const result = await client.query(`FETCH ${batchSize} FROM xml_cursor`);
      const rows = result.rows;

      if (rows.length === 0) {
        hasMore = false;
        break;
      }

      let xmlBatch = '';
      for (const row of rows) {
        const recordXml = buildXmlRecord(columnMap, row);
        xmlBatch += recordXml + '\n';
        totalRows++;
      }

      outputStream.write(xmlBatch);
    }

    await client.query('CLOSE xml_cursor');
    await client.query('COMMIT');

    outputStream.write('</records>');
    outputStream.end();
    console.log(`XML export completed. Total rows: ${totalRows}`);
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch (rollbackErr) {
      // Ignore rollback errors
    }
    throw error;
  }
}

/**
 * Converts a JavaScript object to XML elements
 * Handles nested objects
 */
function buildXmlRecord(columnMap, row) {
  let xml = '<record>';

  for (const { source, target } of columnMap) {
    const value = row[source];
    if (value === null || value === undefined) {
      xml += `<${target}/>`;
    } else if (typeof value === 'object') {
      xml += objectToXml(value, target);
    } else {
      xml += `<${target}>${escapeXml(String(value))}</${target}>`;
    }
  }

  xml += '</record>';
  return xml;
}

/**
 * Converts a nested object to XML elements
 */
function objectToXml(obj, elementName) {
  if (obj === null || obj === undefined) {
    return `<${elementName}/>`;
  }

  let xml = `<${elementName}>`;

  if (Array.isArray(obj)) {
    for (const item of obj) {
      if (typeof item === 'object') {
        xml += objectToXml(item, 'item');
      } else {
        xml += `<item>${escapeXml(String(item))}</item>`;
      }
    }
  } else {
    for (const [key, val] of Object.entries(obj)) {
      if (val === null || val === undefined) {
        xml += `<${key}/>`;
      } else if (typeof val === 'object') {
        xml += objectToXml(val, key);
      } else {
        xml += `<${key}>${escapeXml(String(val))}</${key}>`;
      }
    }
  }

  xml += `</${elementName}>`;
  return xml;
}

/**
 * Escapes XML special characters
 */
function escapeXml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

module.exports = {
  streamToXML,
  buildXmlRecord,
  objectToXml,
  escapeXml,
};
