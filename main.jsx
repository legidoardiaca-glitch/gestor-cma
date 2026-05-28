import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  PieChart,
  Pie,
  Cell,
  CartesianGrid,
} from "recharts";
import { toJpeg, toPng } from "html-to-image";
import jsPDF from "jspdf";
import { createRoot } from "react-dom/client";

const DATA_URL = "/api/data";

const INSCRIPCIONS_CSV_URL =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vTbsKEA9-L8F1dlF2WPYWZ89k316qr1jlwELa9RAhvvXLyBobVeUuUmm6mEuw_PmbMN3VJGdJZxpqXh/pub?gid=0&single=true&output=csv";

const ESPAIS_CSV_URL =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vRWPBpxuBECSh1kLS1Vm-gdmOQhWw6_aBUUsjrX3wMZlaL17IsIkhFrSa8ovmbMR-uFL07SeX5ClGOM/pub?gid=1125496422&single=true&output=csv";

const CHART_COLORS = [
  "#5AA9E6",
  "#7FC8F8",
  "#FFE45E",
  "#FF6392",
  "#B9FBC0",
  "#F9C6D1",
  "#CDB4DB",
  "#A2D2FF",
  "#FDFFB6",
  "#BDE0FE",
];

function downloadDataUrl(dataUrl, fileName) {
  const link = document.createElement("a");
  link.download = fileName;
  link.href = dataUrl;
  link.click();
}


