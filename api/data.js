const CSV_URL =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vRWPBpxuBECSh1kLS1Vm-gdmOQhWw6_aBUUsjrX3wMZlaL17IsIkhFrSa8ovmbMR-uFL07SeX5ClGOM/pub?gid=1637995479&single=true&output=csv";

export default async function handler(req, res) {
  try {
    const response = await fetch(CSV_URL);
    const text = await response.text();

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Cache-Control", "s-maxage=60, stale-while-revalidate=300");

    res.status(200).send(text);
  } catch (error) {
    res.status(500).json({
      error: "No s'ha pogut carregar el CSV",
      detail: error.message,
    });
  }
}
