import { useEffect, useMemo, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { createPortal } from 'react-dom';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import { API_URL } from './api';
import './ReportsPage.css';

type Role = 'SUPERVISOR' | 'INSPECTOR' | 'TECHNICIAN';
type Person = { id: string; name: string; role: Role; color?: string; defaultSupervisorId?: string };
type IncidentType = { id: string; name: string; color?: string };
type ReportAttachment = { id: string; fileName: string; mimeType: string; size: number; sharepointWebUrl: string; createdAt: string };
type ReportUploadSession = { id: string; size: number; nextByte: number; expiresAt: string };
type ReportChunkResult = { complete: boolean; nextByte?: number; attachment?: ReportAttachment };
type Incident = {
  id: string; occurredAt: string; propertyId?: string; propertyName: string; importance: 'HIGH' | 'MEDIUM' | 'LOW';
  description: string; requiresInspector: boolean; status: 'PENDING' | 'SOLVED'; resolution?: string;
  solvedAt?: string; type: IncidentType; technician: Person; supervisor: Person; inspector?: Person;
  typeId: string; technicianId: string; supervisorId: string; inspectorId?: string; attachments: ReportAttachment[];
};
type Dashboard = { incidents: Incident[]; people: Person[]; types: IncidentType[] };
type IncidentForm = { occurredAt: string; propertyName: string; typeId: string; importance: 'HIGH' | 'MEDIUM' | 'LOW'; description: string; technicianId: string; supervisorId: string; requiresInspector: boolean; inspectorId: string };
type DistributionKey = 'type' | 'property' | 'technician' | 'supervisor' | 'inspector' | 'importance' | 'status';
type QuickView = 'ALL' | 'PENDING' | 'SOLVED' | 'INSPECTION';
type PeriodMode = 'ALL' | 'DAY' | 'RANGE' | 'MONTH';

const today = () => new Date().toISOString().slice(0, 10);
const monthStart = () => `${today().slice(0, 8)}01`;
const blankForm = (): IncidentForm => ({ occurredAt: today(), propertyName: '', typeId: '', importance: 'MEDIUM', description: '', technicianId: '', supervisorId: '', requiresInspector: false, inspectorId: '' });
const importanceLabel = (value: string) => value === 'HIGH' ? 'High' : value === 'LOW' ? 'Low' : 'Medium';
const statusLabel = (value: string) => value === 'SOLVED' ? 'Solved' : 'Pending';
const dateKey = (value: string) => value.slice(0, 10);
const displayDate = (value: string) => new Date(`${dateKey(value)}T00:00:00`).toLocaleDateString('en-US');
const reportDate = (value: string, long = false) => new Date(`${dateKey(value)}T00:00:00`).toLocaleDateString('es-ES', long ? { day: 'numeric', month: 'long', year: 'numeric' } : { day: '2-digit', month: '2-digit', year: 'numeric' });
const csvCell = (value: unknown) => `"${String(value ?? '').replaceAll('"', '""')}"`;
const htmlText = (value: unknown) => String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const isPerson = (item: Person | IncidentType): item is Person => 'role' in item;
const fileSize = (bytes: number) => bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
const reportImportanceLabel = (value: string) => value === 'HIGH' ? 'Alta' : value === 'LOW' ? 'Baja' : 'Media';
const reportStatusLabel = (value: string) => value === 'SOLVED' ? 'Solucionada' : 'Pendiente';
const REPORT_COLOR_PALETTE = ['#55b5d3', '#72a7db', '#8a83d5', '#cf8bd6', '#ef946b', '#e8b552', '#80c49e', '#52b7a5'];

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, options);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(typeof data.message === 'string' ? data.message : 'Unable to complete this action.');
  return data as T;
}