function normalizeLooseText(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function getModalitatKey(value) {
  const text = normalizeLooseText(value).toUpperCase();
  if (!text) return "";
  const match = text.match(/\b([ABC])\b/) || text.match(/^([ABC])/);
  return match ? match[1] : text;
}

function formatCompactDate(dateString) {
  if (!dateString || dateString === "—") return "—";
  const date = new Date(`${dateString}T12:00:00`);
  if (Number.isNaN(date.getTime())) return dateString;

  return date.toLocaleDateString("ca-ES", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function toChartEntries(data, limit = 10) {
  return Object.entries(data)
    .filter(([name]) => name && name !== "Sense dades")
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([name, value], index) => ({
      name,
      value,
      color: CHART_COLORS[index % CHART_COLORS.length],
    }));
}

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


async function loadInscripcionsFromCsv() {
  const response = await fetch(INSCRIPCIONS_CSV_URL, { cache: "no-store" });

  if (!response.ok) {
    throw new Error(`Error carregant inscripcions: ${response.status}`);
  }

  const csvText = await response.text();
  return parseCsv(csvText);
}


async function loadEspaisFromCsv() {
  const response = await fetch(ESPAIS_CSV_URL, { cache: "no-store" });

  if (!response.ok) {
    throw new Error(`Error carregant espais: ${response.status}`);
  }

  const csvText = await response.text();
  return parseCsv(csvText);
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


function getDriveFileId(url) {
  const text = String(url || "").trim();

  if (!text.includes("drive.google.com")) return "";

  const fileMatch = text.match(/drive\.google\.com\/file\/d\/([^/?#]+)/);
  if (fileMatch) return fileMatch[1];

  const idMatch = text.match(/[?&]id=([^&#]+)/);
  if (idMatch) return idMatch[1];

  const ucMatch = text.match(/drive\.google\.com\/uc\?[^#]*id=([^&#]+)/);
  if (ucMatch) return ucMatch[1];

  return "";
}

function uniqueValues(values) {
  return Array.from(new Set(values.filter(Boolean)));
}

function getImageUrls(url) {
  const text = String(url || "").trim();

  if (!text) return [];

  const driveId = getDriveFileId(text);

  if (driveId) {
    return uniqueValues([
      `https://drive.google.com/thumbnail?id=${driveId}&sz=w1600`,
      `https://drive.google.com/uc?export=view&id=${driveId}`,
      `https://drive.google.com/uc?id=${driveId}`,
      text,
    ]);
  }

  return [text];
}

function normalizeImageUrl(url) {
  return getImageUrls(url)[0] || "";
}

function getDrivePreviewUrl(url) {
  const driveId = getDriveFileId(url);
  return driveId ? `https://drive.google.com/file/d/${driveId}/preview` : "";
}

function getSafeFileName(value) {
  return String(value || "activitat")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 70) || "activitat";
}


function parseEntrades(value) {
  const text = String(value ?? "").trim();

  if (!text) return 1;

  const number = Number(text.replace(",", "."));
  return Number.isFinite(number) && number > 0 ? number : 1;
}

function normalizeGender(value) {
  const text = String(value ?? "").trim().toLowerCase();

  if (["f", "femeni", "femení", "female", "dona", "woman"].includes(text)) {
    return "♀ Femení";
  }

  if (["m", "masculi", "masculí", "male", "home", "man"].includes(text)) {
    return "♂ Masculí";
  }

  return "○ Sense resposta / altres";
}


function normalizeDistrictForCompare(value) {
  return String(value ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/^\d+\s*/, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function sameDistrictData(rows) {
  let mateix = 0;
  let diferent = 0;
  let senseDades = 0;

  rows.forEach((row) => {
    const origen = normalizeDistrictForCompare(row.procedenciaDistricte);
    const activitat = normalizeDistrictForCompare(row.districteActivitat);

    if (!origen || !activitat) {
      senseDades += 1;
      return;
    }

    if (origen === activitat || origen.includes(activitat) || activitat.includes(origen)) {
      mateix += 1;
    } else {
      diferent += 1;
    }
  });

  return {
    "Mateix districte": mateix,
    "Districte diferent": diferent,
    "Sense dades": senseDades,
  };
}

function translateMeetUs(value) {
  const text = String(value ?? "").trim();
  const key = text.toLowerCase();

  const dictionary = {
    "official website": "Web oficial",
    "website": "Web oficial",
    "web": "Web oficial",
    "newsletter / email": "Butlletí / correu",
    "newsletter": "Butlletí / correu",
    "email": "Butlletí / correu",
    "social media": "Xarxes socials",
    "social networks": "Xarxes socials",
    "instagram": "Xarxes socials",
    "facebook": "Xarxes socials",
    "x / twitter": "Xarxes socials",
    "friends / acquaintances": "Amics o coneguts",
    "friends": "Amics o coneguts",
    "word of mouth": "Amics o coneguts",
    "posters or brochures": "Cartells o fullets",
    "posters": "Cartells o fullets",
    "brochures": "Cartells o fullets",
    "press / media": "Premsa o mitjans",
    "press": "Premsa o mitjans",
    "media": "Premsa o mitjans",
    "others": "Altres",
    "other": "Altres",
    "altre": "Altres",
    "altres": "Altres",
  };

  return dictionary[key] || text || "Sense resposta";
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
    idiomaCatala: normalizeBool(row.idiomaCatala),
    idiomaCastella: normalizeBool(row.idiomaCastella),
    idiomaAngles: normalizeBool(row.idiomaAngles),
    idiomaFrances: normalizeBool(row.idiomaFrances),
    accessRadioGuia: normalizeBool(row.accessRadioGuia),
    accessSubtitulacio: normalizeBool(row.accessSubtitulacio),
    accessLlenguaSignes: normalizeBool(row.accessLlenguaSignes),
    accessBraille: normalizeBool(row.accessBraille),
    accessLecturaFacil: normalizeBool(row.accessLecturaFacil),
    accessMobilitatReduida: normalizeBool(row.accessMobilitatReduida),
    accessDetalls: String(row.accessDetalls || ""),
  };
}


function normalizeInscripcio(row) {
  return {
    _row: row._row || "",
    id: String(row.id || ""),
    idIntern: String(row.id_intern || ""),
    idWeb: String(row.id_web || ""),
    titolWeb: String(row.titol_activitat_web || ""),
    categoria: String(row.categoria || ""),
    districteActivitat: String(row.districte || ""),
    nom: String(row.nom || ""),
    cognom: String(row.cognom || ""),
    entrades: parseEntrades(row.entrades),
    codiPostal: String(row.codi_postal || ""),
    procedenciaDistricte: String(row.barri || ""),
    barri: String(row.barri || ""),
    ciutat: String(row.ciutat || ""),
    genere: normalizeGender(row.genere || row.g_nere),
    esArquitecte: String(row.for_statistical_purposes_we_would_like_to_know_whether_you_are_an_architect || ""),
    comEnsConeix: translateMeetUs(row.how_did_you_meet_us),
  };
}

function normalizeSpace(row) {
  const lat = String(row.latitud || "").replace(",", ".").trim();
  const lon = String(row.longitud || "").replace(",", ".").trim();

  return {
    id: String(row.z || row.id || row._row || ""),
    title: String(row.title_ca || row.title || row.name || ""),
    title_ca: String(row.title_ca || row.title || row.name || ""),
    title_es: String(row.title_es || ""),
    title_en: String(row.title_en || ""),
    body_ca: String(row.body_ca || row.body || ""),
    body_es: String(row.body_es || ""),
    body_en: String(row.body_en || ""),
    adreca: String(row.adreca || ""),
    barri_m: String(row.barri_m || ""),
    districte_m: String(row.districte_m || ""),
    coordenades_m: String(row.coordenades_m || ""),
    adrecaSearch: String(row.adreca_search || ""),
    latitud: lat,
    longitud: lon,
    barri: String(row.barri || row.barri_m || ""),
    districte: String(row.districte || row.districte_m || ""),
    imatge: String(row.imatge || ""),
    autoria: String(row.autoria_imatge || row.autoria || ""),
    imatgeGaleria: String(row.imatge_galeria || ""),
    autoriaGaleria: String(row.autoria_imatge_galeria || ""),
    importar: normalizeBool(row.importar),
  };
}

function normalizeSpaceKey(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[’']/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function findMatchingSpace(name, apiSpaces = []) {
  const key = normalizeSpaceKey(name);

  if (!key) return null;

  const exact = apiSpaces.find((space) => normalizeSpaceKey(space.title_ca || space.title) === key);
  if (exact) return exact;

  return apiSpaces.find((space) => {
    const spaceKey = normalizeSpaceKey(space.title_ca || space.title);
    return spaceKey && (spaceKey.includes(key) || key.includes(spaceKey));
  }) || null;
}

function buildDerivedSpaces(rows, apiSpaces = []) {
  const byName = groupBy(rows.filter((row) => row.espai), (row) => row.espai);
  const used = new Set();

  const activitySpaces = Object.entries(byName).map(([name, items]) => {
    const api = findMatchingSpace(name, apiSpaces) || {};
    const apiKey = api.title_ca || api.title || "";
    if (apiKey) used.add(normalizeSpaceKey(apiKey));

    return {
      id: api.id || name,
      title: api.title_ca || api.title || name,
      title_ca: api.title_ca || api.title || name,
      title_es: api.title_es || "",
      title_en: api.title_en || "",
      body_ca: api.body_ca || "",
      body_es: api.body_es || "",
      body_en: api.body_en || "",
      adreca: api.adreca || "",
      barri: api.barri || mostCommon(items.map((i) => i.districte)),
      districte: api.districte || mostCommon(items.map((i) => i.districte)),
      coordenades: api.coordenades_m || "",
      latitud: api.latitud || "",
      longitud: api.longitud || "",
      imatge: api.imatge || "",
      imatgeGaleria: api.imatgeGaleria || "",
      autoria: api.autoria || "",
      autoriaGaleria: api.autoriaGaleria || "",
      importar: api.importar || false,
      items,
      count: items.length,
      matched: Boolean(api.title_ca || api.title),
      sourceName: name,
    };
  });

  const onlyApiSpaces = apiSpaces
    .filter((space) => !used.has(normalizeSpaceKey(space.title_ca || space.title)))
    .map((space) => ({
      ...space,
      title: space.title_ca || space.title || "Sense títol",
      items: [],
      count: 0,
      matched: true,
      sourceName: space.title_ca || space.title || "",
    }));

  return [...activitySpaces, ...onlyApiSpaces].sort((a, b) => b.count - a.count || a.title.localeCompare(b.title, "ca"));
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


function BrandMark({ className = "" }) {
  return (
    <div className={`brand ${className}`}>
      <img
        className="brandLogo"
        src="/logo.png"
        alt="Barcelona Capital Mundial de l'Arquitectura"
      />
      <div className="brandText">
        <div>BARCELONA</div>
        <div>CAPITAL MUNDIAL</div>
        <div>DE L'ARQUITECTURA</div>
      </div>
    </div>
  );
}


function getVisibleNavItems(role) {
  const normalizedRole = String(role || "").toLowerCase();

  const allItems = [
    ["dashboard", "Dashboard"],
    ["temps", "Temps de Capitalitat"],
    ["direccio", "Direcció"],
    ["activitats", "Activitats"],
    ["propostes", "Propostes"],
    ["calendari", "Calendari"],
    ["espais", "Espais"],
    ["inscripcions", "Dades inscripcions"],
  ];

  if (normalizedRole === "admin") return allItems;

  if (normalizedRole === "direccio") {
    return allItems;
  }

  if (normalizedRole === "editor") {
    return allItems.filter(([id]) => ["activitats", "propostes", "calendari", "espais", "temps"].includes(id));
  }

  if (normalizedRole === "cap_projecte") {
    return allItems.filter(([id]) => ["activitats", "propostes", "calendari", "espais", "temps"].includes(id));
  }

  return allItems.filter(([id]) => ["activitats", "calendari", "espais", "temps"].includes(id));
}

function getDefaultViewForRole(role) {
  const items = getVisibleNavItems(role);
  return items[0]?.[0] || "activitats";
}

function canSeeView(role, view) {
  return getVisibleNavItems(role).some(([id]) => id === view);
}

function formatRoleLabel(role) {
  const labels = {
    direccio: "Direcció",
    editor: "Editor/a",
    cap_projecte: "Cap projecte",
    admin: "Admin",
  };

  return labels[role] || role || "Usuari";
}


function Shell({ children, view, setView, rows, status, userName, role, onLogout }) {
  return (
    <main className="app">
      <aside className="sidebar">
        <BrandMark />

        <nav>
          {getVisibleNavItems(role).map(([id, label]) => (
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
            <small>{formatRoleLabel(role)}</small>
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
  const [exporting, setExporting] = useState(false);
  const [imageFallbackIndex, setImageFallbackIndex] = useState(0);
  const [showDrivePreview, setShowDrivePreview] = useState(false);
  const detailRef = useRef(null);

  useEffect(() => {
    setImageFallbackIndex(0);
    setShowDrivePreview(false);
  }, [row?._row, row?.idIntern, row?.imatge]);

  if (!row) return <div className="panel">Selecciona una activitat.</div>;

  const errors = getErrors(row);
  const imageUrls = getImageUrls(row.imatge);
  const imageUrl = imageUrls[imageFallbackIndex] || "";
  const drivePreviewUrl = getDrivePreviewUrl(row.imatge);
  const fileBase = `activitat-${getSafeFileName(row.idIntern || row.idWeb || row.titolWeb || row.titol)}`;

  async function exportActivity(type) {
    if (!detailRef.current || exporting) return;

    setExporting(true);

    try {
      const node = detailRef.current;

      if (type === "jpg") {
        const dataUrl = await toJpeg(node, {
          quality: 0.96,
          backgroundColor: "#ffffff",
          pixelRatio: 2,
          cacheBust: true,
        });

        downloadDataUrl(dataUrl, `${fileBase}.jpg`);
      }

      if (type === "png") {
        const dataUrl = await toPng(node, {
          backgroundColor: "#ffffff",
          pixelRatio: 2,
          cacheBust: true,
        });

        downloadDataUrl(dataUrl, `${fileBase}.png`);
      }

      if (type === "pdf") {
        const dataUrl = await toPng(node, {
          backgroundColor: "#ffffff",
          pixelRatio: 2,
          cacheBust: true,
        });

        const width = node.offsetWidth;
        const height = node.offsetHeight;
        const pdf = new jsPDF({
          orientation: width >= height ? "landscape" : "portrait",
          unit: "px",
          format: [width, height],
        });

        pdf.addImage(dataUrl, "PNG", 0, 0, width, height);
        pdf.save(`${fileBase}.pdf`);
      }
    } catch (err) {
      alert(`No s'ha pogut exportar la fitxa: ${err.message}`);
    } finally {
      setExporting(false);
    }
  }

  return (
    <div ref={detailRef} className="panel detail activityExportArea">
      <div className="detailTopBar">
        <div className="detailStatus">
          <Badge>{row.idIntern}</Badge>
          <Badge>{row.idWeb || "Sense ID WEB"}</Badge>
          <Badge>{row.encarregada || "Sense encarregada"}</Badge>
          <Badge tone={row.importar ? "success" : "neutral"}>{row.importar ? "Importar" : "No importar"}</Badge>
          {errors.length > 0 && <Badge tone="warning">{errors.length} avisos</Badge>}
        </div>

        <div className="activityExportControls">
          <span>Exportar</span>
          <button type="button" disabled={exporting} onClick={() => exportActivity("png")}>
            PNG
          </button>
          <button type="button" disabled={exporting} onClick={() => exportActivity("jpg")}>
            JPG
          </button>
          <button type="button" disabled={exporting} onClick={() => exportActivity("pdf")}>
            PDF
          </button>
        </div>
      </div>

      <div className="hero">
        {imageUrl || drivePreviewUrl ? (
          <div className="heroImageReal">
            {showDrivePreview && drivePreviewUrl ? (
              <iframe
                className="driveImagePreview"
                src={drivePreviewUrl}
                title={row.titolWeb || row.titol || "Imatge de l'activitat"}
                allow="autoplay"
              />
            ) : (
              <img
                src={imageUrl}
                alt={row.titolWeb || row.titol || "Imatge de l'activitat"}
                referrerPolicy="no-referrer"
                onError={() => {
                  if (imageFallbackIndex < imageUrls.length - 1) {
                    setImageFallbackIndex((current) => current + 1);
                  } else {
                    setShowDrivePreview(Boolean(drivePreviewUrl));
                  }
                }}
              />
            )}

            <a href={row.imatge || imageUrl} target="_blank" rel="noreferrer">
              Obrir imatge
            </a>
          </div>
        ) : (
          <span>Sense imatge principal</span>
        )}
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

          {imageUrl && (
            <a className="externalLink" href={imageUrl} target="_blank" rel="noreferrer">
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


function ActivitiesCatalogView({ rows, selected, setSelected, setSelectedActivityId }) {
  return (
    <div className="catalogGrid">
      {rows.map((row) => {
        const imageUrl = normalizeImageUrl(row.imatge);
        const isSelected = String(selected?._row || selected?.idIntern) === String(row._row || row.idIntern);

        return (
          <button
            key={`${row.idIntern}-${row._row}`}
            type="button"
            className={`catalogCard ${isSelected ? "selected" : ""}`}
            onClick={() => {
              setSelected(row);
              setSelectedActivityId(row._row || row.idIntern);
            }}
          >
            <div className="catalogImage">
              {imageUrl ? (
                <img src={imageUrl} alt={row.titolWeb || row.titol || "Activitat"} referrerPolicy="no-referrer" />
              ) : (
                <span>Sense imatge</span>
              )}
            </div>

            <div className="catalogBody">
              <div className="badges">
                <Badge>{row.categoria || "Sense categoria"}</Badge>
                <Badge>{row.districte || "Sense districte"}</Badge>
              </div>

              <h3>{row.titolWeb || row.titol || "Sense títol"}</h3>
              <p>{row.entradetaCat || row.espai || "Sense entradeta disponible."}</p>

              <div className="catalogMeta">
                <span>📅 {formatCompactDate(row.dataInici)} · {row.horaInici || "—"}</span>
                <span>📍 {row.espai || "Sense espai"}</span>
              </div>

              <div className="catalogFooter">
                <span>{row.idIntern || row.idWeb || "Sense ID"}</span>
                <strong>Obrir fitxa →</strong>
              </div>
            </div>
          </button>
        );
      })}

      {!rows.length && (
        <div className="emptyList">No hi ha activitats amb aquests filtres.</div>
      )}
    </div>
  );
}


function ActivitiesView({ rows, setView, selectedActivityId, setSelectedActivityId }) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [displayMode, setDisplayMode] = useState("gestor");
  const [districtFilter, setDistrictFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [selected, setSelected] = useState(
    rows.find((row) => String(row._row || row.idIntern) === String(selectedActivityId)) || rows[0] || null
  );

  const districtOptions = useMemo(() => {
    return Array.from(new Set(rows.map((row) => row.districte).filter(Boolean))).sort((a, b) =>
      a.localeCompare(b, "ca")
    );
  }, [rows]);

  const categoryOptions = useMemo(() => {
    return Array.from(new Set(rows.map((row) => row.categoria).filter(Boolean))).sort((a, b) =>
      a.localeCompare(b, "ca")
    );
  }, [rows]);

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
        (filter === "errors" && hasErrors(row)) ||
        (filter === "senseEspai" && !row.espai);

      const matchesDistrict = districtFilter === "all" || row.districte === districtFilter;
      const matchesCategory = categoryFilter === "all" || row.categoria === categoryFilter;

      return matchesQuery && matchesFilter && matchesDistrict && matchesCategory;
    });
  }, [rows, query, filter, districtFilter, categoryFilter]);

  useEffect(() => {
    const found = rows.find((row) => String(row._row || row.idIntern) === String(selectedActivityId));
    if (found) setSelected(found);
  }, [selectedActivityId, rows]);

  useEffect(() => {
    if (!filtered.length) {
      setSelected(null);
      return;
    }

    const selectedInFiltered = selected
      ? filtered.some((row) => String(row._row || row.idIntern) === String(selected._row || selected.idIntern))
      : false;

    if (!selectedInFiltered) {
      setSelected(filtered[0]);
      setSelectedActivityId(filtered[0]._row || filtered[0].idIntern);
    }
  }, [filtered, selected, setSelectedActivityId]);

  return (
    <>
      <Top title="Activitats" subtitle="Llistat operatiu de passis llegits directament del Google Sheets." />

      <div className="toolbar activitiesToolbar">
        <div className="activitySearchRow">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar per ID, títol, espai, categoria..."
          />
          <div className="resultsCounter">
            <strong>{filtered.length}</strong>
            <span>{filtered.length === 1 ? "activitat" : "activitats"}</span>
          </div>
        </div>

        <div className="activityFiltersRow">
          <div className="chips">
            {[
              { id: "all", label: "Tot" },
              { id: "errors", label: "Errors" },
              { id: "senseEspai", label: "Sense espai" },
            ].map((item) => (
              <button
                key={item.id}
                onClick={() => setFilter(item.id)}
                className={filter === item.id ? "selected" : ""}
              >
                {item.label}
              </button>
            ))}
          </div>

          <div className="selectFilters">
            <label>
              <span>Districte</span>
              <select value={districtFilter} onChange={(e) => setDistrictFilter(e.target.value)}>
                <option value="all">Tots els districtes</option>
                {districtOptions.map((district) => (
                  <option key={district} value={district}>
                    {district}
                  </option>
                ))}
              </select>
            </label>

            <label>
              <span>Categoria</span>
              <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}>
                <option value="all">Totes les categories</option>
                {categoryOptions.map((category) => (
                  <option key={category} value={category}>
                    {category}
                  </option>
                ))}
              </select>
            </label>

            <label>
              <span>Vista</span>
              <select value={displayMode} onChange={(e) => setDisplayMode(e.target.value)}>
                <option value="gestor">Gestor</option>
                <option value="cataleg">Catàleg</option>
              </select>
            </label>
          </div>
        </div>
      </div>

      {displayMode === "cataleg" ? (
        <div className="catalogLayout">
          <ActivitiesCatalogView
            rows={filtered}
            selected={selected}
            setSelected={setSelected}
            setSelectedActivityId={setSelectedActivityId}
          />
          <Detail
            row={selected}
            onSearchRelated={(value) => {
              if (value) setQuery(String(value));
            }}
            onChangeView={setView}
          />
        </div>
      ) : (
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

            {!filtered.length && (
              <div className="emptyList">
                No hi ha activitats amb aquests filtres.
              </div>
            )}
          </div>
          <Detail
            row={selected}
            onSearchRelated={(value) => {
              if (value) setQuery(String(value));
            }}
            onChangeView={setView}
          />
        </div>
      )}
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


function toLocalISODate(date) {
  const copy = new Date(date);
  copy.setHours(12, 0, 0, 0);
  return copy.toISOString().slice(0, 10);
}

function addDaysISO(dateString, days) {
  const date = new Date(`${dateString}T12:00:00`);
  date.setDate(date.getDate() + days);
  return toLocalISODate(date);
}

function isDateBetween(value, start, end) {
  return isValidDateString(value) && value >= start && value <= end;
}

function buildInscriptionCountByIdWeb(inscripcions = []) {
  return inscripcions.reduce((acc, row) => {
    if (!row.idWeb) return acc;
    acc[row.idWeb] = (acc[row.idWeb] || 0) + 1;
    return acc;
  }, {});
}

function getAgendaStatus(row, inscriptionCountByIdWeb = {}) {
  const critical = [];
  const review = [];

  if (!row.dataInici) critical.push("Sense data");
  if (!row.espai) critical.push("Sense espai");
  if (!row.imatge) critical.push("Sense imatge");

  if (!row.idWeb || !inscriptionCountByIdWeb[row.idWeb]) review.push("Sense inscripcions");
  if (!row.idiomaAngles) review.push("Sense anglès");

  const hasAccessibility =
    row.accessRadioGuia ||
    row.accessSubtitulacio ||
    row.accessLlenguaSignes ||
    row.accessBraille ||
    row.accessLecturaFacil ||
    row.accessMobilitatReduida ||
    Boolean(row.accessDetalls);

  if (!hasAccessibility) review.push("Sense accessibilitat");

  if (critical.length) {
    return {
      tone: "critical",
      label: "Crítica",
      icon: "🔴",
      issues: [...critical, ...review],
    };
  }

  if (review.length) {
    return {
      tone: "review",
      label: "Revisar",
      icon: "🟡",
      issues: review,
    };
  }

  return {
    tone: "ok",
    label: "Completa",
    icon: "🟢",
    issues: [],
  };
}

function AgendaView({ rows, inscripcions = [], query, onOpen }) {
  const today = toLocalISODate(new Date());
  const tomorrow = addDaysISO(today, 1);
  const weekEnd = addDaysISO(today, 7);
  const monthEnd = addDaysISO(today, 30);
  const inscriptionCountByIdWeb = useMemo(() => buildInscriptionCountByIdWeb(inscripcions), [inscripcions]);

  const agendaRows = useMemo(() => {
    return rows
      .filter((row) => isValidDateString(row.dataInici))
      .filter((row) =>
        [row.idIntern, row.idWeb, row.titolWeb, row.titol, row.espai, row.categoria, row.districte, row.encarregada]
          .join(" ")
          .toLowerCase()
          .includes(query.toLowerCase())
      )
      .sort((a, b) =>
        `${a.dataInici || "9999-99-99"} ${a.horaInici || "99:99"}`.localeCompare(
          `${b.dataInici || "9999-99-99"} ${b.horaInici || "99:99"}`
        )
      );
  }, [rows, query]);

  const todayRows = agendaRows.filter((row) => row.dataInici === today);
  const tomorrowRows = agendaRows.filter((row) => row.dataInici === tomorrow);
  const weekRows = agendaRows.filter((row) => isDateBetween(row.dataInici, today, weekEnd));
  const monthRows = agendaRows.filter((row) => isDateBetween(row.dataInici, today, monthEnd));

  const next7Critical = weekRows.filter((row) => getAgendaStatus(row, inscriptionCountByIdWeb).tone === "critical");
  const next7Review = weekRows.filter((row) => getAgendaStatus(row, inscriptionCountByIdWeb).tone === "review");

  const imageAlerts = weekRows.filter((row) => !row.imatge).length;
  const spaceAlerts = weekRows.filter((row) => !row.espai).length;
  const englishAlerts = weekRows.filter((row) => !row.idiomaAngles).length;
  const inscriptionAlerts = weekRows.filter((row) => row.idWeb && !inscriptionCountByIdWeb[row.idWeb]).length;

  return (
    <div className="agendaView">
      <div className="agendaHero">
        <div>
          <p className="eyebrow">Agenda operativa</p>
          <h2>{formatDate(today)}</h2>
          <p>Seguiment de les activitats imminents i dels avisos que cal revisar abans que passin.</p>
        </div>

        <div className="agendaHeroStats">
          <div>
            <strong>{todayRows.length}</strong>
            <span>avui</span>
          </div>
          <div>
            <strong>{weekRows.length}</strong>
            <span>7 dies</span>
          </div>
          <div>
            <strong>{next7Critical.length}</strong>
            <span>crítiques</span>
          </div>
        </div>
      </div>

      <div className="agendaAlerts">
        <div className={next7Critical.length ? "agendaAlert critical" : "agendaAlert ok"}>
          <strong>{next7Critical.length}</strong>
          <span>activitats crítiques els pròxims 7 dies</span>
        </div>
        <div className={next7Review.length ? "agendaAlert review" : "agendaAlert ok"}>
          <strong>{next7Review.length}</strong>
          <span>activitats a revisar els pròxims 7 dies</span>
        </div>
        <div className={imageAlerts ? "agendaAlert review" : "agendaAlert ok"}>
          <strong>{imageAlerts}</strong>
          <span>sense imatge</span>
        </div>
        <div className={spaceAlerts ? "agendaAlert critical" : "agendaAlert ok"}>
          <strong>{spaceAlerts}</strong>
          <span>sense espai</span>
        </div>
        <div className={englishAlerts ? "agendaAlert review" : "agendaAlert ok"}>
          <strong>{englishAlerts}</strong>
          <span>sense anglès</span>
        </div>
        <div className={inscriptionAlerts ? "agendaAlert review" : "agendaAlert ok"}>
          <strong>{inscriptionAlerts}</strong>
          <span>sense inscripcions</span>
        </div>
      </div>

      <div className="agendaGrid">
        <AgendaSection
          title="Avui"
          icon="🔴"
          items={todayRows}
          inscriptionCountByIdWeb={inscriptionCountByIdWeb}
          onOpen={onOpen}
          empty="No hi ha activitats programades avui."
        />

        <AgendaSection
          title="Demà"
          icon="🟡"
          items={tomorrowRows}
          inscriptionCountByIdWeb={inscriptionCountByIdWeb}
          onOpen={onOpen}
          empty="No hi ha activitats programades demà."
        />

        <AgendaSection
          title="Aquesta setmana"
          icon="📅"
          items={weekRows.slice(0, 18)}
          inscriptionCountByIdWeb={inscriptionCountByIdWeb}
          onOpen={onOpen}
          empty="No hi ha activitats els pròxims 7 dies."
        />

        <AgendaSection
          title="Pròxims 30 dies"
          icon="⏳"
          items={monthRows.slice(0, 24)}
          inscriptionCountByIdWeb={inscriptionCountByIdWeb}
          onOpen={onOpen}
          empty="No hi ha activitats els pròxims 30 dies."
        />
      </div>
    </div>
  );
}

function AgendaSection({ title, icon, items, inscriptionCountByIdWeb, onOpen, empty }) {
  return (
    <section className="agendaSection">
      <div className="agendaSectionHeader">
        <div>
          <span>{icon}</span>
          <h2>{title}</h2>
        </div>
        <Badge>{items.length} activitats</Badge>
      </div>

      <div className="agendaItems">
        {items.map((row) => (
          <AgendaItem
            key={`${row.idIntern}-${row._row}`}
            row={row}
            status={getAgendaStatus(row, inscriptionCountByIdWeb)}
            inscriptions={row.idWeb ? inscriptionCountByIdWeb[row.idWeb] || 0 : 0}
            onOpen={onOpen}
          />
        ))}

        {items.length === 0 && <div className="notice success">{empty}</div>}
      </div>
    </section>
  );
}

function AgendaItem({ row, status, inscriptions, onOpen }) {
  return (
    <button className={`agendaItem ${status.tone}`} type="button" onClick={() => onOpen(row)}>
      <time>{row.horaInici || "—"}</time>

      <div className="agendaItemMain">
        <div className="badges">
          <Badge>{row.idIntern || row.idWeb || "Sense ID"}</Badge>
          <Badge>{row.encarregada || "Sense encarregada"}</Badge>
          <span className={`agendaStatus ${status.tone}`}>{status.icon} {status.label}</span>
        </div>

        <h3>{row.titolWeb || row.titol || "Sense títol"}</h3>
        <p>{formatCompactDate(row.dataInici)} · {row.espai || "Sense espai"} · {row.districte || "Sense districte"}</p>

        <div className="agendaMeta">
          <span>🏷 {row.categoria || "Sense categoria"}</span>
          <span>🎟 {inscriptions} inscripcions</span>
        </div>

        {status.issues.length > 0 && (
          <div className="agendaIssueTags">
            {status.issues.slice(0, 4).map((issue) => (
              <span key={issue}>{issue}</span>
            ))}
            {status.issues.length > 4 && <span>+{status.issues.length - 4}</span>}
          </div>
        )}
      </div>
    </button>
  );
}



function getMondayISO(date = new Date()) {
  const copy = new Date(date);
  copy.setHours(12, 0, 0, 0);
  const day = copy.getDay() || 7;
  copy.setDate(copy.getDate() - day + 1);
  return toLocalISODate(copy);
}

function WeeklyProgramExportView({ rows, inscripcions = [], query, onOpen }) {
  const exportRef = useRef(null);
  const [exporting, setExporting] = useState(false);
  const [weekStart, setWeekStart] = useState(getMondayISO(new Date()));

  const weekEnd = addDaysISO(weekStart, 6);
  const inscriptionCountByIdWeb = useMemo(() => buildInscriptionCountByIdWeb(inscripcions), [inscripcions]);

  const weekRows = useMemo(() => {
    return rows
      .filter((row) => isDateBetween(row.dataInici, weekStart, weekEnd))
      .filter((row) =>
        [row.idIntern, row.idWeb, row.titolWeb, row.titol, row.espai, row.categoria, row.districte, row.encarregada]
          .join(" ")
          .toLowerCase()
          .includes(query.toLowerCase())
      )
      .sort((a, b) =>
        `${a.dataInici || "9999-99-99"} ${a.horaInici || "99:99"}`.localeCompare(
          `${b.dataInici || "9999-99-99"} ${b.horaInici || "99:99"}`
        )
      );
  }, [rows, query, weekStart, weekEnd]);

  const dayKeys = Array.from({ length: 7 }, (_, index) => addDaysISO(weekStart, index));
  const weekGroups = groupBy(weekRows, (row) => row.dataInici);
  const categories = countBy(weekRows, "categoria");
  const districts = countBy(weekRows, "districte");

  function moveWeek(days) {
    setWeekStart((current) => addDaysISO(current, days));
  }

  async function exportProgram(type) {
    if (!exportRef.current || exporting) return;

    setExporting(true);

    try {
      const node = exportRef.current;
      const fileBase = `programa-setmanal-cma-${weekStart}_${weekEnd}`;

      if (type === "jpg") {
        const dataUrl = await toJpeg(node, {
          quality: 0.96,
          backgroundColor: "#f7f7f5",
          pixelRatio: 2,
          cacheBust: true,
        });

        downloadDataUrl(dataUrl, `${fileBase}.jpg`);
      }

      if (type === "png") {
        const dataUrl = await toPng(node, {
          backgroundColor: "#f7f7f5",
          pixelRatio: 2,
          cacheBust: true,
        });

        downloadDataUrl(dataUrl, `${fileBase}.png`);
      }

      if (type === "pdf") {
        const dataUrl = await toPng(node, {
          backgroundColor: "#f7f7f5",
          pixelRatio: 2,
          cacheBust: true,
        });

        const width = node.offsetWidth;
        const height = node.offsetHeight;
        const pdf = new jsPDF({
          orientation: "landscape",
          unit: "px",
          format: [width, height],
        });

        pdf.addImage(dataUrl, "PNG", 0, 0, width, height);
        pdf.save(`${fileBase}.pdf`);
      }
    } catch (err) {
      alert(`No s'ha pogut exportar el programa setmanal: ${err.message}`);
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="weeklyProgramView">
      <div className="weeklyProgramControls">
        <div>
          <p className="eyebrow">Programa setmanal</p>
          <h2>{formatCompactDate(weekStart)} – {formatCompactDate(weekEnd)}</h2>
          <p>Vista exportable del programa de la setmana seleccionada.</p>
        </div>

        <div className="weeklyProgramActions">
          <button type="button" onClick={() => moveWeek(-7)}>← Setmana anterior</button>
          <label>
            <span>Inici setmana</span>
            <input type="date" value={weekStart} onChange={(e) => setWeekStart(e.target.value)} />
          </label>
          <button type="button" onClick={() => moveWeek(7)}>Setmana següent →</button>
          <button type="button" onClick={() => setWeekStart(getMondayISO(new Date()))}>Avui</button>
        </div>

        <div className="weeklyExportButtons">
          <button type="button" disabled={exporting} onClick={() => exportProgram("png")}>
            {exporting ? "Exportant..." : "PNG"}
          </button>
          <button type="button" disabled={exporting} onClick={() => exportProgram("jpg")}>JPG</button>
          <button type="button" disabled={exporting} onClick={() => exportProgram("pdf")}>PDF</button>
        </div>
      </div>

      <div ref={exportRef} className="weeklyProgramExportArea">
        <div className="weeklyProgramHeader">
          <BrandMark />
          <div>
            <p className="eyebrow">Capital Mundial de l'Arquitectura · Gestor CMA</p>
            <h1>Programa setmanal</h1>
            <p>{formatCompactDate(weekStart)} – {formatCompactDate(weekEnd)}</p>
          </div>
          <div className="weeklyProgramKpis">
            <div>
              <strong>{weekRows.length}</strong>
              <span>activitats</span>
            </div>
            <div>
              <strong>{uniqueCount(weekRows, "espai")}</strong>
              <span>espais</span>
            </div>
            <div>
              <strong>{uniqueCount(weekRows, "districte")}</strong>
              <span>districtes</span>
            </div>
          </div>
        </div>

        <div className="weeklyProgramSummary">
          <CompactPills title="Categories" data={categories} />
          <CompactPills title="Districtes" data={districts} />
        </div>

        <div className="weeklyDaysGrid">
          {dayKeys.map((day) => {
            const items = weekGroups[day] || [];

            return (
              <section className="weeklyDayCard" key={day}>
                <div className="weeklyDayHeader">
                  <strong>{formatDate(day)}</strong>
                  <span>{items.length} activitats</span>
                </div>

                <div className="weeklyDayItems">
                  {items.map((row) => (
                    <button
                      key={`${row.idIntern}-${row._row}`}
                      type="button"
                      className="weeklyProgramItem"
                      onClick={() => onOpen(row)}
                    >
                      <time>{row.horaInici || "—"}</time>
                      <div>
                        <h3>{row.titolWeb || row.titol || "Sense títol"}</h3>
                        <p>{row.idIntern || row.idWeb || "Sense ID"} · {row.espai || "Sense espai"}</p>
                        <small>{row.categoria || "Sense categoria"} · {row.districte || "Sense districte"} · 🎟 {row.idWeb ? inscriptionCountByIdWeb[row.idWeb] || 0 : 0}</small>
                      </div>
                    </button>
                  ))}

                  {items.length === 0 && <div className="weeklyEmpty">Sense activitats</div>}
                </div>
              </section>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function CompactPills({ title, data }) {
  const entries = toChartEntries(data, 8);

  return (
    <div className="compactPills">
      <strong>{title}</strong>
      <div>
        {entries.length ? (
          entries.map((item) => (
            <span key={item.name}>{item.name || "Sense dades"} · {item.value}</span>
          ))
        ) : (
          <span>Sense dades</span>
        )}
      </div>
    </div>
  );
}


function CalendarView({ rows, inscripcions = [], setView, setSelectedActivityId }) {
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState("agenda");

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
      <Top title="Calendari" subtitle="Agenda operativa i lectura temporal del programa." />
      <SearchFilters
        query={query}
        setQuery={setQuery}
        activeFilter={mode}
        setActiveFilter={setMode}
        placeholder="Buscar calendari..."
        filters={[
          { id: "agenda", label: "Agenda operativa" },
          { id: "programa", label: "Programa setmanal" },
          { id: "cronologic", label: "Cronològic" },
          { id: "setmanal", label: "Setmanal" },
          { id: "mensual", label: "Mensual" },
        ]}
      />

      {mode === "agenda" ? (
        <AgendaView
          rows={rows}
          inscripcions={inscripcions}
          query={query}
          onOpen={openActivity}
        />
      ) : mode === "programa" ? (
        <WeeklyProgramExportView
          rows={rows}
          inscripcions={inscripcions}
          query={query}
          onOpen={openActivity}
        />
      ) : (
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
      )}
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


function loadExternalCss(href) {
  return new Promise((resolve) => {
    if (document.querySelector(`link[href="${href}"]`)) {
      resolve();
      return;
    }

    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = href;
    link.onload = resolve;
    document.head.appendChild(link);
  });
}

function loadExternalScript(src) {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) {
      resolve();
      return;
    }

    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    script.onload = resolve;
    script.onerror = reject;
    document.body.appendChild(script);
  });
}

async function loadLeafletAssets() {
  await loadExternalCss("https://unpkg.com/leaflet@1.9.4/dist/leaflet.css");
  await loadExternalScript("https://unpkg.com/leaflet@1.9.4/dist/leaflet.js");

  return window.L;
}

function getMapBaseLayer(baseId) {
  const bases = {
    positron: {
      url: "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png",
      attribution: '&copy; OpenStreetMap &copy; CARTO',
    },
    voyager: {
      url: "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png",
      attribution: '&copy; OpenStreetMap &copy; CARTO',
    },
    osm: {
      url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
      attribution: '&copy; OpenStreetMap',
    },
    toner: {
      url: "https://tiles.stadiamaps.com/tiles/stamen_toner_lite/{z}/{x}/{y}{r}.png",
      attribution: '&copy; Stadia Maps &copy; Stamen Design &copy; OpenStreetMap',
    },
  };

  return bases[baseId] || bases.positron;
}

function parseCoordinate(value) {
  const number = Number(String(value || "").replace(",", "."));
  return Number.isFinite(number) ? number : null;
}


function lonToTileX(lon, zoom) {
  return Math.floor(((lon + 180) / 360) * Math.pow(2, zoom));
}

function latToTileY(lat, zoom) {
  const latRad = (lat * Math.PI) / 180;
  return Math.floor(
    ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) *
      Math.pow(2, zoom)
  );
}

function lonToWorldX(lon, zoom) {
  return ((lon + 180) / 360) * Math.pow(2, zoom) * 256;
}

function latToWorldY(lat, zoom) {
  const latRad = (lat * Math.PI) / 180;
  return (
    ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) *
    Math.pow(2, zoom) *
    256
  );
}

function TileSpacesMap({ spaces, selected, setSelectedName }) {
  const [zoom, setZoom] = useState(12);
  const [center, setCenter] = useState({ lat: 41.3874, lon: 2.1686 });
  const [isDragging, setIsDragging] = useState(false);
  const dragRef = useRef(null);

  useEffect(() => {
    if (!selected?.latitud || !selected?.longitud) return;

    const lat = parseCoordinate(selected.latitud);
    const lon = parseCoordinate(selected.longitud);

    if (lat === null || lon === null) return;

    setCenter({ lat, lon });
  }, [selected?.title]);

  const pointData = useMemo(() => {
    return spaces
      .map((space) => {
        const lat = parseCoordinate(space.latitud);
        const lon = parseCoordinate(space.longitud);

        if (lat === null || lon === null) return null;

        // Rang ampli de Barcelona / AMB per evitar punts estranys molt lluny.
        if (lat < 41.20 || lat > 41.60 || lon < 1.85 || lon > 2.45) return null;

        return {
          title: space.title,
          lat,
          lon,
          count: space.count || 0,
          districte: space.districte || "",
        };
      })
      .filter(Boolean);
  }, [spaces]);

  const viewport = useMemo(() => ({
    centerLat: center.lat,
    centerLon: center.lon,
    width: 920,
    height: 600,
  }), [center]);

  const mapData = useMemo(() => {
    const centerX = lonToWorldX(viewport.centerLon, zoom);
    const centerY = latToWorldY(viewport.centerLat, zoom);

    const leftWorld = centerX - viewport.width / 2;
    const topWorld = centerY - viewport.height / 2;

    const minTileX = Math.floor(leftWorld / 256) - 1;
    const maxTileX = Math.floor((leftWorld + viewport.width) / 256) + 1;
    const minTileY = Math.floor(topWorld / 256) - 1;
    const maxTileY = Math.floor((topWorld + viewport.height) / 256) + 1;

    const tiles = [];
    for (let x = minTileX; x <= maxTileX; x++) {
      for (let y = minTileY; y <= maxTileY; y++) {
        tiles.push({
          x,
          y,
          left: x * 256 - leftWorld,
          top: y * 256 - topWorld,
        });
      }
    }

    const rawPoints = pointData
      .map((point) => {
        const x = lonToWorldX(point.lon, zoom) - leftWorld;
        const y = latToWorldY(point.lat, zoom) - topWorld;

        return {
          ...point,
          x,
          y,
          visible: x > -80 && x < viewport.width + 80 && y > -80 && y < viewport.height + 80,
        };
      })
      .filter((point) => point.visible);

    const clusterDistance = zoom <= 11 ? 58 : zoom === 12 ? 42 : zoom === 13 ? 28 : 0;
    const clustered = [];

    rawPoints.forEach((point) => {
      if (!clusterDistance) {
        clustered.push({
          type: "point",
          ...point,
          points: [point],
        });
        return;
      }

      const cluster = clustered.find((item) => {
        const dx = item.x - point.x;
        const dy = item.y - point.y;
        return Math.sqrt(dx * dx + dy * dy) < clusterDistance;
      });

      if (cluster) {
        cluster.points.push(point);
        cluster.x = cluster.points.reduce((sum, p) => sum + p.x, 0) / cluster.points.length;
        cluster.y = cluster.points.reduce((sum, p) => sum + p.y, 0) / cluster.points.length;
        cluster.count = cluster.points.reduce((sum, p) => sum + (p.count || 0), 0);
        cluster.type = cluster.points.length > 1 ? "cluster" : "point";
      } else {
        clustered.push({
          type: "point",
          x: point.x,
          y: point.y,
          count: point.count || 0,
          points: [point],
          ...point,
        });
      }
    });

    return { tiles, points: clustered };
  }, [pointData, viewport, zoom]);

  function worldToLatLon(worldX, worldY, zoomValue) {
    const scale = Math.pow(2, zoomValue);
    const lon = (worldX / (256 * scale)) * 360 - 180;
    const n = Math.PI - (2 * Math.PI * worldY) / (256 * scale);
    const lat = (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
    return { lat, lon };
  }

  function handlePointerDown(event) {
    if (!event.ctrlKey) return;

    const centerX = lonToWorldX(center.lon, zoom);
    const centerY = latToWorldY(center.lat, zoom);

    dragRef.current = {
      startX: event.clientX,
      startY: event.clientY,
      centerX,
      centerY,
    };

    setIsDragging(true);
    event.currentTarget.setPointerCapture?.(event.pointerId);
  }

  function handlePointerMove(event) {
    if (!dragRef.current) return;

    const dx = event.clientX - dragRef.current.startX;
    const dy = event.clientY - dragRef.current.startY;

    const newCenterX = dragRef.current.centerX - dx;
    const newCenterY = dragRef.current.centerY - dy;
    const nextCenter = worldToLatLon(newCenterX, newCenterY, zoom);

    setCenter(nextCenter);
  }

  function handlePointerUp(event) {
    dragRef.current = null;
    setIsDragging(false);
    event.currentTarget.releasePointerCapture?.(event.pointerId);
  }

  function handleWheel(event) {
    event.preventDefault();

    const direction = event.deltaY < 0 ? 1 : -1;
    setZoom((z) => Math.max(10, Math.min(16, z + direction)));
  }

  function openCluster(cluster) {
    const first = cluster.points[0];
    if (!first) return;

    if (cluster.points.length === 1 || zoom >= 14) {
      setSelectedName(first.title);
      return;
    }

    setCenter({ lat: first.lat, lon: first.lon });
    setZoom((z) => Math.min(16, z + 1));
  }

  return (
    <div className="tileMapShell">
      <div className="tileMapCtrlHint">
        Roda per fer zoom · <b>Ctrl</b> + arrossegar per moure
      </div>

      <div
        className={`tileMapCanvas ${isDragging ? "dragging" : ""}`}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onWheel={handleWheel}
      >
        <div className="tileMapInner">
          {mapData.tiles.map((tile) => (
            <img
              key={`${zoom}-${tile.x}-${tile.y}`}
              src={`https://a.basemaps.cartocdn.com/light_all/${zoom}/${tile.x}/${tile.y}@2x.png`}
              alt=""
              loading="lazy"
              className="tileMapTile"
              style={{ left: `${tile.left}px`, top: `${tile.top}px` }}
              draggable="false"
            />
          ))}

          {mapData.points.map((cluster, index) => {
            const isCluster = cluster.points.length > 1;
            const first = cluster.points[0];
            const isSelected = !isCluster && selected?.title === first?.title;
            const size = isCluster
              ? Math.max(34, Math.min(56, 30 + Math.sqrt(cluster.points.length) * 7))
              : Math.max(22, Math.min(38, 22 + Math.sqrt(first?.count || 1) * 3));

            return (
              <button
                key={`${cluster.type}-${index}-${cluster.x}-${cluster.y}`}
                type="button"
                className={`tileMapPoint ${isCluster ? "cluster" : ""} ${isSelected ? "selected" : ""}`}
                style={{
                  left: `${cluster.x}px`,
                  top: `${cluster.y}px`,
                  width: `${size}px`,
                  height: `${size}px`,
                  marginLeft: `${-size / 2}px`,
                  marginTop: `${-size / 2}px`,
                }}
                title={
                  isCluster
                    ? `${cluster.points.length} espais agrupats`
                    : `${first?.title} · ${first?.count} passis`
                }
                onClick={() => openCluster(cluster)}
              >
                <span>{isCluster ? cluster.points.length : first?.count || ""}</span>
              </button>
            );
          })}
        </div>

        {!pointData.length && (
          <div className="mapNoPoints">No hi ha espais amb coordenades per mostrar amb aquests filtres.</div>
        )}
      </div>
    </div>
  );
}



function SpacesView({ rows, apiSpaces = [], setView, setSelectedActivityId }) {
  const [query, setQuery] = useState("");
  const [selectedName, setSelectedName] = useState("");
  const [filter, setFilter] = useState("all");
  const [displayMode, setDisplayMode] = useState("gestor");
  const [districtFilter, setDistrictFilter] = useState("all");
  const [mode, setMode] = useState("list");

  const espaisLoaded = apiSpaces.length > 0;
  const allSpaces = useMemo(() => buildDerivedSpaces(rows, apiSpaces), [rows, apiSpaces]);

  const districtOptions = useMemo(() => {
    return Array.from(new Set(allSpaces.map((space) => space.districte).filter(Boolean))).sort((a, b) =>
      a.localeCompare(b, "ca")
    );
  }, [allSpaces]);

  const spaces = useMemo(() => {
    return allSpaces.filter((space) => {
      const text = [
        space.title,
        space.title_es,
        space.title_en,
        space.adreca,
        space.barri,
        space.districte,
        space.coordenades,
      ]
        .join(" ")
        .toLowerCase();

      const matchesQuery = text.includes(query.toLowerCase());
      const matchesFilter =
        filter === "all" ||
        (filter === "ambActivitats" && space.count > 0) ||
        (filter === "senseActivitats" && space.count === 0) ||
        (filter === "ambMapa" && space.latitud && space.longitud) ||
        (filter === "senseVincle" && espaisLoaded && !space.matched);

      const matchesDistrict = districtFilter === "all" || space.districte === districtFilter;

      return matchesQuery && matchesFilter && matchesDistrict;
    });
  }, [allSpaces, query, filter, districtFilter, espaisLoaded]);

  const selected = spaces.find((space) => space.title === selectedName) || (mode === "list" ? spaces[0] : null);
  const unlinkedCount = espaisLoaded ? allSpaces.filter((space) => !space.matched).length : 0;
  const spacesWithMap = spaces.filter((space) => space.latitud && space.longitud);

  function openActivity(row) {
    setSelectedActivityId(row._row || row.idIntern);
    setView("activitats");
  }

  return (
    <>
      <Top
        title="Espais"
        subtitle="Espais del programa amb coordenades, imatges, mapa i activitats vinculades."
      />

      <div className="stats dashboardStats">
        <KpiCard icon="🏛️" tone="blue" label="Espais" value={spaces.length} />
        <KpiCard icon="🎟️" tone="green" label="Passis vinculats" value={rows.filter((row) => row.espai).length} />
        <KpiCard icon="📍" tone="purple" label="Amb coordenades" value={spacesWithMap.length} />
        <KpiCard icon="🖼️" tone="yellow" label="Amb imatge" value={spaces.filter((space) => space.imatge).length} />
        <KpiCard icon="⚠️" tone="peach" label="Sense vincle exacte" value={unlinkedCount} />
      </div>

      <div className="toolbar activitiesToolbar">
        <div className="activitySearchRow">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar espai, barri, districte o adreça..."
          />
          <div className="resultsCounter">
            <strong>{spaces.length}</strong>
            <span>{spaces.length === 1 ? "espai" : "espais"}</span>
          </div>
        </div>

        <div className="activityFiltersRow">
          <div className="chips">
            {[
              { id: "all", label: "Tots" },
              { id: "ambActivitats", label: "Amb activitats" },
              { id: "senseActivitats", label: "Sense activitats" },
              { id: "ambMapa", label: "Amb coordenades" },
              { id: "senseVincle", label: "Sense vincle exacte" },
            ].map((item) => (
              <button
                key={item.id}
                onClick={() => setFilter(item.id)}
                className={filter === item.id ? "selected" : ""}
              >
                {item.label}
              </button>
            ))}
          </div>

          <div className="selectFilters spacesSelectFilters">
            <label>
              <span>Districte</span>
              <select value={districtFilter} onChange={(e) => setDistrictFilter(e.target.value)}>
                <option value="all">Tots els districtes</option>
                {districtOptions.map((district) => (
                  <option key={district} value={district}>
                    {district}
                  </option>
                ))}
              </select>
            </label>

            <label>
              <span>Vista</span>
              <select value={mode} onChange={(e) => setMode(e.target.value)}>
                <option value="list">Llista</option>
                <option value="map">Mapa</option>
              </select>
            </label>
          </div>
        </div>
      </div>

      {mode === "list" ? (
        <div className="spacesLayout">
          <div className="spacesList">
            {spaces.map((space) => (
              <button
                key={`${space.title}-${space.id}`}
                className={`spaceCard ${selected?.title === space.title ? "selected" : ""}`}
                onClick={() => setSelectedName(space.title)}
              >
                <div className="spaceThumb">
                  {space.imatge ? (
                    <img src={normalizeImageUrl(space.imatge)} alt={space.title} referrerPolicy="no-referrer" />
                  ) : (
                    <span>Sense imatge</span>
                  )}
                </div>

                <div>
                  <div className="badges">
                    <Badge>{space.districte || "Sense districte"}</Badge>
                    {space.latitud && space.longitud && <Badge tone="success">Coordenades</Badge>}
                    {espaisLoaded && !space.matched && <Badge tone="warning">Revisar vincle</Badge>}
                  </div>
                  <h3>{space.title}</h3>
                  <p>{space.adreca || "Adreça pendent"}</p>
                  <small>{space.count} passis vinculats</small>
                </div>
              </button>
            ))}
          </div>

          <SpaceDetail space={selected} onOpenActivity={openActivity} espaisLoaded={espaisLoaded} />
        </div>
      ) : (
        <div className="spacesMapLayout">
          <div className="spacesMapPanel">
            <TileSpacesMap
              spaces={spacesWithMap}
              selected={selected}
              setSelectedName={setSelectedName}
            />
            <div className="mapHint">
              <strong>{spacesWithMap.length}</strong> espais amb coordenades · clic al punt per obrir fitxa
            </div>
          </div>

          {selected ? (
            <SpaceDetail space={selected} onOpenActivity={openActivity} espaisLoaded={espaisLoaded} />
          ) : (
            <div className="panel mapEmptyPanel">
              <h2>Selecciona un punt al mapa</h2>
              <p>La fitxa completa de l’espai només es mostra quan cliques un marcador.</p>
            </div>
          )}
        </div>
      )}
    </>
  );
}

function SpaceDetail({ space, onOpenActivity, espaisLoaded = true }) {
  const [tab, setTab] = useState("general");
  const [imageFallbackIndex, setImageFallbackIndex] = useState(0);

  useEffect(() => {
    setImageFallbackIndex(0);
  }, [space?.id, space?.title, space?.imatge]);

  if (!space) return <div className="panel">Selecciona un espai.</div>;

  const imageUrls = getImageUrls(space.imatge);
  const imageUrl = imageUrls[imageFallbackIndex] || "";
  const galleryUrl = normalizeImageUrl(space.imatgeGaleria);
  const categories = countBy(space.items || [], "categoria");
  const calendarItems = [...(space.items || [])]
    .filter((item) => isValidDateString(item.dataInici))
    .sort((a, b) => `${a.dataInici} ${a.horaInici}`.localeCompare(`${b.dataInici} ${b.horaInici}`))
    .slice(0, 12);

  const hasMap = space.latitud && space.longitud;
  const lat = Number(String(space.latitud).replace(",", "."));
  const lon = Number(String(space.longitud).replace(",", "."));
  const mapSrc =
    hasMap && Number.isFinite(lat) && Number.isFinite(lon)
      ? `https://www.openstreetmap.org/export/embed.html?bbox=${lon - 0.01}%2C${lat - 0.006}%2C${lon + 0.01}%2C${lat + 0.006}&layer=mapnik&marker=${lat}%2C${lon}`
      : "";

  return (
    <div className="panel detail spaceDetailPanel">
      <div className="hero spaceHero">
        {imageUrl ? (
          <div className="heroImageReal">
            <img
              src={imageUrl}
              alt={space.title || "Imatge de l'espai"}
              referrerPolicy="no-referrer"
              onError={() => {
                if (imageFallbackIndex < imageUrls.length - 1) {
                  setImageFallbackIndex((current) => current + 1);
                }
              }}
            />
            <a href={space.imatge || imageUrl} target="_blank" rel="noreferrer">
              Obrir imatge
            </a>
          </div>
        ) : (
          <span>Sense imatge de l’espai</span>
        )}
      </div>

      <div className="badges">
        <Badge>{space.districte || "Sense districte"}</Badge>
        {space.barri && <Badge>{space.barri}</Badge>}
        <Badge>{space.count} passis</Badge>
        {hasMap && <Badge tone="success">Coordenades</Badge>}
        {espaisLoaded && !space.matched && <Badge tone="warning">Nom no vinculat exactament</Badge>}
      </div>

      <h2>{space.title}</h2>
      <p>{space.adreca || "Adreça pendent"}</p>

      <div className="tabs">
        {[
          ["general", "General"],
          ["mapa", "Mapa"],
          ["activitats", "Activitats"],
          ["calendari", "Calendari"],
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
            <Info label="Adreça" value={space.adreca || "—"} />
            <Info label="Coordenades" value={space.coordenades || `${space.latitud || "—"}, ${space.longitud || "—"}`} />
          </div>

          <div className="sectionTitle">Descripció</div>
          <div className="notice spaceDescription">{space.body_ca || "Descripció pendent o no disponible."}</div>

          <div className="sectionTitle">Categories vinculades</div>
          <div className="compactRankList">
            {toChartEntries(categories, 8).map((item) => (
              <div className="compactRankRow" key={item.name}>
                <div className="compactRankTop">
                  <span>{item.name}</span>
                  <b>{item.value}</b>
                </div>
                <div className="compactRankTrack">
                  <i style={{ width: `${(item.value / Math.max(...toChartEntries(categories, 8).map((entry) => entry.value), 1)) * 100}%`, background: item.color }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === "mapa" && (
        <div className="tabBody">
          <div className="infoGrid">
            <Info label="Latitud" value={space.latitud || "—"} />
            <Info label="Longitud" value={space.longitud || "—"} />
            <Info label="Adreça search" value={space.adrecaSearch || "—"} />
            <Info label="Districte" value={space.districte || "—"} />
          </div>

          {mapSrc ? (
            <iframe
              className="osmMap"
              src={mapSrc}
              title={`Mapa de ${space.title}`}
              loading="lazy"
            />
          ) : (
            <div className="mapPlaceholder">
              <span>Mapa pendent: falta latitud i longitud.</span>
            </div>
          )}

          {hasMap && (
            <a
              className="externalLink"
              href={`https://www.openstreetmap.org/?mlat=${space.latitud}&mlon=${space.longitud}#map=16/${space.latitud}/${space.longitud}`}
              target="_blank"
              rel="noreferrer"
            >
              Obrir a OpenStreetMap
            </a>
          )}
        </div>
      )}

      {tab === "activitats" && (
        <div className="tabBody">
          <div className="spaceActivityHeader">
            <h3>{space.count} passis vinculats</h3>
            <p>Relació directa entre l’espai i les activitats del full API PASSIS.</p>
          </div>

          <div className="miniRows clickableRows">
            {(space.items || []).map((item) => (
              <button key={`${item.idIntern}-${item._row}`} onClick={() => onOpenActivity?.(item)}>
                <strong>{item.idIntern || item.idWeb || "Sense ID"}</strong>
                <span>{item.dataInici || "Sense data"} · {item.horaInici || "—"} · {item.titolWeb || item.titol || "Sense títol"}</span>
              </button>
            ))}

            {space.count === 0 && (
              <div className="notice">Aquest espai existeix al full d’espais però encara no té activitats vinculades.</div>
            )}
          </div>
        </div>
      )}

      {tab === "calendari" && (
        <div className="tabBody">
          {calendarItems.length > 0 ? (
            <div className="spaceTimeline">
              {calendarItems.map((item) => (
                <button key={`${item.idIntern}-${item._row}`} onClick={() => onOpenActivity?.(item)}>
                  <time>{formatCompactDate(item.dataInici)}</time>
                  <div>
                    <strong>{item.horaInici || "—"} · {item.idIntern}</strong>
                    <span>{item.titolWeb || item.titol || "Sense títol"}</span>
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <div className="notice">No hi ha passis amb data vàlida per aquest espai.</div>
          )}
        </div>
      )}

      {tab === "web" && (
        <div className="tabBody">
          <div className="infoGrid">
            <Info label="Imatge" value={space.imatge ? "Assignada" : "Falta imatge"} />
            <Info label="Autoria" value={space.autoria || "—"} />
            <Info label="Galeria" value={space.imatgeGaleria ? "Assignada" : "—"} />
            <Info label="Autoria galeria" value={space.autoriaGaleria || "—"} />
            <Info label="Importar" value={space.importar ? "Sí" : "No / pendent"} />
            <Info label="ID espai" value={space.id || "—"} />
          </div>

          <div className="spaceWebLinks">
            {space.imatge && (
              <a className="externalLink" href={space.imatge} target="_blank" rel="noreferrer">
                Obrir imatge principal
              </a>
            )}
            {space.imatgeGaleria && (
              <a className="externalLink" href={space.imatgeGaleria} target="_blank" rel="noreferrer">
                Obrir imatge de galeria
              </a>
            )}
          </div>

          {galleryUrl && (
            <div className="spaceGalleryPreview">
              <img src={galleryUrl} alt={`Galeria ${space.title}`} referrerPolicy="no-referrer" />
            </div>
          )}
        </div>
      )}
    </div>
  );
}





function getQualityIssues(row, inscriptionCountByIdWeb = {}) {
  const issues = [];

  if (!row.dataInici) issues.push("Sense data");
  if (!row.idWeb) issues.push("Sense ID WEB");
  if (!row.espai) issues.push("Sense espai");
  if (!row.imatge) issues.push("Sense imatge");
  if (!row.titolWeb && !row.titol) issues.push("Sense títol");
  if (!row.entradetaCat) issues.push("Sense entradeta CAT");

  if (row.idWeb && !inscriptionCountByIdWeb[row.idWeb]) {
    issues.push("Sense inscripcions");
  }

  if (!row.idiomaAngles) {
    issues.push("Sense anglès");
  }

  const hasAccessibility =
    row.accessRadioGuia ||
    row.accessSubtitulacio ||
    row.accessLlenguaSignes ||
    row.accessBraille ||
    row.accessLecturaFacil ||
    row.accessMobilitatReduida ||
    Boolean(row.accessDetalls);

  if (!hasAccessibility) {
    issues.push("Sense accessibilitat");
  }

  return issues;
}

function DireccioView({ rows, allRows = rows, dataScope = "published", inscripcions, setView, setSelectedActivityId }) {
  const [selectedIssue, setSelectedIssue] = useState("all");
  const [query, setQuery] = useState("");

  const inscriptionCountByIdWeb = useMemo(() => {
    return inscripcions.reduce((acc, row) => {
      if (!row.idWeb) return acc;
      acc[row.idWeb] = (acc[row.idWeb] || 0) + 1;
      return acc;
    }, {});
  }, [inscripcions]);

  const qualityRows = useMemo(() => {
    return rows
      .map((row) => {
        const issues = getQualityIssues(row, inscriptionCountByIdWeb);
        const totalChecks = 9;
        const score = Math.max(0, Math.round(((totalChecks - issues.length) / totalChecks) * 100));

        return {
          row,
          issues,
          score,
        };
      })
      .filter((item) => item.issues.length > 0);
  }, [rows, inscriptionCountByIdWeb]);

  const issueTypes = useMemo(() => {
    const counts = qualityRows.reduce((acc, item) => {
      item.issues.forEach((issue) => {
        acc[issue] = (acc[issue] || 0) + 1;
      });
      return acc;
    }, {});

    return Object.entries(counts)
      .map(([label, count]) => ({ id: label, label, count }))
      .sort((a, b) => b.count - a.count);
  }, [qualityRows]);

  const filteredIssues = useMemo(() => {
    return qualityRows.filter((item) => {
      const row = item.row;
      const text = [
        row.id,
        row.idIntern,
        row.idWeb,
        row.titolWeb,
        row.titol,
        row.espai,
        row.categoria,
        row.districte,
        row.encarregada,
        item.issues.join(" "),
      ]
        .join(" ")
        .toLowerCase();

      const matchesQuery = text.includes(query.toLowerCase());
      const matchesIssue = selectedIssue === "all" || item.issues.includes(selectedIssue);

      return matchesQuery && matchesIssue;
    });
  }, [qualityRows, query, selectedIssue]);

  const averageScore = qualityRows.length
    ? Math.round(qualityRows.reduce((sum, item) => sum + item.score, 0) / qualityRows.length)
    : 100;

  const publishedCount = allRows.filter((row) => row.importar).length;
  const unpublishedCount = allRows.length - publishedCount;
  const publicationPercent = allRows.length ? Math.round((publishedCount / allRows.length) * 100) : 0;

  function openActivity(row) {
    setSelectedActivityId(row._row || row.idIntern);
    setView("activitats");
  }

  return (
    <>
      <Top
        title="Direcció"
        subtitle={`Control executiu de qualitat de dades · Mode actual: ${getScopeLabel(dataScope)}`}
      />

      <div className="stats dashboardStats">
        <KpiCard icon="🌐" tone="blue" label="Publicades" value={publishedCount} />
        <KpiCard icon="📝" tone="yellow" label="No publicades" value={unpublishedCount} />
        <KpiCard icon="%" tone="green" label="Índex publicació" value={`${publicationPercent}%`} />
        <KpiCard icon="✓" tone="green" label="Completitud mitjana" value={`${averageScore}%`} />
        <KpiCard icon="⚠️" tone="peach" label="Avisos en mode actual" value={qualityRows.length} />
      </div>

      <div className="stats dashboardStats directionSecondaryStats">
        <KpiCard icon="🖼️" tone="yellow" label="Sense imatge" value={issueTypes.find((i) => i.id === "Sense imatge")?.count || 0} />
        <KpiCard icon="📍" tone="purple" label="Sense espai" value={issueTypes.find((i) => i.id === "Sense espai")?.count || 0} />
        <KpiCard icon="👥" tone="blue" label="Sense inscripcions" value={issueTypes.find((i) => i.id === "Sense inscripcions")?.count || 0} />
        <KpiCard icon="EN" tone="peach" label="Sense anglès" value={issueTypes.find((i) => i.id === "Sense anglès")?.count || 0} />
        <KpiCard icon="♿" tone="green" label="Sense accessibilitat" value={issueTypes.find((i) => i.id === "Sense accessibilitat")?.count || 0} />
      </div>

      <div className="toolbar activitiesToolbar directionToolbar">
        <div className="activitySearchRow">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar per ID, títol, espai, categoria, encarregada o avís..."
          />
          <div className="resultsCounter">
            <strong>{filteredIssues.length}</strong>
            <span>{filteredIssues.length === 1 ? "fitxa" : "fitxes"}</span>
          </div>
        </div>

        <div className="chips directionIssueChips">
          <button
            onClick={() => setSelectedIssue("all")}
            className={selectedIssue === "all" ? "selected" : ""}
          >
            Tots els avisos
          </button>

          {issueTypes.map((issue) => (
            <button
              key={issue.id}
              onClick={() => setSelectedIssue(issue.id)}
              className={selectedIssue === issue.id ? "selected" : ""}
            >
              {issue.label} · {issue.count}
            </button>
          ))}
        </div>
      </div>

      <div className="directionGrid">
        <section className="chartCard directionSummary">
          <div className="chartCardHeader">
            <div className="chartTitle">
              <span>⚠</span>
              <h2>Resum d’avisos</h2>
            </div>
            <span className="chartTotal">{issueTypes.length} tipus</span>
          </div>

          <div className="compactRankList">
            {issueTypes.map((issue) => {
              const max = Math.max(...issueTypes.map((item) => item.count), 1);

              return (
                <div className="compactRankRow" key={issue.id}>
                  <div className="compactRankTop">
                    <span>{issue.label}</span>
                    <b>{issue.count}</b>
                  </div>
                  <div className="compactRankTrack">
                    <i style={{ width: `${(issue.count / max) * 100}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <section className="chartCard directionListCard">
          <div className="chartCardHeader">
            <div className="chartTitle">
              <span>▤</span>
              <h2>Fitxes a revisar</h2>
            </div>
            <span className="chartTotal">{filteredIssues.length} resultats</span>
          </div>

          <div className="directionIssueList">
            {filteredIssues.slice(0, 80).map(({ row, issues, score }) => (
              <button
                key={`${row.idIntern}-${row._row}`}
                type="button"
                className="directionIssueItem"
                onClick={() => openActivity(row)}
              >
                <div className="directionIssueMain">
                  <div className="badges">
                    <Badge>{row.idIntern || row.idWeb || "Sense ID"}</Badge>
                    <Badge>{row.encarregada || "Sense encarregada"}</Badge>
                    <Badge>{score}% complet</Badge>
                  </div>
                  <h3>{row.titolWeb || row.titol || "Sense títol"}</h3>
                  <p>{row.espai || "Sense espai"} · {row.districte || "Sense districte"} · {row.categoria || "Sense categoria"}</p>
                </div>

                <div className="directionIssueTags">
                  {issues.slice(0, 5).map((issue) => (
                    <span key={issue}>{issue}</span>
                  ))}
                  {issues.length > 5 && <span>+{issues.length - 5}</span>}
                </div>
              </button>
            ))}

            {filteredIssues.length === 0 && (
              <div className="notice success">No hi ha fitxes amb aquests criteris. Tot net.</div>
            )}
          </div>
        </section>
      </div>
    </>
  );
}



function parseTimeToMinutes(value) {
  const text = String(value || "").trim();
  const match = text.match(/^(\d{1,2})[:.](\d{2})/);

  if (!match) return null;

  const hours = Number(match[1]);
  const minutes = Number(match[2]);

  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;

  return hours * 60 + minutes;
}

function getNowMinutes() {
  const now = new Date();
  return now.getHours() * 60 + now.getMinutes();
}


function Barcelona2026Welcome({ rows }) {
  const today = toLocalISODate(new Date());
  const nowMinutes = getNowMinutes();

  const todayRows = useMemo(() => {
    return rows.filter((row) => row.dataInici === today);
  }, [rows, today]);

  const nextActivity = useMemo(() => {
    return rows
      .filter((row) => isValidDateString(row.dataInici))
      .filter((row) => {
        if (row.dataInici > today) return true;
        if (row.dataInici < today) return false;

        const start = parseTimeToMinutes(row.horaInici);
        return start === null || start >= nowMinutes;
      })
      .sort((a, b) =>
        `${a.dataInici || "9999-99-99"} ${a.horaInici || "99:99"}`.localeCompare(
          `${b.dataInici || "9999-99-99"} ${b.horaInici || "99:99"}`
        )
      )[0];
  }, [rows, today, nowMinutes]);

  const greeting = (() => {
    const hour = new Date().getHours();
    if (hour < 13) return "Bon dia";
    if (hour < 20) return "Bona tarda";
    return "Bona nit";
  })();

  const nextText = nextActivity
    ? `${nextActivity.horaInici || "—"} · ${nextActivity.titolWeb || nextActivity.titol || "Pròxima activitat"}`
    : "No hi ha pròximes activitats amb data.";

  return (
    <section className="barcelona2026Welcome">
      <div>
        <p className="eyebrow">Mode Barcelona 2026</p>
        <h2>{greeting}, benvingut/da al Gestor CMA</h2>
        <p>
          Avui Barcelona té <strong>{todayRows.length}</strong> activitats en{" "}
          <strong>{uniqueCount(todayRows, "districte")}</strong> districtes i{" "}
          <strong>{uniqueCount(todayRows, "espai")}</strong> espais.
        </p>
      </div>

      <div className="welcomeNext">
        <span>Pròxima activitat</span>
        <strong>{nextText}</strong>
        {nextActivity && <small>{nextActivity.espai || "Sense espai"} · {nextActivity.districte || "Sense districte"}</small>}
      </div>
    </section>
  );
}


function BarcelonaLivePanel({ rows, inscripcions = [] }) {
  const today = toLocalISODate(new Date());
  const nowMinutes = getNowMinutes();
  const inscriptionCountByIdWeb = useMemo(() => buildInscriptionCountByIdWeb(inscripcions), [inscripcions]);

  const todayRows = useMemo(() => {
    return rows
      .filter((row) => row.dataInici === today)
      .sort((a, b) => (parseTimeToMinutes(a.horaInici) ?? 9999) - (parseTimeToMinutes(b.horaInici) ?? 9999));
  }, [rows, today]);

  const liveRows = useMemo(() => {
    return todayRows.filter((row) => {
      const start = parseTimeToMinutes(row.horaInici);
      const end = parseTimeToMinutes(row.horaFinal);

      if (start === null) return false;
      if (end !== null) return start <= nowMinutes && nowMinutes <= end;

      return start <= nowMinutes && nowMinutes <= start + 120;
    });
  }, [todayRows, nowMinutes]);

  const nextRows = useMemo(() => {
    return rows
      .filter((row) => isValidDateString(row.dataInici))
      .filter((row) => {
        if (row.dataInici > today) return true;
        if (row.dataInici < today) return false;

        const start = parseTimeToMinutes(row.horaInici);
        return start === null || start >= nowMinutes;
      })
      .sort((a, b) =>
        `${a.dataInici || "9999-99-99"} ${a.horaInici || "99:99"}`.localeCompare(
          `${b.dataInici || "9999-99-99"} ${b.horaInici || "99:99"}`
        )
      )
      .slice(0, 5);
  }, [rows, today, nowMinutes]);

  const mainNext = nextRows[0] || null;

  return (
    <section className="barcelonaLivePanel">
      <div className="barcelonaLiveHeader">
        <div>
          <p className="eyebrow">Barcelona en directe</p>
          <h2>{formatDate(today)}</h2>
          <p>Lectura viva del programa publicat: què passa avui, què està en marxa i què ve a continuació.</p>
        </div>

        <div className="liveNowBadge">
          <span>Ara</span>
          <strong>{new Date().toLocaleTimeString("ca-ES", { hour: "2-digit", minute: "2-digit" })}</strong>
        </div>
      </div>

      <div className="liveKpis">
        <div>
          <strong>{todayRows.length}</strong>
          <span>activitats avui</span>
        </div>
        <div>
          <strong>{uniqueCount(todayRows, "espai")}</strong>
          <span>espais avui</span>
        </div>
        <div>
          <strong>{uniqueCount(todayRows, "districte")}</strong>
          <span>districtes avui</span>
        </div>
        <div>
          <strong>{liveRows.length}</strong>
          <span>ara mateix</span>
        </div>
      </div>

      <div className="liveContentGrid">
        <div className="liveBlock">
          <div className="liveBlockHeader">
            <h3>Ara mateix</h3>
            <Badge>{liveRows.length} actives</Badge>
          </div>

          <div className="liveList">
            {liveRows.length ? (
              liveRows.slice(0, 5).map((row) => (
                <LiveMiniCard key={`${row.idIntern}-${row._row}`} row={row} inscriptions={row.idWeb ? inscriptionCountByIdWeb[row.idWeb] || 0 : 0} />
              ))
            ) : (
              <div className="liveEmpty">No hi ha cap activitat en marxa segons l’hora indicada.</div>
            )}
          </div>
        </div>

        <div className="liveBlock featured">
          <div className="liveBlockHeader">
            <h3>Pròxima activitat</h3>
            {mainNext && <Badge>{formatCompactDate(mainNext.dataInici)}</Badge>}
          </div>

          {mainNext ? (
            <div className="nextActivityCard">
              <time>{mainNext.horaInici || "—"}</time>
              <h3>{mainNext.titolWeb || mainNext.titol || "Sense títol"}</h3>
              <p>{mainNext.espai || "Sense espai"} · {mainNext.districte || "Sense districte"}</p>
              <div className="agendaMeta">
                <span>🏷 {mainNext.categoria || "Sense categoria"}</span>
                <span>👤 {mainNext.encarregada || "Sense encarregada"}</span>
                <span>🎟 {mainNext.idWeb ? inscriptionCountByIdWeb[mainNext.idWeb] || 0 : 0} inscripcions</span>
              </div>
            </div>
          ) : (
            <div className="liveEmpty">No hi ha pròximes activitats amb data.</div>
          )}
        </div>

        <div className="liveBlock">
          <div className="liveBlockHeader">
            <h3>Properes</h3>
            <Badge>{nextRows.length} activitats</Badge>
          </div>

          <div className="liveList">
            {nextRows.slice(0, 5).map((row) => (
              <LiveMiniCard key={`${row.idIntern}-${row._row}`} row={row} inscriptions={row.idWeb ? inscriptionCountByIdWeb[row.idWeb] || 0 : 0} />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function LiveMiniCard({ row, inscriptions }) {
  return (
    <div className="liveMiniCard">
      <time>{row.horaInici || "—"}</time>
      <div>
        <h4>{row.titolWeb || row.titol || "Sense títol"}</h4>
        <p>{formatCompactDate(row.dataInici)} · {row.espai || "Sense espai"}</p>
        <small>{row.idIntern || row.idWeb || "Sense ID"} · {row.categoria || "Sense categoria"} · 🎟 {inscriptions}</small>
      </div>
    </div>
  );
}


function DashboardView({ rows, inscripcions = [] }) {
  const dashboardRef = useRef(null);
  const [exporting, setExporting] = useState(false);

  const initialRange = getDateRange(rows);
  const [startDate, setStartDate] = useState(initialRange.start && initialRange.start !== "—" ? initialRange.start : "");
  const [endDate, setEndDate] = useState(initialRange.end && initialRange.end !== "—" ? initialRange.end : "");
  const [monthFilter, setMonthFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [districtFilter, setDistrictFilter] = useState("all");
  const [managerFilter, setManagerFilter] = useState("all");
  const [modalitatFilter, setModalitatFilter] = useState("all");

  const todayLabel = new Date().toLocaleDateString("ca-ES", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  const filterOptions = useMemo(() => {
    const months = Array.from(
      new Set(rows.map((row) => getMonthKey(row.dataInici)).filter((value) => value && value !== "Sense mes"))
    ).sort();

    return {
      months,
      categories: Array.from(new Set(rows.map((row) => row.categoria).filter(Boolean))).sort((a, b) => a.localeCompare(b, "ca")),
      districts: Array.from(new Set(rows.map((row) => row.districte).filter(Boolean))).sort((a, b) => a.localeCompare(b, "ca")),
      managers: Array.from(new Set(rows.map((row) => row.encarregada).filter(Boolean))).sort((a, b) => a.localeCompare(b, "ca")),
      modalitats: Array.from(new Set(rows.map((row) => getModalitatKey(row.modalitat)).filter(Boolean))).sort((a, b) => a.localeCompare(b, "ca")),
    };
  }, [rows]);

  const filteredRows = useMemo(() => {
    return rows.filter((row) => {
      const validDate = isValidDateString(row.dataInici);
      const inDateRange =
        !validDate ||
        ((!startDate || row.dataInici >= startDate) && (!endDate || row.dataInici <= endDate));

      const matchesMonth = monthFilter === "all" || getMonthKey(row.dataInici) === monthFilter;
      const matchesCategory = categoryFilter === "all" || row.categoria === categoryFilter;
      const matchesDistrict = districtFilter === "all" || row.districte === districtFilter;
      const matchesManager = managerFilter === "all" || row.encarregada === managerFilter;
      const matchesModalitat = modalitatFilter === "all" || getModalitatKey(row.modalitat) === modalitatFilter;

      return inDateRange && matchesMonth && matchesCategory && matchesDistrict && matchesManager && matchesModalitat;
    });
  }, [rows, startDate, endDate, monthFilter, categoryFilter, districtFilter, managerFilter, modalitatFilter]);

  const idWebToActivity = useMemo(() => {
    const map = new Map();
    rows.forEach((row) => {
      if (row.idWeb && !map.has(row.idWeb)) {
        map.set(row.idWeb, row);
      }
    });
    return map;
  }, [rows]);

  const filteredIdWeb = useMemo(() => new Set(filteredRows.map((row) => row.idWeb).filter(Boolean)), [filteredRows]);

  const filteredInscripcions = useMemo(() => {
    return inscripcions.filter((row) => {
      if (!row.idWeb || !filteredIdWeb.has(row.idWeb)) return false;

      const activity = idWebToActivity.get(row.idWeb);
      if (!activity) return true;

      const matchesCategory = categoryFilter === "all" || activity.categoria === categoryFilter;
      const matchesDistrict = districtFilter === "all" || activity.districte === districtFilter;
      const matchesManager = managerFilter === "all" || activity.encarregada === managerFilter;
      const matchesModalitat = modalitatFilter === "all" || getModalitatKey(activity.modalitat) === modalitatFilter;

      return matchesCategory && matchesDistrict && matchesManager && matchesModalitat;
    });
  }, [inscripcions, filteredIdWeb, idWebToActivity, categoryFilter, districtFilter, managerFilter, modalitatFilter]);

  const categoryData = countBy(filteredRows, "categoria");
  const districtData = countBy(filteredRows, "districte");
  const managerData = countBy(filteredRows, "encarregada");
  const monthData = countBy(
    filteredRows
      .filter((row) => isValidDateString(row.dataInici))
      .map((row) => ({ mes: getMonthKey(row.dataInici) })),
    "mes"
  );

  const inscriptionsByMonth = getInscriptionsByMonth(filteredInscripcions, idWebToActivity);
  const districtComparison = getDistrictActivityInscriptionComparison(filteredRows, filteredInscripcions, idWebToActivity);
  const topActivityInscriptions = getTopActivityInscriptions(filteredInscripcions, idWebToActivity);

  const dateLabel = `${startDate ? formatCompactDate(startDate) : "Inici"} – ${endDate ? formatCompactDate(endDate) : "Final"}`;

  function resetFilters() {
    setStartDate(initialRange.start && initialRange.start !== "—" ? initialRange.start : "");
    setEndDate(initialRange.end && initialRange.end !== "—" ? initialRange.end : "");
    setMonthFilter("all");
    setCategoryFilter("all");
    setDistrictFilter("all");
    setManagerFilter("all");
    setModalitatFilter("all");
  }

  async function exportDashboard(type) {
    if (!dashboardRef.current || exporting) return;

    setExporting(true);

    try {
      const node = dashboardRef.current;
      const fileBase = `dashboard-cma-${new Date().toISOString().slice(0, 10)}`;

      if (type === "jpg") {
        const dataUrl = await toJpeg(node, {
          quality: 0.96,
          backgroundColor: "#f7f7f5",
          pixelRatio: 2,
          cacheBust: true,
        });

        downloadDataUrl(dataUrl, `${fileBase}.jpg`);
      }

      if (type === "png") {
        const dataUrl = await toPng(node, {
          backgroundColor: "#f7f7f5",
          pixelRatio: 2,
          cacheBust: true,
        });

        downloadDataUrl(dataUrl, `${fileBase}.png`);
      }

      if (type === "pdf") {
        const dataUrl = await toPng(node, {
          backgroundColor: "#f7f7f5",
          pixelRatio: 2,
          cacheBust: true,
        });

        const width = node.offsetWidth;
        const height = node.offsetHeight;
        const pdf = new jsPDF({
          orientation: "landscape",
          unit: "px",
          format: [width, height],
        });

        pdf.addImage(dataUrl, "PNG", 0, 0, width, height);
        pdf.save(`${fileBase}.pdf`);
      }
    } catch (err) {
      alert(`No s'ha pogut exportar el dashboard: ${err.message}`);
    } finally {
      setExporting(false);
    }
  }

  return (
    <div ref={dashboardRef} className="dashboardExportArea">
      <Top
        title="Dashboard direcció"
        subtitle="Visió general de la gestió del programa: tipologies, territori, equips, calendari i inscripcions."
      >
        <div className="dashboardTopControls">
          <div className="todayPill">Avui · {todayLabel}</div>
          <div className="dateRangePill">📅 {dateLabel}</div>
          <div className="exportButtons">
            <button type="button" disabled={exporting} onClick={() => exportDashboard("png")}>
              {exporting ? "Exportant..." : "PNG"}
            </button>
            <button type="button" disabled={exporting} onClick={() => exportDashboard("jpg")}>
              JPG
            </button>
            <button type="button" disabled={exporting} onClick={() => exportDashboard("pdf")}>
              PDF
            </button>
          </div>
        </div>
      </Top>

      <div className="dashboardFilterPanel">
        <div className="dashboardDateInputs">
          <label>
            <span>Data inici</span>
            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </label>
          <label>
            <span>Data final</span>
            <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          </label>
        </div>

        <div className="dashboardSelectFilters">
          <label>
            <span>Mes</span>
            <select value={monthFilter} onChange={(e) => setMonthFilter(e.target.value)}>
              <option value="all">Tots els mesos</option>
              {filterOptions.months.map((month) => (
                <option key={month} value={month}>
                  {formatMonth(month)}
                </option>
              ))}
            </select>
          </label>

          <label>
            <span>Categoria</span>
            <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}>
              <option value="all">Totes les categories</option>
              {filterOptions.categories.map((category) => (
                <option key={category} value={category}>{category}</option>
              ))}
            </select>
          </label>

          <label>
            <span>Districte</span>
            <select value={districtFilter} onChange={(e) => setDistrictFilter(e.target.value)}>
              <option value="all">Tots els districtes</option>
              {filterOptions.districts.map((district) => (
                <option key={district} value={district}>{district}</option>
              ))}
            </select>
          </label>

          <label>
            <span>Encarregada</span>
            <select value={managerFilter} onChange={(e) => setManagerFilter(e.target.value)}>
              <option value="all">Totes</option>
              {filterOptions.managers.map((manager) => (
                <option key={manager} value={manager}>{manager}</option>
              ))}
            </select>
          </label>

          <label>
            <span>Modalitat</span>
            <select value={modalitatFilter} onChange={(e) => setModalitatFilter(e.target.value)}>
              <option value="all">Totes</option>
              {filterOptions.modalitats.map((modalitat) => (
                <option key={modalitat} value={modalitat}>Modalitat {modalitat}</option>
              ))}
            </select>
          </label>

          <button className="resetDashboardFilters" type="button" onClick={resetFilters}>
            Reiniciar filtres
          </button>
        </div>
      </div>

      <Barcelona2026Welcome rows={filteredRows} />

      <BarcelonaLivePanel rows={filteredRows} inscripcions={filteredInscripcions} />

      <div className="stats dashboardStats">
        <KpiCard icon="🎟️" tone="blue" label="Passis" value={filteredRows.length} />
        <KpiCard icon="📄" tone="green" label="Propostes" value={uniqueCount(filteredRows, "id")} />
        <KpiCard icon="🌐" tone="purple" label="Activitats web" value={uniqueCount(filteredRows, "idWeb")} />
        <KpiCard icon="🏛️" tone="yellow" label="Espais" value={uniqueCount(filteredRows, "espai")} />
        <KpiCard icon="👥" tone="peach" label="Inscripcions" value={filteredInscripcions.length} />
      </div>

      <div className="dashboardChartsGrid">
        <TypeDonut title="Activitats per tipologia" data={categoryData} />
        <DistrictBars title="Activitats per districte" data={districtData} />
        <ManagerBars title="Activitats per encarregada" data={managerData} />
        <MonthBarChart title="Activitats per mes · 2026" data={monthData} />
      </div>

      <div className="dashboardChartsGrid dashboardExtraGrid">
        <MonthActivityInscriptionChart
          title="Activitats vs inscripcions per mes"
          activitiesData={monthData}
          inscriptionsData={inscriptionsByMonth}
        />
        <DistrictActivityGap title="Districtes amb més activitat i menys inscripció" data={districtComparison} />
        <CompactRankList title="Top 10 espais amb més passis" data={countBy(filteredRows, "espai")} icon="🏛️" totalLabel="Top 10 espais" />
        <CompactRankList title="Top 10 activitats amb més inscripcions" data={topActivityInscriptions} icon="👥" totalLabel="Top 10 activitats" />
        <CompactRankList title="Top 10 categories amb més pes" data={categoryData} icon="◔" totalLabel="Top 10 categories" />
      </div>
    </div>
  );
}



function getInscriptionsByMonth(inscripcions, idWebToActivity) {
  const data = {};

  inscripcions.forEach((inscripcio) => {
    const activity = idWebToActivity.get(inscripcio.idWeb);
    const month = activity && isValidDateString(activity.dataInici) ? getMonthKey(activity.dataInici) : "Sense mes";
    data[month] = (data[month] || 0) + 1;
  });

  return data;
}

function getTopActivityInscriptions(inscripcions, idWebToActivity) {
  const data = {};

  inscripcions.forEach((inscripcio) => {
    const activity = idWebToActivity.get(inscripcio.idWeb);
    const label = activity?.titolWeb || activity?.titol || inscripcio.titolWeb || inscripcio.idWeb || "Sense activitat";
    data[label] = (data[label] || 0) + 1;
  });

  return data;
}

function getDistrictActivityInscriptionComparison(rows, inscripcions, idWebToActivity) {
  const activities = countBy(rows, "districte");
  const inscriptions = {};

  inscripcions.forEach((inscripcio) => {
    const activity = idWebToActivity.get(inscripcio.idWeb);
    const district = activity?.districte || "Sense dades";
    inscriptions[district] = (inscriptions[district] || 0) + 1;
  });

  return Object.keys(activities)
    .map((district) => {
      const activityCount = activities[district] || 0;
      const inscriptionCount = inscriptions[district] || 0;
      return {
        district,
        activityCount,
        inscriptionCount,
        gap: activityCount - inscriptionCount,
        ratio: inscriptionCount ? activityCount / inscriptionCount : activityCount,
      };
    })
    .sort((a, b) => b.activityCount - a.activityCount || b.gap - a.gap)
    .slice(0, 10);
}

function MonthActivityInscriptionChart({ title, activitiesData, inscriptionsData }) {
  const months = [
    ["2026-01", "Gen"],
    ["2026-02", "Feb"],
    ["2026-03", "Mar"],
    ["2026-04", "Abr"],
    ["2026-05", "Mai"],
    ["2026-06", "Jun"],
    ["2026-07", "Jul"],
    ["2026-08", "Ago"],
    ["2026-09", "Set"],
    ["2026-10", "Oct"],
    ["2026-11", "Nov"],
    ["2026-12", "Des"],
  ];

  const entries = months.map(([key, name]) => ({
    name,
    activitats: activitiesData[key] || 0,
    inscripcions: inscriptionsData[key] || 0,
  }));

  const totalActivities = entries.reduce((sum, item) => sum + item.activitats, 0);
  const totalInscriptions = entries.reduce((sum, item) => sum + item.inscripcions, 0);

  return (
    <ChartCard title={title} icon="↔" totalLabel={`${totalActivities} activitats · ${totalInscriptions} inscripcions`}>
      <div className="chartBody">
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={entries} margin={{ top: 22, right: 16, bottom: 18, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="name" tickLine={false} axisLine={false} tick={{ fontSize: 12 }} />
            <YAxis tickLine={false} axisLine={false} />
            <Tooltip />
            <Bar dataKey="activitats" fill="#2f6fdd" radius={[8, 8, 0, 0]} />
            <Bar dataKey="inscripcions" fill="#4aa79c" radius={[8, 8, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </ChartCard>
  );
}

function DistrictActivityGap({ title, data }) {
  const maxActivity = Math.max(...data.map((item) => item.activityCount), 1);
  const maxInscription = Math.max(...data.map((item) => item.inscriptionCount), 1);

  return (
    <ChartCard title={title} icon="⇣" totalLabel="Top districtes">
      <div className="districtGapList">
        {data.map((item) => (
          <div className="districtGapRow" key={item.district}>
            <div className="districtGapHeader">
              <strong>{formatDistrictName(item.district)}</strong>
              <span>{item.activityCount} activitats · {item.inscriptionCount} inscripcions</span>
            </div>
            <div className="districtGapBars">
              <i style={{ width: `${(item.activityCount / maxActivity) * 100}%` }} />
              <b style={{ width: `${(item.inscriptionCount / maxInscription) * 100}%` }} />
            </div>
          </div>
        ))}
      </div>
    </ChartCard>
  );
}

function KpiCard({ icon, tone, label, value }) {
  return (
    <div className="kpiCard">
      <div className={`kpiIcon ${tone}`}>{icon}</div>
      <div>
        <div className="kpiValue">{value}</div>
        <div className="kpiLabel">{label}</div>
      </div>
    </div>
  );
}

function ChartCard({ title, totalLabel, icon, children }) {
  return (
    <section className="chartCard">
      <div className="chartCardHeader">
        <div className="chartTitle">
          <span>{icon}</span>
          <h2>{title}</h2>
        </div>
        <span className="chartTotal">{totalLabel}</span>
      </div>

      {children}

      <button className="detailLink" type="button">
        Veure detall →
      </button>
    </section>
  );
}

function TypeDonut({ title, data }) {
  const entries = toChartEntries(data, 8);
  const total = entries.reduce((sum, item) => sum + item.value, 0) || 1;
  const chartData = entries.map((item) => ({
    ...item,
    percent: Math.round((item.value / total) * 100),
  }));

  return (
    <ChartCard title={title} icon="◔" totalLabel={`Total: ${total} activitats`}>
      <div className="donutCardBody">
        <div className="donutWrap">
          <ResponsiveContainer width="100%" height={230}>
            <PieChart>
              <Pie
                data={chartData}
                dataKey="value"
                nameKey="name"
                innerRadius={56}
                outerRadius={92}
                paddingAngle={1}
                label={({ percent }) => `${percent}%`}
              >
                {chartData.map((entry) => (
                  <Cell key={entry.name} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip formatter={(value, name) => [value, name]} />
            </PieChart>
          </ResponsiveContainer>
          <div className="donutCenter">
            <strong>{total}</strong>
            <span>activitats</span>
          </div>
        </div>

        <div className="donutLegend">
          {chartData.map((item) => (
            <div className="donutLegendRow" key={item.name}>
              <i style={{ background: item.color }} />
              <span>{item.name}</span>
              <b>{item.value}</b>
              <em>{item.percent}%</em>
            </div>
          ))}
        </div>
      </div>
    </ChartCard>
  );
}

function formatDistrictName(value) {
  return String(value || "")
    .replace(/^\d+\s*/, "")
    .replace(/([a-zàèéíïòóúüç])([A-ZÀÈÉÍÏÒÓÚÜÇ])/g, "$1 $2")
    .replace(/\s*-\s*/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

function DistrictYAxisTick({ x, y, payload }) {
  return (
    <text
      x={x}
      y={y}
      dy={4}
      textAnchor="end"
      fill="#555"
      fontSize={11}
      style={{
        whiteSpace: "nowrap",
      }}
    >
      {payload.value}
    </text>
  );
}

function DistrictBars({ title, data }) {
 const entries = toChartEntries(data, 10).map((item) => ({
  ...item,
  label: formatDistrictName(item.name),
}));
  const total = entries.reduce((sum, item) => sum + item.value, 0);

  return (
    <ChartCard title={title} icon="▰" totalLabel={`Total: ${total} activitats`}>
      <div className="chartBody">
        <ResponsiveContainer width="100%" height={300}>
          <BarChart
  data={entries}
  layout="vertical"
  margin={{ top: 12, right: 34, bottom: 10, left: 115 }}
>
            <CartesianGrid strokeDasharray="3 3" horizontal={false} />
            <XAxis type="number" tickLine={false} axisLine={false} />
            <YAxis
  type="category"
  dataKey="label"
  width={190}
  tickLine={false}
  axisLine={false}
  interval={0}
  tick={<DistrictYAxisTick />}
/>
            <Tooltip />
            <Bar dataKey="value" fill="#2f6fdd" radius={[0, 7, 7, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </ChartCard>
  );
}

function ManagerBars({ title, data }) {
  const entries = toChartEntries(data, 8);
  const total = entries.length;

  return (
    <ChartCard title={title} icon="♙" totalLabel={`Total: ${total} encarregades`}>
      <div className="chartBody">
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={entries} margin={{ top: 22, right: 16, bottom: 18, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="name" tickLine={false} axisLine={false} tick={{ fontSize: 12 }} />
            <YAxis tickLine={false} axisLine={false} />
            <Tooltip />
            <Bar dataKey="value" fill="#4aa79c" radius={[8, 8, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </ChartCard>
  );
}

function MonthBarChart({ title, data }) {
  const months = [
    ["2026-01", "Gen"],
    ["2026-02", "Feb"],
    ["2026-03", "Mar"],
    ["2026-04", "Abr"],
    ["2026-05", "Mai"],
    ["2026-06", "Jun"],
    ["2026-07", "Jul"],
    ["2026-08", "Ago"],
    ["2026-09", "Set"],
    ["2026-10", "Oct"],
    ["2026-11", "Nov"],
    ["2026-12", "Des"],
  ];

  const entries = months.map(([key, name]) => ({
    name,
    value: data[key] || 0,
  }));

  const total = entries.reduce((sum, item) => sum + item.value, 0);

  return (
    <ChartCard title={title} icon="▣" totalLabel={`Total: ${total} activitats`}>
      <div className="chartBody">
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={entries} margin={{ top: 22, right: 16, bottom: 18, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="name" tickLine={false} axisLine={false} tick={{ fontSize: 12 }} />
            <YAxis tickLine={false} axisLine={false} />
            <Tooltip />
            <Bar dataKey="value" fill="#2f6fdd" radius={[8, 8, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </ChartCard>
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



function KpiCardClean({ label, value }) {
  return (
    <div className="kpiCard clean">
      <div>
        <div className="kpiValue">{value}</div>
        <div className="kpiLabel">{label}</div>
      </div>
    </div>
  );
}

function CompactRankList({ title, data, icon = "≡", totalLabel = "" }) {
  const entries = toChartEntries(data, 12);
  const max = Math.max(...entries.map((item) => item.value), 1);
  const total = entries.reduce((sum, item) => sum + item.value, 0);

  return (
    <ChartCard title={title} icon={icon} totalLabel={totalLabel || `Total: ${total}`}>
      <div className="compactRankList">
        {entries.map((item) => (
          <div className="compactRankRow" key={item.name}>
            <div className="compactRankTop">
              <span>{item.name || "Sense dades"}</span>
              <b>{item.value}</b>
            </div>
            <div className="compactRankTrack">
              <i style={{ width: `${(item.value / max) * 100}%`, background: item.color }} />
            </div>
          </div>
        ))}
      </div>
    </ChartCard>
  );
}

function ProcedenciaDistrictMap({ title, data }) {
  const districtData = Object.fromEntries(
    Object.entries(data).map(([key, value]) => [String(key).replace(/^\d+\s*/, ""), value])
  );

  return <DistrictOriginMap title={title} data={districtData} />;
}

function DistrictOriginMap({ title, data }) {
  const districts = [
    ["Ciutat Vella", "CV"],
    ["Eixample", "EX"],
    ["Sants-Montjuïc", "SM"],
    ["Les Corts", "LC"],
    ["Sarrià-Sant Gervasi", "SSG"],
    ["Gràcia", "GR"],
    ["Horta-Guinardó", "HG"],
    ["Nou Barris", "NB"],
    ["Sant Andreu", "SA"],
    ["Sant Martí", "ST"],
  ];

  function getValue(name) {
    const normalizedName = name.toLowerCase();
    const found = Object.entries(data).find(([key]) =>
      String(key).toLowerCase().includes(normalizedName) ||
      normalizedName.includes(String(key).toLowerCase())
    );

    return found ? found[1] : 0;
  }

  const total = districts.reduce((sum, [name]) => sum + getValue(name), 0);
  const max = Math.max(...districts.map(([name]) => getValue(name)), 1);

  return (
    <ChartCard title={title} icon="⌖" totalLabel={`Total: ${total} inscripcions`}>
      <div className="districtOriginMap">
        {districts.map(([name, short], index) => {
          const value = getValue(name);
          const intensity = value / max;

          return (
            <div
              key={name}
              className={`originDistrictCell od${index + 1}`}
              style={{ opacity: 0.28 + intensity * 0.72 }}
              title={`${name}: ${value}`}
            >
              <strong>{short}</strong>
              <span>{value}</span>
              <small>{name}</small>
            </div>
          );
        })}
      </div>
    </ChartCard>
  );
}


function SameDistrictDonut({ rows }) {
  const [selectedDistrict, setSelectedDistrict] = useState("global");

  const districtOptions = useMemo(() => {
    return Array.from(
      new Set(
        rows
          .map((row) => row.procedenciaDistricte)
          .filter(Boolean)
          .sort((a, b) => a.localeCompare(b, "ca"))
      )
    );
  }, [rows]);

  const scopedRows = useMemo(() => {
    if (selectedDistrict === "global") return rows;

    const selected = normalizeDistrictForCompare(selectedDistrict);

    return rows.filter((row) => {
      const origen = normalizeDistrictForCompare(row.procedenciaDistricte);
      return origen === selected || origen.includes(selected) || selected.includes(origen);
    });
  }, [rows, selectedDistrict]);

  const data = sameDistrictData(scopedRows);
  const same = data["Mateix districte"] || 0;
  const different = data["Districte diferent"] || 0;
  const noData = data["Sense dades"] || 0;
  const withData = same + different;
  const percent = withData ? Math.round((same / withData) * 100) : 0;

  const title =
    selectedDistrict === "global"
      ? "Visió global"
      : `Procedència: ${selectedDistrict}`;

  return (
    <ChartCard
      title="Mateix districte vs districte diferent"
      icon="⇄"
      totalLabel={`${scopedRows.length} inscripcions`}
    >
      <div className="sameDistrictControls">
        <label>
          <span>Analitzar procedència</span>
          <select value={selectedDistrict} onChange={(e) => setSelectedDistrict(e.target.value)}>
            <option value="global">Global · tots els districtes</option>
            {districtOptions.map((district) => (
              <option key={district} value={district}>
                {district}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="sameDistrictSummary">
        <div>
          <strong>{percent}%</strong>
          <span>{title}</span>
        </div>
        <p>
          {selectedDistrict === "global"
            ? "Compara el districte de procedència de totes les persones inscrites amb el districte on es fa cada activitat."
            : `De les ${scopedRows.length} inscripcions procedents de ${selectedDistrict}, ${same} van a activitats del mateix districte i ${different} a altres districtes.`}
          {noData > 0 ? ` Hi ha ${noData} registres sense dades completes.` : ""}
        </p>
      </div>

      <div className="sameDistrictMiniStats">
        <div>
          <strong>{same}</strong>
          <span>mateix districte</span>
        </div>
        <div>
          <strong>{different}</strong>
          <span>districte diferent</span>
        </div>
        <div>
          <strong>{noData}</strong>
          <span>sense dades</span>
        </div>
      </div>

      <TypeDonut title="" data={data} />
    </ChartCard>
  );
}


function InscripcionsView({ inscripcions }) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");

  const filtered = useMemo(() => {
    return inscripcions.filter((row) => {
      const text = [
        row.id,
        row.idIntern,
        row.idWeb,
        row.titolWeb,
        row.categoria,
        row.districteActivitat,
        row.nom,
        row.cognom,
        row.codiPostal,
        row.procedenciaDistricte,
        row.ciutat,
        row.genere,
        row.esArquitecte,
        row.comEnsConeix,
      ].join(" ").toLowerCase();

      const architectText = row.esArquitecte.toLowerCase();

      const matchesQuery = text.includes(query.toLowerCase());
      const matchesFilter =
        filter === "all" ||
        (filter === "arquitectes" && (architectText.includes("yes") || architectText.includes("sí") || architectText.includes("si"))) ||
        (filter === "bcn" && row.ciutat.toLowerCase().includes("barcelona")) ||
        (filter === "senseProcedencia" && !row.procedenciaDistricte);

      return matchesQuery && matchesFilter;
    });
  }, [inscripcions, query, filter]);

  const totalEntrades = filtered.reduce((sum, row) => sum + (row.entrades || 0), 0);
  const architectData = {
    "Arquitectes": filtered.filter((row) => {
      const text = row.esArquitecte.toLowerCase();
      return text.includes("yes") || text.includes("sí") || text.includes("si");
    }).length,
    "No arquitectes / sense resposta": filtered.filter((row) => {
      const text = row.esArquitecte.toLowerCase();
      return !(text.includes("yes") || text.includes("sí") || text.includes("si"));
    }).length,
  };

  return (
    <>
      <Top
        title="Dades inscripcions"
        subtitle="Visió de les persones inscrites: entrades, perfils, origen del públic i canals d’arribada."
      />

      <div className="stats dashboardStats">
        <KpiCard icon="👥" tone="blue" label="Inscripcions" value={filtered.length} />
        <KpiCardClean label="Entrades" value={totalEntrades} />
        <KpiCard icon="🌐" tone="purple" label="Activitats web" value={uniqueCount(filtered, "idWeb")} />
        <KpiCard icon="📍" tone="yellow" label="Districtes activitat" value={uniqueCount(filtered, "districteActivitat")} />
        <KpiCard icon="⌖" tone="peach" label="Districtes origen" value={uniqueCount(filtered, "procedenciaDistricte")} />
      </div>

      <div className="toolbar activitiesToolbar">
        <div className="activitySearchRow">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar per activitat, nom, procedència, ciutat, districte..."
          />
          <div className="resultsCounter">
            <strong>{filtered.length}</strong>
            <span>{filtered.length === 1 ? "inscripció" : "inscripcions"}</span>
          </div>
        </div>

        <div className="activityFiltersRow">
          <div className="chips">
            {[
              { id: "all", label: "Tot" },
              { id: "arquitectes", label: "Arquitectes" },
              { id: "bcn", label: "Barcelona" },
              { id: "senseProcedencia", label: "Sense procedència" },
            ].map((item) => (
              <button
                key={item.id}
                onClick={() => setFilter(item.id)}
                className={filter === item.id ? "selected" : ""}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="dashboardChartsGrid inscriptionsChartsGrid">
        <TypeDonut title="Inscripcions per categoria" data={countBy(filtered, "categoria")} />
        <TypeDonut title="Perfil arquitecte" data={architectData} />
        <TypeDonut title="Gènere" data={countBy(filtered, "genere")} />
        <DistrictBars title="Inscripcions per districte de l’activitat" data={countBy(filtered, "districteActivitat")} />
        <CompactRankList title="Com ens han conegut?" data={countBy(filtered, "comEnsConeix")} icon="↗" totalLabel={`${filtered.length} respostes`} />
        <CompactRankList title="Inscripcions per ciutat" data={countBy(filtered, "ciutat")} icon="⌂" totalLabel={`${filtered.length} inscripcions`} />
        <ManagerBars title="Procedència per districte dels participants" data={countBy(filtered, "procedenciaDistricte")} />
        <SameDistrictDonut rows={filtered} />
      </div>
    </>
  );
}


function LoginScreen({ userName, setUserName, role, setRole, onEnter }) {
  return (
    <div className="loginScreen">
      <div className="loginCard">
        <BrandMark className="loginBrand" />
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


function getScopedRows(rows, dataScope) {
  if (dataScope === "published") return rows.filter((row) => row.importar);
  if (dataScope === "unpublished") return rows.filter((row) => !row.importar);
  return rows;
}

function getScopeLabel(dataScope) {
  const labels = {
    published: "Publicades",
    unpublished: "No publicades",
    all: "Totes",
  };

  return labels[dataScope] || "Publicades";
}

function DataScopeControl({ dataScope, setDataScope, rows }) {
  const published = rows.filter((row) => row.importar).length;
  const unpublished = rows.length - published;

  return (
    <div className="dataScopeControl">
      <div>
        <span>Mode dades</span>
        <strong>{getScopeLabel(dataScope)}</strong>
      </div>

      <div className="dataScopeButtons">
        <button
          type="button"
          className={dataScope === "published" ? "active" : ""}
          onClick={() => setDataScope("published")}
        >
          Publicades · {published}
        </button>
        <button
          type="button"
          className={dataScope === "unpublished" ? "active" : ""}
          onClick={() => setDataScope("unpublished")}
        >
          No publicades · {unpublished}
        </button>
        <button
          type="button"
          className={dataScope === "all" ? "active" : ""}
          onClick={() => setDataScope("all")}
        >
          Totes · {rows.length}
        </button>
      </div>
    </div>
  );
}






function dateDiffDays(start, end) {
  const a = new Date(`${start}T12:00:00`);
  const b = new Date(`${end}T12:00:00`);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return 0;
  return Math.round((b - a) / 86400000);
}

function getCountdownParts(targetDate, now = new Date()) {
  const target = new Date(targetDate);
  const diff = Math.max(0, target.getTime() - now.getTime());

  const totalSeconds = Math.floor(diff / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  return { totalSeconds, days, hours, minutes, seconds };
}

function pad2(value) {
  return String(value).padStart(2, "0");
}

function getMostActiveEntry(data) {
  return Object.entries(data || {})
    .filter(([name]) => name && name !== "Sense dades" && name !== "Sense districte" && name !== "Sense espai")
    .sort((a, b) => b[1] - a[1])[0] || ["Sense dades", 0];
}

function getDistrictSlug(value) {
  const text = normalizeLooseText(value)
    .replace(/^\d+\s*/, "")
    .replace(/\bde\b/g, "")
    .replace(/\bdel\b/g, "")
    .replace(/\s+/g, " ")
    .trim();

  if (text.includes("ciutat vella")) return "ciutat-vella";
  if (text.includes("eixample")) return "eixample";
  if (text.includes("sants") || text.includes("montjuic")) return "sants-montjuic";
  if (text.includes("les corts") || text.includes("corts")) return "les-corts";
  if (text.includes("sarria") || text.includes("gervasi")) return "sarria-sant-gervasi";
  if (text.includes("gracia")) return "gracia";
  if (text.includes("horta") || text.includes("guinardo")) return "horta-guinardo";
  if (text.includes("nou barris")) return "nou-barris";
  if (text.includes("sant andreu")) return "sant-andreu";
  if (text.includes("sant marti")) return "sant-marti";

  return "ciutat-vella";
}

function getDistrictImagePath(value) {
  return `/assets/temps-capitalitat/districtes/mapa-${getDistrictSlug(value)}.png`;
}

function getMonthShortFromKey(monthKey) {
  if (!monthKey || monthKey === "Sense mes") return "—";
  const month = Number(monthKey.slice(5, 7));
  const labels = ["GEN", "FEB", "MAR", "ABR", "MAI", "JUN", "JUL", "AGO", "SET", "OCT", "NOV", "DES"];
  return labels[Math.max(0, Math.min(11, month - 1))] || monthKey;
}

function getProgramMonthKeys() {
  return ["2026-02", "2026-03", "2026-04", "2026-05", "2026-06", "2026-07", "2026-08", "2026-09", "2026-10", "2026-11", "2026-12"];
}

function cumulativeCompletedSeries(rows) {
  const months = getProgramMonthKeys();
  let total = 0;
  return months.map((month) => {
    total += rows.filter((row) => getMonthKey(row.dataInici) === month).length;
    return { label: getMonthShortFromKey(month), value: total };
  });
}

function pendingSeries(rows) {
  const months = getProgramMonthKeys();
  return months.map((month, index) => {
    const remainingMonths = months.slice(index);
    const value = rows.filter((row) => remainingMonths.includes(getMonthKey(row.dataInici))).length;
    return { label: getMonthShortFromKey(month), value };
  });
}

function inscriptionsByActivityMonth(inscripcions, rows) {
  const byIdWeb = {};
  rows.forEach((row) => {
    if (row.idWeb && !byIdWeb[row.idWeb]) byIdWeb[row.idWeb] = row;
  });

  const months = getProgramMonthKeys().map((month) => ({ label: getMonthShortFromKey(month), value: 0, key: month }));

  inscripcions.forEach((inscripcio) => {
    const activity = byIdWeb[inscripcio.idWeb];
    const month = getMonthKey(activity?.dataInici);
    const item = months.find((entry) => entry.key === month);
    if (item) item.value += inscripcio.entrades || 1;
  });

  return months;
}

function todayHourlySeries(rows) {
  const buckets = [
    { label: "00h", start: 0, end: 6, value: 0 },
    { label: "06h", start: 6, end: 10, value: 0 },
    { label: "10h", start: 10, end: 14, value: 0 },
    { label: "14h", start: 14, end: 18, value: 0 },
    { label: "18h", start: 18, end: 22, value: 0 },
    { label: "24h", start: 22, end: 24, value: 0 },
  ];

  rows.forEach((row) => {
    const minutes = parseTimeToMinutes(row.horaInici);
    if (minutes === null) return;
    const hour = minutes / 60;
    const bucket = buckets.find((entry) => hour >= entry.start && hour < entry.end);
    if (bucket) bucket.value += 1;
  });

  return buckets;
}

function topEntries(data, limit = 5) {
  return Object.entries(data || {})
    .filter(([label]) => label && label !== "Sense dades")
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([label, value]) => ({ label, value }));
}

function smoothPath(points) {
  if (!points.length) return "";
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;
  return points.reduce((path, point, index) => {
    if (index === 0) return `M ${point.x} ${point.y}`;
    const previous = points[index - 1];
    const cx = (previous.x + point.x) / 2;
    return `${path} C ${cx} ${previous.y}, ${cx} ${point.y}, ${point.x} ${point.y}`;
  }, "");
}

function LineChartMini({ data, tone = "blue", descending = false }) {
  const width = 260;
  const height = 110;
  const padX = 12;
  const padY = 16;
  const max = Math.max(1, ...data.map((item) => item.value));
  const min = Math.min(0, ...data.map((item) => item.value));
  const range = Math.max(1, max - min);
  const points = data.map((item, index) => {
    const x = padX + (index / Math.max(1, data.length - 1)) * (width - padX * 2);
    const y = height - padY - ((item.value - min) / range) * (height - padY * 2);
    return { x, y };
  });
  const path = smoothPath(points);
  const areaPath = `${path} L ${width - padX} ${height - padY} L ${padX} ${height - padY} Z`;

  return (
    <svg className={`realMiniChart line ${tone}`} viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
      <path className="area" d={areaPath} />
      <path className="linePath" d={path} />
      {points.map((point, index) => (
        <circle key={index} cx={point.x} cy={point.y} r={index === points.length - 1 ? 4 : 2.6} />
      ))}
      {data.filter((_, index) => index % 2 === 0 || index === data.length - 1).map((item, index) => (
        <text key={`${item.label}-${index}`} x={padX + ((data.findIndex((d) => d.label === item.label) || 0) / Math.max(1, data.length - 1)) * (width - padX * 2)} y={height - 2}>
          {item.label}
        </text>
      ))}
    </svg>
  );
}

function BarChartMini({ data, tone = "pink" }) {
  const max = Math.max(1, ...data.map((item) => item.value));
  return (
    <div className={`realBarChart ${tone}`} aria-hidden="true">
      {data.slice(1).map((item) => {
        const height = Math.max(8, Math.round((item.value / max) * 72));
        return (
          <span key={item.key || item.label}>
            <i style={{ height: `${height}px` }} />
            <b>{item.label}</b>
          </span>
        );
      })}
    </div>
  );
}

function HourlyPulseChart({ data }) {
  const max = Math.max(1, ...data.map((item) => item.value));
  const width = 260;
  const height = 110;
  const points = data.map((item, index) => {
    const x = 12 + (index / Math.max(1, data.length - 1)) * (width - 24);
    const y = height - 20 - (item.value / max) * 72;
    return { x, y };
  });
  const path = smoothPath(points);
  const areaPath = `${path} L ${width - 12} ${height - 20} L 12 ${height - 20} Z`;

  return (
    <svg className="realMiniChart pulse green" viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
      <path className="area" d={areaPath} />
      <path className="linePath" d={path} />
      {points.map((point, index) => (
        <circle key={index} cx={point.x} cy={point.y} r={data[index].value ? 5 : 2.5} />
      ))}
      {data.map((item, index) => (
        <text key={item.label} x={points[index].x} y={height - 2}>{item.label}</text>
      ))}
    </svg>
  );
}

function DonutChart({ data }) {
  const total = data.reduce((sum, item) => sum + item.value, 0) || 1;
  const colors = ["#8B5CF6", "#FF6392", "#FFE45E", "#5AA9E6", "#B9FBC0"];
  let offset = 0;

  return (
    <div className="donutWrap">
      <svg className="donutChart" viewBox="0 0 120 120" aria-hidden="true">
        <circle className="donutBase" cx="60" cy="60" r="42" />
        {data.map((item, index) => {
          const length = (item.value / total) * 264;
          const dash = `${length} ${264 - length}`;
          const strokeDashoffset = -offset;
          offset += length;
          return (
            <circle
              key={item.label}
              className="donutSegment"
              cx="60"
              cy="60"
              r="42"
              stroke={colors[index % colors.length]}
              strokeDasharray={dash}
              strokeDashoffset={strokeDashoffset}
            />
          );
        })}
        <circle className="donutHole" cx="60" cy="60" r="24" />
      </svg>
      <div className="donutLegend">
        {data.map((item, index) => (
          <span key={item.label}>
            <i style={{ background: colors[index % colors.length] }} />
            <b>{item.label}</b>
            <em>{Math.round((item.value / total) * 100)}%</em>
          </span>
        ))}
      </div>
    </div>
  );
}

function TempsConfetti({ particles }) {
  return (
    <div className="tempsConfettiLayer" aria-hidden="true">
      {particles.map((particle) => (
        <i
          key={particle.id}
          style={{
            left: `${particle.x}%`,
            top: `${particle.y}%`,
            transform: `rotate(${particle.r}deg)`,
            background: particle.color,
            animationDuration: `${particle.d}ms`,
          }}
        />
      ))}
    </div>
  );
}

function TempsCapitalitatView({ rows, inscripcions = [], apiSpaces = [] }) {
  const startDate = "2026-02-12";
  const endDate = "2026-12-13";
  const countdownTarget = "2026-12-13T23:59:59";

  const [particles, setParticles] = useState([]);
  const [funMessage, setFunMessage] = useState({
    title: "La ciutat és l’escenari.",
    text: "Mou el ratolí pel comptador o clica les targetes per activar el mode oficina tècnica.",
    tone: "blue",
  });
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const today = toLocalISODate(now);
  const totalDays = Math.max(1, dateDiffDays(startDate, endDate));
  const elapsedDays = Math.max(0, Math.min(totalDays, dateDiffDays(startDate, today)));
  const countdown = getCountdownParts(countdownTarget, now);
  const progress = Math.max(0, Math.min(100, Math.round((elapsedDays / totalDays) * 100)));

  const completedRows = rows.filter((row) => isValidDateString(row.dataInici) && row.dataInici < today);
  const pendingRows = rows.filter((row) => !isValidDateString(row.dataInici) || row.dataInici >= today);
  const activeProgramPercent = rows.length ? Math.round((completedRows.length / rows.length) * 100) : 0;

  const inscriptionsTotal = inscripcions.reduce((sum, row) => sum + (row.entrades || 1), 0);
  const inscriptionsWithActivity = inscripcions.filter((row) => row.idWeb).length;

  const [topSpace, topSpaceValue] = getMostActiveEntry(countBy(rows, "espai"));
  const [topDistrict, topDistrictValue] = getMostActiveEntry(countBy(rows, "districte"));
  const [topCategory, topCategoryValue] = getMostActiveEntry(countBy(rows, "categoria"));

  const todayRows = rows.filter((row) => row.dataInici === today);
  const districtImage = getDistrictImagePath(topDistrict);

  const topDistrictPercent = rows.length ? Math.round((topDistrictValue / rows.length) * 100) : 0;
  const topCategoryPercent = rows.length ? Math.round((topCategoryValue / rows.length) * 100) : 0;

  const completedChart = cumulativeCompletedSeries(completedRows);
  const pendingChart = pendingSeries(pendingRows);
  const inscriptionsChart = inscriptionsByActivityMonth(inscripcions, rows);
  const todayChart = todayHourlySeries(todayRows);
  const categoryTop = topEntries(countBy(rows, "categoria"), 5);

  const derivedSpaces = useMemo(() => buildDerivedSpaces(rows, apiSpaces), [rows, apiSpaces]);
  const topSpaceData = derivedSpaces.find((space) => normalizeSpaceKey(space.title) === normalizeSpaceKey(topSpace)) || findMatchingSpace(topSpace, apiSpaces);
  const topSpaceImage = normalizeImageUrl(topSpaceData?.imatge || topSpaceData?.imatge_galeria || "");

  const colors = ["#5AA9E6", "#7FC8F8", "#FFE45E", "#FF6392", "#B9FBC0", "#CDB4DB"];

  function addConfetti(x = 50, y = 40, amount = 14) {
    const nowStamp = Date.now();
    const newParticles = Array.from({ length: amount }, (_, index) => ({
      id: `${nowStamp}-${index}-${Math.random()}`,
      x: Math.max(4, Math.min(96, x + (Math.random() - 0.5) * 16)),
      y: Math.max(4, Math.min(82, y + (Math.random() - 0.5) * 10)),
      r: Math.round(Math.random() * 360),
      d: 850 + Math.round(Math.random() * 650),
      color: colors[Math.floor(Math.random() * colors.length)],
    }));

    setParticles((current) => [...current.slice(-80), ...newParticles]);
    window.setTimeout(() => {
      setParticles((current) => current.filter((particle) => !newParticles.some((p) => p.id === particle.id)));
    }, 1800);
  }

  function handleHeroMove(event) {
    if (Math.random() > 0.08) return;
    const rect = event.currentTarget.getBoundingClientRect();
    addConfetti(((event.clientX - rect.left) / rect.width) * 100, ((event.clientY - rect.top) / rect.height) * 100, 2);
  }

  function activateMessage(message, x = 50, y = 50) {
    setFunMessage(message);
    addConfetti(x, y, 26);
  }

  const counters = [
    {
      className: "dark",
      label: "Activitats finalitzades",
      value: completedRows.length,
      text: `${activeProgramPercent}% del programa ja ha passat.`,
      chart: <LineChartMini data={completedChart} tone="blue" />,
      tone: "blue",
      message: {
        title: "Tram superat.",
        text: "La línia mostra l’acumulat real d’activitats finalitzades al llarg del cicle.",
        tone: "blue",
      },
    },
    {
      label: "Activitats pendents",
      value: pendingRows.length,
      text: "Encara queda Capitalitat per activar.",
      chart: <LineChartMini data={pendingChart} tone="yellow" descending />,
      tone: "yellow",
      message: {
        title: "Queda Capitalitat.",
        text: "El gràfic baixa mes a mes fins a Santa Llúcia: cada punt és programa pendent.",
        tone: "yellow",
      },
    },
    {
      label: "Inscripcions totals",
      value: inscriptionsTotal,
      text: `${inscriptionsWithActivity} registres vinculats amb ID WEB.`,
      chart: <BarChartMini data={inscriptionsChart} tone="pink" />,
      tone: "pink",
      message: {
        title: "La gent està entrant.",
        text: "Les barres agrupen les inscripcions segons el mes de l’activitat vinculada.",
        tone: "pink",
      },
    },
    {
      label: "Activitat avui",
      value: todayRows.length,
      text: `${uniqueCount(todayRows, "espai")} espais actius avui.`,
      chart: <HourlyPulseChart data={todayChart} />,
      tone: "green",
      message: {
        title: "La ciutat avui batega.",
        text: "La corba mostra les franges horàries amb més activitat durant el dia.",
        tone: "green",
      },
    },
  ];

  return (
    <>
      <Top
        title="Temps de Capitalitat"
        subtitle="Compte enrere, activació del programa i pols cultural entre Santa Eulàlia i Santa Llúcia."
      />

      <section
        className="tempsV2Hero tempsInteractiveHero tempsPreviewHero"
        onMouseMove={handleHeroMove}
        onClick={(event) => {
          const rect = event.currentTarget.getBoundingClientRect();
          activateMessage(
            {
              title: "Mode compte enrere activat.",
              text: `${countdown.days} dies, ${pad2(countdown.hours)} hores, ${pad2(countdown.minutes)} minuts i ${pad2(countdown.seconds)} segons fins a Santa Llúcia.`,
              tone: "pink",
            },
            ((event.clientX - rect.left) / rect.width) * 100,
            ((event.clientY - rect.top) / rect.height) * 100
          );
        }}
      >
        <TempsConfetti particles={particles} />

        <img className="tempsSaintImage left" src="/assets/temps-capitalitat/santa-eulalia.png" alt="Santa Eulàlia" />

        <div className="tempsV2Center">
          <p className="eyebrow">De Santa Eulàlia a Santa Llúcia</p>
          <button
            type="button"
            className="tempsDaysButton tempsCountdownButton"
            onClick={(event) => {
              event.stopPropagation();
              activateMessage({
                title: "Santa Llúcia s’acosta.",
                text: `${progress}% del cicle recorregut. Queden ${countdown.days} dies, ${pad2(countdown.hours)} hores, ${pad2(countdown.minutes)} minuts i ${pad2(countdown.seconds)} segons.`,
                tone: "pink",
              });
            }}
          >
            <span className="countDays">{countdown.days}</span>
            <span className="countUnits">
              <span><b>{pad2(countdown.hours)}</b><em>hores</em></span>
              <span><b>{pad2(countdown.minutes)}</b><em>minuts</em></span>
              <span><b>{pad2(countdown.seconds)}</b><em>segons</em></span>
            </span>
          </button>
          <strong>compte enrere fins al 13 de desembre</strong>

          <div className="tempsV2Progress"><i style={{ width: `${progress}%` }} /></div>
          <div className="tempsV2Dates">
            <span>Santa Eulàlia · febrer</span>
            <b>{progress}% del cicle</b>
            <span>Santa Llúcia · 13 desembre</span>
          </div>
        </div>

        <img className="tempsSaintImage right" src="/assets/temps-capitalitat/santa-llucia.png" alt="Santa Llúcia" />
      </section>

      <section className="tempsV2Counters tempsRealCounters">
        {counters.map((counter, index) => (
          <button
            key={counter.label}
            type="button"
            className={`tempsV2Counter ${counter.className || ""} interactive real ${counter.tone}`}
            onClick={() => activateMessage(counter.message, 22 + index * 18, 55)}
          >
            <span>{counter.label}</span>
            <strong>{counter.value}</strong>
            <p>{counter.text}</p>
            {counter.chart}
          </button>
        ))}
      </section>

      <section className="tempsDashboardGrid">
        <article
          className="tempsDistrictStory interactive"
          onMouseEnter={() =>
            setFunMessage({
              title: `${formatDistrictName(topDistrict)} lidera el mapa.`,
              text: `${topDistrictValue} passis i ${topDistrictPercent}% del programa publicat. El districte guanyador agafa color.`,
              tone: "pink",
            })
          }
        >
          <div className="districtHeadline">
            <p className="eyebrow">Districte més actiu</p>
            <h2>{formatDistrictName(topDistrict)}</h2>
            <p>{topDistrictValue} passis · {topDistrictPercent}% del programa publicat.</p>
          </div>

          <div className="districtMapFrame">
            <img
              src={districtImage}
              alt={`Mapa del districte més actiu: ${topDistrict}`}
              onError={(event) => {
                const fallback = "/assets/temps-capitalitat/districtes/mapa-ciutat-vella.png";
                if (event.currentTarget.src.includes("mapa-ciutat-vella.png")) return;
                event.currentTarget.src = fallback;
              }}
            />
            <div className="mapTooltip">
              <b>{formatDistrictName(topDistrict)}</b>
              <span>{topDistrictValue} passis</span>
              <small>{topDistrictPercent}% del programa</small>
            </div>
          </div>
        </article>

        <aside className="tempsSidePanel">
          <button
            type="button"
            className={`spaceHeroCard ${topSpaceImage ? "hasImage" : ""}`}
            onClick={() =>
              activateMessage({
                title: `${topSpace} és el motor.`,
                text: `${topSpaceValue} passis vinculats. Ara mateix és l’espai més actiu del programa.`,
                tone: "blue",
              }, 76, 62)
            }
          >
            {topSpaceImage && <img src={topSpaceImage} alt={topSpace} referrerPolicy="no-referrer" />}
            <div>
              <p className="eyebrow">Espai més actiu</p>
              <h2>{topSpace}</h2>
              <span>{topSpaceValue} passis vinculats.</span>
            </div>
          </button>

          <button
            type="button"
            className="categoryDonutCard"
            onClick={() =>
              activateMessage({
                title: `${topCategory} domina el programa.`,
                text: `${topCategoryValue} passis i ${topCategoryPercent}% del programa. Una pista clara del pols cultural.`,
                tone: "yellow",
              }, 78, 74)
            }
          >
            <div>
              <p className="eyebrow">Categoria dominant</p>
              <h2>{topCategory}</h2>
              <p>{topCategoryValue} passis · {topCategoryPercent}% del programa.</p>
            </div>
            <DonutChart data={categoryTop} />
          </button>
        </aside>
      </section>

      <section className={`tempsV2Quote ${funMessage.tone}`}>
        <div>
          <span>“</span>
          <h2>{funMessage.title}</h2>
        </div>
        <p>{funMessage.text}</p>
      </section>
    </>
  );
}


function App() {
  const [authenticated, setAuthenticated] = useState(false);
  const [userName, setUserName] = useState("");
  const [role, setRole] = useState("direccio");
  const [rows, setRows] = useState([]);
  const [dataScope, setDataScope] = useState("published");
  const [inscripcions, setInscripcions] = useState([]);
  const [apiSpaces, setApiSpaces] = useState([]);
  const [selectedActivityId, setSelectedActivityId] = useState("");
  const [view, setView] = useState("dashboard");
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("Carregant API...");
  const [error, setError] = useState("");

  const scopedRows = useMemo(() => getScopedRows(rows, dataScope), [rows, dataScope]);

  useEffect(() => {
    Promise.all([
      loadPassisFromIndex(),
      loadInscripcionsFromCsv().catch(() => []),
    ])
      .then(([jsonRows, inscripcionsRowsRaw]) => {
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
              idiomaCatala: row.idioma_catala,
              idiomaCastella: row.idioma_castella,
              idiomaAngles: row.idioma_angles,
              idiomaFrances: row.idioma_frances,
              accessRadioGuia: row.accesibilitat_radioguia,
              accessSubtitulacio: row.accesibilitat_subtitulacio,
              accessLlenguaSignes: row.accesibilitat_llengua_de_signes,
              accessBraille: row.accesibilitat_braille,
              accessLecturaFacil: row.accesibilitat_lectura_facil,
              accessMobilitatReduida: row.accesibilitat_accessible_per_persones_amb_mobilitat_reduida,
              accessDetalls: row.accessibilitat_detalls,
            })
          );

        const inscripcionsNormalitzades = inscripcionsRowsRaw
          .filter((row) => row.id || row.id_intern || row.id_web || row.nom || row.cognom)
          .map(normalizeInscripcio);

        setRows(passis);
        setInscripcions(inscripcionsNormalitzades);
        setApiSpaces([]);

        if (passis[0]) {
          setSelectedActivityId(passis[0]._row || passis[0].idIntern);
        }

        setStatus(`Dades carregades · ${passis.length} activitats · ${inscripcionsNormalitzades.length} inscripcions · carregant espais…`);
        setLoading(false);

        loadEspaisFromCsv()
          .then((espaisRowsRaw) => {
            const espaisNormalitzats = espaisRowsRaw
              .filter((row) => row.title_ca || row.adreca || row.latitud || row.longitud)
              .map(normalizeSpace);

            setApiSpaces(espaisNormalitzats);
            setStatus(`Dades carregades · ${passis.length} activitats · ${inscripcionsNormalitzades.length} inscripcions · ${espaisNormalitzats.length} espais`);
          })
          .catch(() => {
            setStatus(`Dades carregades · ${passis.length} activitats · ${inscripcionsNormalitzades.length} inscripcions · espais pendents`);
          });
      })
      .catch((err) => {
        setError(err.message || "Error carregant dades");
        setStatus("Error dades");
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
          onEnter={() => {
            setView(getDefaultViewForRole(role));
            setAuthenticated(true);
          }}
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
        rows={scopedRows}
        status={status}
        userName={userName}
        role={role}
        onLogout={() => setAuthenticated(false)}
      >
        {error && <div className="notice">⚠ {error}</div>}
        {!canSeeView(role, view) && (
          <div className="notice">Aquest perfil no té accés a aquesta vista. Selecciona una pestanya disponible al menú lateral.</div>
        )}
        {(role === "direccio" || role === "admin") && (
          <DataScopeControl dataScope={dataScope} setDataScope={setDataScope} rows={rows} />
        )}
        {view === "dashboard" && <DashboardView rows={scopedRows} inscripcions={inscripcions} />}
        {view === "temps" && <TempsCapitalitatView rows={scopedRows} inscripcions={inscripcions} apiSpaces={apiSpaces} />}
        {view === "direccio" && canSeeView(role, "direccio") && (
          <DireccioView
            rows={scopedRows}
            allRows={rows}
            dataScope={dataScope}
            inscripcions={inscripcions}
            setView={setView}
            setSelectedActivityId={setSelectedActivityId}
          />
        )}
        {view === "activitats" && (
          <ActivitiesView
            rows={scopedRows}
            setView={setView}
            selectedActivityId={selectedActivityId}
            setSelectedActivityId={setSelectedActivityId}
          />
        )}
        {view === "propostes" && <ProposalsView rows={scopedRows} />}
        {view === "calendari" && (
          <CalendarView
            rows={scopedRows}
            inscripcions={inscripcions}
            setView={setView}
            setSelectedActivityId={setSelectedActivityId}
          />
        )}
        {view === "espais" && (
          <SpacesView
            rows={scopedRows}
            apiSpaces={apiSpaces}
            setView={setView}
            setSelectedActivityId={setSelectedActivityId}
          />
        )}
        {view === "inscripcions" && <InscripcionsView inscripcions={inscripcions} />}
      </Shell>
      <style>{css}</style>
    </>
  );
}

const css = `
@import url('https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600;700;800;900&display=swap');

* { box-sizing: border-box; }
body { margin: 0; font-family: Montserrat, Arial, sans-serif; background: #f7f7f5; color: #111; }
button, input { font: inherit; }
button { cursor: pointer; }
.app { display: grid; grid-template-columns: 280px 1fr; min-height: 100vh; }
.sidebar { background: #fff; border-right: 1px solid #ddd; padding: 30px; position: sticky; top: 0; height: 100vh; }
.brand { display: flex; align-items: flex-start; gap: 10px; font-size: 15px; line-height: 1.05; font-weight: 900; letter-spacing: -0.035em; margin-bottom: 42px; }
.brandLogo { width: 42px; height: auto; flex-shrink: 0; margin-top: 1px; }
.brandText { display: grid; gap: 1px; }
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

.badge.warning { background: #fff0d6; color: #8a5700; }
.tabs { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; background: #f3f3f1; padding: 6px; border-radius: 18px; margin: 20px 0; }
.tabs button { border: 0; background: transparent; border-radius: 13px; padding: 10px 8px; font-weight: 700; color: #666; }
.tabs button.active { background: #111; color: #fff; }
.tabBody { margin-top: 12px; }
.sectionTitle { font-weight: 800; margin: 22px 0 12px; letter-spacing: -0.02em; }
.heroImage { display: flex; flex-direction: column; gap: 10px; align-items: center; }
.heroImage a, .externalLink { color: #111; font-weight: 800; text-decoration: underline; text-underline-offset: 4px; }
.externalLink { display: inline-block; margin-top: 12px; }
.checkList { display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px; margin-top: 10px; }
.checkList span { border-radius: 14px; padding: 11px 12px; font-weight: 700; }
.checkList .good { background: #eaf7ee; color: #146c2e; }
.checkList .bad { background: #fff0d6; color: #8a5700; }


.loginScreen { min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 30px; background: #f7f7f5; }
.loginCard { width: min(560px, 100%); background: #fff; border: 1px solid #ddd; border-radius: 32px; padding: 34px; box-shadow: 0 10px 35px rgba(0,0,0,.05); }
.loginBrand { margin-bottom: 28px; }
.loginCard label { display: block; font-weight: 800; margin: 18px 0 8px; }
.loginCard input { width: 100%; border: 1px solid #ddd; border-radius: 16px; padding: 14px 16px; background: #fafafa; }
.roleGrid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px; }
.roleGrid button { border: 1px solid #ddd; background: #fff; border-radius: 16px; padding: 14px; font-weight: 800; }
.roleGrid button.active { background: #111; color: #fff; border-color: #111; }
.enterButton { width: 100%; border: 0; background: #111; color: #fff; border-radius: 18px; padding: 16px; margin-top: 24px; font-weight: 900; }
.enterButton:disabled { opacity: .35; cursor: not-allowed; }
.loginNote { background: #f3f3f1; border-radius: 18px; padding: 14px; margin-top: 18px; color: #666; font-size: 14px; }
.userBox { border-top: 1px solid #ddd; margin-top: 14px; padding-top: 14px; display: grid; gap: 4px; }
.userBox b { font-size: 15px; }
.userBox small { color: #777; }
.userBox button { margin-top: 8px; border: 1px solid #ddd; background: #fff; border-radius: 12px; padding: 9px 10px; font-weight: 800; }
.quickActions { display: flex; flex-wrap: wrap; gap: 8px; margin: 18px 0 4px; }
.quickActions button { border: 1px solid #ddd; background: #fff; border-radius: 999px; padding: 8px 11px; font-size: 12px; font-weight: 800; }
.quickActions button:hover { background: #111; color: #fff; border-color: #111; }


.clickable { width: 100%; border: 0; background: transparent; text-align: left; cursor: pointer; }
.clickable:hover { background: #f5f5f3; }
.monthMini { display: block; width: 100%; border: 0; background: #fff; border-radius: 10px; padding: 6px 7px; margin-top: 5px; text-align: left; font-size: 11px; line-height: 1.25; white-space: normal; }
.monthMini:hover { background: #111; color: #fff; }
.mapPlaceholder { height: 230px; border-radius: 22px; border: 1px dashed #cfcfca; background: linear-gradient(135deg, #f2f2ef, #fff); display: flex; align-items: center; justify-content: center; text-align: center; color: #777; padding: 20px; margin-top: 16px; }
.clickableRows button { border: 1px solid #eee; background: #fff; border-radius: 12px; padding: 10px 11px; text-align: left; color: #444; font-weight: 650; }
.clickableRows button:hover { background: #111; color: #fff; border-color: #111; }


.kpiCard.clean { justify-content: center; text-align: left; }
.kpiCard.clean .kpiValue { font-size: 34px; }
.inscriptionsChartsGrid { margin-top: 18px; }
.compactRankList { display: flex; flex-direction: column; gap: 13px; padding: 8px 2px 2px; }
.compactRankRow { display: grid; gap: 7px; }
.compactRankTop { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 12px; align-items: center; font-size: 13px; }
.compactRankTop span { overflow: hidden; white-space: nowrap; text-overflow: ellipsis; color: #333; font-weight: 700; }
.compactRankTop b { color: #111; }
.compactRankTrack { height: 9px; border-radius: 999px; background: #ededeb; overflow: hidden; }
.compactRankTrack i { display: block; height: 100%; border-radius: 999px; }
.districtOriginMap { display: grid; grid-template-columns: repeat(5, 1fr); grid-template-rows: repeat(4, 78px); gap: 8px; min-height: 330px; }
.originDistrictCell { background: #2f6fdd; color: #fff; border-radius: 18px; padding: 10px; display: flex; flex-direction: column; justify-content: space-between; min-width: 0; }
.originDistrictCell strong { font-size: 17px; }
.originDistrictCell span { font-size: 23px; font-weight: 900; line-height: 1; }
.originDistrictCell small { font-size: 10px; line-height: 1.05; opacity: .92; }
.originDistrictCell.od1 { grid-column: 3; grid-row: 3; }
.originDistrictCell.od2 { grid-column: 3; grid-row: 2; }
.originDistrictCell.od3 { grid-column: 2; grid-row: 3; }
.originDistrictCell.od4 { grid-column: 1; grid-row: 3; }
.originDistrictCell.od5 { grid-column: 1 / span 2; grid-row: 2; }
.originDistrictCell.od6 { grid-column: 3; grid-row: 1; }
.originDistrictCell.od7 { grid-column: 2 / span 2; grid-row: 1; }
.originDistrictCell.od8 { grid-column: 4; grid-row: 1; }
.originDistrictCell.od9 { grid-column: 4; grid-row: 2; }
.originDistrictCell.od10 { grid-column: 4 / span 2; grid-row: 3; }
.donutWrap .recharts-wrapper { overflow: visible; }
.donutWrap svg { overflow: visible; }


.sameDistrictSummary { display: grid; grid-template-columns: 150px 1fr; gap: 18px; align-items: center; margin-bottom: 10px; }
.sameDistrictSummary strong { display: block; font-size: 44px; line-height: 1; letter-spacing: -0.05em; }
.sameDistrictSummary span { display: block; margin-top: 5px; color: #555; font-weight: 800; font-size: 13px; line-height: 1.2; }
.sameDistrictSummary p { margin: 0; color: #666; font-size: 13px; line-height: 1.35; }
.chartCard .chartCard { border: 0; box-shadow: none; padding: 0; margin: 0; background: transparent; min-height: 0; }
.chartCard .chartCard .chartCardHeader { display: none; }
.chartCard .chartCard .detailLink { display: none; }
.chartCard .chartCard .donutCardBody { margin-top: 0; }


.sameDistrictControls { margin-bottom: 14px; }
.sameDistrictControls label { display: grid; gap: 6px; }
.sameDistrictControls span { color: #666; font-size: 12px; font-weight: 800; }
.sameDistrictControls select { width: 100%; border: 1px solid #ddd; background: #f7f7f5; border-radius: 14px; padding: 11px 12px; font-weight: 800; color: #111; }
.sameDistrictMiniStats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin: 10px 0 14px; }
.sameDistrictMiniStats div { background: #f7f7f5; border: 1px solid #e7e7e2; border-radius: 16px; padding: 10px; }
.sameDistrictMiniStats strong { display: block; font-size: 22px; line-height: 1; letter-spacing: -0.04em; }
.sameDistrictMiniStats span { display: block; color: #666; font-size: 11px; font-weight: 800; margin-top: 5px; line-height: 1.15; }


.spacesLayout { display: grid; grid-template-columns: 430px 1fr; gap: 22px; align-items: start; }
.spacesList { display: flex; flex-direction: column; gap: 12px; max-height: calc(100vh - 280px); overflow: auto; padding-right: 4px; }
.spaceCard { display: grid; grid-template-columns: 88px 1fr; gap: 14px; background: #fff; border: 1px solid #ddd; border-radius: 22px; padding: 14px; text-align: left; transition: .15s ease; }
.spaceCard:hover, .spaceCard.selected { border-color: #111; transform: translateY(-1px); }
.spaceThumb { width: 88px; height: 88px; border-radius: 16px; background: #f0f0ec; overflow: hidden; display: flex; align-items: center; justify-content: center; color: #777; font-size: 11px; text-align: center; }
.spaceThumb img { width: 100%; height: 100%; object-fit: cover; display: block; }
.spaceCard h3 { font-size: 16px; margin: 0 0 5px; }
.spaceCard p { margin: 0 0 6px; font-size: 13px; }
.spaceCard small { color: #666; font-weight: 800; }
.spaceDetailPanel { max-height: calc(100vh - 72px); overflow: auto; }
.spaceHero { height: 240px; }
.spaceDescription { white-space: pre-wrap; line-height: 1.45; }
.osmMap { width: 100%; height: 360px; border: 0; border-radius: 22px; margin-top: 16px; background: #f1f1ed; }
.spaceActivityHeader { margin-bottom: 14px; }
.spaceActivityHeader h3 { margin: 0 0 4px; }
.spaceActivityHeader p { margin: 0; }
.clickableRows button strong { display: block; margin-bottom: 4px; }
.clickableRows button span { display: block; color: inherit; font-weight: 500; line-height: 1.25; }
.spaceTimeline { display: flex; flex-direction: column; gap: 10px; }
.spaceTimeline button { display: grid; grid-template-columns: 112px 1fr; gap: 14px; text-align: left; border: 1px solid #eee; background: #fff; border-radius: 16px; padding: 12px; }
.spaceTimeline button:hover { border-color: #111; background: #f7f7f5; }
.spaceTimeline time { font-weight: 900; color: #111; }
.spaceTimeline strong, .spaceTimeline span { display: block; }
.spaceTimeline span { color: #666; margin-top: 4px; }
.spaceWebLinks { display: flex; flex-wrap: wrap; gap: 12px; margin: 12px 0 18px; }
.spaceGalleryPreview { width: 100%; border-radius: 22px; overflow: hidden; background: #f1f1ed; }
.spaceGalleryPreview img { width: 100%; max-height: 260px; object-fit: cover; display: block; }


.spacesSelectFilters { align-items: end; }
.spacesMapLayout { display: grid; grid-template-columns: minmax(0, 1.35fr) minmax(420px, .65fr); gap: 22px; align-items: start; }
.spacesMapPanel { position: sticky; top: 28px; background: #fff; border: 1px solid #ddd; border-radius: 26px; padding: 14px; box-shadow: 0 1px 0 rgba(0,0,0,.02); }
.spacesMapCanvas { width: 100%; height: calc(100vh - 250px); min-height: 560px; border-radius: 20px; overflow: hidden; background: #f1f1ed; }
.mapHint { display: flex; gap: 6px; align-items: center; color: #666; font-size: 13px; padding: 12px 4px 2px; }
.mapHint strong { color: #111; }
.mapPopup { display: grid; gap: 4px; min-width: 160px; }
.mapPopup strong { font-size: 14px; }
.mapPopup span, .mapPopup small { color: #555; }
.marker-cluster-small, .marker-cluster-medium, .marker-cluster-large { background-color: rgba(47, 111, 221, .18); }
.marker-cluster-small div, .marker-cluster-medium div, .marker-cluster-large div { background-color: rgba(47, 111, 221, .88); color: #fff; font-weight: 900; }


.leaflet-tooltip { border: 0 !important; border-radius: 12px !important; box-shadow: 0 8px 22px rgba(0,0,0,.12) !important; font-weight: 800; line-height: 1.25; padding: 8px 10px !important; }
.leaflet-container { font-family: Montserrat, Arial, sans-serif; }


.spaceMapMarker { background: transparent; border: 0; }
.spaceMapMarker span { display: block; width: 22px; height: 22px; border-radius: 999px; background: #2f6fdd; border: 3px solid #fff; box-shadow: 0 6px 18px rgba(0,0,0,.22); }
.spaceMapMarker.selected span { width: 32px; height: 32px; background: #111; border: 4px solid #fff; box-shadow: 0 8px 26px rgba(0,0,0,.32); }
.mapEmptyPanel { min-height: 360px; display: flex; flex-direction: column; justify-content: center; }
.mapEmptyPanel h2 { font-size: 28px; }
.mapEmptyPanel p { line-height: 1.45; max-width: 360px; }


.spacesMapShell { position: relative; }
.mapNoPoints { position: absolute; inset: 18px; display: flex; align-items: center; justify-content: center; background: rgba(255,255,255,.86); border-radius: 18px; color: #666; font-weight: 800; text-align: center; padding: 20px; pointer-events: none; }
.spaceMapMarker { background: transparent; border: 0; }
.spaceMapMarker span { display: block; width: 22px; height: 22px; border-radius: 999px; background: #2f6fdd; border: 3px solid #fff; box-shadow: 0 6px 18px rgba(0,0,0,.22); }
.spaceMapMarker.selected span { width: 32px; height: 32px; background: #111; border: 4px solid #fff; box-shadow: 0 8px 26px rgba(0,0,0,.32); }
.mapEmptyPanel { min-height: 360px; display: flex; flex-direction: column; justify-content: center; }
.mapEmptyPanel h2 { font-size: 28px; }
.mapEmptyPanel p { line-height: 1.45; max-width: 360px; }


.dashboardFilterPanel { background: #fff; border: 1px solid #ddd; border-radius: 24px; padding: 16px; margin: 0 0 22px; display: grid; gap: 14px; }
.dashboardDateInputs, .dashboardSelectFilters { display: flex; flex-wrap: wrap; gap: 10px; align-items: end; }
.dashboardDateInputs label, .dashboardSelectFilters label { display: grid; gap: 6px; }
.dashboardDateInputs span, .dashboardSelectFilters span { color: #666; font-size: 12px; font-weight: 800; }
.dashboardDateInputs input, .dashboardSelectFilters select { border: 1px solid #ddd; background: #f7f7f5; border-radius: 14px; padding: 11px 12px; font-weight: 800; color: #111; min-width: 160px; }
.resetDashboardFilters { border: 1px solid #111; background: #111; color: #fff; border-radius: 14px; padding: 12px 14px; font-weight: 900; }
.todayPill { border: 1px solid #ddd; background: #fff; border-radius: 999px; padding: 10px 13px; color: #555; font-weight: 800; font-size: 13px; white-space: nowrap; }
.dashboardExtraGrid { margin-top: 18px; }
.districtGapList { display: flex; flex-direction: column; gap: 13px; padding-top: 8px; }
.districtGapHeader { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 10px; align-items: center; font-size: 13px; }
.districtGapHeader strong { overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
.districtGapHeader span { color: #666; font-weight: 800; font-size: 12px; }
.districtGapBars { display: grid; gap: 5px; }
.districtGapBars i, .districtGapBars b { display: block; height: 8px; border-radius: 999px; }
.districtGapBars i { background: #2f6fdd; }
.districtGapBars b { background: #4aa79c; }


.spacesSelectFilters { align-items: end; }
.spacesMapLayout { display: grid; grid-template-columns: minmax(0, 1.35fr) minmax(420px, .65fr); gap: 22px; align-items: start; }
.spacesMapPanel { position: sticky; top: 28px; background: #fff; border: 1px solid #ddd; border-radius: 26px; padding: 14px; box-shadow: 0 1px 0 rgba(0,0,0,.02); overflow: hidden; }
.tileMapShell { position: relative; width: 100%; }
.tileMapCanvas { position: relative; width: 100%; height: calc(100vh - 250px); min-height: 560px; border-radius: 20px; overflow: hidden; background: #e9ece8; }
.tileMapInner { position: absolute; left: 50%; top: 50%; width: 920px; height: 600px; transform: translate(-50%, -50%); }
.tileMapTile { position: absolute; width: 256px; height: 256px; user-select: none; pointer-events: none; filter: grayscale(.15) saturate(.72) brightness(1.04); }
.tileMapControls { position: absolute; z-index: 30; top: 12px; left: 12px; display: flex; align-items: center; gap: 6px; background: rgba(255,255,255,.92); border: 1px solid #ddd; border-radius: 999px; padding: 6px; box-shadow: 0 4px 16px rgba(0,0,0,.08); }
.tileMapControls button { width: 30px; height: 30px; border-radius: 999px; border: 1px solid #ddd; background: #fff; font-weight: 900; }
.tileMapControls span { color: #555; font-size: 12px; font-weight: 900; padding: 0 7px 0 2px; }
.tileMapPoint { position: absolute; z-index: 20; border: 3px solid #fff; border-radius: 999px; background: #2f6fdd; color: #fff; box-shadow: 0 8px 22px rgba(0,0,0,.24); display: grid; place-items: center; padding: 0; font-size: 10px; font-weight: 900; cursor: pointer; transition: transform .12s ease, background .12s ease; }
.tileMapPoint:hover { transform: scale(1.18); z-index: 40; background: #111; }
.tileMapPoint.selected { background: #111; transform: scale(1.22); z-index: 50; }
.tileMapPoint span { line-height: 1; }
.mapHint { display: flex; gap: 6px; align-items: center; color: #666; font-size: 13px; padding: 12px 4px 2px; }
.mapHint strong { color: #111; }
.mapNoPoints { position: absolute; inset: 18px; display: flex; align-items: center; justify-content: center; background: rgba(255,255,255,.88); border-radius: 18px; color: #666; font-weight: 800; text-align: center; padding: 20px; pointer-events: none; z-index: 500; }
.mapEmptyPanel { min-height: 360px; display: flex; flex-direction: column; justify-content: center; }
.mapEmptyPanel h2 { font-size: 28px; }
.mapEmptyPanel p { line-height: 1.45; max-width: 360px; }


.tileMapCanvas.dragging { cursor: grabbing; }
.tileMapCanvas:not(.dragging) { cursor: default; }
.tileMapCtrlHint { position: absolute; z-index: 30; top: 12px; right: 12px; background: rgba(255,255,255,.94); border: 1px solid #ddd; border-radius: 999px; padding: 10px 13px; color: #555; font-size: 12px; font-weight: 800; box-shadow: 0 4px 16px rgba(0,0,0,.08); pointer-events: none; }
.tileMapPoint.cluster { background: #111; border-color: #fff; }
.tileMapPoint.cluster span { font-size: 12px; }


.spacesMapPanel .spacesList,
.spacesMapPanel .spaceCard,
.spacesMapPanel > .spacesList,
.spacesMapPanel > .spaceCard {
  display: none !important;
}

.spacesMapPanel {
  overflow: hidden;
}

.spacesMapPanel .tileMapShell {
  display: block !important;
}


.tileMapControls {
  display: none !important;
}

.tileMapCtrlHint {
  left: 12px;
  right: auto;
}

.tileMapTile {
  filter: grayscale(.08) saturate(.55) brightness(1.05) contrast(.96);
}


.directionGrid { display: grid; grid-template-columns: 420px 1fr; gap: 18px; align-items: start; }
.directionSummary { position: sticky; top: 28px; }
.directionIssueChips { margin-top: 12px; }
.directionIssueList { display: flex; flex-direction: column; gap: 11px; max-height: calc(100vh - 330px); overflow: auto; padding-right: 4px; }
.directionIssueItem { border: 1px solid #e3e3df; background: #fff; border-radius: 18px; padding: 14px; text-align: left; display: grid; grid-template-columns: minmax(0, 1fr) 230px; gap: 14px; transition: .15s ease; }
.directionIssueItem:hover { border-color: #111; transform: translateY(-1px); }
.directionIssueMain h3 { margin: 0 0 5px; font-size: 16px; line-height: 1.2; }
.directionIssueMain p { margin: 0; font-size: 13px; }
.directionIssueTags { display: flex; flex-wrap: wrap; gap: 6px; justify-content: flex-end; align-content: flex-start; }
.directionIssueTags span { background: #fff0d6; border: 1px solid #f0d7a5; color: #8a5700; border-radius: 999px; padding: 5px 8px; font-size: 11px; font-weight: 900; }
.directionToolbar { margin-bottom: 18px; }


.dataScopeControl { background: #111; color: #fff; border-radius: 22px; padding: 12px 14px; margin-bottom: 22px; display: flex; justify-content: space-between; gap: 14px; align-items: center; }
.dataScopeControl span { display: block; color: rgba(255,255,255,.62); font-size: 11px; font-weight: 900; text-transform: uppercase; letter-spacing: .06em; }
.dataScopeControl strong { display: block; font-size: 18px; letter-spacing: -0.03em; }
.dataScopeButtons { display: flex; flex-wrap: wrap; gap: 8px; }
.dataScopeButtons button { border: 1px solid rgba(255,255,255,.25); background: rgba(255,255,255,.08); color: #fff; border-radius: 999px; padding: 8px 11px; font-size: 12px; font-weight: 900; }
.dataScopeButtons button.active { background: #fff; color: #111; border-color: #fff; }
.directionSecondaryStats { margin-top: -10px; }


.agendaView { display: grid; gap: 18px; }
.agendaHero { background: #111; color: #fff; border-radius: 28px; padding: 24px; display: flex; justify-content: space-between; gap: 22px; align-items: center; }
.agendaHero h2 { font-size: 31px; margin: 0 0 8px; }
.agendaHero p { color: rgba(255,255,255,.68); margin: 0; }
.agendaHeroStats { display: grid; grid-template-columns: repeat(3, 110px); gap: 10px; }
.agendaHeroStats div { background: rgba(255,255,255,.1); border: 1px solid rgba(255,255,255,.16); border-radius: 20px; padding: 14px; }
.agendaHeroStats strong { display: block; font-size: 31px; line-height: 1; letter-spacing: -0.04em; }
.agendaHeroStats span { display: block; color: rgba(255,255,255,.66); margin-top: 6px; font-size: 12px; font-weight: 900; }
.agendaAlerts { display: grid; grid-template-columns: repeat(6, 1fr); gap: 10px; }
.agendaAlert { background: #fff; border: 1px solid #ddd; border-radius: 20px; padding: 14px; }
.agendaAlert strong { display: block; font-size: 28px; line-height: 1; letter-spacing: -0.04em; }
.agendaAlert span { display: block; color: #666; margin-top: 6px; font-size: 12px; font-weight: 800; line-height: 1.15; }
.agendaAlert.critical { background: #fff0e9; border-color: #f1c8b8; }
.agendaAlert.review { background: #fff7e6; border-color: #f0d7a5; }
.agendaAlert.ok { background: #eaf7ee; border-color: #bfe2c9; }
.agendaGrid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 18px; align-items: start; }
.agendaSection { background: #fff; border: 1px solid #ddd; border-radius: 24px; padding: 18px; }
.agendaSectionHeader { display: flex; justify-content: space-between; gap: 12px; align-items: center; border-bottom: 1px solid #eee; padding-bottom: 12px; margin-bottom: 12px; }
.agendaSectionHeader div { display: flex; align-items: center; gap: 9px; }
.agendaSectionHeader h2 { margin: 0; font-size: 20px; }
.agendaItems { display: flex; flex-direction: column; gap: 10px; max-height: 560px; overflow: auto; padding-right: 4px; }
.agendaItem { display: grid; grid-template-columns: 62px 1fr; gap: 12px; width: 100%; border: 1px solid #eee; background: #fff; border-radius: 18px; padding: 12px; text-align: left; transition: .15s ease; }
.agendaItem:hover { border-color: #111; transform: translateY(-1px); }
.agendaItem time { font-weight: 950; font-size: 16px; letter-spacing: -0.03em; color: #111; padding-top: 3px; }
.agendaItem.critical { border-left: 5px solid #e35d3d; }
.agendaItem.review { border-left: 5px solid #e0a12a; }
.agendaItem.ok { border-left: 5px solid #38a35a; }
.agendaItemMain h3 { margin: 0 0 5px; font-size: 15px; line-height: 1.2; }
.agendaItemMain p { margin: 0; font-size: 12px; }
.agendaStatus { display: inline-flex; align-items: center; border-radius: 999px; padding: 5px 9px; font-size: 12px; font-weight: 900; }
.agendaStatus.critical { background: #fff0e9; color: #a63b20; }
.agendaStatus.review { background: #fff7e6; color: #8a5700; }
.agendaStatus.ok { background: #eaf7ee; color: #146c2e; }
.agendaMeta { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 8px; color: #666; font-size: 12px; font-weight: 800; }
.agendaIssueTags { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 9px; }
.agendaIssueTags span { background: #fff0d6; border: 1px solid #f0d7a5; color: #8a5700; border-radius: 999px; padding: 5px 8px; font-size: 11px; font-weight: 900; }


.weeklyProgramView { display: grid; gap: 18px; }
.weeklyProgramControls { background: #fff; border: 1px solid #ddd; border-radius: 24px; padding: 18px; display: grid; grid-template-columns: minmax(0, 1fr) auto auto; gap: 16px; align-items: end; }
.weeklyProgramControls h2 { margin: 0 0 6px; font-size: 28px; }
.weeklyProgramControls p { margin: 0; }
.weeklyProgramActions { display: flex; flex-wrap: wrap; gap: 8px; align-items: end; justify-content: flex-end; }
.weeklyProgramActions button, .weeklyExportButtons button { border: 1px solid #ddd; background: #fff; border-radius: 999px; padding: 10px 12px; font-size: 12px; font-weight: 900; }
.weeklyProgramActions button:hover, .weeklyExportButtons button:hover { background: #111; color: #fff; border-color: #111; }
.weeklyProgramActions label { display: grid; gap: 5px; }
.weeklyProgramActions label span { color: #666; font-size: 11px; font-weight: 900; text-transform: uppercase; }
.weeklyProgramActions input { border: 1px solid #ddd; background: #f7f7f5; border-radius: 14px; padding: 10px 12px; font-weight: 800; }
.weeklyExportButtons { display: flex; gap: 7px; align-items: center; justify-content: flex-end; }
.weeklyProgramExportArea { background: #f7f7f5; border-radius: 28px; padding: 24px; border: 1px solid #ddd; }
.weeklyProgramHeader { background: #111; color: #fff; border-radius: 24px; padding: 22px; display: grid; grid-template-columns: auto minmax(0, 1fr) auto; gap: 22px; align-items: center; margin-bottom: 16px; }
.weeklyProgramHeader .brand { color: #fff; margin: 0; }
.weeklyProgramHeader h1 { color: #fff; font-size: 38px; }
.weeklyProgramHeader p { color: rgba(255,255,255,.7); margin: 4px 0 0; }
.weeklyProgramKpis { display: grid; grid-template-columns: repeat(3, 96px); gap: 8px; }
.weeklyProgramKpis div { background: rgba(255,255,255,.1); border: 1px solid rgba(255,255,255,.16); border-radius: 18px; padding: 13px; }
.weeklyProgramKpis strong { display: block; font-size: 28px; line-height: 1; letter-spacing: -0.04em; }
.weeklyProgramKpis span { display: block; color: rgba(255,255,255,.68); font-size: 11px; font-weight: 900; margin-top: 5px; }
.weeklyProgramSummary { display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; margin-bottom: 16px; }
.compactPills { background: #fff; border: 1px solid #ddd; border-radius: 20px; padding: 14px; }
.compactPills > strong { display: block; margin-bottom: 9px; }
.compactPills div { display: flex; flex-wrap: wrap; gap: 6px; }
.compactPills span { background: #efefed; border-radius: 999px; padding: 6px 9px; font-size: 11px; font-weight: 900; color: #555; }
.weeklyDaysGrid { display: grid; grid-template-columns: repeat(7, minmax(190px, 1fr)); gap: 10px; align-items: stretch; }
.weeklyDayCard { background: #fff; border: 1px solid #ddd; border-radius: 20px; padding: 12px; min-height: 360px; }
.weeklyDayHeader { border-bottom: 1px solid #eee; padding-bottom: 10px; margin-bottom: 10px; }
.weeklyDayHeader strong { display: block; font-size: 14px; line-height: 1.2; }
.weeklyDayHeader span { display: block; color: #666; font-size: 12px; font-weight: 800; margin-top: 3px; }
.weeklyDayItems { display: flex; flex-direction: column; gap: 8px; }
.weeklyProgramItem { border: 1px solid #eee; background: #fafafa; border-radius: 14px; padding: 9px; display: grid; grid-template-columns: 42px 1fr; gap: 8px; text-align: left; }
.weeklyProgramItem:hover { border-color: #111; background: #fff; }
.weeklyProgramItem time { font-weight: 950; font-size: 12px; letter-spacing: -0.03em; }
.weeklyProgramItem h3 { font-size: 12px; line-height: 1.15; margin: 0 0 4px; }
.weeklyProgramItem p { font-size: 11px; line-height: 1.2; margin: 0 0 4px; }
.weeklyProgramItem small { color: #777; font-size: 10px; line-height: 1.2; display: block; }
.weeklyEmpty { background: #f3f3f1; color: #777; border-radius: 14px; padding: 12px; font-size: 12px; font-weight: 800; text-align: center; }


.barcelonaLivePanel { background: #fff; border: 1px solid #ddd; border-radius: 28px; padding: 20px; margin-bottom: 22px; }
.barcelonaLiveHeader { display: flex; justify-content: space-between; gap: 18px; align-items: flex-start; margin-bottom: 16px; }
.barcelonaLiveHeader h2 { margin: 0 0 6px; font-size: 30px; letter-spacing: -0.04em; }
.barcelonaLiveHeader p { margin: 0; color: #666; }
.liveNowBadge { background: #111; color: #fff; border-radius: 20px; padding: 14px 18px; min-width: 120px; text-align: right; }
.liveNowBadge span { display: block; color: rgba(255,255,255,.65); font-size: 11px; font-weight: 900; text-transform: uppercase; }
.liveNowBadge strong { display: block; font-size: 26px; line-height: 1; letter-spacing: -0.04em; margin-top: 5px; }
.liveKpis { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-bottom: 16px; }
.liveKpis div { background: #f7f7f5; border: 1px solid #eee; border-radius: 20px; padding: 15px; }
.liveKpis strong { display: block; font-size: 32px; line-height: 1; letter-spacing: -0.05em; }
.liveKpis span { display: block; color: #666; font-size: 12px; font-weight: 900; margin-top: 6px; }
.liveContentGrid { display: grid; grid-template-columns: minmax(0, 1fr) minmax(320px, .8fr) minmax(0, 1fr); gap: 14px; }
.liveBlock { border: 1px solid #eee; background: #fafafa; border-radius: 22px; padding: 15px; min-height: 230px; }
.liveBlock.featured { background: #111; color: #fff; }
.liveBlockHeader { display: flex; justify-content: space-between; gap: 10px; align-items: center; margin-bottom: 11px; }
.liveBlockHeader h3 { margin: 0; font-size: 18px; }
.liveList { display: flex; flex-direction: column; gap: 9px; }
.liveMiniCard { display: grid; grid-template-columns: 50px 1fr; gap: 10px; border: 1px solid #eee; background: #fff; border-radius: 16px; padding: 11px; }
.liveMiniCard time { font-weight: 950; font-size: 14px; letter-spacing: -0.03em; }
.liveMiniCard h4 { margin: 0 0 4px; font-size: 13px; line-height: 1.2; }
.liveMiniCard p { margin: 0 0 3px; color: #555; font-size: 12px; }
.liveMiniCard small { color: #777; font-size: 11px; font-weight: 800; }
.nextActivityCard { display: grid; gap: 9px; }
.nextActivityCard time { display: inline-flex; width: fit-content; background: #fff; color: #111; border-radius: 999px; padding: 8px 11px; font-size: 18px; font-weight: 950; letter-spacing: -0.04em; }
.nextActivityCard h3 { margin: 0; font-size: 24px; line-height: 1.1; color: #fff; }
.nextActivityCard p { margin: 0; color: rgba(255,255,255,.72); }
.nextActivityCard .agendaMeta { color: rgba(255,255,255,.75); }
.liveEmpty { background: #fff; border: 1px dashed #ddd; border-radius: 16px; padding: 18px; color: #666; font-weight: 800; }
.liveBlock.featured .liveEmpty { background: rgba(255,255,255,.08); border-color: rgba(255,255,255,.18); color: rgba(255,255,255,.7); }


:root {
  --cma-cool-sky: #5AA9E6;
  --cma-sky-blue: #7FC8F8;
  --cma-bright-snow: #F9F9F9;
  --cma-royal-gold: #FFE45E;
  --cma-rose-kiss: #FF6392;
  --cma-ink: #111111;
  --cma-soft-border: #dedede;
}

body {
  background:
    radial-gradient(circle at 12% 8%, rgba(127, 200, 248, .22), transparent 26%),
    radial-gradient(circle at 88% 3%, rgba(255, 99, 146, .16), transparent 24%),
    radial-gradient(circle at 70% 88%, rgba(255, 228, 94, .17), transparent 26%),
    var(--cma-bright-snow);
}

.sidebar {
  background: rgba(255,255,255,.86);
  backdrop-filter: blur(18px);
}

.sidebar nav button.active {
  background: linear-gradient(135deg, var(--cma-cool-sky), var(--cma-sky-blue));
  color: #fff;
}

.sidebar nav button:hover {
  background: rgba(90, 169, 230, .12);
}

.kpiIcon.blue { background: rgba(90,169,230,.22); color: #1f78b7; }
.kpiIcon.green { background: rgba(185,251,192,.42); color: #23703a; }
.kpiIcon.purple { background: rgba(205,180,219,.42); color: #6f4c84; }
.kpiIcon.yellow { background: rgba(255,228,94,.42); color: #8a6a00; }
.kpiIcon.peach { background: rgba(255,99,146,.22); color: #b72d61; }

.resultsCounter,
.dateRangePill,
.todayPill,
.chartTotal,
.badge,
.liveNowBadge,
.dataScopeControl,
.agendaHero,
.weeklyProgramHeader {
  box-shadow: 0 8px 26px rgba(90,169,230,.08);
}

.resultsCounter {
  background: #111;
  color: #fff;
}

.chips button.selected,
.tabs button.active,
.exportButtons button:hover,
.weeklyProgramActions button:hover,
.weeklyExportButtons button:hover,
.activityExportControls button:hover {
  background: linear-gradient(135deg, var(--cma-cool-sky), var(--cma-rose-kiss));
  color: #fff;
  border-color: transparent;
}

.chartCard,
.kpiCard,
.toolbar,
.panel,
.spaceCard,
.agendaSection,
.weeklyProgramControls,
.weeklyProgramExportArea,
.barcelonaLivePanel,
.dashboardFilterPanel {
  border-color: rgba(17,17,17,.10);
  box-shadow: 0 10px 28px rgba(17,17,17,.035);
}

.chartCardHeader .chartTitle span {
  background: rgba(127,200,248,.18);
  color: #1f78b7;
  border-radius: 999px;
  width: 30px;
  height: 30px;
  display: inline-grid;
  place-items: center;
}

.barcelonaLivePanel {
  background:
    linear-gradient(135deg, rgba(255,255,255,.96), rgba(249,249,249,.96)),
    radial-gradient(circle at 10% 0%, rgba(127,200,248,.22), transparent 32%),
    radial-gradient(circle at 100% 12%, rgba(255,99,146,.16), transparent 30%);
}

.liveNowBadge,
.dataScopeControl,
.agendaHero,
.weeklyProgramHeader,
.liveBlock.featured {
  background:
    radial-gradient(circle at 12% 20%, rgba(90,169,230,.36), transparent 34%),
    radial-gradient(circle at 90% 5%, rgba(255,99,146,.32), transparent 31%),
    #111;
}

.liveKpis div:nth-child(1),
.agendaAlert.ok,
.compactPills span:nth-child(4n+1) {
  background: rgba(90,169,230,.14);
}

.liveKpis div:nth-child(2),
.compactPills span:nth-child(4n+2) {
  background: rgba(127,200,248,.18);
}

.liveKpis div:nth-child(3),
.agendaAlert.review,
.compactPills span:nth-child(4n+3) {
  background: rgba(255,228,94,.22);
}

.liveKpis div:nth-child(4),
.agendaAlert.critical,
.compactPills span:nth-child(4n+4) {
  background: rgba(255,99,146,.16);
}

.tileMapPoint {
  background: var(--cma-rose-kiss);
}

.tileMapPoint.cluster {
  background: var(--cma-cool-sky);
}

.compactRankTrack i,
.districtGapBars i {
  background: linear-gradient(90deg, var(--cma-cool-sky), var(--cma-sky-blue)) !important;
}

.districtGapBars b {
  background: linear-gradient(90deg, var(--cma-royal-gold), var(--cma-rose-kiss)) !important;
}

.agendaStatus.critical,
.directionIssueTags span,
.agendaIssueTags span {
  background: rgba(255,99,146,.14);
  border-color: rgba(255,99,146,.28);
  color: #9f1f50;
}

.agendaStatus.review {
  background: rgba(255,228,94,.24);
  color: #7d6200;
}

.agendaStatus.ok {
  background: rgba(185,251,192,.38);
  color: #1e6b36;
}

.weeklyProgramItem:hover,
.agendaItem:hover,
.directionIssueItem:hover,
.spaceCard:hover {
  border-color: var(--cma-cool-sky);
  box-shadow: 0 10px 24px rgba(90,169,230,.13);
}

.weeklyProgramHeader .brand,
.agendaHero .eyebrow,
.barcelonaLivePanel .eyebrow {
  color: #fff;
}


.barcelona2026Welcome {
  position: relative;
  overflow: hidden;
  background:
    radial-gradient(circle at 12% 20%, rgba(255,228,94,.55), transparent 26%),
    radial-gradient(circle at 88% 10%, rgba(255,99,146,.34), transparent 30%),
    linear-gradient(135deg, #5AA9E6, #7FC8F8);
  color: #fff;
  border-radius: 30px;
  padding: 26px;
  margin-bottom: 22px;
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(300px, .6fr);
  gap: 22px;
  align-items: center;
  box-shadow: 0 18px 42px rgba(90,169,230,.22);
}

.barcelona2026Welcome::after {
  content: "";
  position: absolute;
  inset: -80px -120px auto auto;
  width: 260px;
  height: 260px;
  border-radius: 999px;
  background: rgba(255,255,255,.2);
  filter: blur(4px);
}

.barcelona2026Welcome h2 {
  position: relative;
  margin: 0 0 9px;
  color: #fff;
  font-size: clamp(30px, 4vw, 52px);
  line-height: .95;
  letter-spacing: -0.06em;
}

.barcelona2026Welcome p {
  position: relative;
  margin: 0;
  color: rgba(255,255,255,.86);
  font-size: 16px;
  line-height: 1.35;
}

.barcelona2026Welcome p strong {
  color: #fff;
}

.welcomeNext {
  position: relative;
  background: rgba(255,255,255,.18);
  border: 1px solid rgba(255,255,255,.3);
  border-radius: 24px;
  padding: 18px;
  backdrop-filter: blur(12px);
}

.welcomeNext span {
  display: block;
  color: rgba(255,255,255,.72);
  font-size: 11px;
  font-weight: 950;
  text-transform: uppercase;
  letter-spacing: .06em;
  margin-bottom: 8px;
}

.welcomeNext strong {
  display: block;
  font-size: 21px;
  line-height: 1.12;
  letter-spacing: -0.035em;
}

.welcomeNext small {
  display: block;
  color: rgba(255,255,255,.76);
  margin-top: 10px;
  font-weight: 800;
}


.catalogLayout { display: grid; grid-template-columns: minmax(0, 1fr) minmax(440px, .55fr); gap: 22px; align-items: start; }
.catalogGrid { display: grid; grid-template-columns: repeat(auto-fill, minmax(270px, 1fr)); gap: 16px; }
.catalogCard { background: #fff; border: 1px solid rgba(17,17,17,.10); border-radius: 26px; overflow: hidden; text-align: left; display: flex; flex-direction: column; min-height: 430px; box-shadow: 0 10px 28px rgba(17,17,17,.035); transition: .16s ease; }
.catalogCard:hover, .catalogCard.selected { transform: translateY(-2px); border-color: var(--cma-cool-sky); box-shadow: 0 16px 34px rgba(90,169,230,.16); }
.catalogImage { height: 170px; background: linear-gradient(135deg, rgba(90,169,230,.18), rgba(255,99,146,.12)); display: grid; place-items: center; color: #777; font-weight: 900; }
.catalogImage img { width: 100%; height: 100%; object-fit: cover; display: block; }
.catalogBody { padding: 16px; display: flex; flex-direction: column; gap: 10px; flex: 1; }
.catalogBody h3 { margin: 0; font-size: 19px; line-height: 1.08; letter-spacing: -0.035em; }
.catalogBody p { margin: 0; color: #555; font-size: 13px; line-height: 1.35; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }
.catalogMeta { display: grid; gap: 5px; color: #666; font-size: 12px; font-weight: 800; margin-top: auto; }
.catalogFooter { border-top: 1px solid #eee; padding-top: 11px; display: flex; justify-content: space-between; gap: 12px; align-items: center; font-size: 12px; color: #666; font-weight: 900; }
.catalogFooter strong { color: var(--cma-rose-kiss); }


body, button, input, select, textarea { font-family: Montserrat, Arial, sans-serif; }

.tempsHero { position: relative; display: grid; grid-template-columns: 220px minmax(0, 1fr) 220px; gap: 22px; align-items: stretch; background: #fff; border: 1px solid rgba(17,17,17,.10); border-radius: 34px; padding: 24px; box-shadow: 0 12px 34px rgba(17,17,17,.04); overflow: hidden; }
.tempsHero::before { content: ""; position: absolute; inset: 0; background: radial-gradient(circle at 15% 10%, rgba(127,200,248,.18), transparent 28%), radial-gradient(circle at 86% 18%, rgba(255,99,146,.12), transparent 30%), radial-gradient(circle at 50% 90%, rgba(255,228,94,.18), transparent 34%); pointer-events: none; }
.saintFigure { position: relative; z-index: 1; border: 1px solid #e7e7e2; background: rgba(255,255,255,.7); border-radius: 28px; padding: 18px; display: flex; flex-direction: column; justify-content: space-between; min-height: 360px; }
.saintFigure strong { display: block; font-size: 18px; letter-spacing: -0.04em; }
.saintFigure span { color: #666; font-size: 12px; font-weight: 800; }
.saintDrawing { position: relative; height: 270px; filter: grayscale(1); opacity: .78; }
.saintDrawing * { position: absolute; left: 50%; transform: translateX(-50%); border: 3px solid #111; }
.saintHalo { top: 12px; width: 96px; height: 96px; border-radius: 999px; border-width: 2px; }
.saintHead { top: 56px; width: 54px; height: 62px; border-radius: 45%; background: #fff; }
.saintBody { top: 122px; width: 96px; height: 128px; border-radius: 48px 48px 16px 16px; background: #fff; }
.saintCape { top: 132px; width: 150px; height: 126px; border-radius: 80px 80px 18px 18px; border-top-color: transparent; background: transparent; }
.saintPalm { top: 72px; left: 68%; width: 4px; height: 160px; border-width: 0 0 0 3px; transform: rotate(-18deg); }
.saintPalm::after { content: ""; position: absolute; top: -4px; left: -28px; width: 58px; height: 42px; border: 2px solid #111; border-bottom: 0; border-radius: 100% 100% 0 0; transform: rotate(24deg); }
.tempsCenter { position: relative; z-index: 1; text-align: center; display: flex; flex-direction: column; justify-content: center; padding: 26px; }
.tempsCenter h2 { font-size: clamp(92px, 14vw, 190px); line-height: .8; margin: 0; letter-spacing: -0.09em; color: #111; }
.tempsCenter > span { color: #555; font-size: 18px; font-weight: 900; margin-top: 12px; }
.tempsProgress { height: 18px; background: #efefed; border-radius: 999px; overflow: hidden; margin: 32px 0 12px; border: 1px solid #ddd; }
.tempsProgress i { display: block; height: 100%; background: linear-gradient(90deg, var(--cma-cool-sky), var(--cma-royal-gold), var(--cma-rose-kiss)); border-radius: inherit; }
.tempsDates { display: flex; justify-content: space-between; gap: 12px; color: #777; font-weight: 900; font-size: 12px; text-transform: uppercase; }
.tempsDates strong { color: #111; }
.tempsBigCounters { display: grid; grid-template-columns: 1.35fr 1fr 1fr 1fr; gap: 14px; margin: 18px 0; }
.tempsCounterCard { background: #fff; border: 1px solid rgba(17,17,17,.10); border-radius: 28px; padding: 20px; box-shadow: 0 10px 28px rgba(17,17,17,.035); min-height: 190px; display: flex; flex-direction: column; justify-content: space-between; }
.tempsCounterCard.main { background: radial-gradient(circle at 10% 10%, rgba(255,228,94,.42), transparent 34%), radial-gradient(circle at 90% 30%, rgba(127,200,248,.35), transparent 34%), #111; color: #fff; }
.tempsCounterCard span { color: #666; font-size: 12px; font-weight: 950; text-transform: uppercase; letter-spacing: .05em; }
.tempsCounterCard.main span, .tempsCounterCard.main p { color: rgba(255,255,255,.72); }
.tempsCounterCard strong { display: block; font-size: clamp(48px, 7vw, 92px); line-height: .85; letter-spacing: -0.08em; }
.tempsCounterCard p { margin: 0; color: #666; font-weight: 700; }
.tempsInsightGrid { display: grid; grid-template-columns: 1.45fr 1fr 1fr; gap: 14px; }
.tempsInsightCard { background: #fff; border: 1px solid rgba(17,17,17,.10); border-radius: 28px; padding: 20px; min-height: 260px; box-shadow: 0 10px 28px rgba(17,17,17,.035); }
.tempsInsightCard h2 { font-size: 32px; line-height: 1; letter-spacing: -0.055em; margin: 0 0 10px; }
.tempsInsightCard p { margin: 0; }
.tempsInsightCard.district { display: grid; grid-template-columns: .9fr 1.1fr; gap: 18px; align-items: center; }
.tempsMiniMap { height: 250px; display: grid; grid-template-columns: repeat(4, 1fr); grid-template-rows: repeat(5, 1fr); gap: 6px; transform: rotate(-2deg); }
.tempsMapCell { border: 1px solid #ddd; background: #f4f4f0; border-radius: 12px; display: grid; place-items: center; padding: 4px; text-align: center; color: #999; font-size: 8px; font-weight: 900; line-height: 1; }
.tempsMapCell.active { background: linear-gradient(135deg, var(--cma-cool-sky), var(--cma-rose-kiss)); color: #fff; border-color: transparent; box-shadow: 0 12px 28px rgba(90,169,230,.24); transform: scale(1.08); }
.tm-d1 { grid-column: 2; grid-row: 4; } .tm-d2 { grid-column: 2 / 4; grid-row: 3; } .tm-d3 { grid-column: 1 / 3; grid-row: 5; } .tm-d4 { grid-column: 1; grid-row: 4; } .tm-d5 { grid-column: 1 / 3; grid-row: 2; } .tm-d6 { grid-column: 3; grid-row: 2; } .tm-d7 { grid-column: 2 / 4; grid-row: 1; } .tm-d8 { grid-column: 4; grid-row: 1 / 3; } .tm-d9 { grid-column: 4; grid-row: 3; } .tm-d10 { grid-column: 4; grid-row: 4 / 6; }
.tempsMessage { margin-top: 18px; background: radial-gradient(circle at 12% 20%, rgba(255,228,94,.34), transparent 30%), linear-gradient(135deg, #5AA9E6, #7FC8F8); color: #fff; border-radius: 30px; padding: 26px; }
.tempsMessage h2 { color: #fff; font-size: clamp(28px, 4vw, 54px); line-height: .95; letter-spacing: -0.065em; margin: 0 0 10px; }
.tempsMessage p { color: rgba(255,255,255,.78); margin: 0; font-weight: 800; }

@media (max-width: 1000px) {

  .tempsHero { grid-template-columns: 1fr; }
  .saintFigure { min-height: 260px; }
  .tempsBigCounters { grid-template-columns: 1fr; }
  .tempsInsightGrid { grid-template-columns: 1fr; }
  .tempsInsightCard.district { grid-template-columns: 1fr; }

  .app { grid-template-columns: 1fr; }
  .sidebar { position: static; height: auto; }
  .sideMeta { position: static; margin-top: 24px; }
  .split, .spaceGrid, .dashboardGrid { grid-template-columns: 1fr; }
  .stats { grid-template-columns: repeat(2, 1fr); }
  .panel { position: static; }

  .spacesLayout { grid-template-columns: 1fr; }
  .spacesList { max-height: none; }
  .spaceDetailPanel { max-height: none; }

  .directionGrid { grid-template-columns: 1fr; }
  .directionSummary { position: static; }
  .directionIssueList { max-height: none; }
  .directionIssueItem { grid-template-columns: 1fr; }
  .directionIssueTags { justify-content: flex-start; }

  .dataScopeControl { align-items: flex-start; flex-direction: column; }

  .agendaHero { flex-direction: column; align-items: stretch; }
  .agendaHeroStats { grid-template-columns: repeat(3, 1fr); }
  .agendaAlerts { grid-template-columns: repeat(2, 1fr); }
  .agendaGrid { grid-template-columns: 1fr; }
  .agendaItems { max-height: none; }

  .weeklyProgramControls { grid-template-columns: 1fr; }
  .weeklyProgramActions, .weeklyExportButtons { justify-content: flex-start; }
  .weeklyProgramHeader { grid-template-columns: 1fr; }
  .weeklyProgramKpis { grid-template-columns: repeat(3, 1fr); }
  .weeklyProgramSummary { grid-template-columns: 1fr; }
  .weeklyDaysGrid { grid-template-columns: 1fr; }
  .weeklyDayCard { min-height: auto; }

  .barcelonaLiveHeader { flex-direction: column; }
  .liveNowBadge { text-align: left; }
  .liveKpis { grid-template-columns: repeat(2, 1fr); }
  .liveContentGrid { grid-template-columns: 1fr; }

  .barcelona2026Welcome { grid-template-columns: 1fr; }

  .spacesMapLayout { grid-template-columns: 1fr; }
  .spacesMapPanel { position: static; }
  .tileMapCanvas { height: 520px; min-height: 420px; }

  .spacesMapLayout { grid-template-columns: 1fr; }
  .spacesMapPanel { position: static; }
  .spacesMapCanvas { height: 520px; min-height: 420px; }

  .dashboardVisualGrid { grid-template-columns: 1fr; }
  .pieLayout { grid-template-columns: 1fr; justify-items: center; }
  .monthDashboard { grid-template-columns: repeat(2, 1fr); }
  .districtMap { grid-template-columns: repeat(2, 1fr); grid-template-rows: none; }
  .districtCell, .districtCell.d1, .districtCell.d2, .districtCell.d3, .districtCell.d4, .districtCell.d5, .districtCell.d6, .districtCell.d7, .districtCell.d8, .districtCell.d9, .districtCell.d10 { grid-column: auto; grid-row: auto; }
}


/* Dashboard mockup style */
.dashboardExportArea { width: 100%; }
.dashboardTopControls { display: flex; align-items: center; justify-content: flex-end; gap: 12px; flex-wrap: wrap; }
.dateRangePill, .exportButtons { background: #fff; border: 1px solid #ddd; border-radius: 12px; min-height: 42px; display: inline-flex; align-items: center; box-shadow: 0 1px 0 rgba(0,0,0,.02); }
.dateRangePill { padding: 0 14px; font-size: 13px; color: #333; white-space: nowrap; }
.exportButtons { overflow: hidden; }
.exportButtons button { border: 0; border-right: 1px solid #eee; background: #fff; padding: 0 13px; height: 42px; font-weight: 800; font-size: 12px; }
.exportButtons button:last-child { border-right: 0; }
.exportButtons button:hover { background: #f3f3f1; }
.exportButtons button:disabled { opacity: .55; cursor: wait; }
.dashboardStats { grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 16px; margin: 26px 0 18px; }
.kpiCard { background: #fff; border: 1px solid #ddd; border-radius: 22px; padding: 22px; min-height: 100px; display: flex; align-items: center; gap: 18px; box-shadow: 0 10px 24px rgba(0,0,0,.045); }
.kpiIcon { width: 62px; height: 62px; border-radius: 50%; display: grid; place-items: center; font-size: 26px; flex-shrink: 0; }
.kpiIcon.blue { background: #dfeeff; }
.kpiIcon.green { background: #ddf4e6; }
.kpiIcon.purple { background: #e7e2ff; }
.kpiIcon.yellow { background: #fff0c6; }
.kpiIcon.peach { background: #ffe1d5; }
.kpiValue { font-size: 31px; font-weight: 900; line-height: 1; letter-spacing: -0.04em; }
.kpiLabel { color: #555; margin-top: 7px; font-size: 15px; }
.dashboardChartsGrid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 18px; }
.chartCard { background: #fff; border: 1px solid #ddd; border-radius: 22px; padding: 22px; min-height: 360px; box-shadow: 0 10px 24px rgba(0,0,0,.045); position: relative; }
.chartCardHeader { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; margin-bottom: 12px; }
.chartTitle { display: flex; align-items: center; gap: 10px; }
.chartTitle > span { width: 24px; height: 24px; display: grid; place-items: center; color: #333; font-size: 20px; }
.chartTitle h2 { margin: 0; font-size: 20px; }
.chartTotal { background: #f3f3f1; border: 1px solid #eee; border-radius: 999px; padding: 7px 11px; font-size: 12px; color: #555; white-space: nowrap; }
.chartBody { height: 300px; }
.donutCardBody { display: grid; grid-template-columns: 300px 1fr; gap: 24px; align-items: center; min-height: 290px; }
.donutWrap { position: relative; height: 260px; }
.donutCenter {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -40%);
  text-align: center;
}
.donutCenter strong { display: block; font-size: 28px; line-height: 1; }
.donutCenter span { display: block; margin-top: 5px; color: #555; font-size: 13px; }
.donutLegend { display: grid; gap: 10px; }
.donutLegendRow { display: grid; grid-template-columns: 12px minmax(120px, 1fr) 42px 42px; gap: 9px; align-items: center; font-size: 13px; }
.donutLegendRow i { width: 10px; height: 10px; border-radius: 50%; }
.donutLegendRow b, .donutLegendRow em { text-align: right; font-style: normal; font-weight: 800; }
.donutLegendRow em { color: #555; }
.detailLink { position: absolute; right: 22px; bottom: 18px; border: 0; background: transparent; color: #1d5fd0; font-weight: 800; padding: 0; font-size: 13px; }
.recharts-cartesian-axis-tick-value { fill: #555; }
.recharts-default-tooltip { border-radius: 12px !important; border-color: #ddd !important; }
@media (max-width: 1280px) { .donutCardBody { grid-template-columns: 1fr; } .donutWrap { max-width: 320px; width: 100%; margin: 0 auto; } }

.kpiCard.clean { justify-content: center; text-align: left; }
.kpiCard.clean .kpiValue { font-size: 34px; }
.inscriptionsChartsGrid { margin-top: 18px; }
.compactRankList { display: flex; flex-direction: column; gap: 13px; padding: 8px 2px 2px; }
.compactRankRow { display: grid; gap: 7px; }
.compactRankTop { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 12px; align-items: center; font-size: 13px; }
.compactRankTop span { overflow: hidden; white-space: nowrap; text-overflow: ellipsis; color: #333; font-weight: 700; }
.compactRankTop b { color: #111; }
.compactRankTrack { height: 9px; border-radius: 999px; background: #ededeb; overflow: hidden; }
.compactRankTrack i { display: block; height: 100%; border-radius: 999px; }
.districtOriginMap { display: grid; grid-template-columns: repeat(5, 1fr); grid-template-rows: repeat(4, 78px); gap: 8px; min-height: 330px; }
.originDistrictCell { background: #2f6fdd; color: #fff; border-radius: 18px; padding: 10px; display: flex; flex-direction: column; justify-content: space-between; min-width: 0; }
.originDistrictCell strong { font-size: 17px; }
.originDistrictCell span { font-size: 23px; font-weight: 900; line-height: 1; }
.originDistrictCell small { font-size: 10px; line-height: 1.05; opacity: .92; }
.originDistrictCell.od1 { grid-column: 3; grid-row: 3; }
.originDistrictCell.od2 { grid-column: 3; grid-row: 2; }
.originDistrictCell.od3 { grid-column: 2; grid-row: 3; }
.originDistrictCell.od4 { grid-column: 1; grid-row: 3; }
.originDistrictCell.od5 { grid-column: 1 / span 2; grid-row: 2; }
.originDistrictCell.od6 { grid-column: 3; grid-row: 1; }
.originDistrictCell.od7 { grid-column: 2 / span 2; grid-row: 1; }
.originDistrictCell.od8 { grid-column: 4; grid-row: 1; }
.originDistrictCell.od9 { grid-column: 4; grid-row: 2; }
.originDistrictCell.od10 { grid-column: 4 / span 2; grid-row: 3; }
.donutWrap .recharts-wrapper { overflow: visible; }
.donutWrap svg { overflow: visible; }


.sameDistrictSummary { display: grid; grid-template-columns: 150px 1fr; gap: 18px; align-items: center; margin-bottom: 10px; }
.sameDistrictSummary strong { display: block; font-size: 44px; line-height: 1; letter-spacing: -0.05em; }
.sameDistrictSummary span { display: block; margin-top: 5px; color: #555; font-weight: 800; font-size: 13px; line-height: 1.2; }
.sameDistrictSummary p { margin: 0; color: #666; font-size: 13px; line-height: 1.35; }
.chartCard .chartCard { border: 0; box-shadow: none; padding: 0; margin: 0; background: transparent; min-height: 0; }
.chartCard .chartCard .chartCardHeader { display: none; }
.chartCard .chartCard .detailLink { display: none; }
.chartCard .chartCard .donutCardBody { margin-top: 0; }


.sameDistrictControls { margin-bottom: 14px; }
.sameDistrictControls label { display: grid; gap: 6px; }
.sameDistrictControls span { color: #666; font-size: 12px; font-weight: 800; }
.sameDistrictControls select { width: 100%; border: 1px solid #ddd; background: #f7f7f5; border-radius: 14px; padding: 11px 12px; font-weight: 800; color: #111; }
.sameDistrictMiniStats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin: 10px 0 14px; }
.sameDistrictMiniStats div { background: #f7f7f5; border: 1px solid #e7e7e2; border-radius: 16px; padding: 10px; }
.sameDistrictMiniStats strong { display: block; font-size: 22px; line-height: 1; letter-spacing: -0.04em; }
.sameDistrictMiniStats span { display: block; color: #666; font-size: 11px; font-weight: 800; margin-top: 5px; line-height: 1.15; }


.spacesLayout { display: grid; grid-template-columns: 430px 1fr; gap: 22px; align-items: start; }
.spacesList { display: flex; flex-direction: column; gap: 12px; max-height: calc(100vh - 280px); overflow: auto; padding-right: 4px; }
.spaceCard { display: grid; grid-template-columns: 88px 1fr; gap: 14px; background: #fff; border: 1px solid #ddd; border-radius: 22px; padding: 14px; text-align: left; transition: .15s ease; }
.spaceCard:hover, .spaceCard.selected { border-color: #111; transform: translateY(-1px); }
.spaceThumb { width: 88px; height: 88px; border-radius: 16px; background: #f0f0ec; overflow: hidden; display: flex; align-items: center; justify-content: center; color: #777; font-size: 11px; text-align: center; }
.spaceThumb img { width: 100%; height: 100%; object-fit: cover; display: block; }
.spaceCard h3 { font-size: 16px; margin: 0 0 5px; }
.spaceCard p { margin: 0 0 6px; font-size: 13px; }
.spaceCard small { color: #666; font-weight: 800; }
.spaceDetailPanel { max-height: calc(100vh - 72px); overflow: auto; }
.spaceHero { height: 240px; }
.spaceDescription { white-space: pre-wrap; line-height: 1.45; }
.osmMap { width: 100%; height: 360px; border: 0; border-radius: 22px; margin-top: 16px; background: #f1f1ed; }
.spaceActivityHeader { margin-bottom: 14px; }
.spaceActivityHeader h3 { margin: 0 0 4px; }
.spaceActivityHeader p { margin: 0; }
.clickableRows button strong { display: block; margin-bottom: 4px; }
.clickableRows button span { display: block; color: inherit; font-weight: 500; line-height: 1.25; }
.spaceTimeline { display: flex; flex-direction: column; gap: 10px; }
.spaceTimeline button { display: grid; grid-template-columns: 112px 1fr; gap: 14px; text-align: left; border: 1px solid #eee; background: #fff; border-radius: 16px; padding: 12px; }
.spaceTimeline button:hover { border-color: #111; background: #f7f7f5; }
.spaceTimeline time { font-weight: 900; color: #111; }
.spaceTimeline strong, .spaceTimeline span { display: block; }
.spaceTimeline span { color: #666; margin-top: 4px; }
.spaceWebLinks { display: flex; flex-wrap: wrap; gap: 12px; margin: 12px 0 18px; }
.spaceGalleryPreview { width: 100%; border-radius: 22px; overflow: hidden; background: #f1f1ed; }
.spaceGalleryPreview img { width: 100%; max-height: 260px; object-fit: cover; display: block; }


.spacesSelectFilters { align-items: end; }
.spacesMapLayout { display: grid; grid-template-columns: minmax(0, 1.35fr) minmax(420px, .65fr); gap: 22px; align-items: start; }
.spacesMapPanel { position: sticky; top: 28px; background: #fff; border: 1px solid #ddd; border-radius: 26px; padding: 14px; box-shadow: 0 1px 0 rgba(0,0,0,.02); }
.spacesMapCanvas { width: 100%; height: calc(100vh - 250px); min-height: 560px; border-radius: 20px; overflow: hidden; background: #f1f1ed; }
.mapHint { display: flex; gap: 6px; align-items: center; color: #666; font-size: 13px; padding: 12px 4px 2px; }
.mapHint strong { color: #111; }
.mapPopup { display: grid; gap: 4px; min-width: 160px; }
.mapPopup strong { font-size: 14px; }
.mapPopup span, .mapPopup small { color: #555; }
.marker-cluster-small, .marker-cluster-medium, .marker-cluster-large { background-color: rgba(47, 111, 221, .18); }
.marker-cluster-small div, .marker-cluster-medium div, .marker-cluster-large div { background-color: rgba(47, 111, 221, .88); color: #fff; font-weight: 900; }


.leaflet-tooltip { border: 0 !important; border-radius: 12px !important; box-shadow: 0 8px 22px rgba(0,0,0,.12) !important; font-weight: 800; line-height: 1.25; padding: 8px 10px !important; }
.leaflet-container { font-family: Montserrat, Arial, sans-serif; }


.spaceMapMarker { background: transparent; border: 0; }
.spaceMapMarker span { display: block; width: 22px; height: 22px; border-radius: 999px; background: #2f6fdd; border: 3px solid #fff; box-shadow: 0 6px 18px rgba(0,0,0,.22); }
.spaceMapMarker.selected span { width: 32px; height: 32px; background: #111; border: 4px solid #fff; box-shadow: 0 8px 26px rgba(0,0,0,.32); }
.mapEmptyPanel { min-height: 360px; display: flex; flex-direction: column; justify-content: center; }
.mapEmptyPanel h2 { font-size: 28px; }
.mapEmptyPanel p { line-height: 1.45; max-width: 360px; }


.spacesMapShell { position: relative; }
.mapNoPoints { position: absolute; inset: 18px; display: flex; align-items: center; justify-content: center; background: rgba(255,255,255,.86); border-radius: 18px; color: #666; font-weight: 800; text-align: center; padding: 20px; pointer-events: none; }
.spaceMapMarker { background: transparent; border: 0; }
.spaceMapMarker span { display: block; width: 22px; height: 22px; border-radius: 999px; background: #2f6fdd; border: 3px solid #fff; box-shadow: 0 6px 18px rgba(0,0,0,.22); }
.spaceMapMarker.selected span { width: 32px; height: 32px; background: #111; border: 4px solid #fff; box-shadow: 0 8px 26px rgba(0,0,0,.32); }
.mapEmptyPanel { min-height: 360px; display: flex; flex-direction: column; justify-content: center; }
.mapEmptyPanel h2 { font-size: 28px; }
.mapEmptyPanel p { line-height: 1.45; max-width: 360px; }


.dashboardFilterPanel { background: #fff; border: 1px solid #ddd; border-radius: 24px; padding: 16px; margin: 0 0 22px; display: grid; gap: 14px; }
.dashboardDateInputs, .dashboardSelectFilters { display: flex; flex-wrap: wrap; gap: 10px; align-items: end; }
.dashboardDateInputs label, .dashboardSelectFilters label { display: grid; gap: 6px; }
.dashboardDateInputs span, .dashboardSelectFilters span { color: #666; font-size: 12px; font-weight: 800; }
.dashboardDateInputs input, .dashboardSelectFilters select { border: 1px solid #ddd; background: #f7f7f5; border-radius: 14px; padding: 11px 12px; font-weight: 800; color: #111; min-width: 160px; }
.resetDashboardFilters { border: 1px solid #111; background: #111; color: #fff; border-radius: 14px; padding: 12px 14px; font-weight: 900; }
.todayPill { border: 1px solid #ddd; background: #fff; border-radius: 999px; padding: 10px 13px; color: #555; font-weight: 800; font-size: 13px; white-space: nowrap; }
.dashboardExtraGrid { margin-top: 18px; }
.districtGapList { display: flex; flex-direction: column; gap: 13px; padding-top: 8px; }
.districtGapHeader { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 10px; align-items: center; font-size: 13px; }
.districtGapHeader strong { overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
.districtGapHeader span { color: #666; font-weight: 800; font-size: 12px; }
.districtGapBars { display: grid; gap: 5px; }
.districtGapBars i, .districtGapBars b { display: block; height: 8px; border-radius: 999px; }
.districtGapBars i { background: #2f6fdd; }
.districtGapBars b { background: #4aa79c; }


.spacesSelectFilters { align-items: end; }
.spacesMapLayout { display: grid; grid-template-columns: minmax(0, 1.35fr) minmax(420px, .65fr); gap: 22px; align-items: start; }
.spacesMapPanel { position: sticky; top: 28px; background: #fff; border: 1px solid #ddd; border-radius: 26px; padding: 14px; box-shadow: 0 1px 0 rgba(0,0,0,.02); overflow: hidden; }
.tileMapShell { position: relative; width: 100%; }
.tileMapCanvas { position: relative; width: 100%; height: calc(100vh - 250px); min-height: 560px; border-radius: 20px; overflow: hidden; background: #e9ece8; }
.tileMapInner { position: absolute; left: 50%; top: 50%; width: 920px; height: 600px; transform: translate(-50%, -50%); }
.tileMapTile { position: absolute; width: 256px; height: 256px; user-select: none; pointer-events: none; filter: grayscale(.15) saturate(.72) brightness(1.04); }
.tileMapControls { position: absolute; z-index: 30; top: 12px; left: 12px; display: flex; align-items: center; gap: 6px; background: rgba(255,255,255,.92); border: 1px solid #ddd; border-radius: 999px; padding: 6px; box-shadow: 0 4px 16px rgba(0,0,0,.08); }
.tileMapControls button { width: 30px; height: 30px; border-radius: 999px; border: 1px solid #ddd; background: #fff; font-weight: 900; }
.tileMapControls span { color: #555; font-size: 12px; font-weight: 900; padding: 0 7px 0 2px; }
.tileMapPoint { position: absolute; z-index: 20; border: 3px solid #fff; border-radius: 999px; background: #2f6fdd; color: #fff; box-shadow: 0 8px 22px rgba(0,0,0,.24); display: grid; place-items: center; padding: 0; font-size: 10px; font-weight: 900; cursor: pointer; transition: transform .12s ease, background .12s ease; }
.tileMapPoint:hover { transform: scale(1.18); z-index: 40; background: #111; }
.tileMapPoint.selected { background: #111; transform: scale(1.22); z-index: 50; }
.tileMapPoint span { line-height: 1; }
.mapHint { display: flex; gap: 6px; align-items: center; color: #666; font-size: 13px; padding: 12px 4px 2px; }
.mapHint strong { color: #111; }
.mapNoPoints { position: absolute; inset: 18px; display: flex; align-items: center; justify-content: center; background: rgba(255,255,255,.88); border-radius: 18px; color: #666; font-weight: 800; text-align: center; padding: 20px; pointer-events: none; z-index: 500; }
.mapEmptyPanel { min-height: 360px; display: flex; flex-direction: column; justify-content: center; }
.mapEmptyPanel h2 { font-size: 28px; }
.mapEmptyPanel p { line-height: 1.45; max-width: 360px; }


.tileMapCanvas.dragging { cursor: grabbing; }
.tileMapCanvas:not(.dragging) { cursor: default; }
.tileMapCtrlHint { position: absolute; z-index: 30; top: 12px; right: 12px; background: rgba(255,255,255,.94); border: 1px solid #ddd; border-radius: 999px; padding: 10px 13px; color: #555; font-size: 12px; font-weight: 800; box-shadow: 0 4px 16px rgba(0,0,0,.08); pointer-events: none; }
.tileMapPoint.cluster { background: #111; border-color: #fff; }
.tileMapPoint.cluster span { font-size: 12px; }


.spacesMapPanel .spacesList,
.spacesMapPanel .spaceCard,
.spacesMapPanel > .spacesList,
.spacesMapPanel > .spaceCard {
  display: none !important;
}

.spacesMapPanel {
  overflow: hidden;
}

.spacesMapPanel .tileMapShell {
  display: block !important;
}


.tileMapControls {
  display: none !important;
}

.tileMapCtrlHint {
  left: 12px;
  right: auto;
}

.tileMapTile {
  filter: grayscale(.08) saturate(.55) brightness(1.05) contrast(.96);
}


.directionGrid { display: grid; grid-template-columns: 420px 1fr; gap: 18px; align-items: start; }
.directionSummary { position: sticky; top: 28px; }
.directionIssueChips { margin-top: 12px; }
.directionIssueList { display: flex; flex-direction: column; gap: 11px; max-height: calc(100vh - 330px); overflow: auto; padding-right: 4px; }
.directionIssueItem { border: 1px solid #e3e3df; background: #fff; border-radius: 18px; padding: 14px; text-align: left; display: grid; grid-template-columns: minmax(0, 1fr) 230px; gap: 14px; transition: .15s ease; }
.directionIssueItem:hover { border-color: #111; transform: translateY(-1px); }
.directionIssueMain h3 { margin: 0 0 5px; font-size: 16px; line-height: 1.2; }
.directionIssueMain p { margin: 0; font-size: 13px; }
.directionIssueTags { display: flex; flex-wrap: wrap; gap: 6px; justify-content: flex-end; align-content: flex-start; }
.directionIssueTags span { background: #fff0d6; border: 1px solid #f0d7a5; color: #8a5700; border-radius: 999px; padding: 5px 8px; font-size: 11px; font-weight: 900; }
.directionToolbar { margin-bottom: 18px; }


.dataScopeControl { background: #111; color: #fff; border-radius: 22px; padding: 12px 14px; margin-bottom: 22px; display: flex; justify-content: space-between; gap: 14px; align-items: center; }
.dataScopeControl span { display: block; color: rgba(255,255,255,.62); font-size: 11px; font-weight: 900; text-transform: uppercase; letter-spacing: .06em; }
.dataScopeControl strong { display: block; font-size: 18px; letter-spacing: -0.03em; }
.dataScopeButtons { display: flex; flex-wrap: wrap; gap: 8px; }
.dataScopeButtons button { border: 1px solid rgba(255,255,255,.25); background: rgba(255,255,255,.08); color: #fff; border-radius: 999px; padding: 8px 11px; font-size: 12px; font-weight: 900; }
.dataScopeButtons button.active { background: #fff; color: #111; border-color: #fff; }
.directionSecondaryStats { margin-top: -10px; }


.agendaView { display: grid; gap: 18px; }
.agendaHero { background: #111; color: #fff; border-radius: 28px; padding: 24px; display: flex; justify-content: space-between; gap: 22px; align-items: center; }
.agendaHero h2 { font-size: 31px; margin: 0 0 8px; }
.agendaHero p { color: rgba(255,255,255,.68); margin: 0; }
.agendaHeroStats { display: grid; grid-template-columns: repeat(3, 110px); gap: 10px; }
.agendaHeroStats div { background: rgba(255,255,255,.1); border: 1px solid rgba(255,255,255,.16); border-radius: 20px; padding: 14px; }
.agendaHeroStats strong { display: block; font-size: 31px; line-height: 1; letter-spacing: -0.04em; }
.agendaHeroStats span { display: block; color: rgba(255,255,255,.66); margin-top: 6px; font-size: 12px; font-weight: 900; }
.agendaAlerts { display: grid; grid-template-columns: repeat(6, 1fr); gap: 10px; }
.agendaAlert { background: #fff; border: 1px solid #ddd; border-radius: 20px; padding: 14px; }
.agendaAlert strong { display: block; font-size: 28px; line-height: 1; letter-spacing: -0.04em; }
.agendaAlert span { display: block; color: #666; margin-top: 6px; font-size: 12px; font-weight: 800; line-height: 1.15; }
.agendaAlert.critical { background: #fff0e9; border-color: #f1c8b8; }
.agendaAlert.review { background: #fff7e6; border-color: #f0d7a5; }
.agendaAlert.ok { background: #eaf7ee; border-color: #bfe2c9; }
.agendaGrid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 18px; align-items: start; }
.agendaSection { background: #fff; border: 1px solid #ddd; border-radius: 24px; padding: 18px; }
.agendaSectionHeader { display: flex; justify-content: space-between; gap: 12px; align-items: center; border-bottom: 1px solid #eee; padding-bottom: 12px; margin-bottom: 12px; }
.agendaSectionHeader div { display: flex; align-items: center; gap: 9px; }
.agendaSectionHeader h2 { margin: 0; font-size: 20px; }
.agendaItems { display: flex; flex-direction: column; gap: 10px; max-height: 560px; overflow: auto; padding-right: 4px; }
.agendaItem { display: grid; grid-template-columns: 62px 1fr; gap: 12px; width: 100%; border: 1px solid #eee; background: #fff; border-radius: 18px; padding: 12px; text-align: left; transition: .15s ease; }
.agendaItem:hover { border-color: #111; transform: translateY(-1px); }
.agendaItem time { font-weight: 950; font-size: 16px; letter-spacing: -0.03em; color: #111; padding-top: 3px; }
.agendaItem.critical { border-left: 5px solid #e35d3d; }
.agendaItem.review { border-left: 5px solid #e0a12a; }
.agendaItem.ok { border-left: 5px solid #38a35a; }
.agendaItemMain h3 { margin: 0 0 5px; font-size: 15px; line-height: 1.2; }
.agendaItemMain p { margin: 0; font-size: 12px; }
.agendaStatus { display: inline-flex; align-items: center; border-radius: 999px; padding: 5px 9px; font-size: 12px; font-weight: 900; }
.agendaStatus.critical { background: #fff0e9; color: #a63b20; }
.agendaStatus.review { background: #fff7e6; color: #8a5700; }
.agendaStatus.ok { background: #eaf7ee; color: #146c2e; }
.agendaMeta { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 8px; color: #666; font-size: 12px; font-weight: 800; }
.agendaIssueTags { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 9px; }
.agendaIssueTags span { background: #fff0d6; border: 1px solid #f0d7a5; color: #8a5700; border-radius: 999px; padding: 5px 8px; font-size: 11px; font-weight: 900; }


.weeklyProgramView { display: grid; gap: 18px; }
.weeklyProgramControls { background: #fff; border: 1px solid #ddd; border-radius: 24px; padding: 18px; display: grid; grid-template-columns: minmax(0, 1fr) auto auto; gap: 16px; align-items: end; }
.weeklyProgramControls h2 { margin: 0 0 6px; font-size: 28px; }
.weeklyProgramControls p { margin: 0; }
.weeklyProgramActions { display: flex; flex-wrap: wrap; gap: 8px; align-items: end; justify-content: flex-end; }
.weeklyProgramActions button, .weeklyExportButtons button { border: 1px solid #ddd; background: #fff; border-radius: 999px; padding: 10px 12px; font-size: 12px; font-weight: 900; }
.weeklyProgramActions button:hover, .weeklyExportButtons button:hover { background: #111; color: #fff; border-color: #111; }
.weeklyProgramActions label { display: grid; gap: 5px; }
.weeklyProgramActions label span { color: #666; font-size: 11px; font-weight: 900; text-transform: uppercase; }
.weeklyProgramActions input { border: 1px solid #ddd; background: #f7f7f5; border-radius: 14px; padding: 10px 12px; font-weight: 800; }
.weeklyExportButtons { display: flex; gap: 7px; align-items: center; justify-content: flex-end; }
.weeklyProgramExportArea { background: #f7f7f5; border-radius: 28px; padding: 24px; border: 1px solid #ddd; }
.weeklyProgramHeader { background: #111; color: #fff; border-radius: 24px; padding: 22px; display: grid; grid-template-columns: auto minmax(0, 1fr) auto; gap: 22px; align-items: center; margin-bottom: 16px; }
.weeklyProgramHeader .brand { color: #fff; margin: 0; }
.weeklyProgramHeader h1 { color: #fff; font-size: 38px; }
.weeklyProgramHeader p { color: rgba(255,255,255,.7); margin: 4px 0 0; }
.weeklyProgramKpis { display: grid; grid-template-columns: repeat(3, 96px); gap: 8px; }
.weeklyProgramKpis div { background: rgba(255,255,255,.1); border: 1px solid rgba(255,255,255,.16); border-radius: 18px; padding: 13px; }
.weeklyProgramKpis strong { display: block; font-size: 28px; line-height: 1; letter-spacing: -0.04em; }
.weeklyProgramKpis span { display: block; color: rgba(255,255,255,.68); font-size: 11px; font-weight: 900; margin-top: 5px; }
.weeklyProgramSummary { display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; margin-bottom: 16px; }
.compactPills { background: #fff; border: 1px solid #ddd; border-radius: 20px; padding: 14px; }
.compactPills > strong { display: block; margin-bottom: 9px; }
.compactPills div { display: flex; flex-wrap: wrap; gap: 6px; }
.compactPills span { background: #efefed; border-radius: 999px; padding: 6px 9px; font-size: 11px; font-weight: 900; color: #555; }
.weeklyDaysGrid { display: grid; grid-template-columns: repeat(7, minmax(190px, 1fr)); gap: 10px; align-items: stretch; }
.weeklyDayCard { background: #fff; border: 1px solid #ddd; border-radius: 20px; padding: 12px; min-height: 360px; }
.weeklyDayHeader { border-bottom: 1px solid #eee; padding-bottom: 10px; margin-bottom: 10px; }
.weeklyDayHeader strong { display: block; font-size: 14px; line-height: 1.2; }
.weeklyDayHeader span { display: block; color: #666; font-size: 12px; font-weight: 800; margin-top: 3px; }
.weeklyDayItems { display: flex; flex-direction: column; gap: 8px; }
.weeklyProgramItem { border: 1px solid #eee; background: #fafafa; border-radius: 14px; padding: 9px; display: grid; grid-template-columns: 42px 1fr; gap: 8px; text-align: left; }
.weeklyProgramItem:hover { border-color: #111; background: #fff; }
.weeklyProgramItem time { font-weight: 950; font-size: 12px; letter-spacing: -0.03em; }
.weeklyProgramItem h3 { font-size: 12px; line-height: 1.15; margin: 0 0 4px; }
.weeklyProgramItem p { font-size: 11px; line-height: 1.2; margin: 0 0 4px; }
.weeklyProgramItem small { color: #777; font-size: 10px; line-height: 1.2; display: block; }
.weeklyEmpty { background: #f3f3f1; color: #777; border-radius: 14px; padding: 12px; font-size: 12px; font-weight: 800; text-align: center; }


.barcelonaLivePanel { background: #fff; border: 1px solid #ddd; border-radius: 28px; padding: 20px; margin-bottom: 22px; }
.barcelonaLiveHeader { display: flex; justify-content: space-between; gap: 18px; align-items: flex-start; margin-bottom: 16px; }
.barcelonaLiveHeader h2 { margin: 0 0 6px; font-size: 30px; letter-spacing: -0.04em; }
.barcelonaLiveHeader p { margin: 0; color: #666; }
.liveNowBadge { background: #111; color: #fff; border-radius: 20px; padding: 14px 18px; min-width: 120px; text-align: right; }
.liveNowBadge span { display: block; color: rgba(255,255,255,.65); font-size: 11px; font-weight: 900; text-transform: uppercase; }
.liveNowBadge strong { display: block; font-size: 26px; line-height: 1; letter-spacing: -0.04em; margin-top: 5px; }
.liveKpis { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-bottom: 16px; }
.liveKpis div { background: #f7f7f5; border: 1px solid #eee; border-radius: 20px; padding: 15px; }
.liveKpis strong { display: block; font-size: 32px; line-height: 1; letter-spacing: -0.05em; }
.liveKpis span { display: block; color: #666; font-size: 12px; font-weight: 900; margin-top: 6px; }
.liveContentGrid { display: grid; grid-template-columns: minmax(0, 1fr) minmax(320px, .8fr) minmax(0, 1fr); gap: 14px; }
.liveBlock { border: 1px solid #eee; background: #fafafa; border-radius: 22px; padding: 15px; min-height: 230px; }
.liveBlock.featured { background: #111; color: #fff; }
.liveBlockHeader { display: flex; justify-content: space-between; gap: 10px; align-items: center; margin-bottom: 11px; }
.liveBlockHeader h3 { margin: 0; font-size: 18px; }
.liveList { display: flex; flex-direction: column; gap: 9px; }
.liveMiniCard { display: grid; grid-template-columns: 50px 1fr; gap: 10px; border: 1px solid #eee; background: #fff; border-radius: 16px; padding: 11px; }
.liveMiniCard time { font-weight: 950; font-size: 14px; letter-spacing: -0.03em; }
.liveMiniCard h4 { margin: 0 0 4px; font-size: 13px; line-height: 1.2; }
.liveMiniCard p { margin: 0 0 3px; color: #555; font-size: 12px; }
.liveMiniCard small { color: #777; font-size: 11px; font-weight: 800; }
.nextActivityCard { display: grid; gap: 9px; }
.nextActivityCard time { display: inline-flex; width: fit-content; background: #fff; color: #111; border-radius: 999px; padding: 8px 11px; font-size: 18px; font-weight: 950; letter-spacing: -0.04em; }
.nextActivityCard h3 { margin: 0; font-size: 24px; line-height: 1.1; color: #fff; }
.nextActivityCard p { margin: 0; color: rgba(255,255,255,.72); }
.nextActivityCard .agendaMeta { color: rgba(255,255,255,.75); }
.liveEmpty { background: #fff; border: 1px dashed #ddd; border-radius: 16px; padding: 18px; color: #666; font-weight: 800; }
.liveBlock.featured .liveEmpty { background: rgba(255,255,255,.08); border-color: rgba(255,255,255,.18); color: rgba(255,255,255,.7); }


:root {
  --cma-cool-sky: #5AA9E6;
  --cma-sky-blue: #7FC8F8;
  --cma-bright-snow: #F9F9F9;
  --cma-royal-gold: #FFE45E;
  --cma-rose-kiss: #FF6392;
  --cma-ink: #111111;
  --cma-soft-border: #dedede;
}

body {
  background:
    radial-gradient(circle at 12% 8%, rgba(127, 200, 248, .22), transparent 26%),
    radial-gradient(circle at 88% 3%, rgba(255, 99, 146, .16), transparent 24%),
    radial-gradient(circle at 70% 88%, rgba(255, 228, 94, .17), transparent 26%),
    var(--cma-bright-snow);
}

.sidebar {
  background: rgba(255,255,255,.86);
  backdrop-filter: blur(18px);
}

.sidebar nav button.active {
  background: linear-gradient(135deg, var(--cma-cool-sky), var(--cma-sky-blue));
  color: #fff;
}

.sidebar nav button:hover {
  background: rgba(90, 169, 230, .12);
}

.kpiIcon.blue { background: rgba(90,169,230,.22); color: #1f78b7; }
.kpiIcon.green { background: rgba(185,251,192,.42); color: #23703a; }
.kpiIcon.purple { background: rgba(205,180,219,.42); color: #6f4c84; }
.kpiIcon.yellow { background: rgba(255,228,94,.42); color: #8a6a00; }
.kpiIcon.peach { background: rgba(255,99,146,.22); color: #b72d61; }

.resultsCounter,
.dateRangePill,
.todayPill,
.chartTotal,
.badge,
.liveNowBadge,
.dataScopeControl,
.agendaHero,
.weeklyProgramHeader {
  box-shadow: 0 8px 26px rgba(90,169,230,.08);
}

.resultsCounter {
  background: #111;
  color: #fff;
}

.chips button.selected,
.tabs button.active,
.exportButtons button:hover,
.weeklyProgramActions button:hover,
.weeklyExportButtons button:hover,
.activityExportControls button:hover {
  background: linear-gradient(135deg, var(--cma-cool-sky), var(--cma-rose-kiss));
  color: #fff;
  border-color: transparent;
}

.chartCard,
.kpiCard,
.toolbar,
.panel,
.spaceCard,
.agendaSection,
.weeklyProgramControls,
.weeklyProgramExportArea,
.barcelonaLivePanel,
.dashboardFilterPanel {
  border-color: rgba(17,17,17,.10);
  box-shadow: 0 10px 28px rgba(17,17,17,.035);
}

.chartCardHeader .chartTitle span {
  background: rgba(127,200,248,.18);
  color: #1f78b7;
  border-radius: 999px;
  width: 30px;
  height: 30px;
  display: inline-grid;
  place-items: center;
}

.barcelonaLivePanel {
  background:
    linear-gradient(135deg, rgba(255,255,255,.96), rgba(249,249,249,.96)),
    radial-gradient(circle at 10% 0%, rgba(127,200,248,.22), transparent 32%),
    radial-gradient(circle at 100% 12%, rgba(255,99,146,.16), transparent 30%);
}

.liveNowBadge,
.dataScopeControl,
.agendaHero,
.weeklyProgramHeader,
.liveBlock.featured {
  background:
    radial-gradient(circle at 12% 20%, rgba(90,169,230,.36), transparent 34%),
    radial-gradient(circle at 90% 5%, rgba(255,99,146,.32), transparent 31%),
    #111;
}

.liveKpis div:nth-child(1),
.agendaAlert.ok,
.compactPills span:nth-child(4n+1) {
  background: rgba(90,169,230,.14);
}

.liveKpis div:nth-child(2),
.compactPills span:nth-child(4n+2) {
  background: rgba(127,200,248,.18);
}

.liveKpis div:nth-child(3),
.agendaAlert.review,
.compactPills span:nth-child(4n+3) {
  background: rgba(255,228,94,.22);
}

.liveKpis div:nth-child(4),
.agendaAlert.critical,
.compactPills span:nth-child(4n+4) {
  background: rgba(255,99,146,.16);
}

.tileMapPoint {
  background: var(--cma-rose-kiss);
}

.tileMapPoint.cluster {
  background: var(--cma-cool-sky);
}

.compactRankTrack i,
.districtGapBars i {
  background: linear-gradient(90deg, var(--cma-cool-sky), var(--cma-sky-blue)) !important;
}

.districtGapBars b {
  background: linear-gradient(90deg, var(--cma-royal-gold), var(--cma-rose-kiss)) !important;
}

.agendaStatus.critical,
.directionIssueTags span,
.agendaIssueTags span {
  background: rgba(255,99,146,.14);
  border-color: rgba(255,99,146,.28);
  color: #9f1f50;
}

.agendaStatus.review {
  background: rgba(255,228,94,.24);
  color: #7d6200;
}

.agendaStatus.ok {
  background: rgba(185,251,192,.38);
  color: #1e6b36;
}

.weeklyProgramItem:hover,
.agendaItem:hover,
.directionIssueItem:hover,
.spaceCard:hover {
  border-color: var(--cma-cool-sky);
  box-shadow: 0 10px 24px rgba(90,169,230,.13);
}

.weeklyProgramHeader .brand,
.agendaHero .eyebrow,
.barcelonaLivePanel .eyebrow {
  color: #fff;
}


.barcelona2026Welcome {
  position: relative;
  overflow: hidden;
  background:
    radial-gradient(circle at 12% 20%, rgba(255,228,94,.55), transparent 26%),
    radial-gradient(circle at 88% 10%, rgba(255,99,146,.34), transparent 30%),
    linear-gradient(135deg, #5AA9E6, #7FC8F8);
  color: #fff;
  border-radius: 30px;
  padding: 26px;
  margin-bottom: 22px;
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(300px, .6fr);
  gap: 22px;
  align-items: center;
  box-shadow: 0 18px 42px rgba(90,169,230,.22);
}

.barcelona2026Welcome::after {
  content: "";
  position: absolute;
  inset: -80px -120px auto auto;
  width: 260px;
  height: 260px;
  border-radius: 999px;
  background: rgba(255,255,255,.2);
  filter: blur(4px);
}

.barcelona2026Welcome h2 {
  position: relative;
  margin: 0 0 9px;
  color: #fff;
  font-size: clamp(30px, 4vw, 52px);
  line-height: .95;
  letter-spacing: -0.06em;
}

.barcelona2026Welcome p {
  position: relative;
  margin: 0;
  color: rgba(255,255,255,.86);
  font-size: 16px;
  line-height: 1.35;
}

.barcelona2026Welcome p strong {
  color: #fff;
}

.welcomeNext {
  position: relative;
  background: rgba(255,255,255,.18);
  border: 1px solid rgba(255,255,255,.3);
  border-radius: 24px;
  padding: 18px;
  backdrop-filter: blur(12px);
}

.welcomeNext span {
  display: block;
  color: rgba(255,255,255,.72);
  font-size: 11px;
  font-weight: 950;
  text-transform: uppercase;
  letter-spacing: .06em;
  margin-bottom: 8px;
}

.welcomeNext strong {
  display: block;
  font-size: 21px;
  line-height: 1.12;
  letter-spacing: -0.035em;
}

.welcomeNext small {
  display: block;
  color: rgba(255,255,255,.76);
  margin-top: 10px;
  font-weight: 800;
}


.catalogLayout { display: grid; grid-template-columns: minmax(0, 1fr) minmax(440px, .55fr); gap: 22px; align-items: start; }
.catalogGrid { display: grid; grid-template-columns: repeat(auto-fill, minmax(270px, 1fr)); gap: 16px; }
.catalogCard { background: #fff; border: 1px solid rgba(17,17,17,.10); border-radius: 26px; overflow: hidden; text-align: left; display: flex; flex-direction: column; min-height: 430px; box-shadow: 0 10px 28px rgba(17,17,17,.035); transition: .16s ease; }
.catalogCard:hover, .catalogCard.selected { transform: translateY(-2px); border-color: var(--cma-cool-sky); box-shadow: 0 16px 34px rgba(90,169,230,.16); }
.catalogImage { height: 170px; background: linear-gradient(135deg, rgba(90,169,230,.18), rgba(255,99,146,.12)); display: grid; place-items: center; color: #777; font-weight: 900; }
.catalogImage img { width: 100%; height: 100%; object-fit: cover; display: block; }
.catalogBody { padding: 16px; display: flex; flex-direction: column; gap: 10px; flex: 1; }
.catalogBody h3 { margin: 0; font-size: 19px; line-height: 1.08; letter-spacing: -0.035em; }
.catalogBody p { margin: 0; color: #555; font-size: 13px; line-height: 1.35; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }
.catalogMeta { display: grid; gap: 5px; color: #666; font-size: 12px; font-weight: 800; margin-top: auto; }
.catalogFooter { border-top: 1px solid #eee; padding-top: 11px; display: flex; justify-content: space-between; gap: 12px; align-items: center; font-size: 12px; color: #666; font-weight: 900; }
.catalogFooter strong { color: var(--cma-rose-kiss); }


body, button, input, select, textarea { font-family: Montserrat, Arial, sans-serif; }

.tempsHero { position: relative; display: grid; grid-template-columns: 220px minmax(0, 1fr) 220px; gap: 22px; align-items: stretch; background: #fff; border: 1px solid rgba(17,17,17,.10); border-radius: 34px; padding: 24px; box-shadow: 0 12px 34px rgba(17,17,17,.04); overflow: hidden; }
.tempsHero::before { content: ""; position: absolute; inset: 0; background: radial-gradient(circle at 15% 10%, rgba(127,200,248,.18), transparent 28%), radial-gradient(circle at 86% 18%, rgba(255,99,146,.12), transparent 30%), radial-gradient(circle at 50% 90%, rgba(255,228,94,.18), transparent 34%); pointer-events: none; }
.saintFigure { position: relative; z-index: 1; border: 1px solid #e7e7e2; background: rgba(255,255,255,.7); border-radius: 28px; padding: 18px; display: flex; flex-direction: column; justify-content: space-between; min-height: 360px; }
.saintFigure strong { display: block; font-size: 18px; letter-spacing: -0.04em; }
.saintFigure span { color: #666; font-size: 12px; font-weight: 800; }
.saintDrawing { position: relative; height: 270px; filter: grayscale(1); opacity: .78; }
.saintDrawing * { position: absolute; left: 50%; transform: translateX(-50%); border: 3px solid #111; }
.saintHalo { top: 12px; width: 96px; height: 96px; border-radius: 999px; border-width: 2px; }
.saintHead { top: 56px; width: 54px; height: 62px; border-radius: 45%; background: #fff; }
.saintBody { top: 122px; width: 96px; height: 128px; border-radius: 48px 48px 16px 16px; background: #fff; }
.saintCape { top: 132px; width: 150px; height: 126px; border-radius: 80px 80px 18px 18px; border-top-color: transparent; background: transparent; }
.saintPalm { top: 72px; left: 68%; width: 4px; height: 160px; border-width: 0 0 0 3px; transform: rotate(-18deg); }
.saintPalm::after { content: ""; position: absolute; top: -4px; left: -28px; width: 58px; height: 42px; border: 2px solid #111; border-bottom: 0; border-radius: 100% 100% 0 0; transform: rotate(24deg); }
.tempsCenter { position: relative; z-index: 1; text-align: center; display: flex; flex-direction: column; justify-content: center; padding: 26px; }
.tempsCenter h2 { font-size: clamp(92px, 14vw, 190px); line-height: .8; margin: 0; letter-spacing: -0.09em; color: #111; }
.tempsCenter > span { color: #555; font-size: 18px; font-weight: 900; margin-top: 12px; }
.tempsProgress { height: 18px; background: #efefed; border-radius: 999px; overflow: hidden; margin: 32px 0 12px; border: 1px solid #ddd; }
.tempsProgress i { display: block; height: 100%; background: linear-gradient(90deg, var(--cma-cool-sky), var(--cma-royal-gold), var(--cma-rose-kiss)); border-radius: inherit; }
.tempsDates { display: flex; justify-content: space-between; gap: 12px; color: #777; font-weight: 900; font-size: 12px; text-transform: uppercase; }
.tempsDates strong { color: #111; }
.tempsBigCounters { display: grid; grid-template-columns: 1.35fr 1fr 1fr 1fr; gap: 14px; margin: 18px 0; }
.tempsCounterCard { background: #fff; border: 1px solid rgba(17,17,17,.10); border-radius: 28px; padding: 20px; box-shadow: 0 10px 28px rgba(17,17,17,.035); min-height: 190px; display: flex; flex-direction: column; justify-content: space-between; }
.tempsCounterCard.main { background: radial-gradient(circle at 10% 10%, rgba(255,228,94,.42), transparent 34%), radial-gradient(circle at 90% 30%, rgba(127,200,248,.35), transparent 34%), #111; color: #fff; }
.tempsCounterCard span { color: #666; font-size: 12px; font-weight: 950; text-transform: uppercase; letter-spacing: .05em; }
.tempsCounterCard.main span, .tempsCounterCard.main p { color: rgba(255,255,255,.72); }
.tempsCounterCard strong { display: block; font-size: clamp(48px, 7vw, 92px); line-height: .85; letter-spacing: -0.08em; }
.tempsCounterCard p { margin: 0; color: #666; font-weight: 700; }
.tempsInsightGrid { display: grid; grid-template-columns: 1.45fr 1fr 1fr; gap: 14px; }
.tempsInsightCard { background: #fff; border: 1px solid rgba(17,17,17,.10); border-radius: 28px; padding: 20px; min-height: 260px; box-shadow: 0 10px 28px rgba(17,17,17,.035); }
.tempsInsightCard h2 { font-size: 32px; line-height: 1; letter-spacing: -0.055em; margin: 0 0 10px; }
.tempsInsightCard p { margin: 0; }
.tempsInsightCard.district { display: grid; grid-template-columns: .9fr 1.1fr; gap: 18px; align-items: center; }
.tempsMiniMap { height: 250px; display: grid; grid-template-columns: repeat(4, 1fr); grid-template-rows: repeat(5, 1fr); gap: 6px; transform: rotate(-2deg); }
.tempsMapCell { border: 1px solid #ddd; background: #f4f4f0; border-radius: 12px; display: grid; place-items: center; padding: 4px; text-align: center; color: #999; font-size: 8px; font-weight: 900; line-height: 1; }
.tempsMapCell.active { background: linear-gradient(135deg, var(--cma-cool-sky), var(--cma-rose-kiss)); color: #fff; border-color: transparent; box-shadow: 0 12px 28px rgba(90,169,230,.24); transform: scale(1.08); }
.tm-d1 { grid-column: 2; grid-row: 4; } .tm-d2 { grid-column: 2 / 4; grid-row: 3; } .tm-d3 { grid-column: 1 / 3; grid-row: 5; } .tm-d4 { grid-column: 1; grid-row: 4; } .tm-d5 { grid-column: 1 / 3; grid-row: 2; } .tm-d6 { grid-column: 3; grid-row: 2; } .tm-d7 { grid-column: 2 / 4; grid-row: 1; } .tm-d8 { grid-column: 4; grid-row: 1 / 3; } .tm-d9 { grid-column: 4; grid-row: 3; } .tm-d10 { grid-column: 4; grid-row: 4 / 6; }
.tempsMessage { margin-top: 18px; background: radial-gradient(circle at 12% 20%, rgba(255,228,94,.34), transparent 30%), linear-gradient(135deg, #5AA9E6, #7FC8F8); color: #fff; border-radius: 30px; padding: 26px; }
.tempsMessage h2 { color: #fff; font-size: clamp(28px, 4vw, 54px); line-height: .95; letter-spacing: -0.065em; margin: 0 0 10px; }
.tempsMessage p { color: rgba(255,255,255,.78); margin: 0; font-weight: 800; }

@media (max-width: 1000px) {

  .tempsHero { grid-template-columns: 1fr; }
  .saintFigure { min-height: 260px; }
  .tempsBigCounters { grid-template-columns: 1fr; }
  .tempsInsightGrid { grid-template-columns: 1fr; }
  .tempsInsightCard.district { grid-template-columns: 1fr; }
 .dashboardStats, .dashboardChartsGrid { grid-template-columns: 1fr; } .dashboardTopControls { justify-content: flex-start; } }
@media (max-width: 700px) { .kpiCard { padding: 18px; } .donutLegendRow { grid-template-columns: 12px 1fr auto; } .donutLegendRow em { display: none; } }

/* Activitats · filtros, contador, imagen y exportación */
.activitiesToolbar {
  padding: 14px;
}

.activitySearchRow {
  display: grid;
  grid-template-columns: 1fr 150px;
  gap: 12px;
  align-items: stretch;
  margin-bottom: 12px;
}

.activitySearchRow input {
  margin-bottom: 0;
}

.resultsCounter {
  background: #111;
  color: #fff;
  border-radius: 16px;
  padding: 10px 14px;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  line-height: 1.05;
  min-height: 48px;
}

.resultsCounter strong {
  font-size: 22px;
  letter-spacing: -0.04em;
}

.resultsCounter span {
  font-size: 11px;
  color: #ddd;
  font-weight: 800;
  text-transform: uppercase;
  margin-top: 3px;
}

.activityFiltersRow {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: center;
  flex-wrap: wrap;
}

.selectFilters {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  margin-left: auto;
}

.selectFilters label {
  display: flex;
  align-items: center;
  gap: 7px;
  background: #f3f3f1;
  border: 1px solid #ddd;
  border-radius: 999px;
  padding: 5px 8px 5px 12px;
}

.selectFilters label span {
  font-size: 12px;
  font-weight: 900;
  color: #555;
}

.selectFilters select {
  border: 0;
  background: transparent;
  max-width: 210px;
  font-size: 12px;
  font-weight: 800;
  color: #111;
  outline: none;
  cursor: pointer;
}

.emptyList {
  background: #fff;
  border: 1px dashed #ccc;
  border-radius: 20px;
  padding: 22px;
  color: #666;
  text-align: center;
}

.detailTopBar {
  display: flex;
  justify-content: space-between;
  gap: 14px;
  align-items: flex-start;
  margin-bottom: 14px;
}

.detailStatus {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.activityExportControls {
  display: flex;
  align-items: center;
  gap: 6px;
  background: #f3f3f1;
  border: 1px solid #ddd;
  border-radius: 999px;
  padding: 5px;
  flex-shrink: 0;
}

.activityExportControls span {
  font-size: 11px;
  font-weight: 900;
  color: #555;
  padding: 0 5px 0 7px;
  text-transform: uppercase;
}

.activityExportControls button {
  border: 1px solid #ddd;
  background: #fff;
  border-radius: 999px;
  padding: 6px 9px;
  font-size: 11px;
  font-weight: 900;
}

.activityExportControls button:hover {
  background: #111;
  color: #fff;
  border-color: #111;
}

.activityExportControls button:disabled {
  opacity: .45;
  cursor: not-allowed;
}

.heroImageReal {
  position: relative;
  width: 100%;
  height: 100%;
  border-radius: 20px;
  overflow: hidden;
  background: #efefed;
}

.heroImageReal img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.driveImagePreview {
  width: 100%;
  height: 100%;
  border: 0;
  display: block;
}

.heroImageReal a {
  position: absolute;
  right: 12px;
  bottom: 12px;
  background: rgba(255,255,255,.92);
  color: #111;
  border-radius: 999px;
  padding: 8px 11px;
  font-size: 12px;
  font-weight: 900;
  text-decoration: none;
  box-shadow: 0 3px 12px rgba(0,0,0,.12);
}

.activityExportArea {
  background: #fff;
}


.kpiCard.clean { justify-content: center; text-align: left; }
.kpiCard.clean .kpiValue { font-size: 34px; }
.inscriptionsChartsGrid { margin-top: 18px; }
.compactRankList { display: flex; flex-direction: column; gap: 13px; padding: 8px 2px 2px; }
.compactRankRow { display: grid; gap: 7px; }
.compactRankTop { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 12px; align-items: center; font-size: 13px; }
.compactRankTop span { overflow: hidden; white-space: nowrap; text-overflow: ellipsis; color: #333; font-weight: 700; }
.compactRankTop b { color: #111; }
.compactRankTrack { height: 9px; border-radius: 999px; background: #ededeb; overflow: hidden; }
.compactRankTrack i { display: block; height: 100%; border-radius: 999px; }
.districtOriginMap { display: grid; grid-template-columns: repeat(5, 1fr); grid-template-rows: repeat(4, 78px); gap: 8px; min-height: 330px; }
.originDistrictCell { background: #2f6fdd; color: #fff; border-radius: 18px; padding: 10px; display: flex; flex-direction: column; justify-content: space-between; min-width: 0; }
.originDistrictCell strong { font-size: 17px; }
.originDistrictCell span { font-size: 23px; font-weight: 900; line-height: 1; }
.originDistrictCell small { font-size: 10px; line-height: 1.05; opacity: .92; }
.originDistrictCell.od1 { grid-column: 3; grid-row: 3; }
.originDistrictCell.od2 { grid-column: 3; grid-row: 2; }
.originDistrictCell.od3 { grid-column: 2; grid-row: 3; }
.originDistrictCell.od4 { grid-column: 1; grid-row: 3; }
.originDistrictCell.od5 { grid-column: 1 / span 2; grid-row: 2; }
.originDistrictCell.od6 { grid-column: 3; grid-row: 1; }
.originDistrictCell.od7 { grid-column: 2 / span 2; grid-row: 1; }
.originDistrictCell.od8 { grid-column: 4; grid-row: 1; }
.originDistrictCell.od9 { grid-column: 4; grid-row: 2; }
.originDistrictCell.od10 { grid-column: 4 / span 2; grid-row: 3; }
.donutWrap .recharts-wrapper { overflow: visible; }
.donutWrap svg { overflow: visible; }


.sameDistrictSummary { display: grid; grid-template-columns: 150px 1fr; gap: 18px; align-items: center; margin-bottom: 10px; }
.sameDistrictSummary strong { display: block; font-size: 44px; line-height: 1; letter-spacing: -0.05em; }
.sameDistrictSummary span { display: block; margin-top: 5px; color: #555; font-weight: 800; font-size: 13px; line-height: 1.2; }
.sameDistrictSummary p { margin: 0; color: #666; font-size: 13px; line-height: 1.35; }
.chartCard .chartCard { border: 0; box-shadow: none; padding: 0; margin: 0; background: transparent; min-height: 0; }
.chartCard .chartCard .chartCardHeader { display: none; }
.chartCard .chartCard .detailLink { display: none; }
.chartCard .chartCard .donutCardBody { margin-top: 0; }


.sameDistrictControls { margin-bottom: 14px; }
.sameDistrictControls label { display: grid; gap: 6px; }
.sameDistrictControls span { color: #666; font-size: 12px; font-weight: 800; }
.sameDistrictControls select { width: 100%; border: 1px solid #ddd; background: #f7f7f5; border-radius: 14px; padding: 11px 12px; font-weight: 800; color: #111; }
.sameDistrictMiniStats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin: 10px 0 14px; }
.sameDistrictMiniStats div { background: #f7f7f5; border: 1px solid #e7e7e2; border-radius: 16px; padding: 10px; }
.sameDistrictMiniStats strong { display: block; font-size: 22px; line-height: 1; letter-spacing: -0.04em; }
.sameDistrictMiniStats span { display: block; color: #666; font-size: 11px; font-weight: 800; margin-top: 5px; line-height: 1.15; }


.spacesLayout { display: grid; grid-template-columns: 430px 1fr; gap: 22px; align-items: start; }
.spacesList { display: flex; flex-direction: column; gap: 12px; max-height: calc(100vh - 280px); overflow: auto; padding-right: 4px; }
.spaceCard { display: grid; grid-template-columns: 88px 1fr; gap: 14px; background: #fff; border: 1px solid #ddd; border-radius: 22px; padding: 14px; text-align: left; transition: .15s ease; }
.spaceCard:hover, .spaceCard.selected { border-color: #111; transform: translateY(-1px); }
.spaceThumb { width: 88px; height: 88px; border-radius: 16px; background: #f0f0ec; overflow: hidden; display: flex; align-items: center; justify-content: center; color: #777; font-size: 11px; text-align: center; }
.spaceThumb img { width: 100%; height: 100%; object-fit: cover; display: block; }
.spaceCard h3 { font-size: 16px; margin: 0 0 5px; }
.spaceCard p { margin: 0 0 6px; font-size: 13px; }
.spaceCard small { color: #666; font-weight: 800; }
.spaceDetailPanel { max-height: calc(100vh - 72px); overflow: auto; }
.spaceHero { height: 240px; }
.spaceDescription { white-space: pre-wrap; line-height: 1.45; }
.osmMap { width: 100%; height: 360px; border: 0; border-radius: 22px; margin-top: 16px; background: #f1f1ed; }
.spaceActivityHeader { margin-bottom: 14px; }
.spaceActivityHeader h3 { margin: 0 0 4px; }
.spaceActivityHeader p { margin: 0; }
.clickableRows button strong { display: block; margin-bottom: 4px; }
.clickableRows button span { display: block; color: inherit; font-weight: 500; line-height: 1.25; }
.spaceTimeline { display: flex; flex-direction: column; gap: 10px; }
.spaceTimeline button { display: grid; grid-template-columns: 112px 1fr; gap: 14px; text-align: left; border: 1px solid #eee; background: #fff; border-radius: 16px; padding: 12px; }
.spaceTimeline button:hover { border-color: #111; background: #f7f7f5; }
.spaceTimeline time { font-weight: 900; color: #111; }
.spaceTimeline strong, .spaceTimeline span { display: block; }
.spaceTimeline span { color: #666; margin-top: 4px; }
.spaceWebLinks { display: flex; flex-wrap: wrap; gap: 12px; margin: 12px 0 18px; }
.spaceGalleryPreview { width: 100%; border-radius: 22px; overflow: hidden; background: #f1f1ed; }
.spaceGalleryPreview img { width: 100%; max-height: 260px; object-fit: cover; display: block; }


.spacesSelectFilters { align-items: end; }
.spacesMapLayout { display: grid; grid-template-columns: minmax(0, 1.35fr) minmax(420px, .65fr); gap: 22px; align-items: start; }
.spacesMapPanel { position: sticky; top: 28px; background: #fff; border: 1px solid #ddd; border-radius: 26px; padding: 14px; box-shadow: 0 1px 0 rgba(0,0,0,.02); }
.spacesMapCanvas { width: 100%; height: calc(100vh - 250px); min-height: 560px; border-radius: 20px; overflow: hidden; background: #f1f1ed; }
.mapHint { display: flex; gap: 6px; align-items: center; color: #666; font-size: 13px; padding: 12px 4px 2px; }
.mapHint strong { color: #111; }
.mapPopup { display: grid; gap: 4px; min-width: 160px; }
.mapPopup strong { font-size: 14px; }
.mapPopup span, .mapPopup small { color: #555; }
.marker-cluster-small, .marker-cluster-medium, .marker-cluster-large { background-color: rgba(47, 111, 221, .18); }
.marker-cluster-small div, .marker-cluster-medium div, .marker-cluster-large div { background-color: rgba(47, 111, 221, .88); color: #fff; font-weight: 900; }


.leaflet-tooltip { border: 0 !important; border-radius: 12px !important; box-shadow: 0 8px 22px rgba(0,0,0,.12) !important; font-weight: 800; line-height: 1.25; padding: 8px 10px !important; }
.leaflet-container { font-family: Montserrat, Arial, sans-serif; }


.spaceMapMarker { background: transparent; border: 0; }
.spaceMapMarker span { display: block; width: 22px; height: 22px; border-radius: 999px; background: #2f6fdd; border: 3px solid #fff; box-shadow: 0 6px 18px rgba(0,0,0,.22); }
.spaceMapMarker.selected span { width: 32px; height: 32px; background: #111; border: 4px solid #fff; box-shadow: 0 8px 26px rgba(0,0,0,.32); }
.mapEmptyPanel { min-height: 360px; display: flex; flex-direction: column; justify-content: center; }
.mapEmptyPanel h2 { font-size: 28px; }
.mapEmptyPanel p { line-height: 1.45; max-width: 360px; }


.spacesMapShell { position: relative; }
.mapNoPoints { position: absolute; inset: 18px; display: flex; align-items: center; justify-content: center; background: rgba(255,255,255,.86); border-radius: 18px; color: #666; font-weight: 800; text-align: center; padding: 20px; pointer-events: none; }
.spaceMapMarker { background: transparent; border: 0; }
.spaceMapMarker span { display: block; width: 22px; height: 22px; border-radius: 999px; background: #2f6fdd; border: 3px solid #fff; box-shadow: 0 6px 18px rgba(0,0,0,.22); }
.spaceMapMarker.selected span { width: 32px; height: 32px; background: #111; border: 4px solid #fff; box-shadow: 0 8px 26px rgba(0,0,0,.32); }
.mapEmptyPanel { min-height: 360px; display: flex; flex-direction: column; justify-content: center; }
.mapEmptyPanel h2 { font-size: 28px; }
.mapEmptyPanel p { line-height: 1.45; max-width: 360px; }


.dashboardFilterPanel { background: #fff; border: 1px solid #ddd; border-radius: 24px; padding: 16px; margin: 0 0 22px; display: grid; gap: 14px; }
.dashboardDateInputs, .dashboardSelectFilters { display: flex; flex-wrap: wrap; gap: 10px; align-items: end; }
.dashboardDateInputs label, .dashboardSelectFilters label { display: grid; gap: 6px; }
.dashboardDateInputs span, .dashboardSelectFilters span { color: #666; font-size: 12px; font-weight: 800; }
.dashboardDateInputs input, .dashboardSelectFilters select { border: 1px solid #ddd; background: #f7f7f5; border-radius: 14px; padding: 11px 12px; font-weight: 800; color: #111; min-width: 160px; }
.resetDashboardFilters { border: 1px solid #111; background: #111; color: #fff; border-radius: 14px; padding: 12px 14px; font-weight: 900; }
.todayPill { border: 1px solid #ddd; background: #fff; border-radius: 999px; padding: 10px 13px; color: #555; font-weight: 800; font-size: 13px; white-space: nowrap; }
.dashboardExtraGrid { margin-top: 18px; }
.districtGapList { display: flex; flex-direction: column; gap: 13px; padding-top: 8px; }
.districtGapHeader { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 10px; align-items: center; font-size: 13px; }
.districtGapHeader strong { overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
.districtGapHeader span { color: #666; font-weight: 800; font-size: 12px; }
.districtGapBars { display: grid; gap: 5px; }
.districtGapBars i, .districtGapBars b { display: block; height: 8px; border-radius: 999px; }
.districtGapBars i { background: #2f6fdd; }
.districtGapBars b { background: #4aa79c; }


.spacesSelectFilters { align-items: end; }
.spacesMapLayout { display: grid; grid-template-columns: minmax(0, 1.35fr) minmax(420px, .65fr); gap: 22px; align-items: start; }
.spacesMapPanel { position: sticky; top: 28px; background: #fff; border: 1px solid #ddd; border-radius: 26px; padding: 14px; box-shadow: 0 1px 0 rgba(0,0,0,.02); overflow: hidden; }
.tileMapShell { position: relative; width: 100%; }
.tileMapCanvas { position: relative; width: 100%; height: calc(100vh - 250px); min-height: 560px; border-radius: 20px; overflow: hidden; background: #e9ece8; }
.tileMapInner { position: absolute; left: 50%; top: 50%; width: 920px; height: 600px; transform: translate(-50%, -50%); }
.tileMapTile { position: absolute; width: 256px; height: 256px; user-select: none; pointer-events: none; filter: grayscale(.15) saturate(.72) brightness(1.04); }
.tileMapControls { position: absolute; z-index: 30; top: 12px; left: 12px; display: flex; align-items: center; gap: 6px; background: rgba(255,255,255,.92); border: 1px solid #ddd; border-radius: 999px; padding: 6px; box-shadow: 0 4px 16px rgba(0,0,0,.08); }
.tileMapControls button { width: 30px; height: 30px; border-radius: 999px; border: 1px solid #ddd; background: #fff; font-weight: 900; }
.tileMapControls span { color: #555; font-size: 12px; font-weight: 900; padding: 0 7px 0 2px; }
.tileMapPoint { position: absolute; z-index: 20; border: 3px solid #fff; border-radius: 999px; background: #2f6fdd; color: #fff; box-shadow: 0 8px 22px rgba(0,0,0,.24); display: grid; place-items: center; padding: 0; font-size: 10px; font-weight: 900; cursor: pointer; transition: transform .12s ease, background .12s ease; }
.tileMapPoint:hover { transform: scale(1.18); z-index: 40; background: #111; }
.tileMapPoint.selected { background: #111; transform: scale(1.22); z-index: 50; }
.tileMapPoint span { line-height: 1; }
.mapHint { display: flex; gap: 6px; align-items: center; color: #666; font-size: 13px; padding: 12px 4px 2px; }
.mapHint strong { color: #111; }
.mapNoPoints { position: absolute; inset: 18px; display: flex; align-items: center; justify-content: center; background: rgba(255,255,255,.88); border-radius: 18px; color: #666; font-weight: 800; text-align: center; padding: 20px; pointer-events: none; z-index: 500; }
.mapEmptyPanel { min-height: 360px; display: flex; flex-direction: column; justify-content: center; }
.mapEmptyPanel h2 { font-size: 28px; }
.mapEmptyPanel p { line-height: 1.45; max-width: 360px; }


.tileMapCanvas.dragging { cursor: grabbing; }
.tileMapCanvas:not(.dragging) { cursor: default; }
.tileMapCtrlHint { position: absolute; z-index: 30; top: 12px; right: 12px; background: rgba(255,255,255,.94); border: 1px solid #ddd; border-radius: 999px; padding: 10px 13px; color: #555; font-size: 12px; font-weight: 800; box-shadow: 0 4px 16px rgba(0,0,0,.08); pointer-events: none; }
.tileMapPoint.cluster { background: #111; border-color: #fff; }
.tileMapPoint.cluster span { font-size: 12px; }


.spacesMapPanel .spacesList,
.spacesMapPanel .spaceCard,
.spacesMapPanel > .spacesList,
.spacesMapPanel > .spaceCard {
  display: none !important;
}

.spacesMapPanel {
  overflow: hidden;
}

.spacesMapPanel .tileMapShell {
  display: block !important;
}


.tileMapControls {
  display: none !important;
}

.tileMapCtrlHint {
  left: 12px;
  right: auto;
}

.tileMapTile {
  filter: grayscale(.08) saturate(.55) brightness(1.05) contrast(.96);
}


.directionGrid { display: grid; grid-template-columns: 420px 1fr; gap: 18px; align-items: start; }
.directionSummary { position: sticky; top: 28px; }
.directionIssueChips { margin-top: 12px; }
.directionIssueList { display: flex; flex-direction: column; gap: 11px; max-height: calc(100vh - 330px); overflow: auto; padding-right: 4px; }
.directionIssueItem { border: 1px solid #e3e3df; background: #fff; border-radius: 18px; padding: 14px; text-align: left; display: grid; grid-template-columns: minmax(0, 1fr) 230px; gap: 14px; transition: .15s ease; }
.directionIssueItem:hover { border-color: #111; transform: translateY(-1px); }
.directionIssueMain h3 { margin: 0 0 5px; font-size: 16px; line-height: 1.2; }
.directionIssueMain p { margin: 0; font-size: 13px; }
.directionIssueTags { display: flex; flex-wrap: wrap; gap: 6px; justify-content: flex-end; align-content: flex-start; }
.directionIssueTags span { background: #fff0d6; border: 1px solid #f0d7a5; color: #8a5700; border-radius: 999px; padding: 5px 8px; font-size: 11px; font-weight: 900; }
.directionToolbar { margin-bottom: 18px; }


.dataScopeControl { background: #111; color: #fff; border-radius: 22px; padding: 12px 14px; margin-bottom: 22px; display: flex; justify-content: space-between; gap: 14px; align-items: center; }
.dataScopeControl span { display: block; color: rgba(255,255,255,.62); font-size: 11px; font-weight: 900; text-transform: uppercase; letter-spacing: .06em; }
.dataScopeControl strong { display: block; font-size: 18px; letter-spacing: -0.03em; }
.dataScopeButtons { display: flex; flex-wrap: wrap; gap: 8px; }
.dataScopeButtons button { border: 1px solid rgba(255,255,255,.25); background: rgba(255,255,255,.08); color: #fff; border-radius: 999px; padding: 8px 11px; font-size: 12px; font-weight: 900; }
.dataScopeButtons button.active { background: #fff; color: #111; border-color: #fff; }
.directionSecondaryStats { margin-top: -10px; }


.agendaView { display: grid; gap: 18px; }
.agendaHero { background: #111; color: #fff; border-radius: 28px; padding: 24px; display: flex; justify-content: space-between; gap: 22px; align-items: center; }
.agendaHero h2 { font-size: 31px; margin: 0 0 8px; }
.agendaHero p { color: rgba(255,255,255,.68); margin: 0; }
.agendaHeroStats { display: grid; grid-template-columns: repeat(3, 110px); gap: 10px; }
.agendaHeroStats div { background: rgba(255,255,255,.1); border: 1px solid rgba(255,255,255,.16); border-radius: 20px; padding: 14px; }
.agendaHeroStats strong { display: block; font-size: 31px; line-height: 1; letter-spacing: -0.04em; }
.agendaHeroStats span { display: block; color: rgba(255,255,255,.66); margin-top: 6px; font-size: 12px; font-weight: 900; }
.agendaAlerts { display: grid; grid-template-columns: repeat(6, 1fr); gap: 10px; }
.agendaAlert { background: #fff; border: 1px solid #ddd; border-radius: 20px; padding: 14px; }
.agendaAlert strong { display: block; font-size: 28px; line-height: 1; letter-spacing: -0.04em; }
.agendaAlert span { display: block; color: #666; margin-top: 6px; font-size: 12px; font-weight: 800; line-height: 1.15; }
.agendaAlert.critical { background: #fff0e9; border-color: #f1c8b8; }
.agendaAlert.review { background: #fff7e6; border-color: #f0d7a5; }
.agendaAlert.ok { background: #eaf7ee; border-color: #bfe2c9; }
.agendaGrid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 18px; align-items: start; }
.agendaSection { background: #fff; border: 1px solid #ddd; border-radius: 24px; padding: 18px; }
.agendaSectionHeader { display: flex; justify-content: space-between; gap: 12px; align-items: center; border-bottom: 1px solid #eee; padding-bottom: 12px; margin-bottom: 12px; }
.agendaSectionHeader div { display: flex; align-items: center; gap: 9px; }
.agendaSectionHeader h2 { margin: 0; font-size: 20px; }
.agendaItems { display: flex; flex-direction: column; gap: 10px; max-height: 560px; overflow: auto; padding-right: 4px; }
.agendaItem { display: grid; grid-template-columns: 62px 1fr; gap: 12px; width: 100%; border: 1px solid #eee; background: #fff; border-radius: 18px; padding: 12px; text-align: left; transition: .15s ease; }
.agendaItem:hover { border-color: #111; transform: translateY(-1px); }
.agendaItem time { font-weight: 950; font-size: 16px; letter-spacing: -0.03em; color: #111; padding-top: 3px; }
.agendaItem.critical { border-left: 5px solid #e35d3d; }
.agendaItem.review { border-left: 5px solid #e0a12a; }
.agendaItem.ok { border-left: 5px solid #38a35a; }
.agendaItemMain h3 { margin: 0 0 5px; font-size: 15px; line-height: 1.2; }
.agendaItemMain p { margin: 0; font-size: 12px; }
.agendaStatus { display: inline-flex; align-items: center; border-radius: 999px; padding: 5px 9px; font-size: 12px; font-weight: 900; }
.agendaStatus.critical { background: #fff0e9; color: #a63b20; }
.agendaStatus.review { background: #fff7e6; color: #8a5700; }
.agendaStatus.ok { background: #eaf7ee; color: #146c2e; }
.agendaMeta { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 8px; color: #666; font-size: 12px; font-weight: 800; }
.agendaIssueTags { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 9px; }
.agendaIssueTags span { background: #fff0d6; border: 1px solid #f0d7a5; color: #8a5700; border-radius: 999px; padding: 5px 8px; font-size: 11px; font-weight: 900; }


.weeklyProgramView { display: grid; gap: 18px; }
.weeklyProgramControls { background: #fff; border: 1px solid #ddd; border-radius: 24px; padding: 18px; display: grid; grid-template-columns: minmax(0, 1fr) auto auto; gap: 16px; align-items: end; }
.weeklyProgramControls h2 { margin: 0 0 6px; font-size: 28px; }
.weeklyProgramControls p { margin: 0; }
.weeklyProgramActions { display: flex; flex-wrap: wrap; gap: 8px; align-items: end; justify-content: flex-end; }
.weeklyProgramActions button, .weeklyExportButtons button { border: 1px solid #ddd; background: #fff; border-radius: 999px; padding: 10px 12px; font-size: 12px; font-weight: 900; }
.weeklyProgramActions button:hover, .weeklyExportButtons button:hover { background: #111; color: #fff; border-color: #111; }
.weeklyProgramActions label { display: grid; gap: 5px; }
.weeklyProgramActions label span { color: #666; font-size: 11px; font-weight: 900; text-transform: uppercase; }
.weeklyProgramActions input { border: 1px solid #ddd; background: #f7f7f5; border-radius: 14px; padding: 10px 12px; font-weight: 800; }
.weeklyExportButtons { display: flex; gap: 7px; align-items: center; justify-content: flex-end; }
.weeklyProgramExportArea { background: #f7f7f5; border-radius: 28px; padding: 24px; border: 1px solid #ddd; }
.weeklyProgramHeader { background: #111; color: #fff; border-radius: 24px; padding: 22px; display: grid; grid-template-columns: auto minmax(0, 1fr) auto; gap: 22px; align-items: center; margin-bottom: 16px; }
.weeklyProgramHeader .brand { color: #fff; margin: 0; }
.weeklyProgramHeader h1 { color: #fff; font-size: 38px; }
.weeklyProgramHeader p { color: rgba(255,255,255,.7); margin: 4px 0 0; }
.weeklyProgramKpis { display: grid; grid-template-columns: repeat(3, 96px); gap: 8px; }
.weeklyProgramKpis div { background: rgba(255,255,255,.1); border: 1px solid rgba(255,255,255,.16); border-radius: 18px; padding: 13px; }
.weeklyProgramKpis strong { display: block; font-size: 28px; line-height: 1; letter-spacing: -0.04em; }
.weeklyProgramKpis span { display: block; color: rgba(255,255,255,.68); font-size: 11px; font-weight: 900; margin-top: 5px; }
.weeklyProgramSummary { display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; margin-bottom: 16px; }
.compactPills { background: #fff; border: 1px solid #ddd; border-radius: 20px; padding: 14px; }
.compactPills > strong { display: block; margin-bottom: 9px; }
.compactPills div { display: flex; flex-wrap: wrap; gap: 6px; }
.compactPills span { background: #efefed; border-radius: 999px; padding: 6px 9px; font-size: 11px; font-weight: 900; color: #555; }
.weeklyDaysGrid { display: grid; grid-template-columns: repeat(7, minmax(190px, 1fr)); gap: 10px; align-items: stretch; }
.weeklyDayCard { background: #fff; border: 1px solid #ddd; border-radius: 20px; padding: 12px; min-height: 360px; }
.weeklyDayHeader { border-bottom: 1px solid #eee; padding-bottom: 10px; margin-bottom: 10px; }
.weeklyDayHeader strong { display: block; font-size: 14px; line-height: 1.2; }
.weeklyDayHeader span { display: block; color: #666; font-size: 12px; font-weight: 800; margin-top: 3px; }
.weeklyDayItems { display: flex; flex-direction: column; gap: 8px; }
.weeklyProgramItem { border: 1px solid #eee; background: #fafafa; border-radius: 14px; padding: 9px; display: grid; grid-template-columns: 42px 1fr; gap: 8px; text-align: left; }
.weeklyProgramItem:hover { border-color: #111; background: #fff; }
.weeklyProgramItem time { font-weight: 950; font-size: 12px; letter-spacing: -0.03em; }
.weeklyProgramItem h3 { font-size: 12px; line-height: 1.15; margin: 0 0 4px; }
.weeklyProgramItem p { font-size: 11px; line-height: 1.2; margin: 0 0 4px; }
.weeklyProgramItem small { color: #777; font-size: 10px; line-height: 1.2; display: block; }
.weeklyEmpty { background: #f3f3f1; color: #777; border-radius: 14px; padding: 12px; font-size: 12px; font-weight: 800; text-align: center; }


.barcelonaLivePanel { background: #fff; border: 1px solid #ddd; border-radius: 28px; padding: 20px; margin-bottom: 22px; }
.barcelonaLiveHeader { display: flex; justify-content: space-between; gap: 18px; align-items: flex-start; margin-bottom: 16px; }
.barcelonaLiveHeader h2 { margin: 0 0 6px; font-size: 30px; letter-spacing: -0.04em; }
.barcelonaLiveHeader p { margin: 0; color: #666; }
.liveNowBadge { background: #111; color: #fff; border-radius: 20px; padding: 14px 18px; min-width: 120px; text-align: right; }
.liveNowBadge span { display: block; color: rgba(255,255,255,.65); font-size: 11px; font-weight: 900; text-transform: uppercase; }
.liveNowBadge strong { display: block; font-size: 26px; line-height: 1; letter-spacing: -0.04em; margin-top: 5px; }
.liveKpis { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-bottom: 16px; }
.liveKpis div { background: #f7f7f5; border: 1px solid #eee; border-radius: 20px; padding: 15px; }
.liveKpis strong { display: block; font-size: 32px; line-height: 1; letter-spacing: -0.05em; }
.liveKpis span { display: block; color: #666; font-size: 12px; font-weight: 900; margin-top: 6px; }
.liveContentGrid { display: grid; grid-template-columns: minmax(0, 1fr) minmax(320px, .8fr) minmax(0, 1fr); gap: 14px; }
.liveBlock { border: 1px solid #eee; background: #fafafa; border-radius: 22px; padding: 15px; min-height: 230px; }
.liveBlock.featured { background: #111; color: #fff; }
.liveBlockHeader { display: flex; justify-content: space-between; gap: 10px; align-items: center; margin-bottom: 11px; }
.liveBlockHeader h3 { margin: 0; font-size: 18px; }
.liveList { display: flex; flex-direction: column; gap: 9px; }
.liveMiniCard { display: grid; grid-template-columns: 50px 1fr; gap: 10px; border: 1px solid #eee; background: #fff; border-radius: 16px; padding: 11px; }
.liveMiniCard time { font-weight: 950; font-size: 14px; letter-spacing: -0.03em; }
.liveMiniCard h4 { margin: 0 0 4px; font-size: 13px; line-height: 1.2; }
.liveMiniCard p { margin: 0 0 3px; color: #555; font-size: 12px; }
.liveMiniCard small { color: #777; font-size: 11px; font-weight: 800; }
.nextActivityCard { display: grid; gap: 9px; }
.nextActivityCard time { display: inline-flex; width: fit-content; background: #fff; color: #111; border-radius: 999px; padding: 8px 11px; font-size: 18px; font-weight: 950; letter-spacing: -0.04em; }
.nextActivityCard h3 { margin: 0; font-size: 24px; line-height: 1.1; color: #fff; }
.nextActivityCard p { margin: 0; color: rgba(255,255,255,.72); }
.nextActivityCard .agendaMeta { color: rgba(255,255,255,.75); }
.liveEmpty { background: #fff; border: 1px dashed #ddd; border-radius: 16px; padding: 18px; color: #666; font-weight: 800; }
.liveBlock.featured .liveEmpty { background: rgba(255,255,255,.08); border-color: rgba(255,255,255,.18); color: rgba(255,255,255,.7); }


:root {
  --cma-cool-sky: #5AA9E6;
  --cma-sky-blue: #7FC8F8;
  --cma-bright-snow: #F9F9F9;
  --cma-royal-gold: #FFE45E;
  --cma-rose-kiss: #FF6392;
  --cma-ink: #111111;
  --cma-soft-border: #dedede;
}

body {
  background:
    radial-gradient(circle at 12% 8%, rgba(127, 200, 248, .22), transparent 26%),
    radial-gradient(circle at 88% 3%, rgba(255, 99, 146, .16), transparent 24%),
    radial-gradient(circle at 70% 88%, rgba(255, 228, 94, .17), transparent 26%),
    var(--cma-bright-snow);
}

.sidebar {
  background: rgba(255,255,255,.86);
  backdrop-filter: blur(18px);
}

.sidebar nav button.active {
  background: linear-gradient(135deg, var(--cma-cool-sky), var(--cma-sky-blue));
  color: #fff;
}

.sidebar nav button:hover {
  background: rgba(90, 169, 230, .12);
}

.kpiIcon.blue { background: rgba(90,169,230,.22); color: #1f78b7; }
.kpiIcon.green { background: rgba(185,251,192,.42); color: #23703a; }
.kpiIcon.purple { background: rgba(205,180,219,.42); color: #6f4c84; }
.kpiIcon.yellow { background: rgba(255,228,94,.42); color: #8a6a00; }
.kpiIcon.peach { background: rgba(255,99,146,.22); color: #b72d61; }

.resultsCounter,
.dateRangePill,
.todayPill,
.chartTotal,
.badge,
.liveNowBadge,
.dataScopeControl,
.agendaHero,
.weeklyProgramHeader {
  box-shadow: 0 8px 26px rgba(90,169,230,.08);
}

.resultsCounter {
  background: #111;
  color: #fff;
}

.chips button.selected,
.tabs button.active,
.exportButtons button:hover,
.weeklyProgramActions button:hover,
.weeklyExportButtons button:hover,
.activityExportControls button:hover {
  background: linear-gradient(135deg, var(--cma-cool-sky), var(--cma-rose-kiss));
  color: #fff;
  border-color: transparent;
}

.chartCard,
.kpiCard,
.toolbar,
.panel,
.spaceCard,
.agendaSection,
.weeklyProgramControls,
.weeklyProgramExportArea,
.barcelonaLivePanel,
.dashboardFilterPanel {
  border-color: rgba(17,17,17,.10);
  box-shadow: 0 10px 28px rgba(17,17,17,.035);
}

.chartCardHeader .chartTitle span {
  background: rgba(127,200,248,.18);
  color: #1f78b7;
  border-radius: 999px;
  width: 30px;
  height: 30px;
  display: inline-grid;
  place-items: center;
}

.barcelonaLivePanel {
  background:
    linear-gradient(135deg, rgba(255,255,255,.96), rgba(249,249,249,.96)),
    radial-gradient(circle at 10% 0%, rgba(127,200,248,.22), transparent 32%),
    radial-gradient(circle at 100% 12%, rgba(255,99,146,.16), transparent 30%);
}

.liveNowBadge,
.dataScopeControl,
.agendaHero,
.weeklyProgramHeader,
.liveBlock.featured {
  background:
    radial-gradient(circle at 12% 20%, rgba(90,169,230,.36), transparent 34%),
    radial-gradient(circle at 90% 5%, rgba(255,99,146,.32), transparent 31%),
    #111;
}

.liveKpis div:nth-child(1),
.agendaAlert.ok,
.compactPills span:nth-child(4n+1) {
  background: rgba(90,169,230,.14);
}

.liveKpis div:nth-child(2),
.compactPills span:nth-child(4n+2) {
  background: rgba(127,200,248,.18);
}

.liveKpis div:nth-child(3),
.agendaAlert.review,
.compactPills span:nth-child(4n+3) {
  background: rgba(255,228,94,.22);
}

.liveKpis div:nth-child(4),
.agendaAlert.critical,
.compactPills span:nth-child(4n+4) {
  background: rgba(255,99,146,.16);
}

.tileMapPoint {
  background: var(--cma-rose-kiss);
}

.tileMapPoint.cluster {
  background: var(--cma-cool-sky);
}

.compactRankTrack i,
.districtGapBars i {
  background: linear-gradient(90deg, var(--cma-cool-sky), var(--cma-sky-blue)) !important;
}

.districtGapBars b {
  background: linear-gradient(90deg, var(--cma-royal-gold), var(--cma-rose-kiss)) !important;
}

.agendaStatus.critical,
.directionIssueTags span,
.agendaIssueTags span {
  background: rgba(255,99,146,.14);
  border-color: rgba(255,99,146,.28);
  color: #9f1f50;
}

.agendaStatus.review {
  background: rgba(255,228,94,.24);
  color: #7d6200;
}

.agendaStatus.ok {
  background: rgba(185,251,192,.38);
  color: #1e6b36;
}

.weeklyProgramItem:hover,
.agendaItem:hover,
.directionIssueItem:hover,
.spaceCard:hover {
  border-color: var(--cma-cool-sky);
  box-shadow: 0 10px 24px rgba(90,169,230,.13);
}

.weeklyProgramHeader .brand,
.agendaHero .eyebrow,
.barcelonaLivePanel .eyebrow {
  color: #fff;
}


.barcelona2026Welcome {
  position: relative;
  overflow: hidden;
  background:
    radial-gradient(circle at 12% 20%, rgba(255,228,94,.55), transparent 26%),
    radial-gradient(circle at 88% 10%, rgba(255,99,146,.34), transparent 30%),
    linear-gradient(135deg, #5AA9E6, #7FC8F8);
  color: #fff;
  border-radius: 30px;
  padding: 26px;
  margin-bottom: 22px;
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(300px, .6fr);
  gap: 22px;
  align-items: center;
  box-shadow: 0 18px 42px rgba(90,169,230,.22);
}

.barcelona2026Welcome::after {
  content: "";
  position: absolute;
  inset: -80px -120px auto auto;
  width: 260px;
  height: 260px;
  border-radius: 999px;
  background: rgba(255,255,255,.2);
  filter: blur(4px);
}

.barcelona2026Welcome h2 {
  position: relative;
  margin: 0 0 9px;
  color: #fff;
  font-size: clamp(30px, 4vw, 52px);
  line-height: .95;
  letter-spacing: -0.06em;
}

.barcelona2026Welcome p {
  position: relative;
  margin: 0;
  color: rgba(255,255,255,.86);
  font-size: 16px;
  line-height: 1.35;
}

.barcelona2026Welcome p strong {
  color: #fff;
}

.welcomeNext {
  position: relative;
  background: rgba(255,255,255,.18);
  border: 1px solid rgba(255,255,255,.3);
  border-radius: 24px;
  padding: 18px;
  backdrop-filter: blur(12px);
}

.welcomeNext span {
  display: block;
  color: rgba(255,255,255,.72);
  font-size: 11px;
  font-weight: 950;
  text-transform: uppercase;
  letter-spacing: .06em;
  margin-bottom: 8px;
}

.welcomeNext strong {
  display: block;
  font-size: 21px;
  line-height: 1.12;
  letter-spacing: -0.035em;
}

.welcomeNext small {
  display: block;
  color: rgba(255,255,255,.76);
  margin-top: 10px;
  font-weight: 800;
}


.catalogLayout { display: grid; grid-template-columns: minmax(0, 1fr) minmax(440px, .55fr); gap: 22px; align-items: start; }
.catalogGrid { display: grid; grid-template-columns: repeat(auto-fill, minmax(270px, 1fr)); gap: 16px; }
.catalogCard { background: #fff; border: 1px solid rgba(17,17,17,.10); border-radius: 26px; overflow: hidden; text-align: left; display: flex; flex-direction: column; min-height: 430px; box-shadow: 0 10px 28px rgba(17,17,17,.035); transition: .16s ease; }
.catalogCard:hover, .catalogCard.selected { transform: translateY(-2px); border-color: var(--cma-cool-sky); box-shadow: 0 16px 34px rgba(90,169,230,.16); }
.catalogImage { height: 170px; background: linear-gradient(135deg, rgba(90,169,230,.18), rgba(255,99,146,.12)); display: grid; place-items: center; color: #777; font-weight: 900; }
.catalogImage img { width: 100%; height: 100%; object-fit: cover; display: block; }
.catalogBody { padding: 16px; display: flex; flex-direction: column; gap: 10px; flex: 1; }
.catalogBody h3 { margin: 0; font-size: 19px; line-height: 1.08; letter-spacing: -0.035em; }
.catalogBody p { margin: 0; color: #555; font-size: 13px; line-height: 1.35; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }
.catalogMeta { display: grid; gap: 5px; color: #666; font-size: 12px; font-weight: 800; margin-top: auto; }
.catalogFooter { border-top: 1px solid #eee; padding-top: 11px; display: flex; justify-content: space-between; gap: 12px; align-items: center; font-size: 12px; color: #666; font-weight: 900; }
.catalogFooter strong { color: var(--cma-rose-kiss); }


body, button, input, select, textarea { font-family: Montserrat, Arial, sans-serif; }

.tempsHero { position: relative; display: grid; grid-template-columns: 220px minmax(0, 1fr) 220px; gap: 22px; align-items: stretch; background: #fff; border: 1px solid rgba(17,17,17,.10); border-radius: 34px; padding: 24px; box-shadow: 0 12px 34px rgba(17,17,17,.04); overflow: hidden; }
.tempsHero::before { content: ""; position: absolute; inset: 0; background: radial-gradient(circle at 15% 10%, rgba(127,200,248,.18), transparent 28%), radial-gradient(circle at 86% 18%, rgba(255,99,146,.12), transparent 30%), radial-gradient(circle at 50% 90%, rgba(255,228,94,.18), transparent 34%); pointer-events: none; }
.saintFigure { position: relative; z-index: 1; border: 1px solid #e7e7e2; background: rgba(255,255,255,.7); border-radius: 28px; padding: 18px; display: flex; flex-direction: column; justify-content: space-between; min-height: 360px; }
.saintFigure strong { display: block; font-size: 18px; letter-spacing: -0.04em; }
.saintFigure span { color: #666; font-size: 12px; font-weight: 800; }
.saintDrawing { position: relative; height: 270px; filter: grayscale(1); opacity: .78; }
.saintDrawing * { position: absolute; left: 50%; transform: translateX(-50%); border: 3px solid #111; }
.saintHalo { top: 12px; width: 96px; height: 96px; border-radius: 999px; border-width: 2px; }
.saintHead { top: 56px; width: 54px; height: 62px; border-radius: 45%; background: #fff; }
.saintBody { top: 122px; width: 96px; height: 128px; border-radius: 48px 48px 16px 16px; background: #fff; }
.saintCape { top: 132px; width: 150px; height: 126px; border-radius: 80px 80px 18px 18px; border-top-color: transparent; background: transparent; }
.saintPalm { top: 72px; left: 68%; width: 4px; height: 160px; border-width: 0 0 0 3px; transform: rotate(-18deg); }
.saintPalm::after { content: ""; position: absolute; top: -4px; left: -28px; width: 58px; height: 42px; border: 2px solid #111; border-bottom: 0; border-radius: 100% 100% 0 0; transform: rotate(24deg); }
.tempsCenter { position: relative; z-index: 1; text-align: center; display: flex; flex-direction: column; justify-content: center; padding: 26px; }
.tempsCenter h2 { font-size: clamp(92px, 14vw, 190px); line-height: .8; margin: 0; letter-spacing: -0.09em; color: #111; }
.tempsCenter > span { color: #555; font-size: 18px; font-weight: 900; margin-top: 12px; }
.tempsProgress { height: 18px; background: #efefed; border-radius: 999px; overflow: hidden; margin: 32px 0 12px; border: 1px solid #ddd; }
.tempsProgress i { display: block; height: 100%; background: linear-gradient(90deg, var(--cma-cool-sky), var(--cma-royal-gold), var(--cma-rose-kiss)); border-radius: inherit; }
.tempsDates { display: flex; justify-content: space-between; gap: 12px; color: #777; font-weight: 900; font-size: 12px; text-transform: uppercase; }
.tempsDates strong { color: #111; }
.tempsBigCounters { display: grid; grid-template-columns: 1.35fr 1fr 1fr 1fr; gap: 14px; margin: 18px 0; }
.tempsCounterCard { background: #fff; border: 1px solid rgba(17,17,17,.10); border-radius: 28px; padding: 20px; box-shadow: 0 10px 28px rgba(17,17,17,.035); min-height: 190px; display: flex; flex-direction: column; justify-content: space-between; }
.tempsCounterCard.main { background: radial-gradient(circle at 10% 10%, rgba(255,228,94,.42), transparent 34%), radial-gradient(circle at 90% 30%, rgba(127,200,248,.35), transparent 34%), #111; color: #fff; }
.tempsCounterCard span { color: #666; font-size: 12px; font-weight: 950; text-transform: uppercase; letter-spacing: .05em; }
.tempsCounterCard.main span, .tempsCounterCard.main p { color: rgba(255,255,255,.72); }
.tempsCounterCard strong { display: block; font-size: clamp(48px, 7vw, 92px); line-height: .85; letter-spacing: -0.08em; }
.tempsCounterCard p { margin: 0; color: #666; font-weight: 700; }
.tempsInsightGrid { display: grid; grid-template-columns: 1.45fr 1fr 1fr; gap: 14px; }
.tempsInsightCard { background: #fff; border: 1px solid rgba(17,17,17,.10); border-radius: 28px; padding: 20px; min-height: 260px; box-shadow: 0 10px 28px rgba(17,17,17,.035); }
.tempsInsightCard h2 { font-size: 32px; line-height: 1; letter-spacing: -0.055em; margin: 0 0 10px; }
.tempsInsightCard p { margin: 0; }
.tempsInsightCard.district { display: grid; grid-template-columns: .9fr 1.1fr; gap: 18px; align-items: center; }
.tempsMiniMap { height: 250px; display: grid; grid-template-columns: repeat(4, 1fr); grid-template-rows: repeat(5, 1fr); gap: 6px; transform: rotate(-2deg); }
.tempsMapCell { border: 1px solid #ddd; background: #f4f4f0; border-radius: 12px; display: grid; place-items: center; padding: 4px; text-align: center; color: #999; font-size: 8px; font-weight: 900; line-height: 1; }
.tempsMapCell.active { background: linear-gradient(135deg, var(--cma-cool-sky), var(--cma-rose-kiss)); color: #fff; border-color: transparent; box-shadow: 0 12px 28px rgba(90,169,230,.24); transform: scale(1.08); }
.tm-d1 { grid-column: 2; grid-row: 4; } .tm-d2 { grid-column: 2 / 4; grid-row: 3; } .tm-d3 { grid-column: 1 / 3; grid-row: 5; } .tm-d4 { grid-column: 1; grid-row: 4; } .tm-d5 { grid-column: 1 / 3; grid-row: 2; } .tm-d6 { grid-column: 3; grid-row: 2; } .tm-d7 { grid-column: 2 / 4; grid-row: 1; } .tm-d8 { grid-column: 4; grid-row: 1 / 3; } .tm-d9 { grid-column: 4; grid-row: 3; } .tm-d10 { grid-column: 4; grid-row: 4 / 6; }
.tempsMessage { margin-top: 18px; background: radial-gradient(circle at 12% 20%, rgba(255,228,94,.34), transparent 30%), linear-gradient(135deg, #5AA9E6, #7FC8F8); color: #fff; border-radius: 30px; padding: 26px; }
.tempsMessage h2 { color: #fff; font-size: clamp(28px, 4vw, 54px); line-height: .95; letter-spacing: -0.065em; margin: 0 0 10px; }
.tempsMessage p { color: rgba(255,255,255,.78); margin: 0; font-weight: 800; }

@media (max-width: 1000px) {

  .tempsHero { grid-template-columns: 1fr; }
  .saintFigure { min-height: 260px; }
  .tempsBigCounters { grid-template-columns: 1fr; }
  .tempsInsightGrid { grid-template-columns: 1fr; }
  .tempsInsightCard.district { grid-template-columns: 1fr; }

  .activitySearchRow {
    grid-template-columns: 1fr;
  }

  .resultsCounter {
    align-items: flex-start;
  }

  .activityFiltersRow {
    align-items: stretch;
  }

  .selectFilters {
    width: 100%;
    margin-left: 0;
  }

  .selectFilters label {
    width: 100%;
    justify-content: space-between;
  }

  .selectFilters select {
    max-width: 100%;
  }

  .detailTopBar {
    flex-direction: column;
  }

  .activityExportControls {
    align-self: flex-start;
  }
}


/* Temps de Capitalitat V2 visual */
.tempsHero,
.tempsBigCounters,
.tempsInsightGrid,
.tempsMessage {
  display: none !important;
}

.tempsV2Hero {
  position: relative;
  min-height: 460px;
  background:
    radial-gradient(circle at 10% 12%, rgba(90,169,230,.18), transparent 28%),
    radial-gradient(circle at 92% 15%, rgba(255,99,146,.14), transparent 30%),
    radial-gradient(circle at 52% 90%, rgba(255,228,94,.16), transparent 36%),
    #fff;
  border: 1px solid rgba(17,17,17,.10);
  border-radius: 34px;
  overflow: hidden;
  display: grid;
  grid-template-columns: 260px minmax(0, 1fr) 260px;
  align-items: stretch;
  box-shadow: 0 18px 46px rgba(17,17,17,.045);
}

.tempsSaintImage {
  width: 100%;
  height: 100%;
  object-fit: cover;
  filter: grayscale(1) contrast(1.06);
  opacity: .84;
  mix-blend-mode: multiply;
}

.tempsSaintImage.left {
  object-position: center;
  mask-image: linear-gradient(90deg, black 62%, transparent 100%);
}

.tempsSaintImage.right {
  object-position: center;
  mask-image: linear-gradient(270deg, black 62%, transparent 100%);
}

.tempsV2Center {
  position: relative;
  z-index: 2;
  text-align: center;
  display: flex;
  flex-direction: column;
  justify-content: center;
  padding: 38px 10px;
}

.tempsV2Center .eyebrow {
  color: #b34565;
  font-weight: 950;
}

.tempsV2Center h2 {
  margin: 0;
  font-size: clamp(112px, 16vw, 230px);
  line-height: .78;
  letter-spacing: -0.105em;
  color: #111;
}

.tempsV2Center > strong {
  display: block;
  margin-top: 12px;
  color: #333;
  font-size: 18px;
  letter-spacing: -0.02em;
}

.tempsV2Progress {
  height: 18px;
  width: min(720px, 90%);
  margin: 34px auto 12px;
  border-radius: 999px;
  background: #efefed;
  border: 1px solid rgba(17,17,17,.10);
  overflow: hidden;
}

.tempsV2Progress i {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, var(--cma-cool-sky), var(--cma-royal-gold), var(--cma-rose-kiss));
  box-shadow: 0 8px 24px rgba(255,99,146,.22);
}

.tempsV2Dates {
  width: min(720px, 90%);
  margin: 0 auto;
  display: flex;
  justify-content: space-between;
  gap: 12px;
  color: #777;
  font-size: 11px;
  font-weight: 950;
  text-transform: uppercase;
}

.tempsV2Dates b {
  color: #111;
}

.tempsV2Counters {
  display: grid;
  grid-template-columns: 1.35fr 1fr 1fr 1fr;
  gap: 14px;
  margin: 18px 0;
}

.tempsV2Counter {
  min-height: 200px;
  background:
    radial-gradient(circle at 86% 85%, rgba(90,169,230,.13), transparent 34%),
    #fff;
  border: 1px solid rgba(17,17,17,.10);
  border-radius: 28px;
  padding: 22px;
  box-shadow: 0 12px 30px rgba(17,17,17,.035);
  display: flex;
  flex-direction: column;
  justify-content: space-between;
}

.tempsV2Counter.dark {
  background:
    radial-gradient(circle at 86% 35%, rgba(90,169,230,.28), transparent 32%),
    #111;
  color: #fff;
}

.tempsV2Counter span {
  color: #666;
  font-size: 12px;
  font-weight: 950;
  text-transform: uppercase;
  letter-spacing: .05em;
}

.tempsV2Counter.dark span,
.tempsV2Counter.dark p {
  color: rgba(255,255,255,.76);
}

.tempsV2Counter strong {
  display: block;
  font-size: clamp(52px, 7vw, 96px);
  line-height: .82;
  letter-spacing: -0.09em;
}

.tempsV2Counter p {
  margin: 0;
  color: #666;
  font-size: 13px;
  font-weight: 800;
  line-height: 1.25;
}

.tempsV2MainGrid {
  display: grid;
  grid-template-columns: minmax(0, 1.55fr) minmax(340px, .65fr);
  gap: 14px;
  margin-bottom: 18px;
}

.tempsV2MapCard {
  background: #fff;
  border: 1px solid rgba(17,17,17,.10);
  border-radius: 30px;
  padding: 22px;
  display: grid;
  grid-template-columns: .42fr .58fr;
  gap: 18px;
  align-items: center;
  min-height: 460px;
  box-shadow: 0 12px 30px rgba(17,17,17,.035);
}

.tempsV2MapText h2 {
  font-size: clamp(34px, 4.5vw, 64px);
  line-height: .9;
  letter-spacing: -0.07em;
  margin: 0 0 12px;
}

.tempsV2MapText p {
  margin: 0;
  font-size: 14px;
  line-height: 1.35;
}

.tempsV2MapImageWrap {
  width: 100%;
  aspect-ratio: 1.35 / 1;
  border-radius: 26px;
  overflow: hidden;
  background: #f4f4f0;
}

.tempsV2MapImageWrap img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
  transform: scale(1.02);
}

.tempsV2SideCards {
  display: grid;
  gap: 14px;
}

.tempsV2InsightCard {
  background: #fff;
  border: 1px solid rgba(17,17,17,.10);
  border-radius: 30px;
  padding: 22px;
  box-shadow: 0 12px 30px rgba(17,17,17,.035);
  min-height: 223px;
}

.tempsV2InsightCard h2 {
  font-size: clamp(26px, 3vw, 44px);
  line-height: .95;
  letter-spacing: -0.065em;
  margin: 0 0 12px;
}

.tempsV2InsightCard p {
  margin: 0;
}

.tempsV2Quote {
  background:
    radial-gradient(circle at 10% 20%, rgba(255,228,94,.24), transparent 30%),
    linear-gradient(135deg, #5AA9E6, #7FC8F8);
  color: #fff;
  border-radius: 32px;
  padding: 26px;
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  gap: 28px;
}

.tempsV2Quote div {
  display: flex;
  gap: 18px;
  align-items: flex-start;
}

.tempsV2Quote span {
  font-size: 76px;
  line-height: .8;
  color: rgba(255,255,255,.55);
}

.tempsV2Quote h2 {
  color: #fff;
  font-size: clamp(28px, 4vw, 56px);
  line-height: .95;
  letter-spacing: -0.07em;
  margin: 0;
}

.tempsV2Quote p {
  color: rgba(255,255,255,.78);
  margin: 0;
  font-size: 12px;
  font-weight: 900;
  white-space: nowrap;
}

@media (max-width: 1000px) {
  .tempsV2Hero {
    grid-template-columns: 1fr;
  }

  .tempsSaintImage {
    display: none;
  }

  .tempsV2Counters,
  .tempsV2MainGrid,
  .tempsV2MapCard {
    grid-template-columns: 1fr;
  }

  .tempsV2Quote {
    flex-direction: column;
    align-items: flex-start;
  }

  .tempsV2Quote p {
    white-space: normal;
  }
}


/* Temps de Capitalitat V3 · interacció i jajas elegants */
.tempsInteractiveHero {
  cursor: crosshair;
}

.tempsConfettiLayer {
  position: absolute;
  inset: 0;
  pointer-events: none;
  z-index: 6;
  overflow: hidden;
}

.tempsConfettiLayer i {
  position: absolute;
  width: 9px;
  height: 14px;
  border-radius: 3px;
  opacity: .95;
  animation-name: tempsConfettiFall;
  animation-timing-function: cubic-bezier(.22,.8,.28,1);
  animation-fill-mode: forwards;
}

@keyframes tempsConfettiFall {
  0% {
    opacity: 1;
    translate: 0 0;
    scale: 1;
  }
  100% {
    opacity: 0;
    translate: calc((50vw - 50%) * .08) 130px;
    scale: .4;
  }
}

.tempsDaysButton {
  border: 0;
  background: transparent;
  font: inherit;
  font-size: clamp(112px, 16vw, 230px);
  line-height: .78;
  letter-spacing: -0.105em;
  color: #111;
  font-weight: 950;
  cursor: pointer;
  padding: 0;
  transition: transform .18s ease, filter .18s ease;
}

.tempsDaysButton:hover {
  transform: scale(1.035) rotate(-1deg);
  filter: drop-shadow(0 20px 28px rgba(255,99,146,.20));
}

.tempsV2Counter.interactive,
.tempsV2InsightCard.interactive {
  border: 1px solid rgba(17,17,17,.10);
  text-align: left;
  cursor: pointer;
  position: relative;
  overflow: hidden;
  transition: transform .18s ease, box-shadow .18s ease, border-color .18s ease;
}

.tempsV2Counter.interactive:hover,
.tempsV2InsightCard.interactive:hover {
  transform: translateY(-4px);
  border-color: rgba(90,169,230,.42);
  box-shadow: 0 18px 42px rgba(90,169,230,.14);
}

.tempsV2Counter.interactive::after,
.tempsV2InsightCard.interactive::after {
  content: "clic";
  position: absolute;
  right: 14px;
  top: 14px;
  background: rgba(17,17,17,.06);
  color: #555;
  border-radius: 999px;
  padding: 6px 9px;
  font-size: 10px;
  font-weight: 950;
  text-transform: uppercase;
  letter-spacing: .05em;
}

.tempsV2Counter.dark.interactive::after {
  background: rgba(255,255,255,.14);
  color: rgba(255,255,255,.72);
}

.tempsSparkline {
  position: absolute;
  right: 18px;
  bottom: 14px;
  width: 45%;
  height: 58px;
  opacity: .82;
  overflow: visible;
}

.tempsSparkline path {
  fill: none;
  stroke: currentColor;
  stroke-width: 5;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-dasharray: 250;
  stroke-dashoffset: 250;
  animation: tempsDrawLine 1.8s ease forwards;
}

.tempsV2Counter:hover .tempsSparkline path {
  animation: tempsDrawLine .9s ease forwards;
}

@keyframes tempsDrawLine {
  to { stroke-dashoffset: 0; }
}

.tempsSparkline.blue { color: #5AA9E6; }
.tempsSparkline.yellow { color: #E9A90D; }
.tempsSparkline.pink { color: #FF6392; }
.tempsSparkline.green { color: #48A868; }

.interactiveMap {
  transition: transform .2s ease, box-shadow .2s ease;
}

.interactiveMap:hover {
  transform: translateY(-3px);
  box-shadow: 0 20px 52px rgba(255,99,146,.12);
}

.interactiveMap:hover .tempsV2MapImageWrap img {
  transform: scale(1.055);
}

.tempsV2MapImageWrap img {
  transition: transform .45s ease;
}

.tempsV2Quote {
  transition: background .25s ease, transform .18s ease;
}

.tempsV2Quote.blue {
  background:
    radial-gradient(circle at 12% 20%, rgba(255,228,94,.24), transparent 30%),
    linear-gradient(135deg, #5AA9E6, #7FC8F8);
}

.tempsV2Quote.pink {
  background:
    radial-gradient(circle at 12% 20%, rgba(255,228,94,.28), transparent 30%),
    linear-gradient(135deg, #FF6392, #7FC8F8);
}

.tempsV2Quote.yellow {
  background:
    radial-gradient(circle at 80% 20%, rgba(255,99,146,.16), transparent 30%),
    linear-gradient(135deg, #FFE45E, #7FC8F8);
  color: #111;
}

.tempsV2Quote.yellow h2,
.tempsV2Quote.yellow p {
  color: #111;
}

.tempsV2Quote.green {
  background:
    radial-gradient(circle at 80% 20%, rgba(255,228,94,.24), transparent 30%),
    linear-gradient(135deg, #B9FBC0, #7FC8F8);
  color: #111;
}

.tempsV2Quote.green h2,
.tempsV2Quote.green p {
  color: #111;
}


/* Countdown en directe */
.tempsCountdownButton {
  display: inline-grid;
  justify-items: center;
  gap: 8px;
}

.tempsCountdownButton .countDays {
  display: block;
  font-size: clamp(112px, 16vw, 230px);
  line-height: .78;
  letter-spacing: -0.105em;
  font-weight: 950;
}

.tempsCountdownButton .countUnits {
  display: inline-flex;
  align-items: baseline;
  justify-content: center;
  gap: 8px;
  background: rgba(255,255,255,.72);
  border: 1px solid rgba(17,17,17,.10);
  border-radius: 999px;
  padding: 9px 15px;
  box-shadow: 0 8px 24px rgba(17,17,17,.05);
}

.tempsCountdownButton .countUnits b {
  font-size: clamp(18px, 2.2vw, 32px);
  line-height: 1;
  letter-spacing: -0.06em;
}

.tempsCountdownButton .countUnits em {
  font-style: normal;
  color: #777;
  font-size: 11px;
  font-weight: 950;
  text-transform: uppercase;
  margin-right: 4px;
}

.tempsCountdownButton:hover .countUnits {
  border-color: rgba(255,99,146,.28);
  box-shadow: 0 12px 28px rgba(255,99,146,.14);
}



/* Temps de Capitalitat V4 · gràfics reals i preview */
.tempsHero,
.tempsBigCounters,
.tempsInsightGrid,
.tempsMessage,
.tempsV2MainGrid {
  display: none !important;
}

.tempsPreviewHero {
  min-height: 520px;
  box-shadow: none;
  border-color: rgba(17,17,17,.08);
}

.tempsCountdownButton {
  display: inline-grid;
  justify-items: center;
  gap: 10px;
}

.tempsCountdownButton .countDays {
  display: block;
  font-size: clamp(116px, 16vw, 230px);
  line-height: .78;
  letter-spacing: -0.105em;
  font-weight: 950;
}

.tempsCountdownButton .countUnits {
  display: inline-flex !important;
  align-items: stretch;
  justify-content: center;
  gap: 8px;
  background: rgba(255,255,255,.82);
  border: 1px solid rgba(17,17,17,.10);
  border-radius: 18px;
  padding: 8px 10px !important;
  box-shadow: 0 10px 28px rgba(17,17,17,.06);
}

.tempsCountdownButton .countUnits > span {
  display: grid;
  min-width: 68px;
  text-align: center;
  padding: 4px 10px;
  border-right: 1px dashed rgba(255,99,146,.35);
}

.tempsCountdownButton .countUnits > span:last-child {
  border-right: 0;
}

.tempsCountdownButton .countUnits b {
  display: block !important;
  position: static !important;
  transform: none !important;
  font-size: 28px !important;
  line-height: 1 !important;
  letter-spacing: -0.055em !important;
}

.tempsCountdownButton .countUnits em {
  display: block !important;
  position: static !important;
  transform: none !important;
  margin: 4px 0 0 !important;
  color: #666 !important;
  font-size: 9px !important;
  font-weight: 950 !important;
  line-height: 1 !important;
  text-transform: uppercase;
  font-style: normal;
}

.tempsRealCounters {
  grid-template-columns: repeat(4, minmax(0, 1fr));
}

.tempsV2Counter.real {
  min-height: 230px;
  padding: 22px;
}

.tempsV2Counter.real strong {
  font-size: clamp(52px, 6vw, 88px);
  margin: 4px 0;
}

.tempsV2Counter.real p {
  max-width: 70%;
  position: relative;
  z-index: 2;
}

.realMiniChart {
  position: absolute;
  left: 18px;
  right: 18px;
  bottom: 14px;
  width: calc(100% - 36px);
  height: 104px;
  overflow: visible;
}

.realMiniChart .area {
  opacity: .18;
}

.realMiniChart .linePath {
  fill: none;
  stroke: currentColor;
  stroke-width: 4.5;
  stroke-linecap: round;
  stroke-linejoin: round;
  filter: drop-shadow(0 8px 14px rgba(0,0,0,.08));
}

.realMiniChart circle {
  fill: #fff;
  stroke: currentColor;
  stroke-width: 2.5;
}

.realMiniChart text {
  fill: #777;
  font-size: 9px;
  font-weight: 950;
  text-anchor: middle;
}

.realMiniChart.blue { color: #5AA9E6; }
.realMiniChart.yellow { color: #EAB308; }
.realMiniChart.green { color: #4CAF69; }

.realMiniChart.blue .area { fill: #5AA9E6; }
.realMiniChart.yellow .area { fill: #FFE45E; }
.realMiniChart.green .area { fill: #B9FBC0; }

.realBarChart {
  position: absolute;
  left: 22px;
  right: 22px;
  bottom: 18px;
  height: 100px;
  display: flex;
  align-items: end;
  gap: 11px;
}

.realBarChart span {
  flex: 1;
  display: grid;
  align-items: end;
  gap: 6px;
}

.realBarChart i {
  display: block;
  border-radius: 10px 10px 2px 2px;
  background: linear-gradient(180deg, #FF6392, rgba(255,99,146,.18));
  box-shadow: 0 10px 20px rgba(255,99,146,.18);
}

.realBarChart b {
  color: #777;
  font-size: 8px;
  font-weight: 950;
  text-align: center;
}

.tempsDashboardGrid {
  display: grid;
  grid-template-columns: minmax(0, 1.9fr) minmax(360px, .8fr);
  gap: 16px;
  margin-bottom: 18px;
}

.tempsDistrictStory {
  background: #fff;
  border: 1px solid rgba(17,17,17,.10);
  border-radius: 30px;
  padding: 24px;
  display: grid;
  grid-template-columns: .42fr .58fr;
  gap: 22px;
  align-items: center;
  min-height: 430px;
  box-shadow: 0 12px 30px rgba(17,17,17,.035);
}

.districtHeadline h2 {
  margin: 0 0 12px;
  font-size: clamp(44px, 6vw, 78px);
  line-height: .85;
  letter-spacing: -0.085em;
}

.districtHeadline p {
  margin: 0;
  font-size: 14px;
}

.districtMapFrame {
  position: relative;
  aspect-ratio: 1.35 / 1;
  border-radius: 26px;
  overflow: hidden;
  background: #f4f4f0;
  box-shadow: inset 0 0 0 1px rgba(17,17,17,.06);
}

.districtMapFrame img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
  transform: scale(1.02);
  transition: transform .45s ease;
}

.tempsDistrictStory:hover .districtMapFrame img {
  transform: scale(1.065);
}

.mapTooltip {
  position: absolute;
  left: 50%;
  bottom: 18px;
  transform: translateX(-50%);
  background: rgba(255,255,255,.92);
  border: 1px solid rgba(255,99,146,.20);
  border-radius: 16px;
  padding: 11px 13px;
  min-width: 150px;
  box-shadow: 0 12px 28px rgba(17,17,17,.10);
}

.mapTooltip b,
.mapTooltip span,
.mapTooltip small {
  display: block;
}

.mapTooltip b {
  font-size: 14px;
  letter-spacing: -0.03em;
}

.mapTooltip span {
  color: #555;
  font-size: 12px;
  font-weight: 800;
}

.mapTooltip small {
  color: #777;
  font-size: 11px;
  font-weight: 800;
}

.tempsSidePanel {
  display: grid;
  gap: 16px;
}

.spaceHeroCard,
.categoryDonutCard {
  position: relative;
  overflow: hidden;
  min-height: 207px;
  border: 1px solid rgba(17,17,17,.10);
  border-radius: 30px;
  background: #fff;
  padding: 22px;
  text-align: left;
  box-shadow: 0 12px 30px rgba(17,17,17,.035);
  cursor: pointer;
}

.spaceHeroCard img {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  opacity: .48;
  filter: saturate(.8) contrast(.95);
}

.spaceHeroCard.hasImage::after {
  content: "";
  position: absolute;
  inset: 0;
  background: linear-gradient(90deg, rgba(255,255,255,.96) 0%, rgba(255,255,255,.78) 52%, rgba(255,255,255,.12) 100%);
}

.spaceHeroCard div {
  position: relative;
  z-index: 2;
  max-width: 70%;
}

.spaceHeroCard h2,
.categoryDonutCard h2 {
  margin: 0 0 10px;
  font-size: clamp(28px, 3.4vw, 46px);
  line-height: .92;
  letter-spacing: -0.07em;
}

.spaceHeroCard span,
.categoryDonutCard p {
  color: #555;
  font-size: 14px;
  font-weight: 700;
}

.categoryDonutCard {
  display: grid;
  grid-template-columns: .65fr .85fr;
  gap: 14px;
  align-items: center;
}

.donutWrap {
  display: grid;
  grid-template-columns: 120px minmax(0, 1fr);
  gap: 12px;
  align-items: center;
}

.donutChart {
  width: 120px;
  height: 120px;
  transform: rotate(-90deg);
}

.donutBase {
  fill: none;
  stroke: #eee;
  stroke-width: 18;
}

.donutSegment {
  fill: none;
  stroke-width: 18;
  stroke-linecap: butt;
  transition: stroke-width .18s ease;
}

.donutHole {
  fill: #fff;
}

.donutLegend {
  display: grid;
  gap: 7px;
}

.donutLegend span {
  display: grid;
  grid-template-columns: 10px minmax(0,1fr) auto;
  gap: 7px;
  align-items: center;
  font-size: 11px;
  font-weight: 850;
}

.donutLegend i {
  width: 9px;
  height: 9px;
  border-radius: 999px;
}

.donutLegend b {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.donutLegend em {
  color: #555;
  font-style: normal;
}

.tempsConfettiLayer {
  position: absolute;
  inset: 0;
  pointer-events: none;
  z-index: 6;
  overflow: hidden;
}

.tempsConfettiLayer i {
  position: absolute;
  width: 9px;
  height: 14px;
  border-radius: 3px;
  opacity: .95;
  animation-name: tempsConfettiFall;
  animation-timing-function: cubic-bezier(.22,.8,.28,1);
  animation-fill-mode: forwards;
}

@keyframes tempsConfettiFall {
  0% { opacity: 1; translate: 0 0; scale: 1; }
  100% { opacity: 0; translate: 0 130px; scale: .4; }
}

.tempsV2Quote {
  min-height: 92px;
}

@media (max-width: 1200px) {
  .tempsRealCounters,
  .tempsDashboardGrid {
    grid-template-columns: 1fr 1fr;
  }

  .tempsDistrictStory {
    grid-column: 1 / -1;
  }
}

@media (max-width: 800px) {
  .tempsRealCounters,
  .tempsDashboardGrid,
  .tempsDistrictStory,
  .categoryDonutCard {
    grid-template-columns: 1fr;
  }

  .spaceHeroCard div {
    max-width: 100%;
  }

  .tempsCountdownButton .countUnits {
    flex-wrap: wrap;
  }
}

`;


const rootElement = document.getElementById("root");
const root = createRoot(rootElement);
root.render(React.createElement(App));
