import { Fragment, useEffect, useMemo, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { API_URL } from './api';
import './ReportsPage.css';

type Role = 'SUPERVISOR' | 'INSPECTOR' | 'TECHNICIAN';
type Person = { id: string; name: string; role: Role; color?: string; defaultSupervisorId?: string };
type IncidentType = { id: string; name: string; color?: string };
type Incident = {
  id: string; occurredAt: string; propertyName: string; importance: 'HIGH' | 'MEDIUM' | 'LOW';
  description: string; requiresInspector: boolean; status: 'PENDING' | 'SOLVED'; resolution?: string;
  solvedAt?: string; type: IncidentType; technician: Person; supervisor: Person; inspector?: Person;
  typeId: string; technicianId: string; supervisorId: string; inspectorId?: string;
};
type Dashboard = { incidents: Incident[]; people: Person[]; types: IncidentType[] };
type IncidentForm = { occurredAt: string; propertyName: string; typeId: string; importance: 'HIGH' | 'MEDIUM' | 'LOW'; description: string; technicianId: string; supervisorId: string; requiresInspector: boolean; inspectorId: string };
type DistributionKey = 'type' | 'technician' | 'supervisor' | 'inspector' | 'importance' | 'status';
type QuickView = 'ALL' | 'PENDING' | 'SOLVED' | 'INSPECTION';
type PeriodMode = 'ALL' | 'DAY' | 'RANGE' | 'MONTH';

const today = () => new Date().toISOString().slice(0, 10);
const monthStart = () => `${today().slice(0, 8)}01`;
const blankForm = (): IncidentForm => ({ occurredAt: today(), propertyName: '', typeId: '', importance: 'MEDIUM', description: '', technicianId: '', supervisorId: '', requiresInspector: false, inspectorId: '' });
const importanceLabel = (value: string) => value === 'HIGH' ? 'High' : value === 'LOW' ? 'Low' : 'Medium';
const statusLabel = (value: string) => value === 'SOLVED' ? 'Solved' : 'Pending';
const dateKey = (value: string) => value.slice(0, 10);
const displayDate = (value: string) => new Date(`${dateKey(value)}T00:00:00`).toLocaleDateString('en-US');
const csvCell = (value: unknown) => `"${String(value ?? '').replaceAll('"', '""')}"`;
const htmlText = (value: unknown) => String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const isPerson = (item: Person | IncidentType): item is Person => 'role' in item;

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
  const [supervisorHint, setSupervisorHint] = useState('');
  const [solving, setSolving] = useState<Incident | null>(null);
  const [resolution, setResolution] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [configKind, setConfigKind] = useState<'type' | 'supervisor' | 'inspector' | 'technician'>('supervisor');
  const [newOption, setNewOption] = useState('');
  const [reportOpen, setReportOpen] = useState(false);
  const [reportMode, setReportMode] = useState<'DAY' | 'RANGE'>('DAY');
  const [reportDay, setReportDay] = useState(today());
  const [reportFrom, setReportFrom] = useState(monthStart());
  const [reportTo, setReportTo] = useState(today());
  const [groupByMonth, setGroupByMonth] = useState(false);

  async function load() {
    setLoading(true);
    try { setDashboard(await request<Dashboard>('/reports')); setError(''); }
    catch (loadError) { setError((loadError as Error).message); }
    finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, []);

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
  }).sort((a, b) => dateKey(b.occurredAt).localeCompare(dateKey(a.occurredAt)) || (a.status === b.status ? 0 : a.status === 'PENDING' ? -1 : 1)), [dashboard.incidents, quickView, search, periodMode, day, from, to, month, propertyFilter, typeFilter, importanceFilter, technicianFilter, supervisorFilter, inspectorFilter, statusFilter]);

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

  function openNew() { setForm(blankForm()); setEditing('new'); setSupervisorHint(''); setError(''); }
  function openEdit(incident: Incident) {
    setForm({ occurredAt: dateKey(incident.occurredAt), propertyName: incident.propertyName, typeId: incident.type.id, importance: incident.importance, description: incident.description, technicianId: incident.technician.id, supervisorId: incident.supervisor.id, requiresInspector: incident.requiresInspector, inspectorId: incident.inspector?.id ?? '' });
    setEditing(incident); setSupervisorHint(''); setError('');
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
      const payload = { ...form, inspectorId: form.requiresInspector ? form.inspectorId : undefined };
      const path = editing === 'new' ? '/reports/incidents' : `/reports/incidents/${editing.id}`;
      const saved = await request<Incident>(path, { method: editing === 'new' ? 'POST' : 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      setDashboard((current) => ({ ...current, incidents: editing === 'new' ? [saved, ...current.incidents] : current.incidents.map((item) => item.id === saved.id ? saved : item) }));
      setEditing(null);
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
    try { await request(`/reports/config/${configKind}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: newOption.trim() }) }); setNewOption(''); await load(); }
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

  const reportItems = useMemo(() => dashboard.incidents.filter((incident) => {
    const date = dateKey(incident.occurredAt); return reportMode === 'DAY' ? date === reportDay : date >= [reportFrom, reportTo].sort()[0] && date <= [reportFrom, reportTo].sort()[1];
  }).sort((a, b) => dateKey(a.occurredAt).localeCompare(dateKey(b.occurredAt))), [dashboard.incidents, reportMode, reportDay, reportFrom, reportTo]);
  const reportPending = reportItems.filter((item) => item.status === 'PENDING');
  const reportTitle = reportMode === 'DAY' ? `Report for ${displayDate(reportDay)}` : `Report from ${displayDate([reportFrom, reportTo].sort()[0])} to ${displayDate([reportFrom, reportTo].sort()[1])}`;

  function exportCsv(items = filtered) {
    const headers = ['Date', 'Property', 'Incident type', 'Importance', 'Description', 'Supervisor', 'Technician', 'Requires inspector', 'Inspector', 'Status', 'What was done'];
    const rows = items.map((item) => [dateKey(item.occurredAt), item.propertyName, item.type.name, importanceLabel(item.importance), item.description, item.supervisor.name, item.technician.name, item.requiresInspector ? 'Yes' : 'No', item.inspector?.name ?? 'Not applicable', statusLabel(item.status), item.resolution ?? '']);
    const blob = new Blob([[headers, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = `blue-life-reports-${today()}.csv`; link.click(); URL.revokeObjectURL(link.href);
  }
  function downloadReportHtml() {
    const rows = reportItems.map((item) => `<tr><td>${htmlText(displayDate(item.occurredAt))}</td><td>${htmlText(item.propertyName)}</td><td>${htmlText(item.type.name)}</td><td>${htmlText(importanceLabel(item.importance))}</td><td>${htmlText(item.description)}${item.resolution ? `<small><b>DONE:</b> ${htmlText(item.resolution)}</small>` : ''}</td><td>${htmlText(item.inspector?.name ?? 'Not applicable')}</td><td>${htmlText(item.technician.name)}</td><td>${htmlText(item.supervisor.name)}</td><td>${htmlText(statusLabel(item.status))}</td></tr>`).join('');
    const content = `<!doctype html><html><head><meta charset="utf-8"><title>${htmlText(reportTitle)}</title><style>body{font-family:Arial;color:#183746;margin:35px}h1{color:#075477}header{border-bottom:2px solid #38abc8}.kpis{display:grid;grid-template-columns:repeat(4,1fr);border:1px solid #dbe9ef;margin:24px 0}.kpis div{text-align:center;padding:18px}.kpis b{display:block;font-size:28px}table{width:100%;border-collapse:collapse;font-size:10px}th{background:#edf7fa;color:#52717f;text-align:left}td,th{padding:8px;border-bottom:1px solid #e5edf1;vertical-align:top}small{display:block;color:#2b8350;margin-top:6px}.pending{background:#fff0e7;padding:18px;margin-top:25px}@media print{@page{size:A4 landscape;margin:12mm}tr{break-inside:avoid}}</style></head><body><header><small>BLUE LIFE POOL SERVICE · TAMPA, FLORIDA</small><h1>${htmlText(reportTitle)}</h1></header><div class="kpis"><div><b>${reportItems.length}</b>Total</div><div><b>${reportPending.length}</b>Pending</div><div><b>${reportItems.length-reportPending.length}</b>Solved</div><div><b>${reportItems.filter((item)=>item.requiresInspector).length}</b>Require inspector</div></div><h2>Registered reports</h2><table><thead><tr>${['Date','Property','Type','Importance','Description','Inspector','Technician','Supervisor','Status'].map((label)=>`<th>${label}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table><section class="pending"><h2>Pending at close</h2>${reportPending.length ? `<ul>${reportPending.map((item)=>`<li>${htmlText(item.propertyName)} — ${htmlText(item.description)}</li>`).join('')}</ul>` : '<p>No pending reports.</p>'}</section></body></html>`;
    const blob = new Blob([content], { type: 'text/html;charset=utf-8' }); const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = `blue-life-${reportMode === 'DAY' ? reportDay : `${reportFrom}_to_${reportTo}`}.html`; link.click(); URL.revokeObjectURL(link.href);
  }
  function emailReport() {
    const body = `${reportTitle}\n\nTotal: ${reportItems.length}\nPending: ${reportPending.length}\nSolved: ${reportItems.length - reportPending.length}\nRequire inspector: ${reportItems.filter((item) => item.requiresInspector).length}\n\nPending reports:\n${reportPending.map((item) => `• ${item.propertyName}: ${item.description}`).join('\n') || 'None'}`;
    window.location.href = `mailto:?subject=${encodeURIComponent(`Blue Life · ${reportTitle}`)}&body=${encodeURIComponent(body)}`;
  }

  const monthGroups = groupByMonth ? Array.from(new Set(filtered.map((item) => dateKey(item.occurredAt).slice(0, 7)))) : [];
  const missingLists = supervisors.length === 0 || technicians.length === 0 || inspectors.length === 0;

  return <div className="page app-page reports-page">{sidebar}
    <header className="area-page-header reports-header"><div><span className="area-eyebrow">OPERATIONS & ACCOUNTABILITY</span><h1>Reports</h1><p>Track field incidents, ownership, inspections and resolution in one shared control center.</p></div><div className="reports-header-actions"><button className="reports-button reports-button-ghost" onClick={() => setSettingsOpen(true)}>Settings</button><button className="reports-button reports-button-secondary" onClick={() => setReportOpen(true)}>Period report</button><button className="reports-button reports-button-primary" onClick={openNew}>+ New report</button></div></header>
    {error && <div className="reports-message" role="alert">{error}</div>}
    {missingLists && !loading && <button className="reports-setup-banner" onClick={() => setSettingsOpen(true)}><strong>Complete setup</strong><span>Add supervisors, technicians and inspectors before registering the first report.</span><b>Open settings →</b></button>}
    <nav className="reports-quick-nav" aria-label="Quick report views">{([['ALL','All'],['PENDING','Pending'],['SOLVED','Solved'],['INSPECTION','Require inspector']] as Array<[QuickView,string]>).map(([key,label])=><button key={key} className={quickView===key?'reports-quick-active':''} onClick={()=>setQuickView(key)}><span>{quickCounts[key]}</span>{label}</button>)}</nav>
    <section className="reports-kpis"><article><span>Total reports</span><strong>{kpis.total}</strong><small>Current selection</small></article><article className="reports-kpi-pending"><span>Pending</span><strong>{kpis.pending}</strong><small>Needs action</small></article><article className="reports-kpi-solved"><span>Solved</span><strong>{kpis.solved}</strong><small>Work completed</small></article><article className="reports-kpi-inspector"><span>Require inspector</span><strong>{kpis.inspections}</strong><small>Inspection follow-up</small></article></section>
    <section className="reports-filter-card"><div className="reports-filter-heading"><div><h2>Filters</h2><p>All filters work together and update the metrics, distribution and table.</p></div><button onClick={clearFilters}>Clear filters</button></div><div className="reports-filter-grid"><label className="reports-search-field"><span>Quick search</span><input placeholder="Property, description or resolution" value={search} onChange={(event)=>setSearch(event.target.value)} /></label><label><span>Period</span><select value={periodMode} onChange={(event)=>setPeriodMode(event.target.value as PeriodMode)}><option value="ALL">All dates</option><option value="DAY">Day</option><option value="RANGE">Date range</option><option value="MONTH">Month</option></select></label>{periodMode==='DAY'&&<label><span>Date</span><input type="date" value={day} onChange={(event)=>setDay(event.target.value)} /></label>}{periodMode==='RANGE'&&<><label><span>From</span><input type="date" value={from} onChange={(event)=>setFrom(event.target.value)} /></label><label><span>To</span><input type="date" value={to} onChange={(event)=>setTo(event.target.value)} /></label></>}{periodMode==='MONTH'&&<label><span>Month</span><input type="month" value={month} onChange={(event)=>setMonth(event.target.value)} /></label>}<label><span>Property</span><select value={propertyFilter} onChange={(event)=>setPropertyFilter(event.target.value)}><option value="">All properties</option>{propertiesInHistory.map((name)=><option key={name}>{name}</option>)}</select></label><label><span>Type</span><select value={typeFilter} onChange={(event)=>setTypeFilter(event.target.value)}><option value="">All types</option>{dashboard.types.map((item)=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label><span>Importance</span><select value={importanceFilter} onChange={(event)=>setImportanceFilter(event.target.value)}><option value="">All levels</option><option value="HIGH">High</option><option value="MEDIUM">Medium</option><option value="LOW">Low</option></select></label><label><span>Technician</span><select value={technicianFilter} onChange={(event)=>setTechnicianFilter(event.target.value)}><option value="">All technicians</option>{technicians.map((item)=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label><span>Supervisor</span><select value={supervisorFilter} onChange={(event)=>setSupervisorFilter(event.target.value)}><option value="">All supervisors</option>{supervisors.map((item)=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label><span>Inspector</span><select value={inspectorFilter} onChange={(event)=>setInspectorFilter(event.target.value)}><option value="">All inspector options</option><option value="none">No inspector required</option>{inspectors.map((item)=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label><span>Status</span><select value={statusFilter} onChange={(event)=>setStatusFilter(event.target.value)}><option value="">All statuses</option><option value="PENDING">Pending</option><option value="SOLVED">Solved</option></select></label></div></section>
    <section className="reports-distribution-card"><div className="reports-section-heading"><div><h2>Distribution</h2><p>Click a bar to apply it as a filter.</p></div><span>{filtered.length} reports</span></div><div className="reports-distribution-tabs">{(['type','technician','supervisor','inspector','importance','status'] as DistributionKey[]).map((key)=><button key={key} className={activeDistribution===key?'active':''} onClick={()=>setActiveDistribution(key)}>{key[0].toUpperCase()+key.slice(1)}</button>)}</div><div className="reports-bars">{distributionRows.length===0?<p className="reports-empty">No data for this selection.</p>:distributionRows.map((row)=><button key={row.id} className="reports-bar-row" onClick={()=>applyDistribution(row)}><span className="reports-bar-label"><i style={{background:row.color}} />{row.label}</span><span className="reports-bar-track"><i style={{width:`${filtered.length?Math.max(3,row.count/filtered.length*100):0}%`,background:row.color}} /></span><strong>{filtered.length?Math.round(row.count/filtered.length*100):0}% <small>· {row.count}</small></strong></button>)}</div></section>
    <section className="reports-table-card"><div className="reports-section-heading"><div><h2>{quickView==='ALL'?'Report history':quickView==='INSPECTION'?'Reports requiring inspector':`${quickView[0]}${quickView.slice(1).toLowerCase()} reports`}</h2><p>Newest dates first; pending reports appear first within the same day.</p></div><div className="reports-table-actions"><label><input type="checkbox" checked={groupByMonth} onChange={(event)=>setGroupByMonth(event.target.checked)} /> Group by month</label><button onClick={()=>exportCsv()}>Download filtered</button></div></div><div className="reports-table-wrap">{loading?<p className="reports-empty">Loading reports…</p>:<table className="reports-table"><thead><tr><th>Date</th><th>Property</th><th>Type</th><th>Importance</th><th>Description</th><th>Inspector</th><th>Technician</th><th>Supervisor</th><th>Status</th><th>Actions</th></tr></thead><tbody>{filtered.length===0&&<tr><td colSpan={10} className="reports-empty">No reports match this selection.</td></tr>}{groupByMonth?monthGroups.map((group)=><Fragment key={group}><tr className="reports-month-row"><td colSpan={10}>{new Date(`${group}-01T00:00:00`).toLocaleDateString('en-US',{month:'long',year:'numeric'})}<span>{filtered.filter((item)=>dateKey(item.occurredAt).startsWith(group)&&item.status==='PENDING').length} pending</span></td></tr>{filtered.filter((item)=>dateKey(item.occurredAt).startsWith(group)).map(renderRow)}</Fragment>):filtered.map(renderRow)}</tbody></table>}</div></section>

    {editing&&<div className="modal-backdrop"><section className="property-modal reports-editor" role="dialog" aria-modal="true"><div className="reports-modal-heading"><div><span>{editing==='new'?'NEW FIELD REPORT':'EDIT REPORT'}</span><h2>{editing==='new'?'Register a report':editing.propertyName}</h2></div><button onClick={()=>setEditing(null)} aria-label="Close">×</button></div><form onSubmit={saveIncident}><div className="reports-form-grid"><label><span>Date</span><input required type="date" value={form.occurredAt} onChange={(event)=>setForm({...form,occurredAt:event.target.value})} /></label><label className="reports-form-property"><span>Property</span><input required list="reports-properties" placeholder="Start typing a property" value={form.propertyName} onChange={(event)=>setForm({...form,propertyName:event.target.value})} /><datalist id="reports-properties">{propertiesInHistory.map((name)=><option key={name} value={name} />)}</datalist></label><label><span>Incident type</span><select required value={form.typeId} onChange={(event)=>setForm({...form,typeId:event.target.value})}><option value="">Select…</option>{dashboard.types.map((item)=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label className="reports-form-description"><span>Description</span><textarea required rows={4} value={form.description} onChange={(event)=>setForm({...form,description:event.target.value})} /></label><label><span>Technician</span><select required value={form.technicianId} onChange={(event)=>selectTechnician(event.target.value)}><option value="">Select…</option>{technicians.map((item)=><option key={item.id} value={item.id}>{item.name}</option>)}</select>{supervisorHint&&<small>{supervisorHint}</small>}</label><label><span>Supervisor</span><select required value={form.supervisorId} onChange={(event)=>setForm({...form,supervisorId:event.target.value})}><option value="">Select…</option>{supervisors.map((item)=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label><fieldset><legend>Importance</legend>{(['HIGH','MEDIUM','LOW'] as const).map((value)=><label key={value} className={`reports-radio reports-radio-${value.toLowerCase()}`}><input type="radio" name="importance" checked={form.importance===value} onChange={()=>setForm({...form,importance:value})} />{importanceLabel(value)}</label>)}</fieldset><fieldset><legend>Requires inspector?</legend><label className="reports-radio"><input type="radio" name="requires" checked={form.requiresInspector} onChange={()=>setForm({...form,requiresInspector:true})} />Yes</label><label className="reports-radio"><input type="radio" name="requires" checked={!form.requiresInspector} onChange={()=>setForm({...form,requiresInspector:false,inspectorId:''})} />No</label></fieldset>{form.requiresInspector&&<label><span>Inspector</span><select required value={form.inspectorId} onChange={(event)=>setForm({...form,inspectorId:event.target.value})}><option value="">Select…</option>{inspectors.map((item)=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label>}</div>{error&&<p className="reports-form-error">{error}</p>}<div className="modal-actions"><button type="button" className="reports-button reports-button-ghost" onClick={()=>setEditing(null)}>Cancel</button><button className="reports-button reports-button-primary" disabled={busy}>{busy?'Saving…':'Save report'}</button></div></form></section></div>}
    {solving&&<div className="modal-backdrop"><section className="property-modal reports-solve-modal" role="dialog" aria-modal="true"><div className="reports-modal-heading"><div><span>CLOSE REPORT</span><h2>{solving.propertyName}</h2></div><button onClick={()=>setSolving(null)} aria-label="Close">×</button></div><div className="reports-solve-summary"><b>{solving.type.name} · {importanceLabel(solving.importance)}</b><p>{solving.description}</p><small>{solving.technician.name} · Supervisor: {solving.supervisor.name}</small></div><form onSubmit={solveIncident}><label><span>What was done?</span><textarea required rows={5} value={resolution} onChange={(event)=>setResolution(event.target.value)} placeholder="Describe the completed work…" /></label><label className="reports-confirm"><input type="checkbox" checked={confirmed} onChange={(event)=>setConfirmed(event.target.checked)} /> I confirm that this report has been resolved.</label><div className="modal-actions"><button type="button" className="reports-button reports-button-ghost" onClick={()=>setSolving(null)}>Cancel</button><button className="reports-button reports-button-solved" disabled={!confirmed||!resolution.trim()||busy}>Mark as solved</button></div></form></section></div>}
    {settingsOpen&&<div className="modal-backdrop"><section className="property-modal reports-settings-modal" role="dialog" aria-modal="true"><div className="reports-modal-heading"><div><span>REPORTS SETUP</span><h2>Configuration lists</h2></div><button onClick={()=>setSettingsOpen(false)} aria-label="Close">×</button></div><p className="reports-settings-intro">Names live here, not in the form. Renaming an item updates the history automatically.</p><div className="reports-settings-tabs">{(['supervisor','inspector','technician','type'] as const).map((kind)=><button key={kind} className={configKind===kind?'active':''} onClick={()=>setConfigKind(kind)}>{kind[0].toUpperCase()+kind.slice(1)}s</button>)}</div><form className="reports-add-option" onSubmit={saveOption}><input required value={newOption} onChange={(event)=>setNewOption(event.target.value)} placeholder={`Add ${configKind}`} /><button className="reports-button reports-button-primary" disabled={busy}>Add</button></form><div className="reports-option-list">{configItems.map((item)=><div key={item.id} className="reports-option-row"><span><i style={{background:item.color||'#9eb1bd'}} />{item.name}</span>{configKind==='technician'&&isPerson(item)&&<select aria-label={`Default supervisor for ${item.name}`} value={item.defaultSupervisorId||''} onChange={(event)=>void setDefaultSupervisor(item,event.target.value)}><option value="">No default supervisor</option>{supervisors.map((supervisor)=><option key={supervisor.id} value={supervisor.id}>{supervisor.name}</option>)}</select>}<div><button onClick={()=>void renameOption(item)}>Edit</button><button className="danger" onClick={()=>void deleteOption(item)}>Remove</button></div></div>)}{configItems.length===0&&<p className="reports-empty">No items yet.</p>}</div></section></div>}
    {reportOpen&&<div className="modal-backdrop reports-report-backdrop"><section className="reports-report-dialog" role="dialog" aria-modal="true"><div className="reports-report-controls"><div><button className={reportMode==='DAY'?'active':''} onClick={()=>setReportMode('DAY')}>One day</button><button className={reportMode==='RANGE'?'active':''} onClick={()=>setReportMode('RANGE')}>Date range</button>{reportMode==='DAY'?<input type="date" value={reportDay} onChange={(event)=>setReportDay(event.target.value)} />:<><input type="date" value={reportFrom} onChange={(event)=>setReportFrom(event.target.value)} /><span>to</span><input type="date" value={reportTo} onChange={(event)=>setReportTo(event.target.value)} /></>}</div><div><button onClick={downloadReportHtml}>Download</button><button onClick={()=>exportCsv(reportItems)}>Export CSV</button><button onClick={()=>window.print()}>Print / PDF</button><button onClick={emailReport}>Email</button><button className="reports-report-close" onClick={()=>setReportOpen(false)}>×</button></div></div><ReportSheet title={reportTitle} items={reportItems} distribution={distribution} /></section></div>}
  </div>;

  function renderRow(incident: Incident) {
    return <tr key={incident.id} className={incident.status==='PENDING'?'reports-row-pending':''}><td>{displayDate(incident.occurredAt)}</td><td><strong>{incident.propertyName}</strong></td><td><span className="reports-type"><i style={{background:incident.type.color||'#72a7db'}} />{incident.type.name}</span></td><td><span className={`reports-importance reports-importance-${incident.importance.toLowerCase()}`}>{importanceLabel(incident.importance)}</span></td><td className="reports-description">{incident.description}{incident.resolution&&<small><b>DONE</b>{incident.resolution}</small>}</td><td>{incident.inspector?.name??<span className="reports-muted">Not applicable</span>}</td><td>{incident.technician.name}</td><td>{incident.supervisor.name}</td><td><span className={`reports-status reports-status-${incident.status.toLowerCase()}`}>{statusLabel(incident.status)}</span></td><td><div className="reports-row-actions">{incident.status==='PENDING'?<button className="solve" onClick={()=>{setSolving(incident);setResolution(incident.resolution??'');setConfirmed(false)}}>✓ Solve</button>:<button onClick={()=>void reopen(incident)}>Reopen</button>}<button onClick={()=>openEdit(incident)}>Edit</button><button className="danger" onClick={()=>void removeIncident(incident)}>Delete</button></div></td></tr>;
  }
}

function ReportSheet({ title, items, distribution }: { title: string; items: Incident[]; distribution: (items: Incident[], key: DistributionKey) => Array<{id:string;label:string;color:string;count:number}> }) {
  const pending = items.filter((item)=>item.status==='PENDING');
  const charts: Array<[DistributionKey,string]> = [['type','By incident type'],['supervisor','By supervisor'],['technician','By technician'],['importance','By importance']];
  return <div className="reports-print-sheet"><header><span>BLUE LIFE POOL SERVICE · TAMPA, FLORIDA</span><h1>{title}</h1><p>Generated {new Date().toLocaleString()}</p></header><section className="reports-print-kpis"><div><strong>{items.length}</strong><span>Total reports</span></div><div><strong>{pending.length}</strong><span>Pending</span></div><div><strong>{items.length-pending.length}</strong><span>Solved</span></div><div><strong>{items.filter((item)=>item.requiresInspector).length}</strong><span>Require inspector</span></div></section><h2>Period summary</h2><section className="reports-print-charts">{charts.map(([key,label])=><article key={key}><h3>{label}</h3>{distribution(items,key).slice(0,6).map((row)=><div key={row.id}><span><i style={{background:row.color}} />{row.label}</span><b><em style={{width:`${items.length?row.count/items.length*100:0}%`,background:row.color}} /></b><strong>{items.length?Math.round(row.count/items.length*100):0}% · {row.count}</strong></div>)}</article>)}</section><h2>Registered reports</h2><div className="reports-print-table-wrap"><table><thead><tr><th>Date</th><th>Property</th><th>Type</th><th>Importance</th><th>Description</th><th>Inspector</th><th>Technician</th><th>Supervisor</th><th>Status</th></tr></thead><tbody>{items.map((item)=><tr key={item.id}><td>{displayDate(item.occurredAt)}</td><td>{item.propertyName}</td><td>{item.type.name}</td><td>{importanceLabel(item.importance)}</td><td>{item.description}{item.resolution&&<small><b>DONE:</b> {item.resolution}</small>}</td><td>{item.inspector?.name??'Not applicable'}</td><td>{item.technician.name}</td><td>{item.supervisor.name}</td><td>{statusLabel(item.status)}</td></tr>)}</tbody></table></div><section className="reports-print-pending"><h2>▲ Pending reports at close</h2>{pending.length===0?<p>No pending reports in this period.</p>:<ul>{pending.map((item)=><li key={item.id}><b>{displayDate(item.occurredAt)} · {item.propertyName}</b> — {item.type.name} · {importanceLabel(item.importance)}: {item.description}</li>)}</ul>}</section><footer>Blue Life Pool Service · Generated {new Date().toLocaleString()}</footer></div>;
}
