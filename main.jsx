import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";

const DATA_URL = "/api/data";

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

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let insideQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const next = text[i + 1];

    if (char === '"' && insideQuotes && next === '"') {
      cell += '"';
      i++;
    } else if (char === '"') {
      insideQuotes = !insideQuotes;
    } else if (char === "," && !insideQuotes) {
      row.push(cell);
      cell = "";
    } else if ((char === "\n" || char === "\r") && !insideQuotes) {
      if (cell || row.length) {
        row.push(cell);
        rows.push(row);
        row = [];
        cell = "";
      }
      if (char === "\r" && next === "\n") i++;
    } else {
      cell += char;
    }
  }

  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }

  const headers = rows[0].map(normalizeCsvHeader);

  return rows.slice(1).map((values, rowIndex) => {
    const obj = { _row: rowIndex + 2 };

    headers.forEach((header, index) => {
      obj[header] = values[index] || "";
    });

    return obj;
  });
}

function normalizeCsvHeader(header) {
  return String(header)
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
}

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

async function loadPassisFromIndex() {
  const response = await fetch(DATA_URL, { cache: "no-store" });

  if (!response.ok) {
    throw new Error(`Error carregant dades: ${response.status}`);
  }

  const data = await response.json();

  if (!Array.isArray(data.rows)) {
    throw new Error("La resposta de /api/data no conté rows.");
  }

  return data.rows;
}

function normalizeBool(value) {
  const text = String(value ?? "").toLowerCase().trim();
  return value === true || ["true", "sí", "si", "yes", "1"].includes(text);
}

function normalizeDate(value) {
  if (!value) return "";
  const text = String(value).trim();

  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;

  const ddmmyyyy = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (ddmmyyyy) {
    const [, d, m, y] = ddmmyyyy;
    return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  }

  const date = new Date(text);
  if (Number.isNaN(date.getTime())) return "";
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
    autores: String(row.autores || ""),
    contacteAutores: String(row.contacteAutores || ""),
    presencialitat: String(row.presencialitat || ""),
    franjaHoraria: String(row.franjaHoraria || ""),
    dataEscritaCat: String(row.dataEscritaCat || ""),
    municipi: String(row.municipi || ""),
    entrada: String(row.entrada || ""),
    infoInscripcio: String(row.infoInscripcio || ""),
    enllacInscripcions: String(row.enllacInscripcions || ""),
    aforament: String(row.aforament || ""),
    entradetaCat: String(row.entradetaCat || ""),
    voluntaris: normalizeBool(row.voluntaris),
  };
}

function normalizeSpace(row) {
  return {
    id: String(row.id || row.z || row._row || ""),
    title: String(row.title || row.title_ca || row.name || ""),
    title_ca: String(row.title_ca || row.title || row.name || ""),
    title_es: String(row.title_es || ""),
    title_en: String(row.title_en || ""),
    body_ca: String(row.body_ca || row.body || ""),
    adreca: String(row.adreca || ""),
    barri: String(row.barri || ""),
    districte: String(row.districte || ""),
    coordenades: String(row.coordenades || ""),
    latitud: String(row.latitud || ""),
    longitud: String(row.longitud || ""),
    imatge: String(row.imatge || ""),
    autoria: String(row.autoria || row["autoria imatge"] || ""),
    importar: normalizeBool(row.importar),
  };
}

function buildDerivedSpaces(rows, apiSpaces = []) {
  const byName = groupBy(rows.filter((row) => row.espai), (row) => row.espai);
  const apiByName = new Map(apiSpaces.map((space) => [space.title_ca || space.title, space]));

  return Object.entries(byName)
    .map(([name, items]) => {
      const api = apiByName.get(name) || {};
      return {
        id: api.id || name,
        title: api.title_ca || api.title || name,
        title_ca: api.title_ca || api.title || name,
        title_es: api.title_es || "",
        title_en: api.title_en || "",
        body_ca: api.body_ca || "",
        adreca: api.adreca || "",
        barri: api.barri || "",
        districte: api.districte || mostCommon(items.map((i) => i.districte)),
        coordenades: api.coordenades || "",
        latitud: api.latitud || "",
        longitud: api.longitud || "",
        imatge: api.imatge || "",
        autoria: api.autoria || "",
        importar: api.importar || false,
        items,
        count: items.length,
      };
    })
    .sort((a, b) => b.count - a.count);
}

function isValidDateString(value) {
  if (!value) return false;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value))) return false;
  const date = new Date(`${value}T12:00:00`);
  return !Number.isNaN(date.getTime());
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

