import { useEffect, useMemo, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { API_URL } from './api';

type HealthTicket = {
  id: string;
  subject: string;
  property: string;
  sender: string;
  receivedAt: string;
  visitDate: string;
  priority: 'High' | 'Medium' | 'Low';
  status: 'New' | 'In progress' | 'Waiting estimate' | 'Closed';
  estimate: 'Required' | 'Not required' | 'Pending';
};

const initialTickets: HealthTicket[] = [
  { id: 'HD-1048', subject: 'Annual health inspection – pool deck', property: 'The Palms at Tampa', sender: 'manager@thepalms.com', receivedAt: 'Sep 16, 2026 · 8:42 AM', visitDate: 'Sep 26, 2026', priority: 'High', status: 'New', estimate: 'Pending' },
  { id: 'HD-1047', subject: 'Follow-up on pool chemistry correction', property: 'Bayview Residences', sender: 'compliance@bayview.com', receivedAt: 'Sep 15, 2026 · 2:18 PM', visitDate: 'Sep 20, 2026', priority: 'Medium', status: 'In progress', estimate: 'Not required' },
  { id: 'HD-1046', subject: 'Replace damaged safety signage', property: 'Marina Club', sender: 'operations@marinaclub.com', receivedAt: 'Sep 14, 2026 · 11:05 AM', visitDate: 'Oct 04, 2026', priority: 'Low', status: 'Waiting estimate', estimate: 'Required' },
  { id: 'HD-1045', subject: 'Health department visit confirmation', property: 'Cypress Grove', sender: 'admin@cypressgrove.com', receivedAt: 'Sep 12, 2026 · 9:30 AM', visitDate: 'Sep 18, 2026', priority: 'High', status: 'Closed', estimate: 'Not required' },
];

const initialEstimates = [
  { id: 'HD-1046', property: 'Marina Club', request: 'Replace damaged safety signage', value: 680, status: 'Draft needed', updated: 'Today' },
  { id: 'QB-2481', property: 'Ocean Walk', request: 'Repair pool gate and self-closing hinge', value: 1240, status: 'Sent to customer', updated: 'Sep 15, 2026' },
  { id: 'QB-2472', property: 'Harbor Point', request: 'Install compliant depth markers', value: 920, status: 'Approved', updated: 'Sep 11, 2026' },
];

function daysUntil(date: string) {
  const parsed = date.includes('-') ? new Date(`${date}T12:00:00`) : new Date(`${date}, 2026`);
  return Math.ceil((parsed.getTime() - new Date('Sep 16, 2026').getTime()) / 86400000);
}

export function HealthDepartmentPage({ sidebar }: { sidebar: ReactNode }) {
  const [tickets, setTickets] = useState(initialTickets);
  const [estimates, setEstimates] = useState(initialEstimates);
  const [filter, setFilter] = useState<'All' | HealthTicket['status']>('All');
  const [showSettings, setShowSettings] = useState(false);
  const [email, setEmail] = useState('service@bluelifepools.com');
  const [showNewTicket, setShowNewTicket] = useState(false);
  const [newTicket, setNewTicket] = useState({ property: '', subject: '', visitDate: '' });
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState('');
  const filteredTickets = useMemo(() => filter === 'All' ? tickets : tickets.filter((ticket) => ticket.status === filter), [filter, tickets]);
  const alertTickets = tickets.filter((ticket) => ticket.status !== 'Closed' && daysUntil(ticket.visitDate) <= 10);

  useEffect(() => {
    void fetch(`${API_URL}/health-department/tickets`)
      .then((response) => response.ok ? response.json() : Promise.reject(new Error('Ticket API unavailable')))
      .then((rows: Array<{ ticketNumber: string; subject: string; propertyName: string | null; senderEmail: string | null; receivedAt: string; visitDate: string | null; priority: string; status: string; estimateStatus: string }>) => {
        setTickets(rows.map((row) => ({
          id: row.ticketNumber, subject: row.subject, property: row.propertyName ?? 'Property pending', sender: row.senderEmail ?? 'Outlook',
          receivedAt: new Date(row.receivedAt).toLocaleString('en-US'), visitDate: row.visitDate ? new Date(row.visitDate).toLocaleDateString('en-US', { month: 'short', day: '2-digit' }) : 'Sep 26',
          priority: row.priority === 'HIGH' ? 'High' : row.priority === 'LOW' ? 'Low' : 'Medium', status: row.status === 'IN_PROGRESS' ? 'In progress' : row.status === 'WAITING_ESTIMATE' ? 'Waiting estimate' : row.status === 'CLOSED' ? 'Closed' : 'New', estimate: row.estimateStatus === 'REQUIRED' ? 'Required' : row.estimateStatus === 'NOT_REQUIRED' ? 'Not required' : 'Pending',
        })));
      })
      .catch(() => undefined);
  }, []);

  async function syncOutlook() {
    setSyncing(true);
    setSyncMessage('');
    try {
      const response = await fetch(`${API_URL}/health-department/sync`, { method: 'POST' });
      const result = await response.json() as { created?: number; total?: number; message?: string };
      if (!response.ok) throw new Error(result.message ?? 'Outlook sync failed');
      setSyncMessage(`${result.created ?? 0} nuevos tickets · ${result.total ?? tickets.length} en total`);
      window.location.reload();
    } catch (error) {
      setSyncMessage(error instanceof Error ? error.message : 'Could not sync Outlook');
    } finally {
      setSyncing(false);
    }
  }

  function createTicket(event: FormEvent) {
    event.preventDefault();
    setTickets((current) => [{ id: `HD-${1050 + current.length}`, subject: newTicket.subject, property: newTicket.property, sender: email, receivedAt: 'Just now', visitDate: newTicket.visitDate, priority: 'Medium', status: 'New', estimate: 'Pending' }, ...current]);
    setNewTicket({ property: '', subject: '', visitDate: '' });
    setShowNewTicket(false);
  }

  function updateStatus(id: string, status: HealthTicket['status']) {
    setTickets((current) => current.map((ticket) => ticket.id === id ? { ...ticket, status } : ticket));
  }

  return <div className="page app-page health-page">
    {sidebar}
    <header className="area-page-header health-header">
      <div><span className="area-eyebrow">COMPLIANCE & SERVICE</span><h1>Health Department</h1><p>Convierte los correos etiquetados en tickets, controla visitas y da seguimiento a los requerimientos que necesitan estimado.</p></div>
      <div className="area-header-actions"><span className="integration-pill health-email-pill"><i /> Outlook · {email}</span><button className="secondary-button" type="button" onClick={() => void syncOutlook()} disabled={syncing}>{syncing ? 'Syncing…' : 'Sync Outlook'}</button><button className="secondary-button" type="button" onClick={() => setShowSettings((current) => !current)}>Email settings</button><button className="primary-button" type="button" onClick={() => setShowNewTicket(true)}>+ New ticket</button></div>
    </header>

    {syncMessage && <p className="health-sync-message">{syncMessage}</p>}

    {showSettings && <section className="health-settings"><div><strong>Ticket intake email</strong><p>Todo correo con la categoría <b>Health department</b> se convertirá en un ticket nuevo.</p></div><div className="health-settings-form"><input aria-label="Health Department email" value={email} onChange={(event) => setEmail(event.target.value)} /><button className="primary-button" type="button" onClick={() => setShowSettings(false)}>Save</button></div></section>}

    <section className="health-kpis"><article><span>Open tickets</span><strong>{tickets.filter((ticket) => ticket.status !== 'Closed').length}</strong><small>From labeled email</small></article><article className="health-kpi-alert"><span>Visits in next 10 days</span><strong>{alertTickets.length}</strong><small>Need management</small></article><article><span>Estimates to follow up</span><strong>{estimates.filter((estimate) => estimate.status !== 'Approved').length}</strong><small>QuickBooks workflow</small></article><article><span>Approved this month</span><strong>{estimates.filter((estimate) => estimate.status === 'Approved').length}</strong><small>Ready for next system</small></article></section>

    {alertTickets.length > 0 && <section className="health-alert-banner"><span className="health-alert-icon">!</span><div><strong>{alertTickets.length} health visit{alertTickets.length > 1 ? 's' : ''} need attention</strong><p>Gestiona estas visitas antes de que falten 10 días.</p></div><button className="secondary-button" type="button" onClick={() => setFilter('All')}>Review alerts</button></section>}

    <div className="health-main-grid"><section className="health-card health-tickets-card"><div className="health-card-heading"><div><h2>Ticket inbox</h2><p>Tickets creados desde {email}.</p></div><select value={filter} onChange={(event) => setFilter(event.target.value as typeof filter)}><option>All</option><option>New</option><option>In progress</option><option>Waiting estimate</option><option>Closed</option></select></div><div className="health-ticket-list">{filteredTickets.map((ticket) => <article className="health-ticket" key={ticket.id}><div className="health-ticket-top"><span className="health-ticket-id">{ticket.id}</span><span className={`health-priority health-${ticket.priority.toLowerCase()}`}>{ticket.priority}</span><span className={`health-status health-status-${ticket.status.toLowerCase().replaceAll(' ', '-')}`}>{ticket.status}</span></div><h3>{ticket.subject}</h3><p className="health-property">{ticket.property}</p><div className="health-ticket-meta"><span>✉ {ticket.sender}</span><span>Received {ticket.receivedAt}</span><span className={daysUntil(ticket.visitDate) <= 10 ? 'health-due' : ''}>Visit {ticket.visitDate} · {daysUntil(ticket.visitDate)} days</span></div><div className="health-ticket-actions"><label>Move to<select value={ticket.status} onChange={(event) => updateStatus(ticket.id, event.target.value as HealthTicket['status'])}><option>New</option><option>In progress</option><option>Waiting estimate</option><option>Closed</option></select></label>{ticket.estimate === 'Required' && <span className="health-estimate-flag">$ Estimate required</span>}{ticket.estimate === 'Pending' && <span className="health-estimate-flag health-estimate-pending">Review for estimate</span>}</div></article>)}</div></section>

      <aside className="health-side-column"><section className="health-card health-calendar-card"><div className="health-card-heading"><div><h2>Upcoming visits</h2><p>Alert threshold: 10 days</p></div><span className="health-month">SEP 2026</span></div>{tickets.filter((ticket) => ticket.status !== 'Closed').sort((a, b) => daysUntil(a.visitDate) - daysUntil(b.visitDate)).map((ticket) => <div className="health-visit-row" key={ticket.id}><div className="health-date-chip"><strong>{ticket.visitDate.split(' ')[1]?.replace(',', '')}</strong><small>{ticket.visitDate.split(' ')[0]}</small></div><div><strong>{ticket.property}</strong><span>{ticket.subject}</span></div><em className={daysUntil(ticket.visitDate) <= 10 ? 'health-due' : ''}>{daysUntil(ticket.visitDate)}d</em></div>)}</section>
      <section className="health-card health-quickbooks-card"><div className="health-card-heading"><div><h2>Estimate follow-up</h2><p>Approval status from QuickBooks</p></div><span className="integration-pill">QB</span></div>{estimates.map((estimate) => <div className="health-estimate-row" key={estimate.id}><div><strong>{estimate.property}</strong><span>{estimate.request}</span></div><div><b>${estimate.value.toLocaleString('en-US')}</b><small className={`health-qb-status health-qb-${estimate.status.toLowerCase().replaceAll(' ', '-')}`}>{estimate.status}</small></div></div>)}<button className="health-link-button" type="button" onClick={() => setEstimates((current) => current.map((estimate) => estimate.status === 'Draft needed' ? { ...estimate, status: 'Sent to customer', updated: 'Just now' } : estimate))}>Send draft estimate to QuickBooks →</button></section></aside></div>

    {showNewTicket && <div className="modal-backdrop"><section className="property-modal repair-request-modal" role="dialog" aria-modal="true"><div className="edit-panel-header"><div><h2>New Health Department ticket</h2><p>Use this for a ticket received outside the connected inbox.</p></div><button className="modal-close" type="button" onClick={() => setShowNewTicket(false)}>&times;</button></div><form onSubmit={createTicket}><div className="form-grid"><div className="form-field form-field-wide"><label>Property *</label><input required value={newTicket.property} onChange={(event) => setNewTicket({ ...newTicket, property: event.target.value })} /></div><div className="form-field form-field-wide"><label>Subject *</label><input required value={newTicket.subject} onChange={(event) => setNewTicket({ ...newTicket, subject: event.target.value })} /></div><div className="form-field"><label>Visit date *</label><input required type="date" value={newTicket.visitDate} onChange={(event) => setNewTicket({ ...newTicket, visitDate: event.target.value })} /></div></div><div className="modal-actions"><button className="secondary-button" type="button" onClick={() => setShowNewTicket(false)}>Cancel</button><button className="primary-button" type="submit">Create ticket</button></div></form></section></div>}
  </div>;
}
