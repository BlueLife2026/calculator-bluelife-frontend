import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { API_URL } from './api';
import { daysUntilInspection, englishChemical, englishHealthStatus, healthDate, inspectionSignal } from './healthDisplay';
import { healthHistoryDate, indexPropertyHealthTickets, propertyNameKey, ticketInspectionDate } from './propertyHistory';
import type { PropertyHealthTicket } from './propertyHistory';

type HistoryProperty = {
  id: string; name: string; code: string | null; lifecycleStatus: string; serviceStartDate: string | null;
  propertyType: string | null; segment: string | null; addressLine1: string | null; city: string | null;
  state: string | null; zipCode: string | null; county: string | null; maintenanceChiefInfo: string | null;
  managementCompany: { name: string } | null;
  contacts: Array<{ id: string; role: string | null; isPrimary: boolean; contact: { firstName: string | null; lastName: string | null; email: string | null; phone: string | null } }>;
  waterBodies: Array<{ id: string; name: string; type: string; size: string | null; gallons: number | null; active: boolean }>;
};
type Tab = 'overview' | 'general' | 'estimates' | 'health' | 'complaints';
const tabs: Array<[Tab, string]> = [['overview', 'Overview'], ['general', 'General information'], ['estimates', 'Estimates'], ['health', 'Health Department'], ['complaints', 'Complaints']];
const checklistFields = [
  ['Quimico', 'Chemical'], ['Feeders', 'Feeders'], ['Main drain', 'Main drain'], ['Flow meter /  Flow rate', 'Flow meter / Flow rate'],
  ['Life Hook, safety line', 'Safety line'], ['Gauges, gutters, Plugs', 'Gauges / Gutters / Plugs'], ['Rules / Water level', 'Rules / Water level'], ['Step / Handrail', 'Step / Handrail'],
];
function label(value: string | null) { return value ? value.toLowerCase().replaceAll('_', ' ').replace(/\b\w/g, (char) => char.toUpperCase()) : 'Not assigned'; }
function ticketStatus(value: string) { return value === 'CLOSED' ? 'Closed' : value === 'IN_PROGRESS' ? 'In progress' : 'New'; }
function checklist(value: string, chemical: boolean) {
  let values = [value];
  try { const parsed: unknown = JSON.parse(value); if (Array.isArray(parsed)) values = parsed.map(String); } catch {}
  return values.map((item) => chemical ? englishChemical(item) : item).join(', ');
}
function info(title: string, value: string | null | undefined, accent = '') { return <div className={'history-info-item' + (accent ? ' ' + accent : '')} key={title}><dt>{title}</dt><dd>{value || 'Not assigned'}</dd></div>; }