export function ReportsPage({ sidebar, properties }: { sidebar: ReactNode; properties: Array<{ id: string; name: string }> }) {
  const [dashboard, setDashboard] = useState<Dashboard>({ incidents: [], people: [], types: [] });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [quickView, setQuickView] = useState<QuickView>('ALL');
  const [search, setSearch] = useState('');
  const [periodMode, setPeriodMode] = useState<PeriodMode>('ALL');
  const [day, setDay] = useState(today());
  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState(today());
  const [month, setMonth] = useState(today().slice(0, 7));
  const [propertyFilter, setPropertyFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [importanceFilter, setImportanceFilter] = useState('');
  const [technicianFilter, setTechnicianFilter] = useState('');
  const [supervisorFilter, setSupervisorFilter] = useState('');
  const [inspectorFilter, setInspectorFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [activeDistribution, setActiveDistribution] = useState<DistributionKey>('type');
  const [editing, setEditing] = useState<Incident | null | 'new'>(null);
  const [form, setForm] = useState<IncidentForm>(blankForm());
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [supervisorHint, setSupervisorHint] = useState('');
  const [solving, setSolving] = useState<Incident | null>(null);
  const [resolution, setResolution] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [configKind, setConfigKind] = useState<'type' | 'supervisor' | 'inspector' | 'technician'>('supervisor');
  const [newOption, setNewOption] = useState('');
  const [newOptionColor, setNewOptionColor] = useState(REPORT_COLOR_PALETTE[0]);
  const [colorPickerFor, setColorPickerFor] = useState<string | null>(null);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportMode, setReportMode] = useState<'DAY' | 'RANGE'>('DAY');
  const [reportDay, setReportDay] = useState(today());
  const [reportFrom, setReportFrom] = useState(monthStart());
  const [reportTo, setReportTo] = useState(today());
  const [printing, setPrinting] = useState(false);

  async function load() {
    setLoading(true);
    try { setDashboard(await request<Dashboard>('/reports')); setError(''); }
    catch (loadError) { setError((loadError as Error).message); }
    finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, []);
  useEffect(() => {
    if (!printing) return undefined;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const sheet = document.querySelector<HTMLElement>('.reports-pdf-capture .reports-print-sheet');
          if (!sheet) throw new Error('The report is not ready to export.');
          const canvas = await html2canvas(sheet, { backgroundColor: '#ffffff', scale: 2, useCORS: true, logging: false });
          if (cancelled) return;
          const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
          const pageWidth = 210;
          const pageHeight = 297;
          const scale = Math.min(pageWidth / canvas.width, pageHeight / canvas.height);
          const width = canvas.width * scale;
          const height = canvas.height * scale;
          pdf.addImage(canvas.toDataURL('image/png'), 'PNG', (pageWidth - width) / 2, (pageHeight - height) / 2, width, height);
          pdf.save(`blue-life-reporte-${reportDay || 'periodo'}.pdf`);
        } catch (error) {
          window.alert(error instanceof Error ? error.message : 'No fue posible crear el PDF.');
        } finally {
          if (!cancelled) setPrinting(false);
        }
      })();
    }, 120);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [printing, reportDay]);

  const people = (role: Role) => dashboard.people.filter((person) => person.role === role);
  const supervisors = people('SUPERVISOR');
  const technicians = people('TECHNICIAN');
  const inspectors = people('INSPECTOR');
  const propertiesInHistory = Array.from(new Set([...properties.map((item) => item.name), ...dashboard.incidents.map((item) => item.propertyName)])).filter(Boolean).sort();

  const filtered = useMemo(() => dashboard.incidents.filter((incident) => {
    const date = dateKey(incident.occurredAt);
    const query = search.trim().toLowerCase();
    if (quickView === 'PENDING' && incident.status !== 'PENDING') return false;
    if (quickView === 'SOLVED' && incident.status !== 'SOLVED') return false;
    if (quickView === 'INSPECTION' && !incident.requiresInspector) return false;
    if (query && !`${incident.propertyName} ${incident.description} ${incident.resolution ?? ''}`.toLowerCase().includes(query)) return false;
    if (periodMode === 'DAY' && date !== day) return false;
    if (periodMode === 'RANGE' && (date < from || date > to)) return false;
    if (periodMode === 'MONTH' && !date.startsWith(month)) return false;
    if (propertyFilter && incident.propertyName !== propertyFilter) return false;
    if (typeFilter && incident.type.id !== typeFilter) return false;
    if (importanceFilter && incident.importance !== importanceFilter) return false;
    if (technicianFilter && incident.technician.id !== technicianFilter) return false;
    if (supervisorFilter && incident.supervisor.id !== supervisorFilter) return false;
    if (inspectorFilter === 'none' && incident.inspector) return false;
    if (inspectorFilter && inspectorFilter !== 'none' && incident.inspector?.id !== inspectorFilter) return false;
    if (statusFilter && incident.status !== statusFilter) return false;
    return true;
  }).sort((a, b) => (a.status === b.status ? 0 : a.status === 'PENDING' ? -1 : 1) || dateKey(b.occurredAt).localeCompare(dateKey(a.occurredAt))), [dashboard.incidents, quickView, search, periodMode, day, from, to, month, propertyFilter, typeFilter, importanceFilter, technicianFilter, supervisorFilter, inspectorFilter, statusFilter]);

  const quickCounts = {
    ALL: dashboard.incidents.length,
    PENDING: dashboard.incidents.filter((item) => item.status === 'PENDING').length,
    SOLVED: dashboard.incidents.filter((item) => item.status === 'SOLVED').length,
    INSPECTION: dashboard.incidents.filter((item) => item.requiresInspector).length,
  };
  const kpis = { total: filtered.length, pending: filtered.filter((item) => item.status === 'PENDING').length, solved: filtered.filter((item) => item.status === 'SOLVED').length, inspections: filtered.filter((item) => item.requiresInspector).length };

  function distribution(items: Incident[], key: DistributionKey) {
    const counts = new Map<string, { id: string; label: string; color: string; count: number }>();
    for (const incident of items) {
      let id = '', label = '', color = '#aeb8c4';
      if (key === 'type') ({ id, name: label, color = '#72a7db' } = incident.type);
      if (key === 'property') { id = incident.propertyName; label = incident.propertyName; color = '#61c39a'; }
      if (key === 'technician') ({ id, name: label, color = '#72a7db' } = incident.technician);
      if (key === 'supervisor') ({ id, name: label, color = '#72a7db' } = incident.supervisor);
      if (key === 'inspector') { id = incident.inspector?.id ?? 'none'; label = incident.inspector?.name ?? 'No inspector required'; color = incident.inspector?.color ?? '#aeb8c4'; }
      if (key === 'importance') { id = incident.importance; label = importanceLabel(id); color = id === 'HIGH' ? '#df5f63' : id === 'MEDIUM' ? '#e8b552' : '#9da9b5'; }
      if (key === 'status') { id = incident.status; label = statusLabel(id); color = id === 'SOLVED' ? '#68b887' : '#efad84'; }
      const current = counts.get(id);
      counts.set(id, { id, label, color, count: (current?.count ?? 0) + 1 });
    }
    return Array.from(counts.values()).sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
  }
  const distributionRows = distribution(filtered, activeDistribution);

  function applyDistribution(row: { id: string }) {
    if (activeDistribution === 'type') setTypeFilter(row.id);
    if (activeDistribution === 'technician') setTechnicianFilter(row.id);
    if (activeDistribution === 'supervisor') setSupervisorFilter(row.id);
    if (activeDistribution === 'inspector') setInspectorFilter(row.id);
    if (activeDistribution === 'importance') setImportanceFilter(row.id);
    if (activeDistribution === 'status') setStatusFilter(row.id);
  }

  function clearFilters() {
    setSearch(''); setPeriodMode('ALL'); setPropertyFilter(''); setTypeFilter(''); setImportanceFilter('');
    setTechnicianFilter(''); setSupervisorFilter(''); setInspectorFilter(''); setStatusFilter(''); setQuickView('ALL');
  }

  function openNew() { setForm(blankForm()); setPendingFiles([]); setEditing('new'); setSupervisorHint(''); setError(''); }
  function openEdit(incident: Incident) {
    setForm({ occurredAt: dateKey(incident.occurredAt), propertyName: incident.propertyName, typeId: incident.type.id, importance: incident.importance, description: incident.description, technicianId: incident.technician.id, supervisorId: incident.supervisor.id, requiresInspector: incident.requiresInspector, inspectorId: incident.inspector?.id ?? '' });
    setPendingFiles([]); setEditing(incident); setSupervisorHint(''); setError('');
  }
  function selectTechnician(id: string) {
    const technician = technicians.find((person) => person.id === id);
    const suggested = technician?.defaultSupervisorId;
    setForm((current) => ({ ...current, technicianId: id, supervisorId: suggested || current.supervisorId }));
    setSupervisorHint(suggested ? `Default supervisor suggested for ${technician?.name}. You can change it for this report.` : '');
  }
  async function saveIncident(event: FormEvent) {
    event.preventDefault(); if (busy || !editing) return;
    setBusy(true); setError('');
    try {
      const selectedProperty = properties.find((item) => item.name.trim().toLocaleLowerCase() === form.propertyName.trim().toLocaleLowerCase());
      if (pendingFiles.length && !selectedProperty) throw new Error('Choose a property registered in Commercial to upload photos or videos.');
      const payload = { ...form, propertyId: selectedProperty?.id ?? null, inspectorId: form.requiresInspector ? form.inspectorId : undefined };
      const path = editing === 'new' ? '/reports/incidents' : `/reports/incidents/${editing.id}`;
      let saved = await request<Incident>(path, { method: editing === 'new' ? 'POST' : 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const failed: string[] = [];
      for (const file of pendingFiles) {
        try {
          const session = await request<ReportUploadSession>(`/reports/incidents/${saved.id}/attachments/sessions`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ fileName: file.name, mimeType: file.type, size: file.size }),
          });
          const chunkSize = 3_276_800;
          let attachment: ReportAttachment | undefined;
          for (let start = 0; start < file.size; start += chunkSize) {
            const body = new FormData(); body.append('file', file.slice(start, Math.min(start + chunkSize, file.size)), file.name);
            const result = await request<ReportChunkResult>(`/reports/incidents/${saved.id}/attachments/sessions/${session.id}/chunks`, { method: 'POST', body });
            if (result.attachment) attachment = result.attachment;
          }
          if (!attachment) throw new Error('SharePoint did not confirm the completed upload.');
          saved = { ...saved, attachments: [...(saved.attachments ?? []), attachment] };
        } catch { failed.push(file.name); }
      }
      setDashboard((current) => ({ ...current, incidents: editing === 'new' ? [saved, ...current.incidents] : current.incidents.map((item) => item.id === saved.id ? saved : item) }));
      setPendingFiles([]);
      setEditing(null);
      if (failed.length) setError(`The report was saved, but these files could not be uploaded to SharePoint: ${failed.join(', ')}.`);
    } catch (saveError) { setError((saveError as Error).message); }
    finally { setBusy(false); }
  }
  async function solveIncident(event: FormEvent) {
    event.preventDefault(); if (!solving || !confirmed || !resolution.trim() || busy) return;
    setBusy(true); setError('');
    try {
      const saved = await request<Incident>(`/reports/incidents/${solving.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'SOLVED', resolution: resolution.trim() }) });
      setDashboard((current) => ({ ...current, incidents: current.incidents.map((item) => item.id === saved.id ? saved : item) }));
      setSolving(null); setResolution(''); setConfirmed(false);
    } catch (solveError) { setError((solveError as Error).message); }
    finally { setBusy(false); }
  }
  async function reopen(incident: Incident) {
    if (!window.confirm(`Reopen the report for ${incident.propertyName}?`)) return;
    const saved = await request<Incident>(`/reports/incidents/${incident.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'PENDING' }) });
    setDashboard((current) => ({ ...current, incidents: current.incidents.map((item) => item.id === saved.id ? saved : item) }));
  }
  async function removeIncident(incident: Incident) {
    if (!window.confirm(`Delete the report for ${incident.propertyName}?`)) return;
    await request(`/reports/incidents/${incident.id}`, { method: 'DELETE' });
    setDashboard((current) => ({ ...current, incidents: current.incidents.filter((item) => item.id !== incident.id) }));
  }

  const configItems = configKind === 'type' ? dashboard.types : dashboard.people.filter((person) => person.role === configKind.toUpperCase());
  async function saveOption(event: FormEvent) {
    event.preventDefault(); if (!newOption.trim() || busy) return;
    setBusy(true);
    try { await request(`/reports/config/${configKind}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: newOption.trim(), color: configKind === 'technician' ? newOptionColor : undefined }) }); setNewOption(''); await load(); }
    catch (optionError) { setError((optionError as Error).message); }
    finally { setBusy(false); }
  }
  async function renameOption(item: Person | IncidentType) {
    const name = window.prompt('New name', item.name)?.trim(); if (!name || name === item.name) return;
    await request(`/reports/config/${configKind}/${item.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, color: item.color, defaultSupervisorId: isPerson(item) ? item.defaultSupervisorId : undefined }) });
    await load();
  }
  async function deleteOption(item: Person | IncidentType) {
    if (!window.confirm(`Remove ${item.name} from this list? Existing history will be preserved.`)) return;
    await request(`/reports/config/${configKind}/${item.id}`, { method: 'DELETE' }); await load();
  }
  async function setDefaultSupervisor(technician: Person, supervisorId: string) {
    await request(`/reports/config/technician/${technician.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: technician.name, color: technician.color, defaultSupervisorId: supervisorId || undefined }) });
    await load();
  }
  async function setOptionColor(technician: Person, color: string) {
    await request(`/reports/config/technician/${technician.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: technician.name, color, defaultSupervisorId: technician.defaultSupervisorId }) });
    setColorPickerFor(null);
    await load();
  }

  const reportItems = useMemo(() => dashboard.incidents.filter((incident) => {
    const date = dateKey(incident.occurredAt); return reportMode === 'DAY' ? date === reportDay : date >= [reportFrom, reportTo].sort()[0] && date <= [reportFrom, reportTo].sort()[1];
  }).sort((a, b) => dateKey(a.occurredAt).localeCompare(dateKey(b.occurredAt))), [dashboard.incidents, reportMode, reportDay, reportFrom, reportTo]);
  const reportTitle = reportMode === 'DAY' ? `Reporte del ${reportDate(reportDay, true)}` : 'Reporte por rango de fechas';
  const reportSubtitle = reportMode === 'DAY' ? `Fecha: ${reportDate(reportDay)}` : `Del ${reportDate([reportFrom, reportTo].sort()[0], true)} al ${reportDate([reportFrom, reportTo].sort()[1], true)}`;

  function exportCsv(items = filtered) {
    const headers = ['Fecha', 'Propiedad', 'Tipo de novedad', 'Importancia', 'Descripción', 'Supervisor', 'Técnico', 'Requiere inspector', 'Inspector', 'Estado', 'Qué se hizo'];
    const rows = items.map((item) => [reportDate(item.occurredAt), item.propertyName, item.type.name, reportImportanceLabel(item.importance), item.description, item.supervisor.name, item.technician.name, item.requiresInspector ? 'Sí' : 'No', item.inspector?.name ?? 'No aplica', reportStatusLabel(item.status), item.resolution ?? '']);
    const blob = new Blob([[headers, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = `blue-life-reports-${today()}.csv`; link.click(); URL.revokeObjectURL(link.href);
  }
  function downloadExcelReport() {
    const headers = ['Fecha', 'Propiedad', 'Tipo', 'Importancia', 'Descripción', 'Inspector', 'Técnico', 'Supervisor', 'Estado'];
    const rows = reportItems.map((item) => [dateKey(item.occurredAt), item.propertyName, item.type.name, reportImportanceLabel(item.importance), item.description, item.inspector?.name ?? 'No aplica', item.technician.name, item.supervisor.name, reportStatusLabel(item.status)]);
    const cell = (value: unknown, header = false) => `<Cell${header ? ' ss:StyleID="Header"' : ''}><Data ss:Type="String">${htmlText(value)}</Data></Cell>`;
    const content = `<?xml version="1.0"?><Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"><Styles><Style ss:ID="Header"><Font ss:Bold="1" ss:Color="#FFFFFF"/><Interior ss:Color="#0E6B85" ss:Pattern="Solid"/></Style></Styles><Worksheet ss:Name="Reporte"><Table><Row>${headers.map((header) => cell(header, true)).join('')}</Row>${rows.map((row) => `<Row>${row.map((value) => cell(value)).join('')}</Row>`).join('')}</Table></Worksheet></Workbook>`;
    const blob = new Blob([content], { type: 'application/vnd.ms-excel;charset=utf-8' }); const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = `blue-life-reporte-${reportMode === 'DAY' ? reportDay : `${reportFrom}_a_${reportTo}`}.xls`; link.click(); URL.revokeObjectURL(link.href);
  }

  const missingLists = supervisors.length === 0 || technicians.length === 0 || inspectors.length === 0;

  return <div className="page app-page reports-page">{sidebar}
    <header className="area-page-header reports-header"><div><span className="area-eyebrow">OPERATIONS & ACCOUNTABILITY</span><h1>Reports</h1><p>Track field incidents, ownership, inspections and resolution in one shared control center.</p></div><div className="reports-header-actions"><button className="reports-button reports-button-ghost" onClick={() => setSettingsOpen(true)}>Settings</button><button className="reports-button reports-button-secondary" onClick={() => setReportOpen(true)}>Period report</button><button className="reports-button reports-button-primary" onClick={openNew}>+ New report</button></div></header>
    {error && <div className="reports-message" role="alert">{error}</div>}
    {missingLists && !loading && <button className="reports-setup-banner" onClick={() => setSettingsOpen(true)}><strong>Complete setup</strong><span>Add supervisors, technicians and inspectors before registering the first report.</span><b>Open settings →</b></button>}
    <nav className="reports-quick-nav" aria-label="Quick report views">{([['ALL','All'],['PENDING','Pending'],['SOLVED','Solved'],['INSPECTION','Require inspector']] as Array<[QuickView,string]>).map(([key,label])=><button key={key} className={quickView===key?'reports-quick-active':''} onClick={()=>setQuickView(key)}><span>{quickCounts[key]}</span>{label}</button>)}</nav>
    <section className="reports-kpis"><article><span>Total reports</span><strong>{kpis.total}</strong><small>Current selection</small></article><article className="reports-kpi-pending"><span>Pending</span><strong>{kpis.pending}</strong><small>Needs action</small></article><article className="reports-kpi-solved"><span>Solved</span><strong>{kpis.solved}</strong><small>Work completed</small></article><article className="reports-kpi-inspector"><span>Require inspector</span><strong>{kpis.inspections}</strong><small>Inspection follow-up</small></article></section>
    <section className="reports-filter-card"><div className="reports-filter-heading"><div><h2>Filters</h2><p>All filters work together and update the metrics, distribution and table.</p></div><button onClick={clearFilters}>Clear filters</button></div><div className="reports-filter-grid"><label className="reports-search-field"><span>Quick search</span><input placeholder="Property, description or resolution" value={search} onChange={(event)=>setSearch(event.target.value)} /></label><label><span>Period</span><select value={periodMode} onChange={(event)=>setPeriodMode(event.target.value as PeriodMode)}><option value="ALL">All dates</option><option value="DAY">Day</option><option value="RANGE">Date range</option><option value="MONTH">Month</option></select></label>{periodMode==='DAY'&&<label><span>Date</span><input type="date" value={day} onChange={(event)=>setDay(event.target.value)} /></label>}{periodMode==='RANGE'&&<><label><span>From</span><input type="date" value={from} onChange={(event)=>setFrom(event.target.value)} /></label><label><span>To</span><input type="date" value={to} onChange={(event)=>setTo(event.target.value)} /></label></>}{periodMode==='MONTH'&&<label><span>Month</span><input type="month" value={month} onChange={(event)=>setMonth(event.target.value)} /></label>}<label><span>Property</span><select value={propertyFilter} onChange={(event)=>setPropertyFilter(event.target.value)}><option value="">All properties</option>{propertiesInHistory.map((name)=><option key={name}>{name}</option>)}</select></label><label><span>Type</span><select value={typeFilter} onChange={(event)=>setTypeFilter(event.target.value)}><option value="">All types</option>{dashboard.types.map((item)=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label><span>Importance</span><select value={importanceFilter} onChange={(event)=>setImportanceFilter(event.target.value)}><option value="">All levels</option><option value="HIGH">High</option><option value="MEDIUM">Medium</option><option value="LOW">Low</option></select></label><label><span>Technician</span><select value={technicianFilter} onChange={(event)=>setTechnicianFilter(event.target.value)}><option value="">All technicians</option>{technicians.map((item)=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label><span>Supervisor</span><select value={supervisorFilter} onChange={(event)=>setSupervisorFilter(event.target.value)}><option value="">All supervisors</option>{supervisors.map((item)=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label><span>Inspector</span><select value={inspectorFilter} onChange={(event)=>setInspectorFilter(event.target.value)}><option value="">All inspector options</option><option value="none">No inspector required</option>{inspectors.map((item)=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label><span>Status</span><select value={statusFilter} onChange={(event)=>setStatusFilter(event.target.value)}><option value="">All statuses</option><option value="PENDING">Pending</option><option value="SOLVED">Solved</option></select></label></div></section>
    <section className="reports-distribution-card"><div className="reports-section-heading"><div><h2>Distribution</h2><p>Click a bar to apply it as a filter.</p></div><span>{filtered.length} reports</span></div><div className="reports-distribution-tabs">{(['type','technician','supervisor','inspector','importance','status'] as DistributionKey[]).map((key)=><button key={key} className={activeDistribution===key?'active':''} onClick={()=>setActiveDistribution(key)}>{key[0].toUpperCase()+key.slice(1)}</button>)}</div><div className="reports-bars">{distributionRows.length===0?<p className="reports-empty">No data for this selection.</p>:distributionRows.map((row)=><button key={row.id} className="reports-bar-row" onClick={()=>applyDistribution(row)}><span className="reports-bar-label"><i style={{background:row.color}} />{row.label}</span><span className="reports-bar-track"><i style={{width:`${filtered.length?Math.max(3,row.count/filtered.length*100):0}%`,background:row.color}} /></span><strong>{filtered.length?Math.round(row.count/filtered.length*100):0}% <small>· {row.count}</small></strong></button>)}</div></section>
    <section className="reports-table-card"><div className="reports-section-heading"><div><h2>{quickView==='ALL'?'Report history':quickView==='INSPECTION'?'Reports requiring inspector':`${quickView[0]}${quickView.slice(1).toLowerCase()} reports`}</h2></div></div><div className="reports-table-wrap">{loading?<p className="reports-empty">Loading reports…</p>:<table className="reports-table"><thead><tr className="reports-table-download-row"><th colSpan={10} className="reports-table-download-spacer" /><th colSpan={2} className="reports-table-download-heading"><button onClick={()=>exportCsv()}>Download filtered</button></th></tr><tr><th>Date</th><th>Property</th><th>Type</th><th>Importance</th><th>Description</th><th>Inspector</th><th>Technician</th><th>Supervisor</th><th>Status</th><th className="reports-action-heading">Action</th><th className="reports-action-heading" aria-label="Edit" /><th className="reports-action-heading" aria-label="Delete" /></tr></thead><tbody>{filtered.length===0&&<tr><td colSpan={12} className="reports-empty">No reports match this selection.</td></tr>}{filtered.map(renderRow)}</tbody></table>}</div></section>

    {editing && <div className="modal-backdrop">
      <section className="property-modal reports-editor" role="dialog" aria-modal="true">
        <div className="reports-modal-heading"><div><span>{editing === 'new' ? 'NEW FIELD REPORT' : 'EDIT REPORT'}</span><h2>{editing === 'new' ? 'Register a report' : editing.propertyName}</h2></div><button onClick={() => setEditing(null)} aria-label="Close">×</button></div>
        <form onSubmit={saveIncident}>
          <div className="reports-form-grid">
            <label><span>Date</span><input required type="date" value={form.occurredAt} onChange={(event) => setForm({ ...form, occurredAt: event.target.value })} /></label>
            <label className="reports-form-property"><span>Property</span><input required list="reports-properties" placeholder="Start typing a property" value={form.propertyName} onChange={(event) => setForm({ ...form, propertyName: event.target.value })} /><datalist id="reports-properties">{propertiesInHistory.map((name) => <option key={name} value={name} />)}</datalist></label>
            <label><span>Incident type</span><select required value={form.typeId} onChange={(event) => setForm({ ...form, typeId: event.target.value })}><option value="">Select…</option>{dashboard.types.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
            <label className="reports-form-description"><span>Description</span><textarea required rows={4} value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} /></label>
            <label className="reports-form-attachments"><span>Photos and videos</span>
              <div className="reports-upload-zone">
                <input type="file" multiple accept="image/*,video/*" onChange={(event) => {
                  const selected = Array.from(event.target.files ?? []);
                  const invalidType = selected.find((file) => !file.type.startsWith('image/') && !file.type.startsWith('video/'));
                  const invalid = selected.find((file) => file.size > 50 * 1024 * 1024);
                  if (invalidType) { setError(`${invalidType.name} is not a supported photo or video.`); event.target.value = ''; return; }
                  if (invalid) { setError(`${invalid.name} is larger than 50 MB.`); event.target.value = ''; return; }
                  setPendingFiles((current) => [...current, ...selected]); setError(''); event.target.value = '';
                }} />
                <strong>＋ Add photos or videos</strong>
                <small>Saved in Commercial / property / Reportes. Maximum 50 MB per file.</small>
              </div>
              {pendingFiles.length > 0 && <div className="reports-selected-files">{pendingFiles.map((file, index) => <span key={`${file.name}-${file.lastModified}-${index}`}>{file.type.startsWith('video/') ? '▶' : '▧'} <b>{file.name}</b><small>{fileSize(file.size)}</small><button type="button" onClick={() => setPendingFiles((current) => current.filter((_, itemIndex) => itemIndex !== index))} aria-label={`Remove ${file.name}`}>×</button></span>)}</div>}
              {editing !== 'new' && editing.attachments?.length > 0 && <div className="reports-existing-files"><small>Already saved in SharePoint</small><AttachmentLinks attachments={editing.attachments} /></div>}
            </label>
            <label><span>Technician</span><select required value={form.technicianId} onChange={(event) => selectTechnician(event.target.value)}><option value="">Select…</option>{technicians.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>{supervisorHint && <small>{supervisorHint}</small>}</label>
            <label><span>Supervisor</span><select required value={form.supervisorId} onChange={(event) => setForm({ ...form, supervisorId: event.target.value })}><option value="">Select…</option>{supervisors.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
            <fieldset><legend>Importance</legend>{(['HIGH', 'MEDIUM', 'LOW'] as const).map((value) => <label key={value} className={`reports-radio reports-radio-${value.toLowerCase()}`}><input type="radio" name="importance" checked={form.importance === value} onChange={() => setForm({ ...form, importance: value })} />{importanceLabel(value)}</label>)}</fieldset>
            <fieldset><legend>Requires inspector?</legend><label className="reports-radio"><input type="radio" name="requires" checked={form.requiresInspector} onChange={() => setForm({ ...form, requiresInspector: true })} />Yes</label><label className="reports-radio"><input type="radio" name="requires" checked={!form.requiresInspector} onChange={() => setForm({ ...form, requiresInspector: false, inspectorId: '' })} />No</label></fieldset>
            {form.requiresInspector && <label><span>Inspector</span><select required value={form.inspectorId} onChange={(event) => setForm({ ...form, inspectorId: event.target.value })}><option value="">Select…</option>{inspectors.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>}
          </div>
          {error && <p className="reports-form-error">{error}</p>}
          <div className="modal-actions"><button type="button" className="reports-button reports-button-ghost" onClick={() => setEditing(null)}>Cancel</button><button className="reports-button reports-button-primary" disabled={busy}>{busy ? (pendingFiles.length ? 'Saving and uploading…' : 'Saving…') : 'Save report'}</button></div>
        </form>
      </section>
    </div>}
    {solving&&<div className="modal-backdrop"><section className="property-modal reports-solve-modal" role="dialog" aria-modal="true"><div className="reports-modal-heading"><div><span>CLOSE REPORT</span><h2>{solving.propertyName}</h2></div><button onClick={()=>setSolving(null)} aria-label="Close">×</button></div><div className="reports-solve-summary"><b>{solving.type.name} · {importanceLabel(solving.importance)}</b><p>{solving.description}</p><small>{solving.technician.name} · Supervisor: {solving.supervisor.name}</small></div><form onSubmit={solveIncident}><label><span>What was done?</span><textarea required rows={5} value={resolution} onChange={(event)=>setResolution(event.target.value)} placeholder="Describe the completed work…" /></label><label className="reports-confirm"><input type="checkbox" checked={confirmed} onChange={(event)=>setConfirmed(event.target.checked)} /> I confirm that this report has been resolved.</label><div className="modal-actions"><button type="button" className="reports-button reports-button-ghost" onClick={()=>setSolving(null)}>Cancel</button><button className="reports-button reports-button-solved" disabled={!confirmed||!resolution.trim()||busy}>Mark as solved</button></div></form></section></div>}
    {settingsOpen&&<div className="modal-backdrop"><section className="property-modal reports-settings-modal" role="dialog" aria-modal="true">
      <div className="reports-modal-heading"><div><span>REPORTS SETUP</span><h2>Configuration lists</h2></div><button onClick={()=>setSettingsOpen(false)} aria-label="Close">×</button></div>
      <p className="reports-settings-intro">Names live here, not in the form. Renaming an item updates the history automatically.</p>
      <div className="reports-settings-tabs">{(['supervisor','inspector','technician','type'] as const).map((kind)=><button key={kind} className={configKind===kind?'active':''} onClick={()=>{setConfigKind(kind);setColorPickerFor(null);}}>{kind[0].toUpperCase()+kind.slice(1)}s</button>)}</div>
      <form className="reports-add-option" onSubmit={saveOption}>
        <input required value={newOption} onChange={(event)=>setNewOption(event.target.value)} placeholder={`Add ${configKind}`} />
        <button className="reports-button reports-button-primary" disabled={busy}>Add</button>
        {configKind==='technician'&&<div className="reports-color-palette reports-new-color-palette"><span>Choose technician color</span><div>{REPORT_COLOR_PALETTE.map((color)=><button key={color} type="button" className={newOptionColor===color?'selected':''} style={{background:color}} onClick={()=>setNewOptionColor(color)} aria-label={`Use color ${color}`} />)}</div></div>}
      </form>
      <div className="reports-option-list">{configItems.map((item)=><div key={item.id} className="reports-option-row">
        <span>{configKind==='technician'&&isPerson(item)?<button type="button" className="reports-option-color-button" onClick={()=>setColorPickerFor((current)=>current===item.id?null:item.id)} aria-label={`Change color for ${item.name}`}><i style={{background:item.color||'#9eb1bd'}} /></button>:<i style={{background:item.color||'#9eb1bd'}} />}{item.name}</span>
        {configKind==='technician'&&isPerson(item)&&<select aria-label={`Default supervisor for ${item.name}`} value={item.defaultSupervisorId||''} onChange={(event)=>void setDefaultSupervisor(item,event.target.value)}><option value="">No default supervisor</option>{supervisors.map((supervisor)=><option key={supervisor.id} value={supervisor.id}>{supervisor.name}</option>)}</select>}
        <div><button onClick={()=>void renameOption(item)}>Edit</button><button className="danger" onClick={()=>void deleteOption(item)}>Remove</button></div>
        {configKind==='technician'&&isPerson(item)&&colorPickerFor===item.id&&<div className="reports-color-palette reports-existing-color-palette"><span>Change color</span><div>{REPORT_COLOR_PALETTE.map((color)=><button key={color} type="button" className={item.color===color?'selected':''} style={{background:color}} onClick={()=>void setOptionColor(item,color)} aria-label={`Use color ${color} for ${item.name}`} />)}</div></div>}
      </div>)}{configItems.length===0&&<p className="reports-empty">No items yet.</p>}</div>
    </section></div>}
    {reportOpen&&<div className="modal-backdrop reports-report-backdrop"><section className="reports-report-dialog" role="dialog" aria-modal="true"><div className="reports-report-controls"><div><button className={reportMode==='DAY'?'active':''} onClick={()=>setReportMode('DAY')}>Un día</button><button className={reportMode==='RANGE'?'active':''} onClick={()=>setReportMode('RANGE')}>Rango de fechas</button>{reportMode==='DAY'?<input type="date" value={reportDay} onChange={(event)=>setReportDay(event.target.value)} />:<><input type="date" value={reportFrom} onChange={(event)=>setReportFrom(event.target.value)} /><span>al</span><input type="date" value={reportTo} onChange={(event)=>setReportTo(event.target.value)} /></>}</div><div><button onClick={()=>setPrinting(true)}>PDF</button><button onClick={downloadExcelReport}>Excel</button><button onClick={()=>exportCsv(reportItems)}>CSV</button><button className="reports-report-close" onClick={()=>setReportOpen(false)}>×</button></div></div><ReportSheet title={reportTitle} subtitle={reportSubtitle} items={reportItems} distribution={distribution} /></section></div>}
    {printing&&createPortal(<div className="reports-print-portal reports-pdf-capture"><ReportSheet title={reportTitle} subtitle={reportSubtitle} items={reportItems} distribution={distribution} /></div>, document.body)}
  </div>;

  function renderRow(incident: Incident) {
    return <tr key={incident.id} className={incident.status === 'PENDING' ? 'reports-row-pending' : ''}>
      <td>{displayDate(incident.occurredAt)}</td><td><strong>{incident.propertyName}</strong></td>
      <td><span className="reports-type"><i style={{ background: incident.type.color || '#72a7db' }} />{incident.type.name}</span></td>
      <td><span className={`reports-importance reports-importance-${incident.importance.toLowerCase()}`}>{importanceLabel(incident.importance)}</span></td>
      <td className="reports-description">{incident.description}{incident.resolution && <small><b>DONE</b>{incident.resolution}</small>}{incident.attachments?.length > 0 && <AttachmentLinks attachments={incident.attachments} />}</td>
      <td>{incident.inspector?.name ?? <span className="reports-muted">Not applicable</span>}</td><td>{incident.technician.name}</td><td>{incident.supervisor.name}</td>
      <td><span className={`reports-status reports-status-${incident.status.toLowerCase()}`}>{statusLabel(incident.status)}</span></td>
      <td className="reports-action-cell"><div className="reports-row-actions">{incident.status === 'PENDING' ? <button className="solve" onClick={() => { setSolving(incident); setResolution(incident.resolution ?? ''); setConfirmed(false); }}>✓ Solve</button> : <button onClick={() => void reopen(incident)}>Reopen</button>}</div></td>
      <td className="reports-edit-delete-cell" colSpan={2}><div className="reports-row-actions reports-edit-delete-actions"><button onClick={() => openEdit(incident)}>Edit</button><button className="danger" onClick={() => void removeIncident(incident)}>Delete</button></div></td>
    </tr>;
  }
}

function AttachmentLinks({ attachments }: { attachments: ReportAttachment[] }) {
  return <div className="reports-attachment-links">{attachments.map((file) => <a key={file.id} href={file.sharepointWebUrl} target="_blank" rel="noreferrer" title={`${file.fileName} · ${fileSize(file.size)}`}><span>{file.mimeType.startsWith('video/') ? '▶' : '▧'}</span>{file.fileName}</a>)}</div>;
}

function ReportSheet({ title, subtitle, items, distribution }: { title: string; subtitle: string; items: Incident[]; distribution: (items: Incident[], key: DistributionKey) => Array<{id:string;label:string;color:string;count:number}> }) {
  const pending = items.filter((item) => item.status === 'PENDING');
  const charts: Array<[DistributionKey, string]> = [['type', 'Por tipo de novedad'], ['property', 'Por propiedad'], ['technician', 'Por técnico'], ['importance', 'Por importancia']];
  return <div className="reports-print-sheet">
    <header><span>BLUE LIFE POOL SERVICE · TAMPA, FLORIDA</span><h1>{title}</h1><p>{subtitle}</p></header>
    <section className="reports-print-kpis"><div><strong>{items.length}</strong><span>Total de novedades</span></div><div><strong>{pending.length}</strong><span>Pendientes</span></div><div><strong>{items.length - pending.length}</strong><span>Solucionadas</span></div><div><strong>{items.filter((item) => item.requiresInspector).length}</strong><span>Requieren inspector</span></div></section>
    <h2>Resumen del período</h2>
    <section className="reports-print-charts">{charts.map(([key, label]) => <article key={key}><h3>{label}</h3>{distribution(items, key).slice(0, 7).map((row) => <div key={row.id}><span><i style={{ background: row.color }} />{row.label}</span><b><em style={{ width: `${items.length ? row.count / items.length * 100 : 0}%`, background: row.color }} /></b><strong>{items.length ? Math.round(row.count / items.length * 100) : 0}% · {row.count}</strong></div>)}</article>)}</section>
    <h2>Novedades registradas</h2>
    <div className="reports-print-table-wrap"><table><thead><tr><th>Fecha</th><th>Propiedad</th><th>Tipo</th><th>Importancia</th><th>Descripción</th><th>Inspector</th><th>Técnico</th><th>Supervisor</th><th>Estado</th></tr></thead><tbody>{items.map((item) => <tr key={item.id}><td>{reportDate(item.occurredAt)}</td><td>{item.propertyName}</td><td>{item.type.name}</td><td>{reportImportanceLabel(item.importance)}</td><td>{item.description}{item.resolution && <small><b>HECHO:</b> {item.resolution}</small>}{item.attachments?.length > 0 && <small><b>ARCHIVOS:</b> {item.attachments.map((file) => file.fileName).join(', ')}</small>}</td><td>{item.inspector?.name ?? 'No aplica'}</td><td>{item.technician.name}</td><td>{item.supervisor.name}</td><td>{reportStatusLabel(item.status)}</td></tr>)}</tbody></table></div>
    <section className="reports-print-records">{items.map((item) => <article key={item.id}>
      <div className="reports-print-record-heading"><div><span>{reportDate(item.occurredAt)}</span><h3>{item.propertyName}</h3></div><b className={`reports-print-record-status reports-print-record-status-${item.status.toLowerCase()}`}>{reportStatusLabel(item.status)}</b></div>
      <div className="reports-print-record-meta"><span><b>Tipo</b>{item.type.name}</span><span><b>Importancia</b>{reportImportanceLabel(item.importance)}</span><span><b>Técnico</b>{item.technician.name}</span><span><b>Supervisor</b>{item.supervisor.name}</span><span><b>Inspector</b>{item.inspector?.name ?? 'No aplica'}</span></div>
      <p>{item.description}</p>
      {item.resolution && <small><b>HECHO:</b> {item.resolution}</small>}
      {item.attachments?.length > 0 && <small><b>ARCHIVOS:</b> {item.attachments.map((file) => file.fileName).join(', ')}</small>}
    </article>)}</section>
    <section className="reports-print-pending"><h2>▲ Pendientes al cierre</h2>{pending.length === 0 ? <p>No hay novedades pendientes en este período.</p> : <ul>{pending.map((item) => <li key={item.id}><b>{reportDate(item.occurredAt)} · {item.propertyName}</b> — {item.type.name} · {reportImportanceLabel(item.importance)}: {item.description}</li>)}</ul>}</section>
    <footer>Blue Life Pool Service · Generado {new Date().toLocaleString('es-ES')}</footer>
  </div>;
}