function Shell({ children, view, setView, rows, status, userName, role, onLogout }) {
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
          <div className="userBox">
            <b>{userName}</b>
            <small>{role}</small>
            <button onClick={onLogout}>Canviar usuari</button>
          </div>
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

function Detail({ row, onSearchRelated, onChangeView }) {
  const [tab, setTab] = useState("general");

  if (!row) return <div className="panel">Selecciona una activitat.</div>;

  const errors = getErrors(row);

  return (
    <div className="panel detail">
      <div className="hero">
        {row.imatge ? (
          <div className="heroImage">
            <span>Imatge principal vinculada</span>
            <a href={row.imatge} target="_blank" rel="noreferrer">Obrir imatge</a>
          </div>
        ) : (
          <span>Sense imatge principal</span>
        )}
      </div>

      <div className="badges">
        <Badge>{row.idIntern}</Badge>
        <Badge>{row.idWeb || "Sense ID WEB"}</Badge>
        <Badge>{row.encarregada || "Sense encarregada"}</Badge>
        <Badge tone={row.importar ? "success" : "neutral"}>{row.importar ? "Importar" : "No importar"}</Badge>
        {errors.length > 0 && <Badge tone="warning">{errors.length} avisos</Badge>}
      </div>

      <h2>{row.titolWeb || row.titol || "Sense títol"}</h2>
      <p>{row.categoria || "Sense categoria"}</p>

      <div className="quickActions">
        <button onClick={() => onSearchRelated?.(row.id)}>Veure proposta {row.id}</button>
        <button onClick={() => onSearchRelated?.(row.idWeb)}>Veure ID WEB {row.idWeb || "—"}</button>
        <button onClick={() => onSearchRelated?.(row.espai)}>Veure espai</button>
        <button onClick={() => onSearchRelated?.(row.categoria)}>Veure categoria</button>
        <button onClick={() => onChangeView?.("propostes")}>Anar a Propostes</button>
        <button onClick={() => onChangeView?.("espais")}>Anar a Espais</button>
      </div>

      <div className="tabs">
        {[
          ["general", "General"],
          ["web", "Web"],
          ["produccio", "Producció"],
          ["errors", "Errors"],
        ].map(([id, label]) => (
          <button key={id} className={tab === id ? "active" : ""} onClick={() => setTab(id)}>
            {label}
          </button>
        ))}
      </div>

      {tab === "general" && (
        <div className="tabBody">
          <div className="infoGrid">
            <Info label="ID proposta" value={row.id || "—"} />
            <Info label="ID intern" value={row.idIntern || "—"} />
            <Info label="ID web" value={row.idWeb || "—"} />
            <Info label="Encarregada" value={row.encarregada || "—"} />
            <Info label="Categoria" value={row.categoria || "—"} />
            <Info label="Modalitat" value={row.modalitat || "—"} />
            <Info label="Agrupador" value={row.agrupador || "—"} />
            <Info label="Fila origen" value={row._row || "—"} />
          </div>

          <div className="sectionTitle">Calendari i ubicació</div>
          <div className="infoGrid">
            <Info label="Data inici" value={`${row.dataInici || "—"} ${row.horaInici || ""}`} />
            <Info label="Data final" value={`${row.dataFinal || "—"} ${row.horaFinal || ""}`} />
            <Info label="Espai" value={row.espai || "Sense espai"} />
            <Info label="Districte" value={row.districte || "Sense districte"} />
          </div>
        </div>
      )}

      {tab === "web" && (
        <div className="tabBody">
          <div className="infoGrid">
            <Info label="Títol web" value={row.titolWeb || "—"} />
            <Info label="Títol activitat CAT" value={row.titol || "—"} />
            <Info label="ID WEB" value={row.idWeb || "—"} />
            <Info label="Importar" value={row.importar ? "Sí" : "No"} />
            <Info label="Imatge principal" value={row.imatge ? "Assignada" : "Falta imatge"} />
            <Info label="Categoria" value={row.categoria || "—"} />
          </div>

          {row.imatge && (
            <a className="externalLink" href={row.imatge} target="_blank" rel="noreferrer">
              Obrir imatge principal
            </a>
          )}
        </div>
      )}

      {tab === "produccio" && (
        <div className="tabBody">
          <div className="infoGrid">
            <Info label="Aforament" value={row.aforament || "—"} />
            <Info label="Import amb IVA" value={row.importAmbIva ? `${row.importAmbIva} €` : "—"} />
            <Info label="Entrada" value={row.entrada || "—"} />
            <Info label="Modalitat" value={row.modalitat || "—"} />
            <Info label="Espai" value={row.espai || "—"} />
            <Info label="Districte" value={row.districte || "—"} />
          </div>

          <div className="notice">
            Més endavant aquí podem afegir persones inscrites, assistents i percentatge d’ocupació.
          </div>
        </div>
      )}

      {tab === "errors" && (
        <div className="tabBody">
          {errors.length === 0 ? (
            <div className="notice success">Aquesta fitxa no té errors bàsics.</div>
          ) : (
            <div className="errorList">
              {errors.map((e) => (
                <div className="notice" key={e}>⚠ {e}</div>
              ))}
            </div>
          )}

          <div className="sectionTitle">Criteris revisats</div>
          <div className="checkList">
            <span className={row.titolWeb ? "good" : "bad"}>{row.titolWeb ? "✓" : "×"} Títol web</span>
            <span className={row.dataInici ? "good" : "bad"}>{row.dataInici ? "✓" : "×"} Data inici</span>
            <span className={row.espai ? "good" : "bad"}>{row.espai ? "✓" : "×"} Espai</span>
            <span className={row.idWeb ? "good" : "bad"}>{row.idWeb ? "✓" : "×"} ID WEB</span>
          </div>
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

function ActivitiesView({ rows, setView, selectedActivityId, setSelectedActivityId }) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [selected, setSelected] = useState(rows.find((row) => String(row._row || row.idIntern) === String(selectedActivityId)) || rows[0] || null);

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
    const found = rows.find((row) => String(row._row || row.idIntern) === String(selectedActivityId));
    if (found) setSelected(found);
  }, [selectedActivityId, rows]);

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
              onClick={() => {
                setSelected(row);
                setSelectedActivityId(row._row || row.idIntern);
              }}
            />
          ))}
        </div>
        <Detail
          row={selected}
          onSearchRelated={(value) => {
            if (value) setQuery(String(value));
          }}
          onChangeView={setView}
        />
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

