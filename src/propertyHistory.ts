import { healthDate } from './healthDisplay';

export type PropertyHealthTicket = {
  ticketNumber: string;
  subject: string;
  propertyName: string | null;
  receivedAt: string;
  visitDate: string | null;
  status: string;
  estimateStatus: string;
  estimateNumber: string | null;
  healthData: Record<string, string> | null;
  deletedAt?: string | null;
  comments?: Array<{ id: string; author: string; body: string; createdAt: string }>;
};

export function propertyNameKey(name: string): string {
  return name.normalize('NFC').trim().replace(/\s+/g, ' ').toLowerCase();
}

export function indexPropertyHealthTickets(properties: Array<{ id: string; name: string }>, tickets: PropertyHealthTicket[]) {
  const names = new Map<string, string[]>();
  const byProperty = new Map<string, PropertyHealthTicket[]>();
  for (const property of properties) {
    const key = propertyNameKey(property.name);
    names.set(key, [...(names.get(key) || []), property.id]);
    byProperty.set(property.id, []);
  }
  let unmatched = 0;
  for (const ticket of tickets) {
    if (ticket.deletedAt) continue;
    const key = propertyNameKey(ticket.propertyName?.trim() || '');
    const candidates = names.get(key);
    if (!key || candidates?.length !== 1) { unmatched++; continue; }
    byProperty.get(candidates[0])!.push(ticket);
  }
  for (const history of byProperty.values()) {
    history.sort((a, b) => {
      const difference = healthHistoryDate(b).localeCompare(healthHistoryDate(a));
      return difference || b.receivedAt.localeCompare(a.receivedAt) || b.ticketNumber.localeCompare(a.ticketNumber);
    });
  }
  return { byProperty, unmatched };
}

export function ticketInspectionDate(ticket: PropertyHealthTicket): string {
  const data = ticket.healthData || {};
  return healthDate(Object.prototype.hasOwnProperty.call(data, 'Fecha de Inicio') ? data['Fecha de Inicio'] : ticket.visitDate || '');
}

export function healthHistoryDate(ticket: PropertyHealthTicket): string {
  return ticketInspectionDate(ticket) || healthDate(ticket.receivedAt);
}