export function PropertyHistoryPage({ sidebar, properties, onOpenHealth }: { sidebar: ReactNode; properties: HistoryProperty[]; onOpenHealth: () => void }) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('overview');
  const [search, setSearch] = useState('');
  const [tickets, setTickets] = useState<PropertyHealthTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [refresh, setRefresh] = useState(0);
  const [clock, setClock] = useState(() => new Date());
  useEffect(() => {
    const controller = new AbortController();
    let pending = false;
    async function load() {
      if (pending) return;
      pending = true;
      try {
        const response = await fetch(API_URL + '/health-department/tickets', { signal: controller.signal });
        if (!response.ok) throw new Error('Unable to load Health Department history.');
        const rows: unknown = await response.json();
        if (!Array.isArray(rows)) throw new Error('Unable to load Health Department history.');
        if (!controller.signal.aborted) { setTickets(rows); setError(''); }
      } catch (cause) {
        if (!controller.signal.aborted) setError((cause as Error).message);
      } finally { pending = false; if (!controller.signal.aborted) setLoading(false); }
    }
    void load();
    const timer = window.setInterval(() => { setClock(new Date()); void load(); }, 60000);
    const focus = () => { setClock(new Date()); void load(); };
    window.addEventListener('focus', focus);
    return () => { controller.abort(); window.clearInterval(timer); window.removeEventListener('focus', focus); };
  }, [refresh]);
  const index = useMemo(() => indexPropertyHealthTickets(properties, tickets), [properties, tickets]);
  const displayed = useMemo(() => properties.filter((property) => propertyNameKey([property.name, property.addressLine1, property.city, property.managementCompany?.name].filter(Boolean).join(' ')).includes(propertyNameKey(search))).slice().sort((a, b) => a.name.localeCompare(b.name)), [properties, search]);
  const property = properties.find((item) => item.id === selectedId);
  const history = property ? index.byProperty.get(property.id) || [] : [];
  const deadlines = history.map((ticket) => ({ ticket, date: healthDate(ticket.healthData?.['Fecha Límite'] || '') })).filter(({ ticket, date }) => ticket.status !== 'CLOSED' && date && daysUntilInspection(date, clock) >= 0).sort((a, b) => a.date.localeCompare(b.date));
  const totalLinked = Array.from(index.byProperty.values()).reduce((sum, rows) => sum + rows.length, 0);
  function select(id: string) { setSelectedId(id); setTab('overview'); }
  function stats(rows: PropertyHealthTicket[]) {
    return <div className="history-metrics"><article><span>Health records</span><strong>{rows.length}</strong></article><article><span>Open tickets</span><strong>{rows.filter((ticket) => ticket.status !== 'CLOSED').length}</strong></article><article><span>Closed tickets</span><strong>{rows.filter((ticket) => ticket.status === 'CLOSED').length}</strong></article><article><span>Estimates recorded</span><strong>{rows.filter((ticket) => ticket.estimateNumber || ticket.healthData?.Estimado).length}</strong></article></div>;
  }
  function healthCard(ticket: PropertyHealthTicket) {
    const data = ticket.healthData || {};
    const inspection = ticketInspectionDate(ticket);
    const deadline = healthDate(data['Fecha Límite'] || '');
    const number = ticket.estimateNumber || data.Estimado || '';
    const comments = ticket.comments || [];
    return <article className="history-health-record" key={ticket.ticketNumber}>
      <div className="history-record-header"><div><span className="history-record-date">{healthHistoryDate(ticket) || 'Date not assigned'}</span><h3>{ticket.ticketNumber}</h3></div><span className={'health-status health-status-' + ticketStatus(ticket.status).toLowerCase().replace(' ', '-')}>{ticketStatus(ticket.status)}</span></div>
      <p className="history-record-subject">{ticket.subject}</p>
      <dl className="history-record-summary">{info('Inspection date', inspection)}{info('Reinspection deadline', deadline)}{info('Initial report status', englishHealthStatus(data.Estado))}{info('Final report status', englishHealthStatus(data['Estado Final']))}{number && <div className="history-estimate-number">{info('Estimate number', number)}</div>}{data['Estado Estimado'] && <div className="history-estimate-status">{info('Estimate status', englishHealthStatus(data['Estado Estimado']))}</div>}</dl>
      {data.Violaciones && <div className="history-violations"><strong>Violations</strong><p>{data.Violaciones}</p></div>}
      <details className="history-record-details"><summary>Inspection details and comments ({comments.length})</summary><dl className="history-record-summary">{info('Requires estimate', ticket.estimateStatus === 'REQUIRED' ? 'Yes' : 'No')}{checklistFields.filter(([field]) => data[field] && data[field] !== '[]').map(([field, title]) => info(title, checklist(data[field], field === 'Quimico')))}</dl><h4>Comment history</h4>{comments.length === 0 ? <p className="history-muted">No comments recorded.</p> : comments.map((comment) => <div className="history-comment" key={comment.id}><strong>{comment.author}</strong><time>{new Date(comment.createdAt).toLocaleString('en-US', { timeZone: 'America/Bogota' })}</time><p>{comment.body}</p></div>)}</details>
    </article>;
  }
  return <div className="page app-page property-history-page">{sidebar}
    <header className="area-page-header"><div><span className="area-eyebrow">PROPERTY RECORDS</span><h1>{property ? property.name : 'Property history'}</h1><p className="history-header-description">{property ? 'One property. A shared history across your team.' : 'The Commercial property directory, with a shared record for every property.'}</p></div><button className="secondary-button" onClick={() => setRefresh((value) => value + 1)}>Refresh history</button></header>
    {error && <div role="alert" className="history-error">{error} <button onClick={() => setRefresh((value) => value + 1)}>Retry</button></div>}
    {!property ? <>
      <div className="history-directory-heading"><div><strong>{properties.length} properties</strong><span>{loading ? 'Loading Health history…' : totalLinked + ' linked Health records'}</span></div><input type="search" aria-label="Search properties" placeholder="Search property, address or management company" value={search} onChange={(event) => setSearch(event.target.value)} /></div>
      {index.unmatched > 0 && !loading && <div className="history-link-notice">{index.unmatched} Health records need a matching Commercial property name. They are not assigned automatically to similar names. <button onClick={onOpenHealth}>Review Health tickets →</button></div>}
      <div className="history-property-grid">{displayed.map((item) => {
        const records = index.byProperty.get(item.id) || [];
        return <button className="history-property-card" key={item.id} onClick={() => select(item.id)}><div className="history-property-card-top"><span className="history-property-avatar" aria-hidden="true">{item.name.slice(0, 2).toUpperCase()}</span><span className="history-lifecycle">{label(item.lifecycleStatus)}</span></div><h2>{item.name}</h2><p>{[item.addressLine1, item.city, item.state].filter(Boolean).join(', ') || 'Address not assigned'}</p><small>{item.managementCompany?.name || 'Management company not assigned'}</small><div className="history-property-card-footer"><span>{loading ? 'Loading…' : records.length + ' Health records'}</span><strong>View record →</strong></div></button>;
      })}</div>{displayed.length === 0 && <p className="history-empty">{properties.length === 0 ? 'No Commercial properties registered yet.' : 'No properties match your search.'}</p>}
    </> : <>
      <div className="history-property-navigation"><button className="history-back-button" onClick={() => setSelectedId(null)}>← All properties</button><label>Property<select value={property.id} onChange={(event) => select(event.target.value)}>{properties.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label></div>
      <nav className="history-tabs" aria-label="Property sections">{tabs.map(([key, title]) => <button key={key} aria-current={tab === key ? 'page' : undefined} className={tab === key ? 'history-tab-active' : ''} onClick={() => setTab(key)}>{title}{key === 'health' && <span>{history.length}</span>}</button>)}</nav>
      {tab === 'overview' && <>{stats(history)}<div className="history-overview-grid"><section className="history-panel"><h2>Property overview</h2><dl className="history-info-grid">{info('Management company', property.managementCompany?.name)}{info('Address', [property.addressLine1, property.city, property.state, property.zipCode].filter(Boolean).join(', '))}{info('Property type', label(property.propertyType))}{info('Service status', label(property.lifecycleStatus))}</dl><button className="history-text-button" onClick={() => setTab('general')}>View general information →</button></section><section className="history-panel"><h2>Next reinspection deadline</h2>{deadlines[0] ? <><span className={'history-deadline health-inspection-' + inspectionSignal(daysUntilInspection(deadlines[0].date, clock))}>{deadlines[0].date}<small>{daysUntilInspection(deadlines[0].date, clock) === 0 ? 'Today' : daysUntilInspection(deadlines[0].date, clock) + ' days remaining'}</small></span><p>{deadlines[0].ticket.ticketNumber}</p><button className="history-text-button" onClick={() => setTab('health')}>View Health history →</button></> : <p className="history-muted">No upcoming reinspection deadline assigned.</p>}</section></div><section className="history-panel"><div className="history-panel-heading"><h2>Latest Health records</h2><button className="history-text-button" onClick={() => setTab('health')}>View all →</button></div>{loading ? <p>Loading Health history…</p> : history.length === 0 ? <p className="history-muted">No Health records linked to this property yet.</p> : <div className="history-timeline">{history.slice(0, 3).map(healthCard)}</div>}</section></>}
      {tab === 'general' && <div className="history-overview-grid"><section className="history-panel"><h2>General information</h2><p className="history-muted">Read from Commercial. Update this information in Commercial.</p><dl className="history-info-grid">{info('Property name', property.name)}{info('Property code', property.code)}{info('Management company', property.managementCompany?.name)}{info('Property type', label(property.propertyType))}{info('Segment', label(property.segment))}{info('Service status', label(property.lifecycleStatus))}{info('Service start date', healthDate(property.serviceStartDate || ''))}{info('Address', property.addressLine1)}{info('City', property.city)}{info('County', property.county)}{info('State', property.state)}{info('ZIP code', property.zipCode)}{info('Maintenance contact information', property.maintenanceChiefInfo)}</dl></section><div className="history-side-panels"><section className="history-panel"><h2>Contacts</h2>{property.contacts.length === 0 && <p className="history-muted">No contacts registered.</p>}{property.contacts.map((relation) => <div className="history-contact" key={relation.id}><strong>{[relation.contact.firstName, relation.contact.lastName].filter(Boolean).join(' ') || 'Contact'}{relation.isPrimary ? ' · Primary' : ''}</strong><small>{label(relation.role)}</small><span>{relation.contact.email || 'Email not assigned'}</span><span>{relation.contact.phone || 'Phone not assigned'}</span></div>)}</section><section className="history-panel"><h2>Water bodies</h2>{property.waterBodies.length === 0 && <p className="history-muted">No water bodies registered.</p>}{property.waterBodies.map((body) => <div className="history-contact" key={body.id}><strong>{body.name}</strong><small>{label(body.type)} · {body.active ? 'Active' : 'Inactive'}</small><span>{label(body.size)}{body.gallons != null ? ' · ' + body.gallons.toLocaleString('en-US') + ' gallons' : ''}</span></div>)}</section></div></div>}
      {tab === 'health' && <section className="history-panel"><div className="history-panel-heading"><div><h2>Health Department history</h2><p className="history-muted">Live records from Health Department, including closed tickets and comment history.</p></div><button className="secondary-button" onClick={onOpenHealth}>Open Health Department</button></div>{loading ? <p>Loading Health history…</p> : history.length === 0 ? <p className="history-empty">No Health tickets match this property's Commercial name.</p> : <div className="history-timeline">{history.map(healthCard)}</div>}</section>}
      {(tab === 'estimates' || tab === 'complaints') && <section className="history-panel history-coming-next"><h2>{tab === 'estimates' ? 'Estimates' : 'Complaints'}</h2><p>This section is ready for the next integration step.</p>{tab === 'estimates' && <><p>Estimate numbers and statuses recorded in Health are already available in this property's Health history.</p><button className="history-text-button" onClick={() => setTab('health')}>View Health estimates →</button></>}</section>}
    </>}
  </div>;
}