function CalendarView({ rows, setView, setSelectedActivityId }) {
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState("cronologic");

  const filtered = rows
    .filter((row) =>
      [row.idIntern, row.idWeb, row.titolWeb, row.titol, row.espai, row.categoria, row.districte]
        .join(" ")
        .toLowerCase()
        .includes(query.toLowerCase())
    )
    .sort((a, b) => `${a.dataInici || "9999-99-99"} ${a.horaInici}`.localeCompare(`${b.dataInici || "9999-99-99"} ${b.horaInici}`));

  const datedRows = filtered.filter((row) => isValidDateString(row.dataInici));
  const undatedRows = filtered.filter((row) => !isValidDateString(row.dataInici));

  const dayGroups = groupBy(datedRows, (row) => row.dataInici);
  const weekGroups = groupBy(datedRows, (row) => getWeekKey(row.dataInici));
  const monthGroups = groupBy(datedRows, (row) => getMonthKey(row.dataInici));

  function openActivity(row) {
    setSelectedActivityId(row._row || row.idIntern);
    setView("activitats");
  }

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
          Object.entries(dayGroups).map(([date, items]) => <CalendarBlock key={date} title={formatDate(date)} items={items} onOpen={openActivity} />)}
        {mode === "setmanal" &&
          Object.entries(weekGroups).map(([week, items]) => <CalendarBlock key={week} title={`Setmana ${week}`} items={items} onOpen={openActivity} />)}
        {mode === "mensual" &&
          Object.entries(monthGroups).map(([month, items]) => <MonthBlock key={month} month={month} items={items} onOpen={openActivity} />)}

        {undatedRows.length > 0 && (
          <CalendarBlock
            title="Sense data assignada"
            items={undatedRows}
            onOpen={openActivity}
          />
        )}
      </div>
    </>
  );
}

function CalendarBlock({ title, items, onOpen }) {
  return (
    <div className="calendarBlock">
      <div className="calendarHeader">
        <h2>{title}</h2>
        <Badge>{items.length} passis</Badge>
      </div>
      {items.map((item) => (
        <button className="calendarItem clickable" key={`${item.idIntern}-${item._row}`} onClick={() => onOpen?.(item)}>
          <strong>{item.horaInici || "--:--"}</strong>
          <div>
            <h3>{item.idIntern || item.idWeb || "Sense ID"} · {item.titolWeb || item.titol || "Sense títol"}</h3>
            <p>{item.espai || "Sense espai"} · {item.districte || "Sense districte"} · {item.categoria || "Sense categoria"}</p>
          </div>
        </button>
      ))}
    </div>
  );
}

function MonthBlock({ month, items, onOpen }) {
  const byDay = groupBy(items.filter((row) => isValidDateString(row.dataInici)), (row) => row.dataInici);
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
            {dayItems.slice(0, 4).map((item) => (
              <button className="monthMini" key={`${item.idIntern}-${item._row}`} onClick={() => onOpen?.(item)}>
                {item.horaInici || "—"} · {item.idIntern || item.idWeb || "Sense ID"} · {item.titolWeb || item.titol || "Sense títol"}
              </button>
            ))}
            {dayItems.length > 4 && <small>+{dayItems.length - 4} més</small>}
          </div>
        ))}
      </div>
    </div>
  );
}

function SpacesView({ rows, apiSpaces = [], setView, setSelectedActivityId }) {
  const [query, setQuery] = useState("");
  const [selectedName, setSelectedName] = useState("");

  const spaces = useMemo(() => {
    return buildDerivedSpaces(rows, apiSpaces).filter((space) =>
      [
        space.title,
        space.adreca,
        space.barri,
        space.districte,
        space.coordenades,
      ]
        .join(" ")
        .toLowerCase()
        .includes(query.toLowerCase())
    );
  }, [rows, apiSpaces, query]);

  const selected = spaces.find((space) => space.title === selectedName) || spaces[0] || null;

  function openActivity(row) {
    setSelectedActivityId(row._row || row.idIntern);
    setView("activitats");
  }

  return (
    <>
      <Top title="Espais" subtitle="Espais vinculats als passis. La fitxa ja està preparada per incorporar API ESPAIS amb adreces, imatges i coordenades." />
      <SearchFilters
        query={query}
        setQuery={setQuery}
        activeFilter="all"
        setActiveFilter={() => {}}
        placeholder="Buscar espai, barri, districte o adreça..."
        filters={[{ id: "all", label: "Tots" }]}
      />

      <div className="split">
        <div className="list">
          {spaces.map((space) => (
            <button
              key={space.title}
              className={`activityCard ${selected?.title === space.title ? "selected" : ""}`}
              onClick={() => setSelectedName(space.title)}
            >
              <div className="cardTop">
                <div>
                  <div className="badges">
                    <Badge>{space.districte || "Sense districte"}</Badge>
                    {space.barri && <Badge>{space.barri}</Badge>}
                    <Badge>{space.count} passis</Badge>
                  </div>
                  <h3>{space.title}</h3>
                  <p>{space.adreca || "Adreça pendent / no connectada"}</p>
                </div>
                <span>›</span>
              </div>
            </button>
          ))}
        </div>

        <SpaceDetail space={selected} onOpenActivity={openActivity} />
      </div>
    </>
  );
}

