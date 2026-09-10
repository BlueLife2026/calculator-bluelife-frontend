import { useEffect, useState, type FormEvent, type ReactNode } from 'react';

import { API_URL } from './api';

type QuantityKey =
  | 'tabsQuantity'
  | 'liquidChlorineGallons'
  | 'muriaticAcidGallons'
  | 'shockScoops'
  | 'dePowderBags'
  | 'bicarbonateScoops'
  | 'stabilizerScoops'
  | 'saltBags'
  | 'phosphatesOunces';

type ChemicalReportForm = Record<QuantityKey, string> & {
  serviceDate: string;
  technicianName: string;
};

type ChemicalReport = Record<QuantityKey, number | string> & {
  id: string;
  serviceDate: string;
  technicianName: string;
  propertyId: string | null;
  propertyName: string | null;
  waterBodyId: string | null;
  waterBodyName: string | null;
  notes: string | null;
  validationStatus: string;
  createdAt: string;
};

const chemicalFields: Array<{
  key: QuantityKey;
  label: string;
  unit: string;
  shortLabel: string;
}> = [
  { key: 'tabsQuantity', label: 'Tabletas', unit: 'cantidad', shortLabel: 'Tabs' },
  { key: 'liquidChlorineGallons', label: 'Cloro líquido', unit: 'galones', shortLabel: 'Cloro' },
  { key: 'muriaticAcidGallons', label: 'Ácido muriático', unit: 'galones', shortLabel: 'Ácido' },
  { key: 'shockScoops', label: 'Shock', unit: 'scoops', shortLabel: 'Shock' },
  { key: 'dePowderBags', label: 'Polvo DE', unit: 'bolsas', shortLabel: 'DE' },
  { key: 'bicarbonateScoops', label: 'Bicarbonato', unit: 'scoops', shortLabel: 'Bicarb.' },
  { key: 'stabilizerScoops', label: 'Estabilizador', unit: 'scoops', shortLabel: 'Estab.' },
  { key: 'saltBags', label: 'Sal', unit: 'bolsas', shortLabel: 'Sal' },
  { key: 'phosphatesOunces', label: 'Fosfatos', unit: 'onzas', shortLabel: 'Fosfatos' },
];

const technicians = [
  'Adrian Suarez',
  'Alexander Lara',
  'Angel Hernandez',
  'Angel Viña',
  'Camilo Hidalgo',
  'Camilo Leon',
  'Diego Avila',
  'Georky Quiñones',
  'Guillermo Fernandez',
  'Joisel Sagion Díaz',
  'Jose Lugo',
  'Mauricio Tami',
  'Miguel Morales',
  'Nelson Belauzaran',
  'Reidel Blanco',
];

