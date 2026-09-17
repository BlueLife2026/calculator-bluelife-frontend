import { useEffect, useMemo, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { API_URL } from './api';

type Comment = { id: string; author: string; body: string; createdAt: string };
type Ticket = { id: string; subject: string; property: string; sender: string; receivedAt: string; visitDate: string; status: string; estimate: string; estimateNumber: string; healthData: Record<string, string>; comments: Comment[] };
const groups: Array<[string, string, string[]]> = [
  ['Quimico', 'Chemical', ['Ph', 'Cloro', 'Estabilizador']],
  ['Feeders', 'Feeders', ['Ph Feeder', 'Chlorine Feeder', 'Disinfection Feeder']],
  ['Main drain', 'Main drain', ['Main drain']],
  ['Flow meter /  Flow rate', 'Flow meter / Flow rate', ['Flow meter', 'Flow rate']],
  ['Life Hook, safety line', 'Safety line', ['Life Hook', 'Safety Line', 'Throw Rope', 'Life ring']],
  ['Gauges, gutters, Plugs', 'Gauges / Gutters / Plugs', ['Vacuum gauge', 'Skimmer gutter', 'Return', 'Plug', 'Gutter grate', 'Thermometer', 'pressure gauge']],
  ['Rules / Water level', 'Rules / Water level', ['Rules', 'Water level', 'water clarity']],
  ['Step / Handrail', 'Step / Handrail', ['Step', 'Handrail']],
];
function dateValue(value: string) {
  if (!value) return '';
  if (/^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10);
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toISOString().slice(0, 10);
}
function asList(value: string) {
  try { const result: unknown = JSON.parse(value || '[]'); return Array.isArray(result) ? result.map(String) : value ? [value] : []; }
  catch { return value ? [value] : []; }
}
function mapTicket(row: Record<string, any>): Ticket {
  const data = row.healthData ?? {};
  return { id: row.ticketNumber, subject: row.subject || 'Health Department request', property: row.propertyName || data.Propiedad || '', sender: row.senderEmail || 'Historical / manual', receivedAt: row.receivedAt, visitDate: dateValue(data['Fecha de Inicio'] || row.visitDate || ''), status: row.status || 'NEW', estimate: row.estimateStatus || 'PENDING', estimateNumber: row.estimateNumber || data.Estimado || '', healthData: data, comments: row.comments || [] };
}
function daysUntil(value: string) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  return Math.round((new Date(value + 'T00:00:00').getTime() - today.getTime()) / 86400000);
}
const statusLabel = (value: string) => value === 'CLOSED' ? 'Closed' : value === 'IN_PROGRESS' ? 'In progress' : 'New';
async function request(path: string, options?: RequestInit) {
  const response = await fetch(API_URL + path, options);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(typeof data.message === 'string' ? data.message : 'Unable to complete this action.');
  return data;
}

