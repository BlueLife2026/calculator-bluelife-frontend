import { useEffect, useState, type FormEvent, type ReactNode } from 'react';

import { API_URL } from './api';

type QuantityKey =
  | 'tabsQuantity'
  | 'liquidChlorineGallons'
  | 'chlorinePowderScoops'
  | 'muriaticAcidGallons'
  | 'shockScoops'
  | 'dePowderBags'
  | 'bicarbonateScoops'
  | 'stabilizerScoops'
  | 'saltBags'
  | 'phosphatesOunces';

type UnitKey = 'tabsUnit' | 'dePowderUnit' | 'stabilizerUnit';

type ChemicalReportForm = Record<QuantityKey | UnitKey, string> & {
  serviceDate: string;
  technicianName: string;
};

type ChemicalReport = Record<QuantityKey, number | string> & Record<UnitKey, string> & {
  id: string;
  serviceDate: string;
  technicianName: string;
  notes: string | null;
  createdAt: string;
};

type TechnicianDirectoryEntry = {
  id: string;
  name: string;
  whatsappNumber?: string;
  active?: boolean;
};

type ChemicalOwner = {
  name: string;
  email: string;
};

const chemicalOwnerTokenKey = 'bluelife-chemicals-owner-token';

const chemicalFields: Array<{
  key: QuantityKey;
  label: string;
  unitKey?: UnitKey;
  fixedUnit: { value: string; label: string };
  shortLabel: string;
}> = [
  {
    key: 'liquidChlorineGallons',
    label: 'Cloro líquido',
    fixedUnit: { value: 'gallons', label: 'galones' },
    shortLabel: 'Cloro',
  },
  {
    key: 'muriaticAcidGallons',
    label: 'Ácido muriático',
    fixedUnit: { value: 'gallons', label: 'galones' },
    shortLabel: 'Ácido',
  },
  {
    key: 'tabsQuantity',
    label: 'Tabletas',
    unitKey: 'tabsUnit',
    fixedUnit: { value: 'units', label: 'unidades' },
    shortLabel: 'Tabs',
  },
  {
    key: 'stabilizerScoops',
    label: 'Estabilizador',
    unitKey: 'stabilizerUnit',
    fixedUnit: { value: 'bucket', label: 'bucket' },
    shortLabel: 'Estab.',
  },
  {
    key: 'dePowderBags',
    label: 'Polvo D.E.',
    unitKey: 'dePowderUnit',
    fixedUnit: { value: 'bags', label: 'bolsas' },
    shortLabel: 'D.E.',
  },
  {
    key: 'shockScoops',
    label: 'Shock',
    fixedUnit: { value: 'scoops', label: 'scoops' },
    shortLabel: 'Shock',
  },
  {
    key: 'bicarbonateScoops',
    label: 'Bicarbonato',
    fixedUnit: { value: 'bags', label: 'bolsas' },
    shortLabel: 'Bicarb.',
  },
  {
    key: 'saltBags',
    label: 'Sal',
    fixedUnit: { value: 'bags', label: 'bolsas' },
    shortLabel: 'Sal',
  },
  {
    key: 'phosphatesOunces',
    label: 'Fosfato',
    fixedUnit: { value: 'ounces', label: 'onzas' },
    shortLabel: 'Fosfato',
  },
  {
    key: 'chlorinePowderScoops',
    label: 'Cloro en polvo',
    fixedUnit: { value: 'scoops', label: 'scoops' },
    shortLabel: 'Cloro polvo',
  },
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
    tabsUnit: 'units',
    liquidChlorineGallons: '',
    chlorinePowderScoops: '',
    muriaticAcidGallons: '',
    shockScoops: '',
    dePowderBags: '',
    dePowderUnit: 'bags',
    bicarbonateScoops: '',
    stabilizerScoops: '',
    stabilizerUnit: 'bucket',
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

function reportDuplicateKey(report: {
  serviceDate: string;
  technicianName: string;
  [key: string]: unknown;
}) {
  const technician = report.technicianName
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
  const quantity = (value: unknown) => Number(value) || 0;
  return JSON.stringify([
    report.serviceDate.slice(0, 10),
    technician,
    quantity(report.tabsQuantity),
    report.tabsUnit || 'units',
    quantity(report.liquidChlorineGallons),
    quantity(report.chlorinePowderScoops),
    quantity(report.muriaticAcidGallons),
    quantity(report.shockScoops),
    quantity(report.dePowderBags),
    report.dePowderUnit || 'bags',
    quantity(report.bicarbonateScoops),
    quantity(report.stabilizerScoops),
    report.stabilizerUnit || 'bucket',
    quantity(report.saltBags),
    quantity(report.phosphatesOunces),
    report.notes || null,
  ]);
}

function selectedUnitLabel(
  report: ChemicalReport,
  chemical: (typeof chemicalFields)[number],
) {
  if (!chemical.unitKey) return chemical.fixedUnit.label;
  const fallbackUnit = {
    tabsUnit: 'units',
    dePowderUnit: 'bags',
    stabilizerUnit: 'scoops',
  }[chemical.unitKey];
  const value = report[chemical.unitKey] || fallbackUnit;
  return value === chemical.fixedUnit.value ? chemical.fixedUnit.label : value;
}

export function ChemicalsPage({
  sidebar,
}: {
  sidebar: ReactNode;
}) {
  const [initialTechnicianToken] = useState(technicianTokenFromSharedLink);
  const [technicianToken, setTechnicianToken] = useState(initialTechnicianToken);
  const [technicianAccessMode] = useState(technicianAccessModeFromLink);
  const [activeTab, setActiveTab] = useState<'register' | 'technicians'>('register');
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
  const [editingReportId, setEditingReportId] = useState('');
  const [reportPendingDeletion, setReportPendingDeletion] = useState<ChemicalReport | null>(null);
  const [reportPendingEdit, setReportPendingEdit] = useState<ChemicalReport | null>(null);
  const [managedTechnicians, setManagedTechnicians] = useState<TechnicianDirectoryEntry[]>([]);
  const [newTechnicianName, setNewTechnicianName] = useState('');
  const [newTechnicianPhone, setNewTechnicianPhone] = useState('');
  const [technicianSaving, setTechnicianSaving] = useState(false);
  const [technicianMessage, setTechnicianMessage] = useState('');
  const [editingTechnician, setEditingTechnician] = useState<TechnicianDirectoryEntry | null>(null);
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
    if (value !== '' && (Number(value) < 0 || Number(value) > 100000)) return;
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

    const duplicateKey = reportDuplicateKey(form);
    if (reports.some((report) => report.id !== editingReportId && reportDuplicateKey(report) === duplicateKey)) {
      setError('Este registro ya fue guardado anteriormente para ese técnico y fecha.');
      return;
    }

    try {
      setSaving(true);
      const response = await fetch(`${API_URL}/chemicals/reports${editingReportId ? `/${editingReportId}` : ''}`, {
        method: editingReportId ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json', ...(ownerToken ? { Authorization: `Bearer ${ownerToken}` } : {}) },
        body: JSON.stringify({
          serviceDate: form.serviceDate,
          technicianName: form.technicianName.trim(),
          technicianToken: technicianToken || undefined,
          tabsUnit: form.tabsUnit,
          dePowderUnit: form.dePowderUnit,
          stabilizerUnit: 'bucket',
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

      setReports((current) => editingReportId ? current.map((report) => report.id === editingReportId ? result as ChemicalReport : report) : [result as ChemicalReport, ...current]);
      setEditingReportId('');
      setForm((current) => ({
        ...emptyForm(lockedTechnician || current.technicianName),
        serviceDate: current.serviceDate,
      }));
      setSavedMessage(editingReportId ? 'Registro actualizado correctamente.' : 'Registro guardado correctamente en el sistema.');
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
        throw new Error('No encontramos ese nombre de acceso.');
      }
      setLockedTechnician(result.name);
      setTechnicianToken(result.technicianToken);
      setForm((current) => ({ ...current, technicianName: result.name ?? '' }));
    } catch (accessError) {
      console.error(accessError);
      setError(
        accessError instanceof Error
          ? accessError.message
          : 'No se pudo validar el nombre de acceso.',
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
      await loadManagedTechnicians(result.token);
      setOwnerPassword('');
      setShowOwnerAccess(false);
      const pendingReport = reportPendingDeletion;
      setReportPendingDeletion(null);
      if (pendingReport) {
        await removeReport(pendingReport, result.owner, result.token);
      }
      const pendingEdit = reportPendingEdit;
      setReportPendingEdit(null);
      if (pendingEdit) editReport(pendingEdit, result.token);
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

  async function loadManagedTechnicians(token = ownerToken) {
    if (!token) return;
    const response = await fetch(`${API_URL}/chemicals/technicians/directory`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (response.status === 401) {
      await logoutOwner();
      throw new Error('Tu sesión venció. Ingresa nuevamente.');
    }
    if (!response.ok) throw new Error('No se pudo cargar la lista de técnicos.');
    setManagedTechnicians(await response.json() as TechnicianDirectoryEntry[]);
  }

  async function saveTechnician(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!ownerToken) {
      setShowOwnerAccess(true);
      return;
    }
    setTechnicianSaving(true);
    setTechnicianMessage('');
    try {
      const response = await fetch(`${API_URL}/chemicals/technicians`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ownerToken}` },
        body: JSON.stringify({ name: newTechnicianName.trim(), whatsappNumber: newTechnicianPhone.trim() }),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok) throw new Error(Array.isArray(result?.message) ? result.message.join(' ') : result?.message || 'No se pudo agregar el técnico.');
      setManagedTechnicians((current) => [...current, result as TechnicianDirectoryEntry].sort((a, b) => a.name.localeCompare(b.name)));
      setNewTechnicianName('');
      setNewTechnicianPhone('');
      setTechnicianMessage('Técnico agregado correctamente.');
    } catch (saveError) {
      setTechnicianMessage(saveError instanceof Error ? saveError.message : 'No se pudo agregar el técnico.');
    } finally {
      setTechnicianSaving(false);
    }
  }

  async function deleteTechnician(technician: TechnicianDirectoryEntry) {
    if (!ownerToken || !window.confirm(`¿Eliminar el acceso de ${technician.name}?`)) return;
    try {
      const response = await fetch(`${API_URL}/chemicals/technicians/${technician.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${ownerToken}` },
      });
      if (!response.ok) throw new Error('No se pudo eliminar el técnico.');
      setManagedTechnicians((current) => current.filter((item) => item.id !== technician.id));
    } catch (deleteError) {
      window.alert(deleteError instanceof Error ? deleteError.message : 'No se pudo eliminar el técnico.');
    }
  }

  async function updateTechnician(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!ownerToken || !editingTechnician) return;
    const response = await fetch(`${API_URL}/chemicals/technicians/${editingTechnician.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ownerToken}` }, body: JSON.stringify({ name: editingTechnician.name.trim(), whatsappNumber: (editingTechnician.whatsappNumber ?? '').trim() }) });
    const result = await response.json().catch(() => null);
    if (!response.ok) { window.alert(result?.message || 'No se pudo actualizar el técnico.'); return; }
    setManagedTechnicians((current) => current.map((item) => item.id === editingTechnician.id ? result as TechnicianDirectoryEntry : item).sort((a, b) => a.name.localeCompare(b.name)));
    setEditingTechnician(null);
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

  function editReport(report: ChemicalReport, activeOwnerToken = ownerToken) {
    if (!activeOwnerToken) {
      setReportPendingEdit(report);
      setShowOwnerAccess(true);
      return;
    }
    setForm({ serviceDate: report.serviceDate.slice(0, 10), technicianName: report.technicianName, ...Object.fromEntries(chemicalFields.map(({ key }) => [key, String(report[key] ?? '')])), tabsUnit: report.tabsUnit, dePowderUnit: report.dePowderUnit, stabilizerUnit: report.stabilizerUnit } as ChemicalReportForm);
    setEditingReportId(report.id);
    setError('');
    setSavedMessage('');
    window.scrollTo({ top: 0, behavior: 'smooth' });
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

      {editingTechnician && (
        <div className="modal-backdrop"><section className="property-modal repair-request-modal" role="dialog" aria-modal="true"><div className="edit-panel-header"><div><h2>Editar técnico</h2><p>Corrige el nombre o el celular sin eliminar el acceso.</p></div><button className="modal-close" type="button" onClick={() => setEditingTechnician(null)}>&times;</button></div><form onSubmit={(event) => void updateTechnician(event)}><div className="form-grid"><div className="form-field form-field-wide"><label>Nombre y código *</label><input required maxLength={120} value={editingTechnician.name} onChange={(event) => setEditingTechnician({ ...editingTechnician, name: event.target.value })} /></div><div className="form-field form-field-wide"><label>Celular de WhatsApp *</label><input required maxLength={30} value={editingTechnician.whatsappNumber ?? ''} onChange={(event) => setEditingTechnician({ ...editingTechnician, whatsappNumber: event.target.value })} /></div></div><div className="modal-actions"><button className="secondary-button" type="button" onClick={() => setEditingTechnician(null)}>Cancelar</button><button className="primary-button" type="submit">Guardar cambios</button></div></form></section></div>
      )}

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
            <button className={activeTab === 'register' ? 'chemicals-tab-active' : ''} type="button" onClick={() => setActiveTab('register')}>Registro</button>
            <button className={activeTab === 'technicians' ? 'chemicals-tab-active' : ''} type="button" onClick={() => { setActiveTab('technicians'); if (ownerToken) void loadManagedTechnicians().catch((error) => setTechnicianMessage(error instanceof Error ? error.message : 'No se pudo cargar la lista.')); }}>Técnicos</button>
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

      {(isSharedForm || activeTab === 'register') && <div className={`chemicals-workspace ${isSharedForm ? 'chemicals-shared-workspace' : ''}`}>
        <section className="chemicals-form-card">
          <div className="chemicals-card-heading">
            <div>
              <span>{isSharedForm && !lockedTechnician ? 'ACCESO DEL TÉCNICO' : 'NUEVO REGISTRO'}</span>
              <h2>Químicos</h2>
            </div>
            <small>{isSharedForm && !lockedTechnician ? 'Usa tu nombre de acceso.' : 'Todos los campos con * son obligatorios.'}</small>
          </div>

          {isSharedForm && !lockedTechnician ? (
            <form className="chemicals-access-form" onSubmit={submitTechnicianAccess}>
              <div className="chemicals-access-intro">
                <span aria-hidden="true">✓</span>
                <div>
                  <h3>Escribe tu nombre de acceso</h3>
                  <p>Usa el nombre numerado asignado. Después de validarlo, quedará bloqueado.</p>
                </div>
              </div>
              <div className="form-field">
                <label htmlFor="chemical-access-code">Nombre de acceso del técnico *</label>
                <input
                  id="chemical-access-code"
                  autoCapitalize="words"
                  autoComplete="name"
                  maxLength={120}
                  placeholder="Ejemplo: 99 Técnico Ejemplo"
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
          ) : <form noValidate onSubmit={submitReport}>
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
                  <div className="chemical-quantity-control">
                    <input
                      id={`chemical-${chemical.key}`}
                      type="number"
                      min="0"
                      max="100000"
                      step="1"
                      inputMode="decimal"
                      placeholder="0"
                      value={form[chemical.key]}
                      onChange={(event) => updateQuantity(chemical.key, event.target.value)}
                    />
                    <span className="chemical-unit-label">{chemical.fixedUnit.label}</span>
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
                  setEditingReportId('');
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
                {saving ? 'Guardando...' : editingReportId ? 'Guardar cambios' : 'Guardar registro'}
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
                        <small>Retiro de bodega</small>
                      </div>
                      <button className="chemical-report-edit" type="button" onClick={() => editReport(report)}>Editar</button><button
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
                      <div><dt>Origen</dt><dd>Bodega</dd></div>
                    </dl>
                    <div className="chemical-report-quantities">
                      {usedChemicals.map((chemical) => (
                        <span key={chemical.key}>
                          <strong>{quantityLabel(report[chemical.key])}</strong>
                          {chemical.shortLabel}
                          {chemical.unitKey && ` · ${selectedUnitLabel(report, chemical)}`}
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
      </div>}

      {!isSharedForm && activeTab === 'technicians' && (
        <section className="chemicals-technicians-card">
          {!owner ? (
            <div className="chemicals-technicians-locked">
              <h2>Lista de técnicos</h2>
              <p>Inicia sesión para consultar y administrar los códigos y celulares.</p>
              <button className="primary-button" type="button" onClick={() => setShowOwnerAccess(true)}>Ingresar para ver la lista</button>
            </div>
          ) : (
            <>
              <div className="chemicals-card-heading"><div><span>ADMINISTRACIÓN</span><h2>Códigos y celulares</h2></div><small>{managedTechnicians.length} accesos</small></div>
              <form className="chemicals-technician-form" onSubmit={saveTechnician}>
                <div className="form-field"><label htmlFor="new-technician-name">Código y nombre *</label><input id="new-technician-name" required maxLength={120} placeholder="Ejemplo: 99 Técnico Ejemplo" value={newTechnicianName} onChange={(event) => setNewTechnicianName(event.target.value)} /></div>
                <div className="form-field"><label htmlFor="new-technician-phone">Celular de WhatsApp *</label><input id="new-technician-phone" required maxLength={30} placeholder="Ejemplo: +57 300 000 0000" value={newTechnicianPhone} onChange={(event) => setNewTechnicianPhone(event.target.value)} /></div>
                <button className="primary-button" type="submit" disabled={technicianSaving}>{technicianSaving ? 'Guardando…' : 'Agregar técnico'}</button>
              </form>
              {technicianMessage && <p className="chemicals-form-message chemicals-form-success">{technicianMessage}</p>}
              <div className="chemicals-technician-list">{managedTechnicians.map((technician) => <div className="chemicals-technician-row" key={technician.id}><div><strong>{technician.name}</strong><span>{technician.whatsappNumber}</span></div><div className="chemicals-technician-actions"><button className="chemical-report-edit" type="button" onClick={() => setEditingTechnician({ ...technician })}>Editar</button><button className="chemical-report-delete" type="button" onClick={() => void deleteTechnician(technician)}>Eliminar</button></div></div>)}</div>
            </>
          )}
        </section>
      )}

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