function SpaceDetail({ space, onOpenActivity }) {
  const [tab, setTab] = useState("general");

  if (!space) return <div className="panel">Selecciona un espai.</div>;

  return (
    <div className="panel detail">
      <div className="hero">
        {space.imatge ? (
          <div className="heroImage">
            <span>Imatge de l’espai vinculada</span>
            <a href={space.imatge} target="_blank" rel="noreferrer">Obrir imatge</a>
          </div>
        ) : (
          <span>Sense imatge de l’espai</span>
        )}
      </div>

      <div className="badges">
        <Badge>{space.districte || "Sense districte"}</Badge>
        {space.barri && <Badge>{space.barri}</Badge>}
        <Badge>{space.count} passis</Badge>
        {space.latitud && space.longitud && <Badge tone="success">Coordenades</Badge>}
      </div>

      <h2>{space.title}</h2>
      <p>{space.adreca || "Quan connectem API ESPAIS aquí apareixerà l’adreça completa."}</p>

      <div className="tabs">
        {[
          ["general", "General"],
          ["ubicacio", "Ubicació"],
          ["activitats", "Activitats"],
          ["web", "Web"],
        ].map(([id, label]) => (
          <button key={id} className={tab === id ? "active" : ""} onClick={() => setTab(id)}>
            {label}
          </button>
        ))}
      </div>

      {tab === "general" && (
        <div className="tabBody">
          <div className="infoGrid">
            <Info label="Nom CAT" value={space.title_ca || space.title} />
            <Info label="Nom CAST" value={space.title_es || "—"} />
            <Info label="Nom ANG" value={space.title_en || "—"} />
            <Info label="Passis vinculats" value={space.count} />
            <Info label="Barri" value={space.barri || "—"} />
            <Info label="Districte" value={space.districte || "—"} />
          </div>
          <div className="sectionTitle">Descripció</div>
          <div className="notice">{space.body_ca || "Descripció pendent o encara no connectada des d’API ESPAIS."}</div>
        </div>
      )}

      {tab === "ubicacio" && (
        <div className="tabBody">
          <div className="infoGrid">
            <Info label="Adreça" value={space.adreca || "—"} />
            <Info label="Coordenades" value={space.coordenades || "—"} />
            <Info label="Latitud" value={space.latitud || "—"} />
            <Info label="Longitud" value={space.longitud || "—"} />
          </div>
          <div className="mapPlaceholder">
            {space.latitud && space.longitud ? (
              <span>{space.latitud}, {space.longitud}</span>
            ) : (
              <span>Mapa pendent: falta connectar latitud i longitud d’API ESPAIS.</span>
            )}
          </div>
        </div>
      )}

      {tab === "activitats" && (
        <div className="tabBody">
          <div className="miniRows clickableRows">
            {space.items.map((item) => (
              <button key={`${item.idIntern}-${item._row}`} onClick={() => onOpenActivity?.(item)}>
                {item.dataInici || "Sense data"} · {item.idIntern || item.idWeb || "Sense ID"} · {item.titolWeb || item.titol || "Sense títol"}
              </button>
            ))}
          </div>
        </div>
      )}

      {tab === "web" && (
        <div className="tabBody">
          <div className="infoGrid">
            <Info label="Imatge" value={space.imatge ? "Assignada" : "Falta imatge"} />
            <Info label="Autoria" value={space.autoria || "—"} />
            <Info label="Importar" value={space.importar ? "Sí" : "No / pendent"} />
            <Info label="ID espai" value={space.id || "—"} />
          </div>
          {space.imatge && (
            <a className="externalLink" href={space.imatge} target="_blank" rel="noreferrer">
              Obrir imatge de l’espai
            </a>
          )}
        </div>
      )}
    </div>
  );
}


function DashboardView({ rows }) {
  const categoryData = countBy(rows, "categoria");
  const districtData = countBy(rows, "districte");
  const managerData = countBy(rows, "encarregada");
  const monthData = countBy(
    rows
      .filter((row) => isValidDateString(row.dataInici))
      .map((row) => ({ mes: getMonthKey(row.dataInici) })),
    "mes"
  );

  return (
    <>
      <Top title="Dashboard direcció" subtitle="Lectura visual general del programa: tipologies, territori, equips i calendari 2026." />

      <div className="stats">
        <StatCard label="Passis" value={rows.length} />
        <StatCard label="Propostes" value={uniqueCount(rows, "id")} />
        <StatCard label="Activitats web" value={uniqueCount(rows, "idWeb")} />
        <StatCard label="Espais" value={uniqueCount(rows, "espai")} />
        <StatCard label="Districtes" value={uniqueCount(rows, "districte")} />
      </div>

      <div className="dashboardVisualGrid">
        <PieChart title="Activitats per tipologia" data={categoryData} />
        <DistrictMap title="Activitats per districte" data={districtData} />
        <VerticalBars title="Activitats per encarregada" data={managerData} />
        <MonthCalendar title="Activitats per mes · 2026" data={monthData} />
      </div>
    </>
  );
}

