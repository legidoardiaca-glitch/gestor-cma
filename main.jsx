import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";

const API_URL = "https://script.google.com/macros/s/AKfycbwIMYYBvm4veXb4ecpTmgfDXbQalgDWsQWUq4w5iMLMSBCEniadDS7kZO0dfkaBLcz-/exec";

function loadJsonp(url) {
  return new Promise((resolve, reject) => {
    const callbackName = `callback_${Date.now()}`;
    const script = document.createElement("script");
    window[callbackName] = (data) => {
      resolve(data);
      delete window[callbackName];
      script.remove();
    };
    script.onerror = () => reject(new Error("No s'ha pogut carregar l'API"));
    script.src = `${url}?callback=${callbackName}`;
    document.body.appendChild(script);
  });
}

function App() {
  const [rows, setRows] = useState([]);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(null);
  const [view, setView] = useState("activitats");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    loadJsonp(API_URL)
      .then((data) => {
        const passis = data.passis || [];
        setRows(passis);
        setSelected(passis[0] || null);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      });
  }, []);

  const filtered = useMemo(() => {
    return rows.filter((r) =>
      [
        r.id,
        r.idIntern,
        r.idWeb,
        r.titol,
        r.titolWeb,
        r.encarregada,
        r.categoria,
        r.espai,
        r.districte
      ]
        .join(" ")
        .toLowerCase()
        .includes(query.toLowerCase())
    );
  }, [rows, query]);

  const groupedByDate = useMemo(() => {
    const groups = {};
    filtered.forEach((r) => {
      const date = r.dataInici || "Sense data";
      if (!groups[date]) groups[date] = [];
      groups[date].push(r);
    });
    return groups;
  }, [filtered]);

  const stats = {
    activitats: rows.length,
    propostes: new Set(rows.map((r) => r.id)).size,
    web: new Set(rows.map((r) => r.idWeb)).size,
    espais: new Set(rows.map((r) => r.espai).filter(Boolean)).size,
    districtes: new Set(rows.map((r) => r.districte).filter(Boolean)).size,
  };

  if (loading) return <div className="screen">Carregant dades...</div>;
  if (error) return <div className="screen">Error: {error}</div>;

  return (
    <main>
      <aside>
        <div className="brand">BARCELONA<br />CAPITAL MUNDIAL<br />DE L'ARQUITECTURA</div>

        <button onClick={() => setView("activitats")} className={view === "activitats" ? "active" : ""}>Activitats</button>
        <button onClick={() => setView("calendari")} className={view === "calendari" ? "active" : ""}>Calendari</button>
        <button onClick={() => setView("dashboard")} className={view === "dashboard" ? "active" : ""}>Dashboard</button>
      </aside>

      <section className="content">
        <header>
          <div>
            <h1>Gestor d'activitats</h1>
            <p>Dades reals connectades a Google Sheets</p>
          </div>
          <span>{rows.length} registres carregats</span>
        </header>

        <div className="stats">
          <Card title="Passis" value={stats.activitats} />
          <Card title="Propostes" value={stats.propostes} />
          <Card title="Activitats web" value={stats.web} />
          <Card title="Espais" value={stats.espais} />
          <Card title="Districtes" value={stats.districtes} />
        </div>

        <input
          className="search"
          placeholder="Buscar per ID, títol, espai, categoria..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />

        {view === "activitats" && (
          <div className="grid">
            <div className="list">
              {filtered.map((r) => (
                <button key={`${r.idIntern}-${r._row}`} className="item" onClick={() => setSelected(r)}>
                  <b>{r.idIntern}</b>
                  <span>{r.titolWeb || r.titol}</span>
                  <small>{r.dataInici} · {r.horaInici || "—"} · {r.espai || "Sense espai"}</small>
                </button>
              ))}
            </div>

            <Detail row={selected} />
          </div>
        )}

        {view === "calendari" && (
          <div className="calendar">
            {Object.entries(groupedByDate).map(([date, items]) => (
              <div className="day" key={date}>
                <h2>{date}</h2>
                {items.map((r) => (
                  <button key={`${r.idIntern}-${r._row}`} onClick={() => setSelected(r)}>
                    <b>{r.horaInici || "--:--"}</b> {r.idIntern} · {r.titolWeb || r.titol}
                    <small>{r.espai}</small>
                  </button>
                ))}
              </div>
            ))}
          </div>
        )}

        {view === "dashboard" && (
          <div className="dashboard">
            <Chart title="Activitats per categoria" data={countBy(rows, "categoria")} />
            <Chart title="Activitats per districte" data={countBy(rows, "districte")} />
            <Chart title="Activitats per encarregada" data={countBy(rows, "encarregada")} />
          </div>
        )}
      </section>

      <style>{css}</style>
    </main>
  );
}

