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
  createdAt: string;
};

type TechnicianDirectoryEntry = {
  id: string;
  name: string;
};

type ChemicalOwner = {
  name: string;
  email: string;
};

const chemicalOwnerTokenKey = 'bluelife-chemicals-owner-token';

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

function technicianTokenFromSharedLink() {
  return new URLSearchParams(window.location.search)
    .get('technicianToken')
    ?.trim() ?? '';
}

function technicianAccessModeFromLink() {
  return new URLSearchParams(window.location.search).get('technicianAccess') === '1';
}

function sharedTechnicianAccessUrl() {
  const url = new URL(window.location.href);
  url.search = '';
  url.hash = '';
  url.searchParams.set('area', 'chemicals');
  url.searchParams.set('technicianAccess', '1');
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
  const [initialTechnicianToken] = useState(technicianTokenFromSharedLink);
  const [technicianToken, setTechnicianToken] = useState(initialTechnicianToken);
  const [technicianAccessMode] = useState(technicianAccessModeFromLink);
  const [lockedTechnician, setLockedTechnician] = useState('');
  const [accessCode, setAccessCode] = useState('');
  const [accessing, setAccessing] = useState(false);
  const [form, setForm] = useState<ChemicalReportForm>(emptyForm);
  const [reports, setReports] = useState<ChemicalReport[]>([]);
  const [technicians, setTechnicians] = useState<TechnicianDirectoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [savedMessage, setSavedMessage] = useState('');
  const [ownerToken, setOwnerToken] = useState(
    () => window.localStorage.getItem(chemicalOwnerTokenKey) ?? '',
  );
  const [owner, setOwner] = useState<ChemicalOwner | null>(null);
  const [showOwnerAccess, setShowOwnerAccess] = useState(false);
  const [ownerEmail, setOwnerEmail] = useState('ximena.velosa@bluelifepools.com');
  const [ownerPassword, setOwnerPassword] = useState('');
  const [ownerAccessing, setOwnerAccessing] = useState(false);
  const [deletingReportId, setDeletingReportId] = useState('');
  const [reportPendingDeletion, setReportPendingDeletion] = useState<ChemicalReport | null>(null);
  const isSharedForm = technicianAccessMode || Boolean(initialTechnicianToken);

  useEffect(() => {
    async function loadChemicalWorkspace() {
      if (isSharedForm) {
        if (!initialTechnicianToken) {
          setLoading(false);
          return;
        }
        try {
          const response = await fetch(
            `${API_URL}/chemicals/technicians/resolve/${encodeURIComponent(initialTechnicianToken)}`,
          );
          if (!response.ok) throw new Error('El enlace del técnico no es válido.');
          const technician = await response.json() as { name: string };
          setLockedTechnician(technician.name);
          setForm((current) => ({ ...current, technicianName: technician.name }));
        } catch (loadError) {
          console.error(loadError);
          setError('Este enlace no es válido o ya no está activo.');
        } finally {
          setLoading(false);
        }
        return;
      }

      try {
        const [reportsResponse, techniciansResponse] = await Promise.all([
          fetch(`${API_URL}/chemicals/reports`),
          fetch(`${API_URL}/chemicals/technicians`),
        ]);
        if (!reportsResponse.ok || !techniciansResponse.ok) {
          throw new Error('No se pudo cargar el espacio de químicos.');
        }
        setReports(await reportsResponse.json());
        setTechnicians(await techniciansResponse.json());
      } catch (loadError) {
        console.error(loadError);
        setError('No se pudo cargar la información de químicos.');
      } finally {
        setLoading(false);
      }
    }

    void loadChemicalWorkspace();
  }, [initialTechnicianToken, isSharedForm]);

  useEffect(() => {
    if (isSharedForm || !ownerToken) return;

    async function verifyOwnerSession() {
      try {
        const response = await fetch(`${API_URL}/chemicals/owner/session`, {
          headers: { Authorization: `Bearer ${ownerToken}` },
        });
        if (!response.ok) throw new Error('Owner session expired.');
        const activeOwner = await response.json() as ChemicalOwner;
        setOwner(activeOwner);
      } catch {
        window.localStorage.removeItem(chemicalOwnerTokenKey);
        setOwnerToken('');
        setOwner(null);
      }
    }

    void verifyOwnerSession();
  }, [isSharedForm, ownerToken]);

  const reportsToday = reports.filter(
    (report) => report.serviceDate.slice(0, 10) === localDate(),
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
          technicianToken: technicianToken || undefined,
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

  async function submitTechnicianAccess(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    try {
      setAccessing(true);
      const response = await fetch(`${API_URL}/chemicals/technicians/access`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: accessCode.trim() }),
      });
      const result = await response.json().catch(() => null) as {
        name?: string;
        technicianToken?: string;
      } | null;
      if (!response.ok || !result?.name || !result.technicianToken) {
        throw new Error('No encontramos un técnico con ese nombre.');
      }
      setLockedTechnician(result.name);
      setTechnicianToken(result.technicianToken);
      setForm((current) => ({ ...current, technicianName: result.name ?? '' }));
    } catch (accessError) {
      console.error(accessError);
      setError(
        accessError instanceof Error
          ? accessError.message
          : 'No se pudo validar el nombre.',
      );
    } finally {
      setAccessing(false);
    }
  }

  async function accessOwner(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      setOwnerAccessing(true);
      const response = await fetch(`${API_URL}/chemicals/owner/access`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: ownerEmail.trim(),
          password: ownerPassword,
        }),
      });
      const result = await response.json().catch(() => null) as {
        token?: string;
        owner?: ChemicalOwner;
      } | null;
      if (!response.ok || !result?.token || !result.owner) {
        throw new Error('El correo o la clave no son correctos.');
      }

      window.localStorage.setItem(chemicalOwnerTokenKey, result.token);
      setOwnerToken(result.token);
      setOwner(result.owner);
      setOwnerPassword('');
      setShowOwnerAccess(false);
      const pendingReport = reportPendingDeletion;
      setReportPendingDeletion(null);
      if (pendingReport) {
        await removeReport(pendingReport, result.owner, result.token);
      }
    } catch (ownerAccessError) {
      window.alert(
        ownerAccessError instanceof Error
          ? ownerAccessError.message
          : 'No fue posible acceder al perfil.',
      );
    } finally {
      setOwnerAccessing(false);
    }
  }

  async function logoutOwner() {
    if (ownerToken) {
      await fetch(`${API_URL}/chemicals/owner/logout`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${ownerToken}` },
      }).catch(() => undefined);
    }
    window.localStorage.removeItem(chemicalOwnerTokenKey);
    setOwnerToken('');
    setOwner(null);
  }

  function requestRemoveReport(report: ChemicalReport) {
    if (!owner || !ownerToken) {
      setReportPendingDeletion(report);
      setShowOwnerAccess(true);
      return;
    }
    void removeReport(report);
  }

  async function removeReport(
    report: ChemicalReport,
    activeOwner = owner,
    activeOwnerToken = ownerToken,
  ) {
    if (!activeOwner || !activeOwnerToken) return;
    const confirmed = window.confirm(
      `¿Eliminar el registro de ${report.technicianName} del ${formatReportDate(report.serviceDate)}?`,
    );
    if (!confirmed) return;

    try {
      setDeletingReportId(report.id);
      const response = await fetch(`${API_URL}/chemicals/reports/${report.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${activeOwnerToken}` },
      });
      if (response.status === 401) {
        await logoutOwner();
        throw new Error('Tu sesión venció. Presiona Eliminar para volver a ingresar.');
      }
      if (!response.ok) throw new Error('No se pudo eliminar el registro.');
      setReports((current) => current.filter((item) => item.id !== report.id));
    } catch (removeError) {
      window.alert(
        removeError instanceof Error
          ? removeError.message
          : 'No se pudo eliminar el registro.',
      );
    } finally {
      setDeletingReportId('');
    }
  }

  function shareOnWhatsApp() {
    const message = `Hola, usa este enlace para reportar las cantidades de químicos retiradas de bodega: ${sharedTechnicianAccessUrl()}`;
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

      {!isSharedForm && (
        <header className="area-page-header chemicals-page-header">
          <div>
            <span className="area-eyebrow">CONTROL OPERATIVO</span>
            <h1>Químicos</h1>
          </div>
        </header>
      )}

      {!isSharedForm && (
        <>
          <nav className="chemicals-tabs" aria-label="Módulos de químicos">
            <button className="chemicals-tab-active" type="button">Registro</button>
          </nav>

          <section className="chemicals-kpis">
            <article><span>Registros de hoy</span><strong>{reportsToday}</strong><small>Retiros informados por el equipo</small></article>
            <article><span>Técnicos con registros</span><strong>{techniciansReported}</strong><small>En el historial disponible</small></article>
          </section>

          <section className="chemicals-share-panel">
            <div>
              <span>UN SOLO ENLACE PARA WHATSAPP</span>
              <h2>Acceso general para todos los técnicos</h2>
              <p>Todos ingresan por el mismo enlace y escriben su nombre para identificarse.</p>
            </div>
            <div className="chemicals-share-controls chemicals-single-share-control">
              <button
                className="chemicals-whatsapp-button"
                type="button"
                onClick={shareOnWhatsApp}
              >
                Compartir enlace único
              </button>
            </div>
          </section>
        </>
      )}

      <div className={`chemicals-workspace ${isSharedForm ? 'chemicals-shared-workspace' : ''}`}>
        <section className="chemicals-form-card">
          <div className="chemicals-card-heading">
            <div>
              <span>{isSharedForm && !lockedTechnician ? 'ACCESO DEL TÉCNICO' : 'NUEVO REGISTRO'}</span>
              <h2>Químicos</h2>
            </div>
            <small>{isSharedForm && !lockedTechnician ? 'Usa tu nombre completo.' : 'Todos los campos con * son obligatorios.'}</small>
          </div>

          {isSharedForm && !lockedTechnician ? (
            <form className="chemicals-access-form" onSubmit={submitTechnicianAccess}>
              <div className="chemicals-access-intro">
                <span aria-hidden="true">✓</span>
                <div>
                  <h3>Escribe tu nombre completo</h3>
                  <p>No verás una lista de técnicos. Después de validarlo, tu nombre quedará bloqueado.</p>
                </div>
              </div>
              <div className="form-field">
                <label htmlFor="chemical-access-code">Nombre del técnico *</label>
                <input
                  id="chemical-access-code"
                  autoCapitalize="words"
                  autoComplete="name"
                  maxLength={120}
                  placeholder="Ejemplo: Angel Viña"
                  required
                  value={accessCode}
                  onChange={(event) => setAccessCode(event.target.value)}
                />
              </div>
              {error && <p className="chemicals-form-message chemicals-form-error">{error}</p>}
              <div className="chemicals-form-actions">
                <button
                  className="primary-button"
                  type="submit"
                  disabled={accessing || accessCode.trim().length < 2}
                >
                  {accessing ? 'Validando...' : 'Continuar'}
                </button>
              </div>
            </form>
          ) : <form onSubmit={submitReport}>
            <div className="chemicals-context-grid">
              <div className="form-field">
                <label htmlFor="chemical-date">Fecha del reporte *</label>
                <div className="chemical-date-control">
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
              </div>
              <div className="form-field">
                <label htmlFor="chemical-technician">Técnico *</label>
                {isSharedForm ? (
                  <>
                    <input
                      className="chemicals-locked-technician"
                      id="chemical-technician"
                      readOnly
                      value={loading ? 'Validando enlace...' : form.technicianName}
                    />
                    <small className="chemicals-locked-note">Identificado por enlace único · no se puede cambiar</small>
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
                      <option value={technician.name} key={technician.name}>{technician.name}</option>
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
                disabled={saving || loading || !form.serviceDate || !form.technicianName.trim()}
              >
                {saving ? 'Guardando...' : 'Guardar registro'}
              </button>
            </div>
          </form>}
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
                      <button
                        className="chemical-report-delete"
                        type="button"
                        disabled={deletingReportId === report.id}
                        aria-label={`Eliminar registro de ${report.technicianName}`}
                        onClick={() => requestRemoveReport(report)}
                      >
                        {deletingReportId === report.id ? 'Eliminando…' : 'Eliminar'}
                      </button>
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

      {!isSharedForm && (
        <footer className="chemicals-page-tools">
          <a href={`${API_URL}/chemicals/reports/export`}>
            Descargar registros para Excel
          </a>
          {owner && (
            <button type="button" onClick={() => void logoutOwner()}>
              Cerrar sesión
            </button>
          )}
        </footer>
      )}

      {!isSharedForm && showOwnerAccess && (
        <div
          className="modal-backdrop"
          role="presentation"
          onMouseDown={() => {
            setShowOwnerAccess(false);
            setReportPendingDeletion(null);
          }}
        >
          <section
            className="chemicals-owner-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="chemicals-owner-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="chemicals-owner-modal-heading">
              <div>
                <span>ACCESO PRIVADO</span>
                <h2 id="chemicals-owner-title">Confirmar identidad</h2>
              </div>
              <button
                type="button"
                aria-label="Cerrar"
                onClick={() => {
                  setShowOwnerAccess(false);
                  setReportPendingDeletion(null);
                }}
              >×</button>
            </div>
            <p>
              {reportPendingDeletion
                ? 'Inicia sesión para confirmar la eliminación de este registro.'
                : 'Solo la propietaria puede habilitar la eliminación de registros.'}
            </p>
            <form onSubmit={accessOwner}>
              <div className="form-field">
                <label htmlFor="chemical-owner-email">Correo *</label>
                <input
                  id="chemical-owner-email"
                  type="email"
                  autoComplete="username"
                  required
                  value={ownerEmail}
                  onChange={(event) => setOwnerEmail(event.target.value)}
                />
              </div>
              <div className="form-field">
                <label htmlFor="chemical-owner-password">Clave *</label>
                <input
                  id="chemical-owner-password"
                  type="password"
                  autoComplete="current-password"
                  minLength={8}
                  required
                  value={ownerPassword}
                  onChange={(event) => setOwnerPassword(event.target.value)}
                />
              </div>
              <button className="primary-button" type="submit" disabled={ownerAccessing}>
                {ownerAccessing ? 'Ingresando…' : 'Ingresar'}
              </button>
            </form>
          </section>
        </div>
      )}
    </div>
  );
}