function PieChart({ title, data }) {
  const entries = Object.entries(data)
    .filter(([name]) => name && name !== "Sense dades")
    .sort((a, b) => b[1] - a[1]);

  const total = entries.reduce((sum, [, value]) => sum + value, 0) || 1;
  let cumulative = 0;

  const gradient = entries
    .map(([name, value], index) => {
      const start = (cumulative / total) * 100;
      cumulative += value;
      const end = (cumulative / total) * 100;
      return `var(--chart-${(index % 10) + 1}) ${start}% ${end}%`;
    })
    .join(", ");

  return (
    <div className="vizCard">
      <div className="vizHeader">
        <h2>{title}</h2>
        <Badge>{total} passis</Badge>
      </div>

      <div className="pieLayout">
        <div className="pie" style={{ background: `conic-gradient(${gradient})` }}>
          <div>{entries.length}<span>tipologies</span></div>
        </div>

        <div className="legend">
          {entries.slice(0, 10).map(([name, value], index) => (
            <div className="legendItem" key={name}>
              <i style={{ background: `var(--chart-${(index % 10) + 1})` }} />
              <span>{name}</span>
              <b>{value}</b>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function DistrictMap({ title, data }) {
  const districts = [
    ["01 Ciutat Vella", "CV"],
    ["02 Eixample", "EX"],
    ["03 Sants-Montjuïc", "SM"],
    ["04 Les Corts", "LC"],
    ["05 Sarrià-Sant Gervasi", "SSG"],
    ["06 Gràcia", "GR"],
    ["07 Horta-Guinardó", "HG"],
    ["08 Nou Barris", "NB"],
    ["09 Sant Andreu", "SA"],
    ["10 Sant Martí", "ST"],
  ];

  function getValue(name) {
    const found = Object.entries(data).find(([key]) =>
      String(key).toLowerCase().includes(name.slice(3).toLowerCase()) ||
      String(key).startsWith(name.slice(0, 2))
    );
    return found ? found[1] : 0;
  }

  const max = Math.max(...districts.map(([name]) => getValue(name)), 1);

  return (
    <div className="vizCard">
      <div className="vizHeader">
        <h2>{title}</h2>
        <Badge>{Object.values(data).reduce((a, b) => a + b, 0)} passis</Badge>
      </div>

      <div className="districtMap">
        {districts.map(([name, short], index) => {
          const value = getValue(name);
          const intensity = value / max;
          return (
            <div
              key={name}
              className={`districtCell d${index + 1}`}
              style={{ opacity: 0.35 + intensity * 0.65 }}
              title={`${name}: ${value}`}
            >
              <strong>{short}</strong>
              <span>{value}</span>
              <small>{name.replace(/^\d+\s/, "")}</small>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function VerticalBars({ title, data }) {
  const entries = Object.entries(data)
    .filter(([name]) => name && name !== "Sense dades")
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8);

  const max = Math.max(...entries.map(([, value]) => value), 1);

  return (
    <div className="vizCard">
      <div className="vizHeader">
        <h2>{title}</h2>
        <Badge>{entries.length} equips</Badge>
      </div>

      <div className="verticalBars">
        {entries.map(([name, value], index) => (
          <div className="vBarItem" key={name}>
            <div className="vBarWrap">
              <div
                className="vBar"
                style={{
                  height: `${Math.max(8, (value / max) * 100)}%`,
                  background: `var(--chart-${(index % 10) + 1})`,
                }}
              />
            </div>
            <b>{value}</b>
            <span>{name}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function MonthCalendar({ title, data }) {
  const months = [
    ["2026-01", "Gener"],
    ["2026-02", "Febrer"],
    ["2026-03", "Març"],
    ["2026-04", "Abril"],
    ["2026-05", "Maig"],
    ["2026-06", "Juny"],
    ["2026-07", "Juliol"],
    ["2026-08", "Agost"],
    ["2026-09", "Setembre"],
    ["2026-10", "Octubre"],
    ["2026-11", "Novembre"],
    ["2026-12", "Desembre"],
  ];

  const max = Math.max(...months.map(([key]) => data[key] || 0), 1);

  return (
    <div className="vizCard">
      <div className="vizHeader">
        <h2>{title}</h2>
        <Badge>12 mesos</Badge>
      </div>

      <div className="monthDashboard">
        {months.map(([key, label]) => {
          const value = data[key] || 0;
          return (
            <div className="monthDashCell" key={key}>
              <span>{label}</span>
              <strong>{value}</strong>
              <div>
                <i style={{ width: `${(value / max) * 100}%` }} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
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


function LoginScreen({ userName, setUserName, role, setRole, onEnter }) {
  return (
    <div className="loginScreen">
      <div className="loginCard">
        <div className="brand loginBrand">
          <div>BARCELONA</div>
          <div>CAPITAL MUNDIAL</div>
          <div>DE L'ARQUITECTURA</div>
        </div>
        <p className="eyebrow">Gestor de programació</p>
        <h1>Accés al visor</h1>
        <p>Identificació interna per adaptar la lectura de la plataforma.</p>

        <label>Nom</label>
        <input
          value={userName}
          onChange={(e) => setUserName(e.target.value)}
          placeholder="Nom i cognoms"
        />

        <label>Perfil</label>
        <div className="roleGrid">
          {[
            ["direccio", "Direcció"],
            ["editor", "Editor/a"],
            ["cap_projecte", "Cap projecte"],
            ["admin", "Admin"],
          ].map(([id, label]) => (
            <button
              key={id}
              className={role === id ? "active" : ""}
              onClick={() => setRole(id)}
            >
              {label}
            </button>
          ))}
        </div>

        <button className="enterButton" disabled={!userName.trim()} onClick={onEnter}>
          Entrar a la plataforma
        </button>

        <div className="loginNote">
          De moment és una acreditació simple de visor. Més endavant es pot substituir per login real amb Google.
        </div>
      </div>
    </div>
  );
}

function App() {
  const [authenticated, setAuthenticated] = useState(false);
  const [userName, setUserName] = useState("");
  const [role, setRole] = useState("direccio");
  const [rows, setRows] = useState([]);
  const [apiSpaces, setApiSpaces] = useState([]);
  const [selectedActivityId, setSelectedActivityId] = useState("");
  const [view, setView] = useState("dashboard");
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("Carregant API...");
  const [error, setError] = useState("");

  useEffect(() => {
    loadPassisFromIndex()
      .then((jsonRows) => {
        const passis = jsonRows
          .filter((row) => row.id || row.id_intern || row.titol_activitat || row.titol_activitat_cat)
          .map((row) =>
            normalizeRow({
              _row: row._row,
              id: row.id,
              idIntern: row.id_intern,
              idWeb: row.id_web,
              encarregada: row.encarregada,
              titol: row.titol_activitat_cat || row.titol_activitat,
              titolWeb: row.titol_activitat_cat || row.titol_activitat,
              categoria: row.categoria,
              agrupador: row.agrupador,
              modalitat: row.modalitat,
              dataInici: row.data_inici,
              horaInici: row.hora_inici,
              dataFinal: row.data_final,
              horaFinal: row.hora_final,
              espai: row.espai_on_es_desenvolupara_l_activitat,
              districte: row.districte,
              imatge: row.imatge_principal_mida_900x600_72_dpi_pes_maxim_400kb,
              importar: row.importar,
              autores: row.autores,
              contacteAutores: row.contacte_autores,
              presencialitat: row.presencialitat,
              franjaHoraria: row.franja_horaria,
              dataEscritaCat: row.data_escrita_cat_en_cas_de_tenir_varis_passis,
              municipi: row.municipi_fora_bcn,
              entrada: row.entrada,
              infoInscripcio: row.informacio_de_la_inscripcio,
              enllacInscripcions: row.enllac_inscripcions,
              aforament: row.aforment || row.aforament,
              entradetaCat: row.entradeta_cat,
              voluntaris: row.necesito_voluntaris,
            })
          );

        setRows(passis);
        setApiSpaces([]);

        if (passis[0]) {
          setSelectedActivityId(passis[0]._row || passis[0].idIntern);
        }

        setStatus(`JSON per lots · ${passis.length} registres`);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message || "Error carregant dades");
        setStatus("Error JSON");
        setLoading(false);
      });
  }, []);

  if (!authenticated) {
    return (
      <>
        <LoginScreen
          userName={userName}
          setUserName={setUserName}
          role={role}
          setRole={setRole}
          onEnter={() => setAuthenticated(true)}
        />
        <style>{css}</style>
      </>
    );
  }

  if (loading) return <div className="screen">Carregant dades reals...</div>;

  return (
    <>
      <Shell
        view={view}
        setView={setView}
        rows={rows}
        status={status}
        userName={userName}
        role={role}
        onLogout={() => setAuthenticated(false)}
      >
        {error && <div className="notice">⚠ {error}</div>}
        {view === "dashboard" && <DashboardView rows={rows} />}
        {view === "activitats" && (
          <ActivitiesView
            rows={rows}
            setView={setView}
            selectedActivityId={selectedActivityId}
            setSelectedActivityId={setSelectedActivityId}
          />
        )}
        {view === "propostes" && <ProposalsView rows={rows} />}
        {view === "calendari" && (
          <CalendarView
            rows={rows}
            setView={setView}
            setSelectedActivityId={setSelectedActivityId}
          />
        )}
        {view === "espais" && (
          <SpacesView
            rows={rows}
            apiSpaces={apiSpaces}
            setView={setView}
            setSelectedActivityId={setSelectedActivityId}
          />
        )}
      </Shell>
      <style>{css}</style>
    </>
  );
}

const css = `
:root {
  --bg: #f4f6f8;
  --surface: #ffffff;
  --surface-soft: #f8fafc;
  --border: #dde3ea;
  --text: #17202a;
  --muted: #64748b;
  --muted-2: #94a3b8;
  --primary: #1e3a8a;
  --primary-soft: #e8eefc;
  --success: #15803d;
  --success-soft: #dcfce7;
  --warning: #b45309;
  --warning-soft: #fef3c7;
  --danger: #b91c1c;
  --danger-soft: #fee2e2;
  --shadow: 0 8px 24px rgba(15, 23, 42, 0.06);

  --chart-1: #1e3a8a;
  --chart-2: #2563eb;
  --chart-3: #0891b2;
  --chart-4: #059669;
  --chart-5: #84cc16;
  --chart-6: #f59e0b;
  --chart-7: #ea580c;
  --chart-8: #dc2626;
  --chart-9: #9333ea;
  --chart-10: #475569;
}

* {
  box-sizing: border-box;
}

body {
  margin: 0;
  font-family: Inter, Arial, sans-serif;
  background: var(--bg);
  color: var(--text);
}

button,
input {
  font: inherit;
}

button {
  cursor: pointer;
}

.app {
  display: grid;
  grid-template-columns: 260px 1fr;
  min-height: 100vh;
}

/* SIDEBAR */

.sidebar {
  background: #101827;
  color: #fff;
  padding: 24px 18px;
  position: sticky;
  top: 0;
  height: 100vh;
  display: flex;
  flex-direction: column;
}

.brand {
  font-size: 17px;
  line-height: 1.05;
  font-weight: 900;
  letter-spacing: -0.03em;
  margin-bottom: 34px;
  padding: 0 10px;
}

.sidebar nav {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.sidebar nav button {
  width: 100%;
  border: 0;
  background: transparent;
  color: #cbd5e1;
  text-align: left;
  padding: 12px 14px;
  border-radius: 12px;
  font-weight: 700;
  transition: 0.15s ease;
}

.sidebar nav button.active,
.sidebar nav button:hover {
  background: #1e293b;
  color: #fff;
}

.sideMeta {
  margin-top: auto;
  background: #172033;
  border: 1px solid rgba(255,255,255,0.08);
  border-radius: 18px;
  padding: 16px;
}

.sideMeta p,
.sideMeta span {
  color: #94a3b8;
  margin: 0;
  font-size: 13px;
}

.sideMeta strong {
  display: block;
  font-size: 32px;
  margin-top: 6px;
  color: #fff;
}

.userBox {
  border-top: 1px solid rgba(255,255,255,0.08);
  margin-top: 14px;
  padding-top: 14px;
  display: grid;
  gap: 4px;
}

.userBox b {
  font-size: 14px;
}

.userBox small {
  color: #94a3b8;
}

.userBox button {
  margin-top: 8px;
  border: 1px solid rgba(255,255,255,0.12);
  background: transparent;
  color: #fff;
  border-radius: 12px;
  padding: 9px 10px;
  font-weight: 800;
}

/* LAYOUT */

.content {
  padding: 28px;
  max-width: 1600px;
  width: 100%;
}

.top {
  display: flex;
  justify-content: space-between;
  gap: 24px;
  margin-bottom: 22px;
}

.eyebrow {
  text-transform: uppercase;
  letter-spacing: .08em;
  font-size: 12px;
  margin: 0 0 8px;
  color: var(--muted);
  font-weight: 800;
}

h1 {
  margin: 0;
  font-size: 36px;
  line-height: 1;
  letter-spacing: -0.04em;
}

h2 {
  margin: 0 0 10px;
  letter-spacing: -0.02em;
}

h3 {
  margin: 0;
}

p {
  color: var(--muted);
}

/* CARDS */

.stat,
.panel,
.chart,
.calendarBlock,
.vizCard,
.toolbar,
.activityCard {
  background: var(--surface);
  border: 1px solid var(--border);
  box-shadow: var(--shadow);
}

.stats {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 14px;
  margin-bottom: 22px;
}

.stats.four {
  grid-template-columns: repeat(4, 1fr);
  margin: 20px 0;
}

.stat {
  border-radius: 18px;
  padding: 18px;
}

.statValue {
  font-size: 34px;
  font-weight: 900;
  letter-spacing: -0.05em;
}

.statLabel {
  color: var(--muted);
  margin-top: 4px;
  font-weight: 700;
}

.statHint {
  color: var(--muted-2);
  font-size: 12px;
  margin-top: 4px;
}

/* TOOLBAR */

.toolbar {
  border-radius: 18px;
  padding: 14px;
  margin-bottom: 18px;
}

.toolbar input {
  width: 100%;
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 12px 14px;
  margin-bottom: 10px;
  background: var(--surface-soft);
}

.toolbar input:focus {
  outline: 2px solid var(--primary-soft);
  border-color: var(--primary);
}

.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.chips button {
  border: 1px solid var(--border);
  background: #fff;
  border-radius: 999px;
  padding: 7px 12px;
  font-size: 13px;
  font-weight: 800;
  color: var(--muted);
}

.chips button.selected {
  background: var(--primary);
  color: white;
  border-color: var(--primary);
}

/* SPLIT VIEWS */

.split {
  display: grid;
  grid-template-columns: 420px 1fr;
  gap: 18px;
  align-items: start;
}

.list {
  display: flex;
  flex-direction: column;
  gap: 10px;
  max-height: calc(100vh - 195px);
  overflow: auto;
  padding-right: 4px;
}

/* ACTIVITY CARDS */

.activityCard {
  border-radius: 16px;
  padding: 14px;
  text-align: left;
  transition: 0.15s ease;
}

.activityCard:hover,
.activityCard.selected {
  border-color: var(--primary);
  transform: translateY(-1px);
}

.cardTop {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: start;
}

.activityCard h3 {
  font-size: 15px;
  margin: 0 0 5px;
  line-height: 1.25;
}

.activityCard p {
  margin: 0;
  font-size: 13px;
}

.metaGrid {
  display: grid;
  gap: 5px;
  margin-top: 12px;
  color: var(--muted);
  font-size: 12px;
}

/* BADGES */

.badges {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 9px;
}

.badge {
  display: inline-flex;
  align-items: center;
  border-radius: 999px;
  background: #eef2f7;
  color: #334155;
  padding: 4px 8px;
  font-size: 11px;
  font-weight: 800;
}

.badge.success {
  background: var(--success-soft);
  color: var(--success);
}

.badge.warning {
  background: var(--warning-soft);
  color: var(--warning);
}

.warn {
  color: var(--warning);
  font-weight: 900;
}

.ok {
  color: var(--success);
  font-weight: 900;
}

/* DETAIL PANEL */

.panel {
  border-radius: 20px;
  padding: 20px;
  position: sticky;
  top: 24px;
}

.hero {
  height: 170px;
  border-radius: 16px;
  background: linear-gradient(135deg, #e2e8f0, #f8fafc);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--muted);
  margin-bottom: 16px;
  border: 1px dashed var(--border);
}

.detail h2 {
  font-size: 26px;
}

.infoGrid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 10px;
  margin: 18px 0;
}

.info {
  background: var(--surface-soft);
  border: 1px solid #edf2f7;
  border-radius: 14px;
  padding: 12px;
}

.info span {
  display: block;
  color: var(--muted);
  font-size: 11px;
  margin-bottom: 4px;
  font-weight: 800;
  text-transform: uppercase;
}

.info strong {
  font-size: 13px;
}

/* TABS */

.tabs {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 6px;
  background: #eef2f7;
  padding: 5px;
  border-radius: 14px;
  margin: 18px 0;
}

.tabs button {
  border: 0;
  background: transparent;
  border-radius: 10px;
  padding: 9px 8px;
  font-weight: 800;
  color: var(--muted);
  font-size: 13px;
}

.tabs button.active {
  background: #fff;
  color: var(--primary);
  box-shadow: 0 1px 4px rgba(15,23,42,0.08);
}

.sectionTitle {
  font-weight: 900;
  margin: 20px 0 10px;
  letter-spacing: -0.02em;
}

.notice {
  background: var(--warning-soft);
  border: 1px solid #fde68a;
  color: #78350f;
  border-radius: 14px;
  padding: 12px;
  margin-bottom: 10px;
}

.notice.success {
  background: var(--success-soft);
  border-color: #bbf7d0;
  color: #14532d;
}

/* DASHBOARD VISUAL */

.dashboardVisualGrid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 18px;
}

.vizCard {
  border-radius: 20px;
  padding: 20px;
}

.vizHeader {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: start;
  margin-bottom: 18px;
}

.pieLayout {
  display: grid;
  grid-template-columns: 220px 1fr;
  gap: 18px;
  align-items: center;
}

.pie {
  width: 210px;
  height: 210px;
  border-radius: 50%;
  display: grid;
  place-items: center;
}

.pie div {
  width: 108px;
  height: 108px;
  background: #fff;
  border-radius: 50%;
  display: grid;
  place-items: center;
  font-size: 28px;
  font-weight: 900;
  box-shadow: inset 0 0 0 1px var(--border);
}

.pie span {
  display: block;
  font-size: 11px;
  color: var(--muted);
  font-weight: 800;
}

.legend {
  display: grid;
  gap: 8px;
}

.legendItem {
  display: grid;
  grid-template-columns: 12px 1fr auto;
  gap: 8px;
  align-items: center;
  font-size: 13px;
}

.legendItem i {
  width: 10px;
  height: 10px;
  border-radius: 50%;
}

.legendItem b {
  font-weight: 900;
}

/* RESPONSIVE */

@media (max-width: 1100px) {
  .app {
    grid-template-columns: 1fr;
  }

  .sidebar {
    position: static;
    height: auto;
  }

  .split,
  .dashboardVisualGrid {
    grid-template-columns: 1fr;
  }

  .stats {
    grid-template-columns: repeat(2, 1fr);
  }

  .panel {
    position: static;
  }
}

@media (max-width: 700px) {
  .content {
    padding: 18px;
  }

  h1 {
    font-size: 30px;
  }

  .stats,
  .stats.four,
  .infoGrid {
    grid-template-columns: 1fr;
  }

  .pieLayout {
    grid-template-columns: 1fr;
    justify-items: center;
  }
}
`;

createRoot(document.getElementById("root")).render(<App />);
