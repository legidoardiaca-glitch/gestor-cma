const INDEX_URL =
  "https://drive.google.com/uc?export=download&id=1BwnFNibQldZdARvdvoSAiJfpAOjKbY1X";

function rowsToObjects(headers, rows, startRow = 2) {
  return rows.map((row, rowIndex) => {
    const obj = {
      _row: startRow + rowIndex,
    };

    headers.forEach((header, index) => {
      obj[header] = row[index] ?? "";
    });

    return obj;
  });
}

export default async function handler(req, res) {
  try {
    const indexResponse = await fetch(INDEX_URL);

    if (!indexResponse.ok) {
      throw new Error(`Error carregant index JSON: ${indexResponse.status}`);
    }

    const indexData = await indexResponse.json();

    if (!Array.isArray(indexData.batches)) {
      throw new Error("L'index JSON no conté una llista de lots vàlida.");
    }

    const batchResponses = await Promise.all(
      indexData.batches.map(async (batch) => {
        const response = await fetch(batch.url);

        if (!response.ok) {
          throw new Error(`Error carregant lot ${batch.batch}: ${response.status}`);
        }

        return response.json();
      })
    );

    const rows = batchResponses.flatMap((batch) =>
      rowsToObjects(batch.headers, batch.rows, batch.startRow)
    );

    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("Cache-Control", "s-maxage=300, stale-while-revalidate=3600");

    res.status(200).json({
      generatedAt: new Date().toISOString(),
      indexGeneratedAt: indexData.generatedAt,
      batchesCount: indexData.batches.length,
      rowsCount: rows.length,
      rows,
    });
  } catch (error) {
    res.status(500).json({
      error: "No s'han pogut carregar les dades JSON",
      detail: error.message,
    });
  }
}