function Card({ title, value }) {
  return (
    <div className="card">
      <h2>{value}</h2>
      <p>{title}</p>
    </div>
  );
}

function Detail({ row }) {
  if (!row) return <div className="detail">Selecciona una activitat</div>;

  return (
    <div className="detail">
      <div className="image">{row.imatge ? "Imatge vinculada" : "Sense imatge"}</div>
      <h2>{row.titolWeb || row.titol}</h2>
      <p>{row.categoria}</p>

      <dl>
        <dt>ID</dt><dd>{row.id}</dd>
        <dt>ID INTERN</dt><dd>{row.idIntern}</dd>
        <dt>ID WEB</dt><dd>{row.idWeb}</dd>
        <dt>Encarregada</dt><dd>{row.encarregada}</dd>
        <dt>Data</dt><dd>{row.dataInici} {row.horaInici} → {row.dataFinal} {row.horaFinal}</dd>
        <dt>Espai</dt><dd>{row.espai}</dd>
        <dt>Districte</dt><dd>{row.districte}</dd>
        <dt>Agrupador</dt><dd>{row.agrupador}</dd>
        <dt>Importar</dt><dd>{String(row.importar)}</dd>
      </dl>
    </div>
  );
}

function countBy(rows, key) {
  return rows.reduce((acc, r) => {
    const value = r[key] || "Sense dades";
    acc[value] = (acc[value] || 0) + 1;
    return acc;
  }, {});
}

function Chart({ title, data }) {
  const entries = Object.entries(data).sort((a, b) => b[1] - a[1]).slice(0, 10);
  const max = Math.max(...entries.map((e) => e[1]), 1);

  return (
    <div className="chart">
      <h2>{title}</h2>
      {entries.map(([name, value]) => (
        <div className="bar" key={name}>
          <span>{name}</span>
          <div><i style={{ width: `${(value / max) * 100}%` }} /></div>
          <b>{value}</b>
        </div>
      ))}
    </div>
  );
}

const css = `
* { box-sizing: border-box; }
body { margin: 0; font-family: Inter, Arial, sans-serif; background: #f7f7f7; color: #111; }
main { display: grid; grid-template-columns: 260px 1fr; min-height: 100vh; }
aside { background: white; border-right: 1px solid #ddd; padding: 28px; }
.brand { font-weight: 800; font-size: 20px; line-height: 1.05; margin-bottom: 48px; }
aside button { display: block; width: 100%; border: 0; background: transparent; text-align: left; padding: 14px 16px; border-radius: 14px; margin-bottom: 8px; cursor: pointer; font-weight: 600; }
aside button.active, aside button:hover { background: #eee; }
.content { padding: 36px; }
header { display: flex; justify-content: space-between; align-items: start; margin-bottom: 28px; }
h1 { font-size: 36px; margin: 0; }
p { color: #666; }
.stats { display: grid; grid-template-columns: repeat(5, 1fr); gap: 16px; margin-bottom: 20px; }
.card, .detail, .chart, .day { background: white; border: 1px solid #ddd; border-radius: 20px; padding: 22px; }
.card h2 { font-size: 34px; margin: 0; }
.search { width: 100%; padding: 16px 18px; border-radius: 16px; border: 1px solid #ddd; margin-bottom: 24px; font-size: 16px; }
.grid { display: grid; grid-template-columns: 430px 1fr; gap: 24px; align-items: start; }
.list { display: flex; flex-direction: column; gap: 12px; }
.item { background: white; border: 1px solid #ddd; border-radius: 18px; padding: 18px; text-align: left; cursor: pointer; }
.item span { display: block; margin: 8px 0; font-weight: 600; }
small { display: block; color: #777; }
.image { height: 180px; background: #eee; border-radius: 18px; display: flex; align-items: center; justify-content: center; color: #777; margin-bottom: 20px; }
dl { display: grid; grid-template-columns: 130px 1fr; gap: 10px; }
dt { color: #777; }
dd { margin: 0; font-weight: 600; }
.calendar { display: flex; flex-direction: column; gap: 18px; }
.day button { display: block; width: 100%; text-align: left; border: 0; background: #f4f4f4; margin-top: 10px; border-radius: 14px; padding: 14px; cursor: pointer; }
.dashboard { display: grid; grid-template-columns: repeat(2, 1fr); gap: 20px; }
.bar { display: grid; grid-template-columns: 180px 1fr 40px; gap: 10px; align-items: center; margin: 12px 0; }
.bar div { height: 12px; background: #eee; border-radius: 99px; overflow: hidden; }
.bar i { display: block; height: 100%; background: #111; }
.screen { padding: 40px; font-size: 22px; }
`;

createRoot(document.getElementById("root")).render(<App />);
