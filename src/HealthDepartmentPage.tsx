import { useCallback, useEffect, useMemo, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { API_URL } from './api';
import { daysUntilInspection, englishChemical, englishHealthStatus, estimateStatusOptions, healthDate, inspectionAlertDate, inspectionSignal } from './healthDisplay';

type Comment = { id: string; author: string; body: string; createdAt: string };
type Ticket = { id: string; subject: string; property: string; sender: string; receivedAt: string; visitDate: string; status: string; estimate: string; estimateNumber: string; healthData: Record<string, string>; comments: Comment[] };
const groups: Array<[string, string, string[]]> = [
  ['Quimico', 'Chemical', ['pH', 'Chlorine', 'Stabilizer']],
  ['Feeders', 'Feeders', ['Ph Feeder', 'Chlorine Feeder', 'Disinfection Feeder']],
  ['Main drain', 'Main drain', ['Main drain']],
  ['Flow meter /  Flow rate', 'Flow meter / Flow rate', ['Flow meter', 'Flow rate']],
  ['Life Hook, safety line', 'Safety line', ['Life Hook', 'Safety Line', 'Throw Rope', 'Life ring']],
  ['Gauges, gutters, Plugs', 'Gauges / Gutters / Plugs', ['Vacuum gauge', 'Skimmer gutter', 'Return', 'Plug', 'Gutter grate', 'Thermometer', 'pressure gauge']],
  ['Rules / Water level', 'Rules / Water level', ['Rules', 'Water level', 'water clarity']],
  ['Step / Handrail', 'Step / Handrail', ['Step', 'Handrail']],
];
const dateValue = healthDate;
function asList(value: string) {
  try { const result: unknown = JSON.parse(value || '[]'); return Array.isArray(result) ? result.map(String) : value ? [value] : []; }
  catch { return value ? [value] : []; }
}
function mapTicket(row: Record<string, any>, commercialPropertyNames?: Set<string>): Ticket {
  const data = { ...(row.healthData ?? {}) };
  for (const field of ['Estado Estimado', 'Estado', 'Estado Final']) {
    if (typeof data[field] === 'string') data[field] = englishHealthStatus(data[field]);
  }
  if (typeof data.Quimico === 'string') data.Quimico = JSON.stringify(asList(data.Quimico).map(englishChemical));
  const assignedProperty = row.propertyName && (!commercialPropertyNames || commercialPropertyNames.has(row.propertyName)) ? row.propertyName : '';
  return { id: row.ticketNumber, subject: row.subject || 'Health Department request', property: assignedProperty, sender: row.senderEmail || 'Historical / manual', receivedAt: row.receivedAt, visitDate: dateValue(data['Fecha de Inicio'] || row.visitDate || ''), status: row.status || 'NEW', estimate: row.estimateStatus || 'PENDING', estimateNumber: row.estimateNumber || data.Estimado || '', healthData: data, comments: row.comments || [] };
}
const statusLabel = (value: string) => value === 'CLOSED' ? 'Closed' : value === 'IN_PROGRESS' ? 'In progress' : 'New';
const searchKey = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
function ticketTitle(ticket: Ticket) {
  const importedName = ticket.healthData.Propiedad?.trim();
  if (importedName) return importedName;
  return ticket.subject.replace(/^Health Department inspection\s*-\s*/i, '').trim() || 'Health Department inspection';
}
async function request(path: string, options?: RequestInit) {
  const response = await fetch(API_URL + path, options);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(typeof data.message === 'string' ? data.message : 'Unable to complete this action.');
  return data;
}

export function HealthDepartmentPage({ sidebar, properties, unassignedOnly = false, onClearUnassignedFilter }: { sidebar: ReactNode; properties: Array<{ id: string; name: string }>; unassignedOnly?: boolean; onClearUnassignedFilter?: () => void }) {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [editing, setEditing] = useState<Ticket | null>(null);
  const [filter, setFilter] = useState('All');
  const [propertySearch, setPropertySearch] = useState('');
  const [openComments, setOpenComments] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [author, setAuthor] = useState('Health Department');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [assigningProperty, setAssigningProperty] = useState<string | null>(null);
  const [clock, setClock] = useState(() => new Date());
  const [deleting, setDeleting] = useState<Ticket | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [token, setToken] = useState(() => sessionStorage.getItem('bluelife-health-admin-token') || localStorage.getItem('bluelife-chemicals-owner-token') || '');
  const load = useCallback(async () => { const rows = await request('/health-department/tickets'); const commercialPropertyNames = new Set(properties.map((property) => property.name)); setTickets(rows.map((row: Record<string, any>) => mapTicket(row, commercialPropertyNames))); }, [properties]);
  useEffect(() => { void load().catch((error: Error) => setMessage(error.message)); }, [load]);
  useEffect(() => {
    const timer = window.setInterval(() => setClock(new Date()), 60000);
    return () => window.clearInterval(timer);
  }, []);
  const filtered = useMemo(() => {
    const query = searchKey(propertySearch);
    return tickets.filter((ticket) => (filter === 'All' || ticket.status === filter) && (!unassignedOnly || !ticket.property) && (!query || searchKey(ticket.property).includes(query)));
  }, [tickets, filter, propertySearch, unassignedOnly]);
  const upcoming = useMemo(() => tickets.map((ticket) => ({ ticket, ...inspectionAlertDate(ticket) })).filter(({ ticket, date }) => ticket.status !== 'CLOSED' && date && daysUntilInspection(date, clock) >= 0).sort((a, b) => a.date.localeCompare(b.date)), [tickets, clock]);
  const urgent = upcoming.filter(({ date }) => daysUntilInspection(date, clock) <= 10);
  function newTicket() {
    setMessage('');
    setEditing({ id: '', subject: 'Health Department visit', property: '', sender: '', receivedAt: '', visitDate: '', status: 'NEW', estimate: 'NOT_REQUIRED', estimateNumber: '', healthData: {}, comments: [] });
  }
  function update(field: string, value: string) {
    setEditing((current) => current ? { ...current, healthData: { ...current.healthData, [field]: value } } : null);
  }
  async function save(event: FormEvent) {
    event.preventDefault(); if (!editing || busy) return;
    setBusy(true); setMessage('');
    try {
      const data = { ...editing.healthData, Propiedad: editing.healthData.Propiedad?.trim() || editing.property, 'Fecha de Inicio': editing.visitDate, Estimado: editing.estimate === 'REQUIRED' ? editing.estimateNumber : '' };
      const row = await request('/health-department/tickets' + (editing.id ? '/' + encodeURIComponent(editing.id) : ''), {
        method: editing.id ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ propertyName: editing.property, visitDate: editing.visitDate || null, status: editing.status, estimateStatus: editing.estimate, estimateNumber: editing.estimate === 'REQUIRED' ? editing.estimateNumber : '', healthData: data }),
      });
      const saved = mapTicket({ ...row, comments: editing.comments });
      setTickets((current) => editing.id ? current.map((ticket) => ticket.id === editing.id ? saved : ticket) : [saved, ...current]);
      setEditing(null); setMessage('Ticket saved.');
    } catch (error) { setMessage((error as Error).message); } finally { setBusy(false); }
  }
  async function assignProperty(ticket: Ticket, propertyName: string) {
    if (assigningProperty) return;
    setAssigningProperty(ticket.id); setMessage('');
    try {
      const row = await request('/health-department/tickets/' + encodeURIComponent(ticket.id), {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ propertyName }),
      });
      const saved = mapTicket({ ...row, comments: ticket.comments });
      setTickets((current) => current.map((item) => item.id === ticket.id ? saved : item));
      setMessage(propertyName ? 'Property assigned.' : 'Property assignment removed.');
    } catch (error) { setMessage((error as Error).message); } finally { setAssigningProperty(null); }
  }
  async function sync() {
    setBusy(true); setMessage('');
    try { await request('/health-department/sync', { method: 'POST' }); await load(); setMessage('Sync completed.'); }
    catch (error) { setMessage((error as Error).message); } finally { setBusy(false); }
  }
  async function addComment(event: FormEvent, ticket: Ticket) {
    event.preventDefault(); if (!draft.trim() || busy) return;
    setBusy(true);
    try {
      const comment = await request('/health-department/tickets/' + encodeURIComponent(ticket.id) + '/comments', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ author: author.trim(), body: draft.trim() }) });
      setTickets((current) => current.map((item) => item.id === ticket.id ? { ...item, comments: [...item.comments, comment] } : item)); setDraft('');
    } catch (error) { setMessage((error as Error).message); } finally { setBusy(false); }
  }
  async function remove(event: FormEvent) {
    event.preventDefault(); if (!deleting || busy) return;
    setBusy(true); setMessage('');
    try {
      let auth = token;
      if (!auth) {
        let result;
        try { result = await request('/health-department/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) }); }
        catch { result = await request('/chemicals/owner/access', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) }); }
        auth = result.token; setToken(auth); sessionStorage.setItem('bluelife-health-admin-token', auth); setPassword('');
      }
      await request('/health-department/tickets/' + encodeURIComponent(deleting.id), { method: 'DELETE', headers: { Authorization: 'Bearer ' + auth } });
      setTickets((current) => current.filter((ticket) => ticket.id !== deleting.id)); setDeleting(null); setMessage('Ticket deleted.');
    } catch (error) {
      setToken(''); sessionStorage.removeItem('bluelife-health-admin-token'); setMessage((error as Error).message);
    } finally { setBusy(false); }
  }
  function reportStatus(field: string, label: string) {
    return <label>{label}<select value={editing?.healthData[field] || ''} onChange={(event) => update(field, event.target.value)}><option value="">Select status</option>{['Closed', 'Satisfactory', 'Unsatisfactory'].map((value) => <option key={value}>{value}</option>)}</select></label>;
  }
  function summary(ticket: Ticket) {
    const data = ticket.healthData;
    const items = [
      ['Inspection', ticket.visitDate], ['Initial report', data.Estado], ['Reinspection deadline', data['Fecha Límite']], ['Violations', data.Violaciones],
      ...groups.map(([field, label]) => [label, asList(data[field]).join(', ')]),
      ['Requires estimate', ticket.estimate === 'REQUIRED' ? 'Yes' : 'No'],
      ['Estimate number', ticket.estimateNumber], ['Estimate status', data['Estado Estimado']], ['Final report', data['Estado Final']],
    ].filter(([, value]) => value);
    return <div className="health-ticket-summary">{items.map(([label, value]) => <div className={'health-summary-chip' + (label === 'Estimate number' ? ' health-summary-estimate-number' : label === 'Estimate status' ? ' health-summary-estimate-status' : '')} key={label}><b>{label}</b><span>{value}</span></div>)}</div>;
  }
  return <div className="page app-page health-page">{sidebar}
    <header className="area-page-header health-header"><div><span className="area-eyebrow">COMPLIANCE & SERVICE</span><h1>Health Department</h1></div><div className="health-header-actions"><button className="secondary-button" disabled={busy} onClick={() => void sync()}>Sync</button><button className="primary-button" onClick={newTicket}>+ New ticket</button></div></header>
    {message && <p role="status" className="health-sync-message">{message}</p>}
    {unassignedOnly && <div className="health-unassigned-banner"><span>Showing {filtered.length} tickets without a Commercial property assignment.</span><button type="button" onClick={onClearUnassignedFilter}>Show all tickets</button></div>}
    {urgent.length > 0 && <div className="health-alert-banner"><span className="health-alert-icon">!</span><div><strong>{urgent.length} reinspections within 10 days</strong><p>Based only on assigned reinspection deadlines.</p></div></div>}
    <div className="health-main-grid">
      <section className="health-card health-tickets-card"><div className="health-card-heading"><div><h2>Ticket inbox</h2><p>Inspection reports and follow-up.</p></div><div className="health-ticket-filters"><input type="search" aria-label="Search by property name" placeholder="Search property" value={propertySearch} onChange={(event) => setPropertySearch(event.target.value)} /><select aria-label="Filter tickets" value={filter} onChange={(event) => setFilter(event.target.value)}><option>All</option><option value="NEW">New</option><option value="IN_PROGRESS">In progress</option><option value="CLOSED">Closed</option></select></div></div>
        <div className="health-ticket-list">{filtered.length === 0 && <p className="health-empty">No tickets to display.</p>}{filtered.map((ticket) => <article className="health-ticket" key={ticket.id}>
          <div className="health-ticket-top"><span className="health-ticket-id">{ticket.id}</span><span className={'health-status health-status-' + statusLabel(ticket.status).toLowerCase().replace(' ', '-')}>{statusLabel(ticket.status)}</span></div>
          <h3>{ticketTitle(ticket)}</h3>
          <label className="health-ticket-property-select"><span>Property</span><select aria-label={`Property for ${ticketTitle(ticket)}`} value={ticket.property} disabled={assigningProperty === ticket.id} onChange={(event) => void assignProperty(ticket, event.target.value)}><option value="">Select property</option>{ticket.property && !properties.some((property) => property.name === ticket.property) && <option>{ticket.property}</option>}{properties.map((property) => <option key={property.id} value={property.name}>{property.name}</option>)}</select>{assigningProperty === ticket.id && <small>Saving…</small>}</label>
          <div className="health-ticket-meta"><span>Received {new Date(ticket.receivedAt).toLocaleDateString('en-US')}</span></div>{summary(ticket)}
          <div className="health-ticket-actions"><button className="health-estimate-action" onClick={() => setEditing({ ...ticket, healthData: { ...ticket.healthData } })}>Edit ticket</button><button className="health-comments-button" onClick={() => { setOpenComments(openComments === ticket.id ? null : ticket.id); setDraft(''); }}>Comments ({ticket.comments.length})</button><button className="health-delete-button" onClick={() => { setMessage(''); setDeleting(ticket); }}>Delete ticket</button></div>
          {openComments === ticket.id && <div className="health-comments-panel"><div className="health-comments-list">{ticket.comments.map((comment) => <div className="health-comment" key={comment.id}><strong>{comment.author}</strong><small> {new Date(comment.createdAt).toLocaleString()}</small><p>{comment.body}</p></div>)}</div><form className="health-comment-form" onSubmit={(event) => void addComment(event, ticket)}><input aria-label="Comment author" required value={author} onChange={(event) => setAuthor(event.target.value)} /><textarea aria-label="Comment" required rows={2} value={draft} onChange={(event) => setDraft(event.target.value)} /><button className="secondary-button" disabled={busy}>Add comment</button></form></div>}
        </article>)}</div>
      </section>
      <aside className="health-card health-upcoming">
        <div className="health-card-heading"><div><h2>Upcoming inspections</h2><p>Based only on assigned reinspection deadlines.</p></div></div>
        <div className="health-signal-legend" aria-label="Inspection priority legend"><span><i className="health-signal-dot health-signal-red" />0–2 days</span><span><i className="health-signal-dot health-signal-yellow" />3–5 days</span><span><i className="health-signal-dot health-signal-green" />6–10 days</span></div>
        {upcoming.length === 0 && <p className="health-empty">No upcoming reinspection deadlines assigned.</p>}
        {upcoming.map(({ ticket, date, label }) => {
          const days = daysUntilInspection(date, clock);
          const signal = inspectionSignal(days);
          return <button key={ticket.id} className={'health-upcoming-row health-inspection-' + signal} onClick={() => setEditing({ ...ticket, healthData: { ...ticket.healthData } })}>
            <span className="health-date-chip"><strong>{Number(date.slice(8))}</strong><small>{new Date(date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short' })}</small></span>
            <span className="health-inspection-info"><strong>{ticket.property || 'Select property'}</strong><small>{ticket.id}</small><small>{label}: {date}</small><em className="health-inspection-countdown"><i className={'health-signal-dot health-signal-' + signal} />{days === 0 ? 'Today' : days + (days === 1 ? ' day remaining' : ' days remaining')}</em></span>
          </button>;
        })}
      </aside>
    </div>
    {editing && <div className="modal-backdrop"><section role="dialog" aria-modal="true" aria-label={editing.id ? 'Edit ticket' : 'New ticket'} className="property-modal repair-request-modal health-editor-modal"><div className="edit-panel-header"><h2>{editing.id ? 'Edit ' + editing.id : 'New ticket'}</h2><button className="modal-close" aria-label="Close editor" onClick={() => setEditing(null)}>&times;</button></div><form onSubmit={(event) => void save(event)}><div className="health-detail-grid health-form-grid">
      <label>Property<select required value={editing.property} onChange={(event) => setEditing({ ...editing, property: event.target.value })}><option value="">Select property</option>{editing.property && !properties.some((property) => property.name === editing.property) && <option>{editing.property}</option>}{properties.map((property) => <option key={property.id} value={property.name}>{property.name}</option>)}</select></label>
      <label>Inspection date<input type="date" value={editing.visitDate} onChange={(event) => setEditing({ ...editing, visitDate: event.target.value })} /></label>
      <label>Ticket status<select value={editing.status} onChange={(event) => setEditing({ ...editing, status: event.target.value })}><option value="NEW">New</option><option value="IN_PROGRESS">In progress</option><option value="CLOSED">Closed</option></select></label>
      <div className="health-initial-column">{reportStatus('Estado', 'Initial report status')}<label>Reinspection deadline<input type="date" value={dateValue(editing.healthData['Fecha Límite'] || '')} onChange={(event) => update('Fecha Límite', event.target.value)} /></label></div>
      <label className="health-violations-field">Violations<textarea rows={5} value={editing.healthData.Violaciones || ''} onChange={(event) => update('Violaciones', event.target.value)} /></label>
<fieldset><legend>Requires estimate</legend><label className="health-option"><input type="checkbox" checked={editing.estimate === 'REQUIRED'} onChange={(event) => setEditing({ ...editing, estimate: event.target.checked ? 'REQUIRED' : 'NOT_REQUIRED' })} />Yes</label>{editing.estimate === 'REQUIRED' && <><label>Estimate number<input value={editing.estimateNumber} onChange={(event) => setEditing({ ...editing, estimateNumber: event.target.value })} /></label><label>Estimate status<select value={editing.healthData['Estado Estimado'] || ''} onChange={(event) => update('Estado Estimado', event.target.value)}><option value="">Select status</option>{[...estimateStatusOptions, ...(editing.healthData['Estado Estimado'] && !estimateStatusOptions.includes(editing.healthData['Estado Estimado']) ? [editing.healthData['Estado Estimado']] : [])].map((value) => <option key={value}>{value}</option>)}</select></label></>}</fieldset>
      {groups.map(([field, label, options]) => <fieldset key={field}><legend>{label}</legend>{options.map((option) => <label className="health-option" key={option}><input type="checkbox" checked={asList(editing.healthData[field]).includes(option)} onChange={(event) => { const list = asList(editing.healthData[field]); update(field, JSON.stringify(event.target.checked ? [...new Set([...list, option])] : list.filter((item) => item !== option))); }} />{option}</label>)}</fieldset>)}
      <div className="health-final-field">{reportStatus('Estado Final', 'Final report status')}</div>
    </div>{message && <p role="alert">{message}</p>}<div className="modal-actions"><button type="button" className="secondary-button" onClick={() => setEditing(null)}>Cancel</button><button className="primary-button" disabled={busy}>{busy ? 'Saving...' : 'Save ticket'}</button></div></form></section></div>}
    {deleting && <div className="modal-backdrop"><section role="dialog" aria-modal="true" aria-label="Delete ticket" className="property-modal health-delete-modal"><h2>Delete ticket</h2><p>Delete {deleting.property || deleting.id}? This ticket will be removed from the inbox.</p><form onSubmit={(event) => void remove(event)}>{!token && <><p>Sign in with your Chemicals administrator account or the Service account.</p><label>Email<input type="email" autoComplete="username" required value={email} onChange={(event) => setEmail(event.target.value)} /></label><label>Password<input type="password" autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} /></label></>}{message && <p role="alert">{message}</p>}<div className="modal-actions"><button type="button" className="secondary-button" onClick={() => { setDeleting(null); setPassword(''); }}>Cancel</button><button className="primary-button" disabled={busy}>{busy ? 'Please wait...' : 'Confirm deletion'}</button></div></form></section></div>}
  </div>;
}