export function HealthDepartmentPage({ sidebar, properties }: { sidebar: ReactNode; properties: Array<{ id: string; name: string }> }) {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [editing, setEditing] = useState<Ticket | null>(null);
  const [filter, setFilter] = useState('All');
  const [openComments, setOpenComments] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [author, setAuthor] = useState('Health Department');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState<Ticket | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [token, setToken] = useState(() => sessionStorage.getItem('bluelife-health-admin-token') || localStorage.getItem('bluelife-chemicals-owner-token') || '');
  async function load() { const rows = await request('/health-department/tickets'); setTickets(rows.map(mapTicket)); }
  useEffect(() => { void load().catch((error: Error) => setMessage(error.message)); }, []);
  const filtered = useMemo(() => tickets.filter((ticket) => filter === 'All' || ticket.status === filter), [tickets, filter]);
  const upcoming = useMemo(() => tickets.filter((ticket) => ticket.status !== 'CLOSED' && ticket.visitDate && daysUntil(ticket.visitDate) >= 0).sort((a, b) => a.visitDate.localeCompare(b.visitDate)), [tickets]);
  const urgent = upcoming.filter((ticket) => daysUntil(ticket.visitDate) <= 10);
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
      const data = { ...editing.healthData, Propiedad: editing.property, 'Fecha de Inicio': editing.visitDate, Estimado: editing.estimate === 'REQUIRED' ? editing.estimateNumber : '' };
      const row = await request('/health-department/tickets' + (editing.id ? '/' + encodeURIComponent(editing.id) : ''), {
        method: editing.id ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ propertyName: editing.property, visitDate: editing.visitDate || null, status: editing.status, estimateStatus: editing.estimate, estimateNumber: editing.estimate === 'REQUIRED' ? editing.estimateNumber : '', healthData: data }),
      });
      const saved = mapTicket({ ...row, comments: editing.comments });
      setTickets((current) => editing.id ? current.map((ticket) => ticket.id === editing.id ? saved : ticket) : [saved, ...current]);
      setEditing(null); setMessage('Ticket saved.');
    } catch (error) { setMessage((error as Error).message); } finally { setBusy(false); }
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
    return <div className="health-ticket-summary">{items.map(([label, value]) => <div className="health-summary-chip" key={label}><b>{label}</b><span>{value}</span></div>)}</div>;
  }
  return <div className="page app-page health-page">{sidebar}
    <header className="area-page-header health-header"><div><span className="area-eyebrow">COMPLIANCE & SERVICE</span><h1>Health Department</h1></div><div className="health-header-actions"><button className="secondary-button" disabled={busy} onClick={() => void sync()}>Sync</button><button className="primary-button" onClick={newTicket}>+ New ticket</button></div></header>
    {message && <p role="status" className="health-sync-message">{message}</p>}
    {urgent.length > 0 && <div className="health-alert-banner"><span className="health-alert-icon">!</span><div><strong>{urgent.length} inspections within 10 days</strong><p>Based on the inspection dates assigned in your tickets.</p></div></div>}
    <div className="health-main-grid">
      <section className="health-card health-tickets-card"><div className="health-card-heading"><div><h2>Ticket inbox</h2><p>Inspection reports and follow-up.</p></div><select aria-label="Filter tickets" value={filter} onChange={(event) => setFilter(event.target.value)}><option>All</option><option value="NEW">New</option><option value="IN_PROGRESS">In progress</option><option value="CLOSED">Closed</option></select></div>
        <div className="health-ticket-list">{filtered.length === 0 && <p className="health-empty">No tickets to display.</p>}{filtered.map((ticket) => <article className="health-ticket" key={ticket.id}>
          <div className="health-ticket-top"><span className="health-ticket-id">{ticket.id}</span><span className={'health-status health-status-' + statusLabel(ticket.status).toLowerCase().replace(' ', '-')}>{statusLabel(ticket.status)}</span></div>
          <h3><button className="health-property-link" onClick={() => setEditing({ ...ticket, healthData: { ...ticket.healthData } })}>{ticket.property || 'Select property'}</button></h3>
          <div className="health-ticket-meta"><span>{ticket.subject}</span><span>Received {new Date(ticket.receivedAt).toLocaleDateString('en-US')}</span></div>{summary(ticket)}
          <div className="health-ticket-actions"><button className="health-estimate-action" onClick={() => setEditing({ ...ticket, healthData: { ...ticket.healthData } })}>Edit ticket</button><button className="health-comments-button" onClick={() => { setOpenComments(openComments === ticket.id ? null : ticket.id); setDraft(''); }}>Comments ({ticket.comments.length})</button><button className="health-delete-button" onClick={() => { setMessage(''); setDeleting(ticket); }}>Delete ticket</button></div>
          {openComments === ticket.id && <div className="health-comments-panel"><div className="health-comments-list">{ticket.comments.map((comment) => <div className="health-comment" key={comment.id}><strong>{comment.author}</strong><small> {new Date(comment.createdAt).toLocaleString()}</small><p>{comment.body}</p></div>)}</div><form className="health-comment-form" onSubmit={(event) => void addComment(event, ticket)}><input aria-label="Comment author" required value={author} onChange={(event) => setAuthor(event.target.value)} /><textarea aria-label="Comment" required rows={2} value={draft} onChange={(event) => setDraft(event.target.value)} /><button className="secondary-button" disabled={busy}>Add comment</button></form></div>}
        </article>)}</div>
      </section>
      <aside className="health-card health-upcoming"><div className="health-card-heading"><div><h2>Upcoming inspections</h2><p>Alerts start 10 days before inspection.</p></div></div>{upcoming.length === 0 && <p className="health-empty">No upcoming inspections assigned.</p>}{upcoming.map((ticket) => <button key={ticket.id} className="health-upcoming-row" onClick={() => setEditing({ ...ticket, healthData: { ...ticket.healthData } })}><span className="health-date-chip"><strong>{Number(ticket.visitDate.slice(8))}</strong><small>{new Date(ticket.visitDate + 'T00:00:00').toLocaleDateString('en-US', { month: 'short' })}</small></span><span><strong>{ticket.property || 'Select property'}</strong><small>{ticket.visitDate}</small><em className={daysUntil(ticket.visitDate) <= 10 ? 'health-due' : ''}>{daysUntil(ticket.visitDate) === 0 ? 'Today' : daysUntil(ticket.visitDate) + ' days remaining'}</em></span></button>)}</aside>
    </div>
    {editing && <div className="modal-backdrop"><section role="dialog" aria-modal="true" aria-label={editing.id ? 'Edit ticket' : 'New ticket'} className="property-modal repair-request-modal health-editor-modal"><div className="edit-panel-header"><h2>{editing.id ? 'Edit ' + editing.id : 'New ticket'}</h2><button className="modal-close" aria-label="Close editor" onClick={() => setEditing(null)}>&times;</button></div><form onSubmit={(event) => void save(event)}><div className="health-detail-grid health-form-grid">
      <label>Property<select required value={editing.property} onChange={(event) => setEditing({ ...editing, property: event.target.value })}><option value="">Select property</option>{editing.property && !properties.some((property) => property.name === editing.property) && <option>{editing.property}</option>}{properties.map((property) => <option key={property.id} value={property.name}>{property.name}</option>)}</select></label>
      <label>Inspection date<input type="date" value={editing.visitDate} onChange={(event) => setEditing({ ...editing, visitDate: event.target.value })} /></label>
      <label>Ticket status<select value={editing.status} onChange={(event) => setEditing({ ...editing, status: event.target.value })}><option value="NEW">New</option><option value="IN_PROGRESS">In progress</option><option value="CLOSED">Closed</option></select></label>
      <div className="health-initial-column">{reportStatus('Estado', 'Initial report status')}<label>Reinspection deadline<input type="date" value={dateValue(editing.healthData['Fecha Límite'] || '')} onChange={(event) => update('Fecha Límite', event.target.value)} /></label></div>
      <label className="health-violations-field">Violations<textarea rows={5} value={editing.healthData.Violaciones || ''} onChange={(event) => update('Violaciones', event.target.value)} /></label>
      <fieldset><legend>Requires estimate</legend><label className="health-option"><input type="checkbox" checked={editing.estimate === 'REQUIRED'} onChange={(event) => setEditing({ ...editing, estimate: event.target.checked ? 'REQUIRED' : 'NOT_REQUIRED' })} />Yes</label>{editing.estimate === 'REQUIRED' && <><label>Estimate number<input value={editing.estimateNumber} onChange={(event) => setEditing({ ...editing, estimateNumber: event.target.value })} /></label><label>Estimate status<select value={editing.healthData['Estado Estimado'] || ''} onChange={(event) => update('Estado Estimado', event.target.value)}><option value="">Select status</option>{['Required', 'Sent', 'Approved', 'Rejected'].map((value) => <option key={value}>{value}</option>)}</select></label></>}</fieldset>
      {groups.map(([field, label, options]) => <fieldset key={field}><legend>{label}</legend>{options.map((option) => <label className="health-option" key={option}><input type="checkbox" checked={asList(editing.healthData[field]).includes(option)} onChange={(event) => { const list = asList(editing.healthData[field]); update(field, JSON.stringify(event.target.checked ? [...new Set([...list, option])] : list.filter((item) => item !== option))); }} />{option}</label>)}</fieldset>)}
      <div className="health-final-field">{reportStatus('Estado Final', 'Final report status')}</div>
    </div>{message && <p role="alert">{message}</p>}<div className="modal-actions"><button type="button" className="secondary-button" onClick={() => setEditing(null)}>Cancel</button><button className="primary-button" disabled={busy}>{busy ? 'Saving...' : 'Save ticket'}</button></div></form></section></div>}
    {deleting && <div className="modal-backdrop"><section role="dialog" aria-modal="true" aria-label="Delete ticket" className="property-modal health-delete-modal"><h2>Delete ticket</h2><p>Delete {deleting.property || deleting.id}? This ticket will be removed from the inbox.</p><form onSubmit={(event) => void remove(event)}>{!token && <><p>Sign in with your Chemicals administrator account or the Service account.</p><label>Email<input type="email" autoComplete="username" required value={email} onChange={(event) => setEmail(event.target.value)} /></label><label>Password<input type="password" autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} /></label></>}{message && <p role="alert">{message}</p>}<div className="modal-actions"><button type="button" className="secondary-button" onClick={() => { setDeleting(null); setPassword(''); }}>Cancel</button><button className="primary-button" disabled={busy}>{busy ? 'Please wait...' : 'Confirm deletion'}</button></div></form></section></div>}
  </div>;
}
