import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';

import { API_URL } from './api';

type ChemicalWaterBody = {
  id: string;
  name: string;
  type: string;
  active: boolean;
};

type ChemicalProperty = {
  id: string;
  name: string;
  lifecycleStatus: string;
  waterBodies: ChemicalWaterBody[];
};

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
  propertyId: string;
  waterBodyId: string;
  notes: string;
};

type ChemicalReport = Record<QuantityKey, number | string> & {
  id: string;
  serviceDate: string;
  technicianName: string;
  propertyId: string | null;
  propertyName: string;
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

function emptyForm(): ChemicalReportForm {
  return {
    serviceDate: localDate(),
    technicianName: '',
    propertyId: '',
    waterBodyId: '',
    tabsQuantity: '',
    liquidChlorineGallons: '',
    muriaticAcidGallons: '',
    shockScoops: '',
    dePowderBags: '',
    bicarbonateScoops: '',
    stabilizerScoops: '',
    saltBags: '',
    phosphatesOunces: '',
    notes: '',
  };
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
  properties,
}: {
  sidebar: ReactNode;
  properties: ChemicalProperty[];
}) {
  const [form, setForm] = useState<ChemicalReportForm>(() => emptyForm());
  const [reports, setReports] = useState<ChemicalReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [savedMessage, setSavedMessage] = useState('');

  const activeProperties = useMemo(
    () =>
      properties
        .filter((property) => property.lifecycleStatus === 'CLIENT')
        .slice()
        .sort((first, second) => first.name.localeCompare(second.name)),
    [properties],
  );
  const selectedProperty = activeProperties.find(
    (property) => property.id === form.propertyId,
  );
  const availableWaterBodies =
    selectedProperty?.waterBodies.filter((body) => body.active) ?? [];

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
  const propertiesReported = new Set(reports.map((report) => report.propertyName)).size;

  function updateQuantity(key: QuantityKey, value: string) {
    if (value !== '' && Number(value) < 0) return;
    setForm((current) => ({ ...current, [key]: value }));
  }

  function selectProperty(propertyId: string) {
    const property = activeProperties.find((item) => item.id === propertyId);
    const waterBodies = property?.waterBodies.filter((body) => body.active) ?? [];
    setForm((current) => ({
      ...current,
      propertyId,
      waterBodyId: waterBodies.length === 1 ? waterBodies[0].id : '',
    }));
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
          propertyId: form.propertyId,
          waterBodyId: form.waterBodyId || undefined,
          ...quantities,
          notes: form.notes.trim() || undefined,
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
        ...emptyForm(),
        serviceDate: current.serviceDate,
        technicianName: current.technicianName,
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

  return (
    <div className="page app-page chemicals-page">
      {sidebar}

      <header className="area-page-header chemicals-page-header">
        <div>
          <span className="area-eyebrow">CONTROL OPERATIVO</span>
          <h1>Químicos</h1>
          <p>
            Registra el consumo informado por cada técnico para compararlo con
            bodega y Skimmer.
          </p>
        </div>
        <div className="area-header-actions">
          <span className="integration-pill"><i /> Registro en base de datos activo</span>
          <a
            className="secondary-button chemicals-export-button"
            href={`${API_URL}/chemicals/reports/export`}
          >
            Exportar para Excel
          </a>
        </div>
      </header>

      <nav className="chemicals-tabs" aria-label="Módulos de químicos">
        <button className="chemicals-tab-active" type="button">Registro</button>
        <button type="button" disabled>Validación</button>
        <button type="button" disabled>Bodega</button>
        <button type="button" disabled>Skimmer</button>
      </nav>

      <section className="chemicals-validation-flow" aria-label="Flujo de validación">
        <article className="chemicals-source-active">
          <span>01</span>
          <div><strong>Reporte del técnico</strong><small>Formulario activo</small></div>
        </article>
        <article>
          <span>02</span>
          <div><strong>Salida de bodega</strong><small>Próxima conexión</small></div>
        </article>
        <article>
          <span>03</span>
          <div><strong>Registro en Skimmer</strong><small>Próxima conexión</small></div>
        </article>
      </section>

      <section className="chemicals-kpis">
        <article><span>Registros de hoy</span><strong>{reportsToday}</strong><small>Capturados en el formulario</small></article>
        <article><span>Pendientes de validar</span><strong>{pendingReports}</strong><small>Esperando cruce con las otras fuentes</small></article>
        <article><span>Propiedades registradas</span><strong>{propertiesReported}</strong><small>En el historial disponible</small></article>
      </section>

      <div className="chemicals-workspace">
        <section className="chemicals-form-card">
          <div className="chemicals-card-heading">
            <div><span>NUEVO REGISTRO</span><h2>Reporte de químicos</h2></div>
            <small>Todos los campos con * son obligatorios.</small>
          </div>

          <form onSubmit={submitReport}>
            <div className="chemicals-context-grid">
              <div className="form-field">
                <label htmlFor="chemical-date">Fecha del servicio *</label>
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
                <input
                  id="chemical-technician"
                  list="chemical-technicians"
                  required
                  placeholder="Selecciona o escribe un técnico"
                  value={form.technicianName}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, technicianName: event.target.value }))
                  }
                />
                <datalist id="chemical-technicians">
                  {technicians.map((technician) => (
                    <option value={technician} key={technician} />
                  ))}
                </datalist>
              </div>
              <div className="form-field">
                <label htmlFor="chemical-property">Propiedad *</label>
                <select
                  id="chemical-property"
                  required
                  value={form.propertyId}
                  onChange={(event) => selectProperty(event.target.value)}
                >
                  <option value="">Seleccionar propiedad</option>
                  {activeProperties.map((property) => (
                    <option value={property.id} key={property.id}>{property.name}</option>
                  ))}
                </select>
              </div>
              <div className="form-field">
                <label htmlFor="chemical-water-body">Cuerpo de agua</label>
                <select
                  id="chemical-water-body"
                  value={form.waterBodyId}
                  disabled={!selectedProperty}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, waterBodyId: event.target.value }))
                  }
                >
                  <option value="">General / no especificado</option>
                  {availableWaterBodies.map((body) => (
                    <option value={body.id} key={body.id}>
                      {body.name} · {body.type.replaceAll('_', ' ')}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="chemicals-quantity-heading">
              <div><h3>Cantidades reportadas</h3><p>Deja en blanco los químicos que no se utilizaron.</p></div>
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

            <div className="form-field chemicals-notes-field">
              <label htmlFor="chemical-notes">Notas</label>
              <textarea
                id="chemical-notes"
                rows={3}
                maxLength={2000}
                placeholder="Ejemplo: entrega adicional, tratamiento especial o corrección del reporte."
                value={form.notes}
                onChange={(event) =>
                  setForm((current) => ({ ...current, notes: event.target.value }))
                }
              />
            </div>

            {error && <p className="chemicals-form-message chemicals-form-error">{error}</p>}
            {savedMessage && <p className="chemicals-form-message chemicals-form-success">{savedMessage}</p>}

            <div className="chemicals-form-actions">
              <button
                className="secondary-button"
                type="button"
                onClick={() => {
                  setForm(emptyForm());
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
                disabled={saving || !form.serviceDate || !form.technicianName.trim() || !form.propertyId}
              >
                {saving ? 'Guardando...' : 'Guardar registro'}
              </button>
            </div>
          </form>
        </section>

        <section className="chemicals-history-card">
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
                        <strong>{report.propertyName}</strong>
                        <small>{report.waterBodyName || 'Cuerpo de agua no especificado'}</small>
                      </div>
                      <span>Pendiente de validar</span>
                    </div>
                    <dl>
                      <div><dt>Fecha</dt><dd>{formatReportDate(report.serviceDate)}</dd></div>
                      <div><dt>Técnico</dt><dd>{report.technicianName}</dd></div>
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
        </section>
      </div>
    </div>
  );
}
