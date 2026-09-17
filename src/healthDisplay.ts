const statusTranslations: Record<string, string> = {
  enviado: 'Sent', sent: 'Sent',
  aprobado: 'Approved', approved: 'Approved',
  rechazado: 'Rejected', rejected: 'Rejected',
  convertido: 'Converted', converted: 'Converted',
  requerido: 'Required', required: 'Required',
  pendiente: 'Pending', pending: 'Pending',
  realizado: 'Completed', completado: 'Completed', completed: 'Completed',
  cerrado: 'Closed', closed: 'Closed',
  satisfactorio: 'Satisfactory', satisfactory: 'Satisfactory',
  insatisfactorio: 'Unsatisfactory', unsatisfactory: 'Unsatisfactory',
};

export function englishHealthStatus(value: string = ''): string {
  const trimmed = value.trim();
  return statusTranslations[trimmed.toLowerCase()] || trimmed;
}

export const estimateStatusOptions = ['Required', 'Sent', 'Approved', 'Rejected', 'Converted'];

export function healthDate(value: string = ''): string {
  const trimmed = value.trim();
  const iso = /^(\d{4}-\d{2}-\d{2})(?:$|T)/.exec(trimmed);
  const legacy = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(trimmed);
  const date = iso?.[1] || (legacy ? [legacy[3], legacy[1].padStart(2, '0'), legacy[2].padStart(2, '0')].join('-') : '');
  if (!date) return '';
  const parsed = new Date(date + 'T00:00:00Z');
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date ? date : '';
}

export function inspectionAlertDate(ticket: { visitDate: string; healthData: Record<string, string> }): { date: string; label: string } {
  const deadline = healthDate(ticket.healthData['Fecha Límite'] || '');
  return { date: deadline, label: 'Reinspection deadline' };
}

export function daysUntilInspection(value: string, now = new Date()): number {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Bogota', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  const part = (type: string) => parts.find((item) => item.type === type)!.value;
  const today = [part('year'), part('month'), part('day')].join('-');
  return Math.round((Date.parse(value + 'T00:00:00Z') - Date.parse(today + 'T00:00:00Z')) / 86400000);
}

export function inspectionSignal(days: number): 'red' | 'yellow' | 'green' | 'neutral' {
  if (!Number.isFinite(days) || days > 10) return 'neutral';
  if (days <= 2) return 'red';
  return days <= 5 ? 'yellow' : 'green';
}

export function englishChemical(value: string): string {
  return ({ ph: 'pH', cloro: 'Chlorine', estabilizador: 'Stabilizer' } as Record<string, string>)[value.trim().toLowerCase()] || value;
}