function localDate() {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

function emptyForm(technicianName = ''): ChemicalReportForm {
  return {
    serviceDate: localDate(),
    technicianName,
    tabsQuantity: '',
    liquidChlorineGallons: '',
    muriaticAcidGallons: '',
    shockScoops: '',
    dePowderBags: '',
    bicarbonateScoops: '',
    stabilizerScoops: '',
    saltBags: '',
    phosphatesOunces: '',
  };
}

function technicianFromSharedLink() {
  const requestedTechnician = new URLSearchParams(window.location.search)
    .get('technician')
    ?.trim();
  if (!requestedTechnician) return '';

  return technicians.find(
    (technician) => technician.localeCompare(requestedTechnician, undefined, {
      sensitivity: 'base',
    }) === 0,
  ) ?? '';
}

function sharedTechnicianUrl(technicianName: string) {
  const url = new URL(window.location.href);
  url.search = '';
  url.hash = '';
  url.searchParams.set('area', 'chemicals');
  url.searchParams.set('technician', technicianName);
  return url.toString();
}

function formatReportDate(value: string) {
  const date = value.slice(0, 10);
  const [year, month, day] = date.split('-').map(Number);
  return new Date(year, month - 1, day).toLocaleDateString('en-US');
}

function quantityLabel(value: number | string) {
  return Number(value).toLocaleString('en-US', { maximumFractionDigits: 2 });
}

export function ChemicalsPage({
  sidebar,
}: {
  sidebar: ReactNode;
}) {
  const [lockedTechnician] = useState(technicianFromSharedLink);
  const [form, setForm] = useState<ChemicalReportForm>(() =>
    emptyForm(lockedTechnician),
  );
  const [reports, setReports] = useState<ChemicalReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [savedMessage, setSavedMessage] = useState('');
  const [shareTechnician, setShareTechnician] = useState('');
  const isSharedForm = Boolean(lockedTechnician);

  useEffect(() => {
    async function loadReports() {
      try {
        const response = await fetch(`${API_URL}/chemicals/reports`);
        if (!response.ok) throw new Error('No se pudieron cargar los registros.');
        setReports(await response.json());
      } catch (loadError) {
        console.error(loadError);
        setError('No se pudieron cargar los registros de químicos.');
      } finally {
        setLoading(false);
      }
    }

    void loadReports();
  }, []);

  const reportsToday = reports.filter(
    (report) => report.serviceDate.slice(0, 10) === localDate(),
  ).length;
  const pendingReports = reports.filter(
    (report) => report.validationStatus === 'PENDING',
  ).length;
  const techniciansReported = new Set(
    reports.map((report) => report.technicianName),
  ).size;

  function updateQuantity(key: QuantityKey, value: string) {
    if (value !== '' && Number(value) < 0) return;
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function submitReport(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setSavedMessage('');

    const quantities = Object.fromEntries(
      chemicalFields.map(({ key }) => [key, Number(form[key]) || 0]),
    ) as Record<QuantityKey, number>;

    if (!Object.values(quantities).some((value) => value > 0)) {
      setError('Registra al menos una cantidad de químico mayor que cero.');
      return;
    }

    try {
      setSaving(true);
      const response = await fetch(`${API_URL}/chemicals/reports`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          serviceDate: form.serviceDate,
          technicianName: form.technicianName.trim(),
          ...quantities,
        }),
      });
      const result = await response.json().catch(() => null);

      if (!response.ok) {
        const message = Array.isArray(result?.message)
          ? result.message.join(' ')
          : result?.message;
        throw new Error(message || 'No se pudo guardar el registro.');
      }

      setReports((current) => [result as ChemicalReport, ...current]);
      setForm((current) => ({
        ...emptyForm(lockedTechnician || current.technicianName),
        serviceDate: current.serviceDate,
      }));
      setSavedMessage('Registro guardado correctamente en el sistema.');
    } catch (submitError) {
      console.error(submitError);
      setError(
        submitError instanceof Error
          ? submitError.message
          : 'No se pudo guardar el registro.',
      );
    } finally {
      setSaving(false);
    }
  }

  function shareOnWhatsApp() {
    if (!shareTechnician) return;
    const firstName = shareTechnician.split(' ')[0];
    const message = `Hola ${firstName}, registra aquí las cantidades de químicos que retiraste de bodega: ${sharedTechnicianUrl(shareTechnician)}`;
    const whatsappWindow = window.open(
      `https://wa.me/?text=${encodeURIComponent(message)}`,
      '_blank',
      'noopener,noreferrer',
    );
    if (whatsappWindow) whatsappWindow.opener = null;
  }

  return (
    <div className={`page chemicals-page ${isSharedForm ? 'chemicals-shared-page' : 'app-page'}`}>
      {!isSharedForm && sidebar}

      <header className="area-page-header chemicals-page-header">
        <div>
          <span className="area-eyebrow">CONTROL OPERATIVO</span>
          <h1>Químicos</h1>
          <p>
            Registra las cantidades que cada técnico retira de bodega para
            compararlas después con el inventario y Skimmer.
          </p>
        </div>
        {!isSharedForm && (
          <div className="area-header-actions">
            <span className="integration-pill"><i /> Registro en base de datos activo</span>
            <a
              className="secondary-button chemicals-export-button"
              href={`${API_URL}/chemicals/reports/export`}
            >
              Exportar para Excel
            </a>
          </div>
        )}
      </header>

      {!isSharedForm && (
        <>
          <nav className="chemicals-tabs" aria-label="Módulos de químicos">
            <button className="chemicals-tab-active" type="button">Registro</button>
            <button type="button" disabled>Validación</button>
            <button type="button" disabled>Bodega</button>
            <button type="button" disabled>Skimmer</button>
          </nav>

          <section className="chemicals-validation-flow" aria-label="Flujo de validación">
            <article className="chemicals-source-active">
              <span>01</span>
              <div><strong>Retiro reportado</strong><small>Formulario del técnico</small></div>
            </article>
            <article>
              <span>02</span>
              <div><strong>Salida de bodega</strong><small>Próxima conexión</small></div>
            </article>
            <article>
              <span>03</span>
              <div><strong>Uso en Skimmer</strong><small>Próxima conexión</small></div>
            </article>
          </section>

          <section className="chemicals-kpis">
            <article><span>Registros de hoy</span><strong>{reportsToday}</strong><small>Retiros informados por el equipo</small></article>
            <article><span>Pendientes de validar</span><strong>{pendingReports}</strong><small>Esperando cruce con las otras fuentes</small></article>
            <article><span>Técnicos con registros</span><strong>{techniciansReported}</strong><small>En el historial disponible</small></article>
          </section>

          <section className="chemicals-share-panel">
            <div>
              <span>ENLACE PARA WHATSAPP</span>
              <h2>Formulario personalizado por técnico</h2>
              <p>Selecciona el técnico. El enlace abrirá su formulario con el nombre bloqueado.</p>
            </div>
            <div className="chemicals-share-controls">
              <label htmlFor="chemical-share-technician">Técnico</label>
              <select
                id="chemical-share-technician"
                value={shareTechnician}
                onChange={(event) => setShareTechnician(event.target.value)}
              >
                <option value="">Seleccionar técnico</option>
                {technicians.map((technician) => (
                  <option value={technician} key={technician}>{technician}</option>
                ))}
              </select>
              <button
                className="chemicals-whatsapp-button"
                type="button"
                disabled={!shareTechnician}
                onClick={shareOnWhatsApp}
              >
                Compartir por WhatsApp
              </button>
            </div>
          </section>
        </>
      )}

      <div className={`chemicals-workspace ${isSharedForm ? 'chemicals-shared-workspace' : ''}`}>
        <section className="chemicals-form-card">
          <div className="chemicals-card-heading">
            <div><span>NUEVO REGISTRO</span><h2>Retiro de químicos de bodega</h2></div>
            <small>Todos los campos con * son obligatorios.</small>
          </div>

          <form onSubmit={submitReport}>
            <div className="chemicals-context-grid">
              <div className="form-field">
                <label htmlFor="chemical-date">Fecha del reporte *</label>
                <input
                  id="chemical-date"
                  type="date"
                  required
                  value={form.serviceDate}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, serviceDate: event.target.value }))
                  }
                />
              </div>
              <div className="form-field">
                <label htmlFor="chemical-technician">Técnico *</label>
                {lockedTechnician ? (
                  <>
                    <input
                      className="chemicals-locked-technician"
                      id="chemical-technician"
                      readOnly
                      value={form.technicianName}
                    />
                    <small className="chemicals-locked-note">Asignado por el enlace · no se puede cambiar</small>
                  </>
                ) : (
                  <select
                    id="chemical-technician"
                    required
                    value={form.technicianName}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, technicianName: event.target.value }))
                    }
                  >
                    <option value="">Seleccionar técnico</option>
                    {technicians.map((technician) => (
                      <option value={technician} key={technician}>{technician}</option>
                    ))}
                  </select>
                )}
              </div>
            </div>

            <div className="chemicals-quantity-heading">
              <div><h3>Cantidades retiradas</h3><p>Deja en blanco los químicos que no retiraste.</p></div>
              <span>Fuente: técnico</span>
            </div>
            <div className="chemicals-quantity-grid">
              {chemicalFields.map((chemical) => (
                <div className="chemical-quantity-field" key={chemical.key}>
                  <label htmlFor={`chemical-${chemical.key}`}>{chemical.label}</label>
                  <div>
                    <input
                      id={`chemical-${chemical.key}`}
                      type="number"
                      min="0"
                      max="100000"
                      step="0.01"
                      inputMode="decimal"
                      placeholder="0"
                      value={form[chemical.key]}
                      onChange={(event) => updateQuantity(chemical.key, event.target.value)}
                    />
                    <span>{chemical.unit}</span>
                  </div>
                </div>
              ))}
            </div>

            {error && <p className="chemicals-form-message chemicals-form-error">{error}</p>}
            {savedMessage && <p className="chemicals-form-message chemicals-form-success">{savedMessage}</p>}

            <div className="chemicals-form-actions">
              <button
                className="secondary-button"
                type="button"
                onClick={() => {
                  setForm(emptyForm(lockedTechnician));
                  setError('');
                  setSavedMessage('');
                }}
                disabled={saving}
              >
                Limpiar
              </button>
              <button
                className="primary-button"
                type="submit"
                disabled={saving || !form.serviceDate || !form.technicianName.trim()}
              >
                {saving ? 'Guardando...' : 'Guardar registro'}
              </button>
            </div>
          </form>
        </section>

        {!isSharedForm && <section className="chemicals-history-card">
          <div className="chemicals-card-heading">
            <div><span>HISTORIAL</span><h2>Registros recientes</h2></div>
            <small>{reports.length} registros</small>
          </div>

          {loading ? (
            <p className="chemicals-history-empty">Cargando registros...</p>
          ) : reports.length === 0 ? (
            <div className="chemicals-history-empty">
              <strong>Aún no hay registros</strong>
              <p>El primer reporte guardado aparecerá aquí.</p>
            </div>
          ) : (
            <div className="chemicals-report-list">
              {reports.map((report) => {
                const usedChemicals = chemicalFields.filter(
                  ({ key }) => Number(report[key]) > 0,
                );
                return (
                  <article key={report.id}>
                    <div className="chemical-report-topline">
                      <div>
                        <strong>{report.technicianName}</strong>
                        <small>{report.propertyName || 'Retiro de bodega'}</small>
                      </div>
                      <span>Pendiente de validar</span>
                    </div>
                    <dl>
                      <div><dt>Fecha</dt><dd>{formatReportDate(report.serviceDate)}</dd></div>
                      <div><dt>Origen</dt><dd>{report.propertyName ? 'Registro anterior' : 'Bodega'}</dd></div>
                    </dl>
                    <div className="chemical-report-quantities">
                      {usedChemicals.map((chemical) => (
                        <span key={chemical.key}>
                          <strong>{quantityLabel(report[chemical.key])}</strong>
                          {chemical.shortLabel}
                        </span>
                      ))}
                    </div>
                    {report.notes && <p>{report.notes}</p>}
                  </article>
                );
              })}
            </div>
          )}
        </section>}
      </div>
    </div>
  );
}
