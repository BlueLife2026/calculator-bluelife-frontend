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
