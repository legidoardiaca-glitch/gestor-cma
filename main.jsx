import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";

const API_URL =
  "https://script.google.com/macros/s/AKfycbwIMYYBvm4veXb4ecpTmgfDXbQalgDWsQWUq4w5iMLMSBCEniadDS7kZO0dfkaBLcz-/exec";

function loadJsonp(url) {
  return new Promise((resolve, reject) => {
    const callbackName = `callback_${Date.now()}_${Math.round(Math.random() * 100000)}`;
    const script = document.createElement("script");
    const separator = url.includes("?") ? "&" : "?";
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error("Temps d'espera esgotat carregant l'API"));
    }, 25000);

    function cleanup() {
      clearTimeout(timeout);
      delete window[callbackName];
      script.remove();
    }

    window[callbackName] = (data) => {
      cleanup();
      resolve(data);
    };

    script.onerror = () => {
      cleanup();
      reject(new Error("No s'ha pogut carregar l'API"));
    };

    script.src = `${url}${separator}callback=${callbackName}`;
    document.body.appendChild(script);
  });
}

function normalizeBool(value) {
  const text = String(value ?? "").toLowerCase().trim();
  return value === true || ["true", "sí", "si", "yes", "1"].includes(text);
}

function normalizeDate(value) {
  if (!value) return "";
  const text = String(value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  const date = new Date(text);
  if (Number.isNaN(date.getTime())) return text;
  return date.toISOString().slice(0, 10);
}

function normalizeTime(value) {
  if (!value) return "";
  const text = String(value);
  if (/^\d{1,2}:\d{2}/.test(text)) return text.slice(0, 5);
  const date = new Date(text);
  if (Number.isNaN(date.getTime())) return text;
  return date.toTimeString().slice(0, 5);
}

function normalizeRow(row) {
  return {
    _row: row._row || row._rowNumber || "",
    _sheetName: row._sheetName || "API PASSIS",
    id: String(row.id || ""),
    idIntern: String(row.idIntern || ""),
    idWeb: String(row.idWeb || ""),
    encarregada: String(row.encarregada || "").toUpperCase(),
    titol: String(row.titol || row.titolWeb || ""),
    titolWeb: String(row.titolWeb || row.titol || ""),
    categoria: String(row.categoria || ""),
    agrupador: String(row.agrupador || ""),
    modalitat: String(row.modalitat || ""),
    dataInici: normalizeDate(row.dataInici),
    horaInici: normalizeTime(row.horaInici),
    dataFinal: normalizeDate(row.dataFinal),
    horaFinal: normalizeTime(row.horaFinal),
    espai: String(row.espai || ""),
    districte: String(row.districte || ""),
    imatge: String(row.imatge || ""),
    importAmbIva: String(row.importAmbIva || ""),
    importar: normalizeBool(row.importar),
  };
}

function formatDate(dateString) {
  if (!dateString) return "Sense data";
  const date = new Date(`${dateString}T12:00:00`);
  if (Number.isNaN(date.getTime())) return dateString;
  return date.toLocaleDateString("ca-ES", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function formatMonth(monthKey) {
  if (!monthKey) return "Sense mes";
  const date = new Date(`${monthKey}-01T12:00:00`);
  return date.toLocaleDateString("ca-ES", { month: "long", year: "numeric" });
}

function groupBy(rows, keyFn) {
  return rows.reduce((acc, row) => {
    const key = keyFn(row) || "Sense dades";
    if (!acc[key]) acc[key] = [];
    acc[key].push(row);
    return acc;
  }, {});
}

function countBy(rows, key) {
  return rows.reduce((acc, row) => {
    const value = row[key] || "Sense dades";
    acc[value] = (acc[value] || 0) + 1;
    return acc;
  }, {});
}

function uniqueCount(rows, key) {
  return new Set(rows.map((row) => row[key]).filter(Boolean)).size;
}

function getDateRange(rows) {
  const dates = rows.map((r) => r.dataInici).filter(Boolean).sort();
  return {
    start: dates[0] || "—",
    end: dates[dates.length - 1] || "—",
  };
}

function getWeekKey(dateString) {
  if (!dateString) return "Sense setmana";
  const date = new Date(`${dateString}T12:00:00`);
  if (Number.isNaN(date.getTime())) return "Sense setmana";
  const monday = new Date(date);
  const day = monday.getDay() || 7;
  monday.setDate(monday.getDate() - day + 1);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  return `${monday.toISOString().slice(0, 10)} → ${sunday.toISOString().slice(0, 10)}`;
}

function getMonthKey(dateString) {
  return dateString ? dateString.slice(0, 7) : "Sense mes";
}

function hasErrors(row) {
  return !row.titolWeb || !row.dataInici || !row.espai;
}

function getErrors(row) {
  if (!row) return [];
  const errors = [];
  if (!row.titolWeb) errors.push("Falta títol web");
  if (!row.dataInici) errors.push("Falta data inici");
  if (!row.espai) errors.push("Falta espai");
  if (!row.idWeb) errors.push("Falta ID WEB");
  return errors;
}

function StatCard({ label, value, hint }) {
  return (
    <div className="stat">
      <div className="statValue">{value}</div>
      <div className="statLabel">{label}</div>
      {hint && <div className="statHint">{hint}</div>}
    </div>
  );
}

function Badge({ children, tone = "neutral" }) {
  return <span className={`badge ${tone}`}>{children}</span>;
}

function Shell({ children, view, setView, rows, status }) {
  return (
    <main className="app">
      <aside className="sidebar">
        <div className="brand">
          <div>BARCELONA</div>
          <div>CAPITAL MUNDIAL</div>
          <div>DE L'ARQUITECTURA</div>
        </div>

        <nav>
          {[
            ["dashboard", "Dashboard"],
            ["activitats", "Activitats"],
            ["propostes", "Propostes"],
            ["calendari", "Calendari"],
            ["espais", "Espais"],
          ].map(([id, label]) => (
            <button key={id} onClick={() => setView(id)} className={view === id ? "active" : ""}>
              {label}
            </button>
          ))}
        </nav>

        <div className="sideMeta">
          <p>{status}</p>
          <strong>{rows.length}</strong>
          <span>registres carregats</span>
        </div>
      </aside>

      <section className="content">{children}</section>
    </main>
  );
}

function Top({ title, subtitle, children }) {
  return (
    <header className="top">
      <div>
        <p className="eyebrow">Gestor de programació</p>
        <h1>{title}</h1>
        <p>{subtitle}</p>
      </div>
      <div className="topActions">{children}</div>
    </header>
  );
}

function SearchFilters({ query, setQuery, filters, activeFilter, setActiveFilter, placeholder }) {
  return (
    <div className="toolbar">
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={placeholder || "Buscar..."}
      />
      <div className="chips">
        {filters.map((filter) => (
          <button
            key={filter.id}
            onClick={() => setActiveFilter(filter.id)}
            className={activeFilter === filter.id ? "selected" : ""}
          >
            {filter.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function ActivityCard({ row, selected, onClick }) {
  const errors = getErrors(row);
  return (
    <button className={`activityCard ${selected ? "selected" : ""}`} onClick={onClick}>
      <div className="cardTop">
        <div>
          <div className="badges">
            <Badge>{row.idIntern}</Badge>
            <Badge>{row.encarregada || "Sense encarregada"}</Badge>
            <Badge tone={row.importar ? "success" : "neutral"}>{row.importar ? "Importar" : "No importar"}</Badge>
          </div>
          <h3>{row.titolWeb || row.titol || "Sense títol"}</h3>
          <p>{row.categoria || "Sense categoria"}</p>
        </div>
        <span className={errors.length ? "warn" : "ok"}>{errors.length ? "⚠" : "✓"}</span>
      </div>
      <div className="metaGrid">
        <span>📅 {row.dataInici || "Sense data"} {row.horaInici || ""}</span>
        <span>📍 {row.espai || "Sense espai"}</span>
        <span>🌐 {row.idWeb || "Sense ID WEB"}</span>
      </div>
    </button>
  );
}

function Detail({ row }) {
  if (!row) return <div className="panel">Selecciona una activitat.</div>;

  const errors = getErrors(row);

  return (
    <div className="panel detail">
      <div className="hero">
        {row.imatge ? <span>Imatge vinculada</span> : <span>Sense imatge principal</span>}
      </div>

      <div className="badges">
        <Badge>{row.idIntern}</Badge>
        <Badge>{row.idWeb}</Badge>
        <Badge tone={row.importar ? "success" : "neutral"}>{row.importar ? "Importar" : "No importar"}</Badge>
      </div>

      <h2>{row.titolWeb || row.titol}</h2>
      <p>{row.categoria}</p>

      <div className="infoGrid">
        <Info label="ID proposta" value={row.id} />
        <Info label="Encarregada" value={row.encarregada} />
        <Info label="Data inici" value={`${row.dataInici || "—"} ${row.horaInici || ""}`} />
        <Info label="Data final" value={`${row.dataFinal || "—"} ${row.horaFinal || ""}`} />
        <Info label="Espai" value={row.espai || "—"} />
        <Info label="Districte" value={row.districte || "—"} />
        <Info label="Agrupador" value={row.agrupador || "—"} />
        <Info label="Modalitat" value={row.modalitat || "—"} />
      </div>

      <h3>Validacions</h3>
      {errors.length === 0 ? (
        <div className="notice success">Aquesta fitxa no té errors bàsics.</div>
      ) : (
        <div className="errorList">
          {errors.map((e) => (
            <div className="notice" key={e}>⚠ {e}</div>
          ))}
        </div>
      )}
    </div>
  );
}

function Info({ label, value }) {
  return (
    <div className="info">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function ActivitiesView({ rows }) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [selected, setSelected] = useState(rows[0] || null);

  const filtered = useMemo(() => {
    return rows.filter((row) => {
      const text = [
        row.id,
        row.idIntern,
        row.idWeb,
        row.titol,
        row.titolWeb,
        row.encarregada,
        row.categoria,
        row.espai,
        row.districte,
      ].join(" ").toLowerCase();

      const matchesQuery = text.includes(query.toLowerCase());
      const matchesFilter =
        filter === "all" ||
        (filter === "importar" && row.importar) ||
        (filter === "errors" && hasErrors(row)) ||
        (filter === "senseEspai" && !row.espai);

      return matchesQuery && matchesFilter;
    });
  }, [rows, query, filter]);

  useEffect(() => {
    if (!selected && filtered[0]) setSelected(filtered[0]);
  }, [filtered, selected]);

  return (
    <>
      <Top title="Activitats" subtitle="Llistat operatiu de passis llegits directament del Google Sheets." />
      <SearchFilters
        query={query}
        setQuery={setQuery}
        activeFilter={filter}
        setActiveFilter={setFilter}
        placeholder="Buscar per ID, títol, espai, categoria..."
        filters={[
          { id: "all", label: "Tot" },
          { id: "importar", label: "Importar" },
          { id: "errors", label: "Errors" },
          { id: "senseEspai", label: "Sense espai" },
        ]}
      />
      <div className="split">
        <div className="list">
          {filtered.map((row) => (
            <ActivityCard
              key={`${row.idIntern}-${row._row}`}
              row={row}
              selected={selected?._row === row._row}
              onClick={() => setSelected(row)}
            />
          ))}
        </div>
        <Detail row={selected} />
      </div>
    </>
  );
}

function ProposalsView({ rows }) {
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState("");

  const proposals = useMemo(() => {
    const groups = groupBy(rows, (row) => row.id);
    return Object.entries(groups)
      .map(([id, passis]) => {
        const range = getDateRange(passis);
        const first = passis[0] || {};
        return {
          id,
          title: first.titolWeb || first.titol || "Sense títol",
          encarregada: first.encarregada,
          categoria: mostCommon(passis.map((p) => p.categoria)),
          agrupador: first.agrupador,
          dateStart: range.start,
          dateEnd: range.end,
          passis,
          webCount: uniqueCount(passis, "idWeb"),
          spaceCount: uniqueCount(passis, "espai"),
          districtCount: uniqueCount(passis, "districte"),
          errors: passis.filter(hasErrors).length,
        };
      })
      .sort((a, b) => String(a.id).localeCompare(String(b.id)));
  }, [rows]);

  const filtered = proposals.filter((p) =>
    [p.id, p.title, p.encarregada, p.categoria, p.agrupador].join(" ").toLowerCase().includes(query.toLowerCase())
  );

  const selected = proposals.find((p) => p.id === selectedId) || filtered[0] || null;
  const webGroups = selected ? groupBy(selected.passis, (row) => row.idWeb) : {};

  return (
    <>
      <Top title="Propostes" subtitle="Vista agrupada per ID de proposta, construïda a partir dels passis." />
      <SearchFilters
        query={query}
        setQuery={setQuery}
        activeFilter="all"
        setActiveFilter={() => {}}
        placeholder="Buscar proposta, encarregada, categoria..."
        filters={[{ id: "all", label: "Totes" }]}
      />

      <div className="split">
        <div className="list">
          {filtered.map((p) => (
            <button
              key={p.id}
              className={`activityCard ${selected?.id === p.id ? "selected" : ""}`}
              onClick={() => setSelectedId(p.id)}
            >
              <div className="cardTop">
                <div>
                  <div className="badges">
                    <Badge>{p.id}</Badge>
                    <Badge>{p.encarregada}</Badge>
                    <Badge>{p.categoria}</Badge>
                  </div>
                  <h3>{p.title}</h3>
                  <p>{p.agrupador || "Sense agrupador"}</p>
                </div>
                <span className={p.errors ? "warn" : "ok"}>{p.errors ? "⚠" : "✓"}</span>
              </div>
              <div className="metaGrid">
                <span>📅 {p.dateStart} → {p.dateEnd}</span>
                <span>🎫 {p.passis.length} passis</span>
                <span>🌐 {p.webCount} activitats web</span>
                <span>🏛 {p.spaceCount} espais</span>
              </div>
            </button>
          ))}
        </div>

        <div className="panel">
          {selected ? (
            <>
              <div className="badges">
                <Badge>Proposta {selected.id}</Badge>
                <Badge>{selected.encarregada}</Badge>
                <Badge>{selected.categoria}</Badge>
              </div>
              <h2>{selected.title}</h2>
              <p>{selected.agrupador}</p>

              <div className="stats four">
                <StatCard label="Passis" value={selected.passis.length} />
                <StatCard label="Activitats web" value={selected.webCount} />
                <StatCard label="Espais" value={selected.spaceCount} />
                <StatCard label="Districtes" value={selected.districtCount} />
              </div>

              <h3>Activitats agrupades per ID WEB</h3>
              <div className="webGroups">
                {Object.entries(webGroups).map(([idWeb, items]) => (
                  <div className="webGroup" key={idWeb}>
                    <div>
                      <strong>{idWeb}</strong>
                      <p>{items[0]?.titolWeb || items[0]?.titol}</p>
                    </div>
                    <Badge>{items.length} passis</Badge>
                    <div className="miniRows">
                      {items.map((item) => (
                        <span key={`${item.idIntern}-${item._row}`}>
                          {item.idIntern} · {item.dataInici} · {item.horaInici || "—"} · {item.espai || "Sense espai"}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : (
            "Selecciona una proposta."
          )}
        </div>
      </div>
    </>
  );
}

function mostCommon(values) {
  const counts = values.filter(Boolean).reduce((acc, v) => {
    acc[v] = (acc[v] || 0) + 1;
    return acc;
  }, {});
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] || "Sense categoria";
}

function CalendarView({ rows }) {
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState("cronologic");

  const filtered = rows
    .filter((row) =>
      [row.idIntern, row.idWeb, row.titolWeb, row.titol, row.espai, row.categoria, row.districte]
        .join(" ")
        .toLowerCase()
        .includes(query.toLowerCase())
    )
    .sort((a, b) => `${a.dataInici} ${a.horaInici}`.localeCompare(`${b.dataInici} ${b.horaInici}`));

  const dayGroups = groupBy(filtered, (row) => row.dataInici || "Sense data");
  const weekGroups = groupBy(filtered, (row) => getWeekKey(row.dataInici));
  const monthGroups = groupBy(filtered, (row) => getMonthKey(row.dataInici));

  return (
    <>
      <Top title="Calendari" subtitle="Lectura temporal del programa: cronològica, setmanal i mensual." />
      <SearchFilters
        query={query}
        setQuery={setQuery}
        activeFilter={mode}
        setActiveFilter={setMode}
        placeholder="Buscar calendari..."
        filters={[
          { id: "cronologic", label: "Cronològic" },
          { id: "setmanal", label: "Setmanal" },
          { id: "mensual", label: "Mensual" },
        ]}
      />

      <div className="calendarList">
        {mode === "cronologic" &&
          Object.entries(dayGroups).map(([date, items]) => <CalendarBlock key={date} title={formatDate(date)} items={items} />)}
        {mode === "setmanal" &&
          Object.entries(weekGroups).map(([week, items]) => <CalendarBlock key={week} title={`Setmana ${week}`} items={items} />)}
        {mode === "mensual" &&
          Object.entries(monthGroups).map(([month, items]) => <MonthBlock key={month} month={month} items={items} />)}
      </div>
    </>
  );
}

function CalendarBlock({ title, items }) {
  return (
    <div className="calendarBlock">
      <div className="calendarHeader">
        <h2>{title}</h2>
        <Badge>{items.length} passis</Badge>
      </div>
      {items.map((item) => (
        <div className="calendarItem" key={`${item.idIntern}-${item._row}`}>
          <strong>{item.horaInici || "--:--"}</strong>
          <div>
            <h3>{item.idIntern} · {item.titolWeb || item.titol}</h3>
            <p>{item.espai || "Sense espai"} · {item.districte || "Sense districte"} · {item.categoria}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

function MonthBlock({ month, items }) {
  const byDay = groupBy(items, (row) => row.dataInici || "Sense data");
  return (
    <div className="calendarBlock">
      <div className="calendarHeader">
        <h2>{formatMonth(month)}</h2>
        <Badge>{items.length} passis</Badge>
      </div>
      <div className="monthGrid">
        {Object.entries(byDay).map(([date, dayItems]) => (
          <div className="monthCell" key={date}>
            <strong>{date.slice(-2)}</strong>
            <span>{dayItems.length} passis</span>
            {dayItems.slice(0, 2).map((item) => (
              <small key={`${item.idIntern}-${item._row}`}>{item.horaInici || "—"} · {item.titolWeb || item.titol}</small>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function SpacesView({ rows }) {
  const [query, setQuery] = useState("");

  const spaces = Object.entries(groupBy(rows.filter((r) => r.espai), (r) => r.espai))
    .map(([name, items]) => ({
      name,
      items,
      districte: mostCommon(items.map((i) => i.districte)),
      count: items.length,
    }))
    .filter((space) =>
      [space.name, space.districte].join(" ").toLowerCase().includes(query.toLowerCase())
    )
    .sort((a, b) => b.count - a.count);

  return (
    <>
      <Top title="Espais" subtitle="Espais derivats dels passis. Quan tinguem API ESPAIS, afegirem coordenades i mapa real." />
      <SearchFilters
        query={query}
        setQuery={setQuery}
        activeFilter="all"
        setActiveFilter={() => {}}
        placeholder="Buscar espai o districte..."
        filters={[{ id: "all", label: "Tots" }]}
      />

      <div className="spaceGrid">
        {spaces.map((space) => (
          <div className="panel" key={space.name}>
            <div className="badges">
              <Badge>{space.districte}</Badge>
              <Badge>{space.count} passis</Badge>
            </div>
            <h2>{space.name}</h2>
            <div className="miniRows">
              {space.items.slice(0, 8).map((item) => (
                <span key={`${item.idIntern}-${item._row}`}>{item.dataInici} · {item.idIntern} · {item.titolWeb || item.titol}</span>
              ))}
              {space.items.length > 8 && <span>+ {space.items.length - 8} més</span>}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

function DashboardView({ rows }) {
  return (
    <>
      <Top title="Dashboard direcció" subtitle="Indicadors generals del programa connectats al Google Sheets." />
      <div className="stats">
        <StatCard label="Passis" value={rows.length} />
        <StatCard label="Propostes" value={uniqueCount(rows, "id")} />
        <StatCard label="Activitats web" value={uniqueCount(rows, "idWeb")} />
        <StatCard label="Espais" value={uniqueCount(rows, "espai")} />
        <StatCard label="Districtes" value={uniqueCount(rows, "districte")} />
      </div>
      <div className="dashboardGrid">
        <Chart title="Activitats per tipologia" data={countBy(rows, "categoria")} />
        <Chart title="Activitats per districte" data={countBy(rows, "districte")} />
        <Chart title="Activitats per encarregada" data={countBy(rows, "encarregada")} />
        <Chart title="Activitats per mes" data={countBy(rows.map((r) => ({ mes: getMonthKey(r.dataInici) })), "mes")} />
      </div>
    </>
  );
}

function Chart({ title, data }) {
  const entries = Object.entries(data).sort((a, b) => b[1] - a[1]).slice(0, 12);
  const max = Math.max(...entries.map(([, v]) => v), 1);

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

function App() {
  const [rows, setRows] = useState([]);
  const [view, setView] = useState("dashboard");
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("Carregant API...");
  const [error, setError] = useState("");

  useEffect(() => {
    loadJsonp(API_URL)
      .then((data) => {
        const passis = Array.isArray(data.passis) ? data.passis.map(normalizeRow) : [];
        setRows(passis);
        setStatus("Dades reals");
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message || "Error carregant dades");
        setStatus("Error API");
        setLoading(false);
      });
  }, []);

  if (loading) return <div className="screen">Carregant dades reals...</div>;

  return (
    <>
      <Shell view={view} setView={setView} rows={rows} status={status}>
        {error && <div className="notice">⚠ {error}</div>}
        {view === "dashboard" && <DashboardView rows={rows} />}
        {view === "activitats" && <ActivitiesView rows={rows} />}
        {view === "propostes" && <ProposalsView rows={rows} />}
        {view === "calendari" && <CalendarView rows={rows} />}
        {view === "espais" && <SpacesView rows={rows} />}
      </Shell>
      <style>{css}</style>
    </>
  );
}

const css = `
* { box-sizing: border-box; }
body { margin: 0; font-family: Inter, Arial, sans-serif; background: #f7f7f5; color: #111; }
button, input { font: inherit; }
button { cursor: pointer; }
.app { display: grid; grid-template-columns: 280px 1fr; min-height: 100vh; }
.sidebar { background: #fff; border-right: 1px solid #ddd; padding: 30px; position: sticky; top: 0; height: 100vh; }
.brand { font-size: 21px; line-height: 1.02; font-weight: 900; letter-spacing: -0.03em; margin-bottom: 46px; }
nav button { width: 100%; border: 0; background: transparent; text-align: left; padding: 14px 16px; border-radius: 16px; margin-bottom: 8px; font-weight: 650; }
nav button.active, nav button:hover { background: #efefed; }
.sideMeta { position: absolute; left: 30px; right: 30px; bottom: 30px; background: #f3f3f1; border-radius: 20px; padding: 18px; }
.sideMeta p, .sideMeta span { color: #666; margin: 0; }
.sideMeta strong { display: block; font-size: 34px; margin-top: 6px; }
.content { padding: 36px; max-width: 1500px; width: 100%; }
.top { display: flex; justify-content: space-between; gap: 24px; margin-bottom: 26px; }
.eyebrow { text-transform: uppercase; letter-spacing: .08em; font-size: 12px; margin: 0 0 8px; color: #777; }
h1 { margin: 0; font-size: 42px; line-height: 1; letter-spacing: -0.04em; }
h2 { margin: 0 0 10px; letter-spacing: -0.02em; }
h3 { margin: 0; }
p { color: #666; }
.stats { display: grid; grid-template-columns: repeat(5, 1fr); gap: 14px; margin-bottom: 24px; }
.stats.four { grid-template-columns: repeat(4, 1fr); margin: 20px 0; }
.stat, .panel, .chart, .calendarBlock { background: #fff; border: 1px solid #ddd; border-radius: 24px; padding: 22px; box-shadow: 0 1px 0 rgba(0,0,0,.02); }
.statValue { font-size: 35px; font-weight: 800; letter-spacing: -0.04em; }
.statLabel { color: #666; margin-top: 4px; }
.statHint { color: #888; font-size: 12px; margin-top: 4px; }
.toolbar { background: #fff; border: 1px solid #ddd; border-radius: 24px; padding: 14px; margin-bottom: 22px; }
.toolbar input { width: 100%; border: 1px solid #ddd; border-radius: 16px; padding: 14px 16px; margin-bottom: 12px; background: #fafafa; }
.chips { display: flex; flex-wrap: wrap; gap: 8px; }
.chips button { border: 1px solid #ddd; background: white; border-radius: 999px; padding: 8px 12px; }
.chips button.selected { background: #111; color: white; border-color: #111; }
.split { display: grid; grid-template-columns: 430px 1fr; gap: 22px; align-items: start; }
.list { display: flex; flex-direction: column; gap: 12px; max-height: calc(100vh - 210px); overflow: auto; padding-right: 4px; }
.activityCard { background: #fff; border: 1px solid #ddd; border-radius: 22px; padding: 18px; text-align: left; transition: .15s ease; }
.activityCard:hover, .activityCard.selected { border-color: #111; transform: translateY(-1px); }
.cardTop { display: flex; justify-content: space-between; gap: 12px; align-items: start; }
.badges { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 10px; }
.badge { display: inline-flex; align-items: center; border-radius: 999px; background: #eee; padding: 5px 9px; font-size: 12px; font-weight: 650; }
.badge.success { background: #e5f4e8; }
.activityCard h3 { font-size: 16px; margin: 0 0 6px; }
.activityCard p { margin: 0; }
.warn { color: #aa6b00; font-weight: 800; }
.ok { color: #147d32; font-weight: 800; }
.metaGrid { display: grid; gap: 6px; margin-top: 14px; color: #666; font-size: 13px; }
.panel { position: sticky; top: 28px; }
.hero { height: 190px; border-radius: 20px; background: #efefed; display: flex; align-items: center; justify-content: center; color: #777; margin-bottom: 18px; }
.detail h2 { font-size: 28px; }
.infoGrid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; margin: 22px 0; }
.info { background: #f4f4f2; border-radius: 18px; padding: 14px; }
.info span { display: block; color: #777; font-size: 12px; margin-bottom: 4px; }
.info strong { font-size: 14px; }
.notice { background: #fff7e6; border: 1px solid #f0d7a5; border-radius: 18px; padding: 14px; margin-bottom: 10px; }
.notice.success { background: #eaf7ee; border-color: #bfe2c9; }
.errorList { margin-top: 10px; }
.webGroups { display: flex; flex-direction: column; gap: 14px; margin-top: 14px; }
.webGroup { border: 1px solid #ddd; border-radius: 20px; padding: 16px; background: #fafafa; }
.miniRows { display: flex; flex-direction: column; gap: 7px; margin-top: 12px; }
.miniRows span { background: #fff; border: 1px solid #eee; border-radius: 12px; padding: 9px 10px; color: #555; font-size: 13px; }
.calendarList { display: flex; flex-direction: column; gap: 16px; }
.calendarHeader { display: flex; justify-content: space-between; gap: 12px; align-items: start; border-bottom: 1px solid #eee; padding-bottom: 14px; margin-bottom: 10px; }
.calendarItem { display: grid; grid-template-columns: 80px 1fr; gap: 16px; border-bottom: 1px solid #eee; padding: 14px 0; }
.calendarItem:last-child { border-bottom: 0; }
.calendarItem p { margin: 4px 0 0; }
.monthGrid { display: grid; grid-template-columns: repeat(7, 1fr); gap: 8px; }
.monthCell { min-height: 120px; background: #f5f5f3; border-radius: 16px; padding: 10px; }
.monthCell strong, .monthCell span, .monthCell small { display: block; }
.monthCell span { color: #666; margin: 6px 0; }
.monthCell small { color: #666; margin-top: 4px; line-height: 1.2; }
.spaceGrid, .dashboardGrid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 18px; }
.chart h2 { margin-bottom: 18px; }
.bar { display: grid; grid-template-columns: minmax(160px, 260px) 1fr 44px; gap: 12px; align-items: center; margin: 11px 0; font-size: 13px; }
.bar div { height: 11px; background: #efefed; border-radius: 999px; overflow: hidden; }
.bar i { display: block; height: 100%; background: #111; border-radius: 999px; }
.bar b { text-align: right; }
.screen { padding: 40px; font-size: 22px; }
@media (max-width: 1000px) {
  .app { grid-template-columns: 1fr; }
  .sidebar { position: static; height: auto; }
  .sideMeta { position: static; margin-top: 24px; }
  .split, .spaceGrid, .dashboardGrid { grid-template-columns: 1fr; }
  .stats { grid-template-columns: repeat(2, 1fr); }
  .panel { position: static; }
}
`;

createRoot(document.getElementById("root")).render(<App />);
