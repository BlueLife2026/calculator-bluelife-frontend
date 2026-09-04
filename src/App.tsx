import { useEffect, useMemo, useState } from 'react';
import { API_URL } from './api';
import './App.css';

type AppArea = 'home' | 'commercial' | 'estimates' | 'operations' | 'finance';
type PropertyTab = 'overview' | 'commercial' | 'estimates' | 'contracts';

type EstimateOpportunity = {
  title: string;
  propertyLink: string;
  estimateNumber: string;
  value: number;
  status: string;
  category: string;
  contractor: string;
  opportunityName: string;
  createdAt: string;
  requestedBy: string;
  approvalDate: string;
  approvedBy: string;
  estimatedRepairDate: string;
  technician: string;
  actualRepairDate: string;
  invoiceNumber: string;
  invoiceValue: number;
  invoiceDate: string;
};

function parseCsvRows(csv: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;

  for (let index = 0; index < csv.length; index += 1) {
    const character = csv[index];
    if (character === '"') {
      if (quoted && csv[index + 1] === '"') {
        field += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (character === ',' && !quoted) {
      row.push(field);
      field = '';
    } else if ((character === '\n' || character === '\r') && !quoted) {
      if (character === '\r' && csv[index + 1] === '\n') index += 1;
      row.push(field);
      if (row.some((value) => value.length > 0)) rows.push(row);
      row = [];
      field = '';
    } else {
      field += character;
    }
  }

  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }

  return rows;
}

function parseMoney(value: string) {
  return Number(value.replaceAll(',', '').replace(/[^0-9.-]/g, '')) || 0;
}

type ContactRelation = {
  id: string;
  role: string | null;
  isPrimary: boolean;
  contact: {
    id: string;
    firstName: string | null;
    lastName: string | null;
    email: string | null;
    phone: string | null;
  };
};

type WaterBody = {
  id: string;
  name: string;
  type: string;
  size: string | null;
  active: boolean;
};

type SalesActivity = {
  id: string;
  type: string;
  occurredAt: string;
  notes: string | null;
  status: 'CREATED' | 'SENT' | 'APPROVED' | 'REJECTED';
  sentAt: string | null;
  approvedAt: string | null;
  rejectedAt: string | null;
};

const proposalBoardStatuses: SalesActivity['status'][] = [
  'CREATED',
  'SENT',
  'APPROVED',
  'REJECTED',
];

type ProposalWaterBody = {
  name: string;
  type: string;
  include: boolean;
  category: string;
  monthlyPrice: number;
  frequency: string;
  disinfectionSystem: boolean;
  accessDifficulty: 'EASY' | 'MEDIUM' | 'DIFFICULT';
  priceManuallyAdjusted: boolean;
  priceMode: 'SUGGESTED' | 'CUSTOM';
};

const poolPrices: Record<string, number[]> = {
  SMALL: [600],
  MEDIUM: [700, 750, 800, 850, 900],
  LARGE: [900, 1000, 1100, 1200],
  EXTRA_LARGE: [1300, 1500, 1700, 2000],
};

const automaticWaterBodyPrices: Record<string, number> = {
  SPA: 250,
  KIDDIE_POOL: 400,
  SPLASH_PAD: 400,
  DECORATIVE_WATER_FEATURE: 150,
};

const frequencyMultipliers: Record<string, number> = {
  '1x Weekly': 0.55,
  '2x Weekly': 0.8,
  '3x Weekly': 1,
  '5x Weekly': 1.35,
  '7x Weekly': 1.65,
};

const accessMultipliers: Record<ProposalWaterBody['accessDifficulty'], number> = {
  EASY: 1,
  MEDIUM: 1.03,
  DIFFICULT: 1.06,
};

function calculateWaterBodyPrice(body: ProposalWaterBody) {
  const basePrice = body.type === 'SWIMMING_POOL'
    ? poolPrices[body.category]?.[0] ?? 600
    : automaticWaterBodyPrices[body.type] ?? 150;
  const frequencyMultiplier = frequencyMultipliers[body.frequency] ?? 1;
  const accessMultiplier = accessMultipliers[body.accessDifficulty] ?? 1;
  // Category prices are the 3x-weekly commercial base. Frequency may reduce
  // or increase that base; access and equipment conditions adjust it after.
  const disinfectionMultiplier = body.disinfectionSystem ? 1 : 1.05;
  return basePrice * frequencyMultiplier * accessMultiplier * disinfectionMultiplier;
}

function effectiveWaterBodyPrice(body: ProposalWaterBody) {
  return body.priceManuallyAdjusted ? body.monthlyPrice : calculateWaterBodyPrice(body);
}

function suggestedPricesForWaterBody(body: ProposalWaterBody) {
  return body.type === 'SWIMMING_POOL'
    ? poolPrices[body.category] ?? []
    : [automaticWaterBodyPrices[body.type] ?? 150];
}

const serviceBaseAddress = '811 E 131ST AVE, TAMPA, FL 33612-4424';

type Property = {
  id: string;
  name: string;
  code: string | null;
  leadSource: string | null;
  propertyType: string | null;
  segment: string | null;

  addressLine1: string | null;
  city: string | null;
  county: string | null;
  state: string | null;
  zipCode: string | null;

  sharepointFolderUrl: string | null;
  maintenanceChiefInfo: string | null;
  followUpNotes: string | null;
  deletedAt?: string | null;

  managementCompany: {
    id: string;
    name: string;
  } | null;

  contacts: ContactRelation[];
  waterBodies: WaterBody[];
  salesActivities: SalesActivity[];
};

type EditPropertyForm = {
  name: string;
  leadSource: string;
  propertyType: string;
  segment: string;
  managementCompanyName: string;

  addressLine1: string;
  city: string;
  county: string;
  state: string;
  zipCode: string;

  sharepointFolderUrl: string;
  maintenanceChiefInfo: string;
};

type PropertyForm = EditPropertyForm;

type ContactForm = {
  firstName: string;
  lastName: string;
  role: string;
  email: string;
  phone: string;
  isPrimary: boolean;
};

type EditContactForm = ContactForm & {
  contactId?: string;
};

type WaterBodyForm = {
  name: string;
  type: string;
  size: string;
};

const emptyWaterBodyForm: WaterBodyForm = {
  name: '',
  type: 'SWIMMING_POOL',
  size: 'MEDIUM',
};

const emptyPropertyForm: PropertyForm = {
  name: '',
  leadSource: '',
  propertyType: '',
  segment: '',
  managementCompanyName: '',
  addressLine1: '',
  city: '',
  county: '',
  state: '',
  zipCode: '',
  sharepointFolderUrl: '',
  maintenanceChiefInfo: '',
};

const emptyContactForm: ContactForm = {
  firstName: '',
  lastName: '',
  role: 'PROPERTY_MANAGER',
  email: '',
  phone: '',
  isPrimary: true,
};

const requiredPropertyFields: Array<keyof PropertyForm> = [
  'name',
  'leadSource',
  'propertyType',
  'segment',
  'addressLine1',
  'city',
  'county',
  'state',
  'zipCode',
];

function formatLabel(value: string | null) {
  if (!value) return '-';

  return value
    .toLowerCase()
    .replaceAll('_', ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function propertySku(id: string) {
  return id.slice(0, 7).toLowerCase();
}

function isValidHttpUrl(value: string) {
  if (!value.trim()) return true;

  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

function propertyToForm(
  property: Property,
): EditPropertyForm {
  return {
    name: property.name ?? '',
    leadSource: property.leadSource ?? '',
    propertyType: property.propertyType ?? '',
    segment: property.segment ?? '',
    managementCompanyName: property.managementCompany?.name ?? '',

    addressLine1: property.addressLine1 ?? '',
    city: property.city ?? '',
    county: property.county ?? '',
    state: property.state ?? '',
    zipCode: property.zipCode ?? '',

    sharepointFolderUrl:
      property.sharepointFolderUrl ?? '',

    maintenanceChiefInfo:
      property.maintenanceChiefInfo ?? '',
  };
}

function WaterBodiesEditor({
  bodies,
  idPrefix,
  onAdd,
  onUpdate,
  onRemove,
}: {
  bodies: WaterBodyForm[];
  idPrefix: string;
  onAdd: () => void;
  onUpdate: (
    index: number,
    field: keyof WaterBodyForm,
    value: string,
  ) => void;
  onRemove: (index: number) => void;
}) {
  const counts = bodies.reduce<Record<string, number>>(
    (result, body) => ({
      ...result,
      [body.type]: (result[body.type] ?? 0) + 1,
    }),
    {},
  );

  return (
    <>
      <div className="form-section-title form-field-wide">
        <div>
          <h3>Water Bodies</h3>
          <p>Add each pool, spa or fountain separately.</p>
        </div>
        <button className="secondary-button" type="button" onClick={onAdd}>
          + Add water body
        </button>
      </div>

      <div className="water-bodies-editor form-field-wide">
        {bodies.length === 0 ? (
          <p className="empty-text">No water bodies added.</p>
        ) : (
          <>
            <div className="water-body-summary">
              {Object.entries(counts).map(([type, count]) => (
                <span className="tag" key={type}>
                  {count} {formatLabel(type)}{count > 1 ? 's' : ''}
                </span>
              ))}
            </div>

            {bodies.map((body, index) => (
              <div className="water-body-editor" key={`${idPrefix}-${index}`}>
                <div className="form-field">
                  <label htmlFor={`${idPrefix}-type-${index}`}>Type *</label>
                  <select
                    id={`${idPrefix}-type-${index}`}
                    value={body.type}
                    onChange={(event) =>
                      onUpdate(index, 'type', event.target.value)
                    }
                  >
                    <option value="SWIMMING_POOL">Swimming Pool</option>
                    <option value="SPA">Spa</option>
                    <option value="KIDDIE_POOL">Kiddie Pool</option>
                    <option value="SPLASH_PAD">Splash Pad</option>
                    <option value="DECORATIVE_WATER_FEATURE">
                      Decorative Water Feature
                    </option>
                    <option value="OTHER">Other</option>
                  </select>
                </div>

                <div className="form-field water-body-name-field">
                  <label htmlFor={`${idPrefix}-name-${index}`}>
                    Name or identifier *
                  </label>
                  <input
                    id={`${idPrefix}-name-${index}`}
                    placeholder="Example: Main Pool or North Spa"
                    value={body.name}
                    onChange={(event) =>
                      onUpdate(index, 'name', event.target.value)
                    }
                  />
                </div>

                <div className="form-field">
                  <label htmlFor={`${idPrefix}-size-${index}`}>
                    Size *
                  </label>
                  <select
                    id={`${idPrefix}-size-${index}`}
                    value={body.size}
                    onChange={(event) =>
                      onUpdate(index, 'size', event.target.value)
                    }
                  >
                    <option value="">Select size</option>
                    <option value="SMALL">Small</option>
                    <option value="MEDIUM">Medium</option>
                    <option value="LARGE">Large</option>
                    <option value="EXTRA_LARGE">Extra Large</option>
                  </select>
                </div>

                <button
                  className="delete-button water-body-remove"
                  type="button"
                  onClick={() => onRemove(index)}
                >
                  Remove
                </button>
              </div>
            ))}
          </>
        )}
      </div>
    </>
  );
}

function App() {
  const [activeArea, setActiveArea] = useState<AppArea>('commercial');
  const [estimateOpportunities, setEstimateOpportunities] = useState<EstimateOpportunity[]>([]);
  const [estimateSearch, setEstimateSearch] = useState('');
  const [estimateStatus, setEstimateStatus] = useState('ALL');
  const [estimatesLoading, setEstimatesLoading] = useState(true);
  const [showRepairRequest, setShowRepairRequest] = useState(false);
  const [repairRequest, setRepairRequest] = useState({ property: '', description: '', category: '', requestedBy: 'Commercial' });
  const [propertyTab, setPropertyTab] = useState<PropertyTab>('overview');
  const [properties, setProperties] =
    useState<Property[]>([]);

  const [deletedProperties, setDeletedProperties] =
    useState<Property[]>([]);

  const [showDeleted, setShowDeleted] =
    useState(false);

  const [trashActionId, setTrashActionId] =
    useState<string | null>(null);

  const [loading, setLoading] =
    useState(true);

  const [search, setSearch] =
    useState('');

  const [
    selectedProperty,
    setSelectedProperty,
  ] = useState<Property | null>(null);

  const [
    detailLoading,
    setDetailLoading,
  ] = useState(false);

  const [
    isEditing,
    setIsEditing,
  ] = useState(false);

  const [
    saving,
    setSaving,
  ] = useState(false);

  const [creatingSharePointFolder, setCreatingSharePointFolder] =
    useState(false);

  const [showProposal, setShowProposal] = useState(false);
  const [showProposalReminders, setShowProposalReminders] = useState(false);
  const [reminderReferenceTime, setReminderReferenceTime] = useState(() => Date.now());
  const [focusedReminderActivityId, setFocusedReminderActivityId] = useState<string | null>(null);
  const [showDemoReminder, setShowDemoReminder] = useState(true);
  const [savingProposal, setSavingProposal] = useState(false);
  const [previewActivityId, setPreviewActivityId] = useState<string | null>(null);
  const [proposalDraftNotes, setProposalDraftNotes] = useState('');
  const [, setSavingProposalText] = useState(false);
  const [managementStatus, setManagementStatus] = useState('CURRENT');
  const [adjustments, setAdjustments] = useState('0');
  const [proposalNotes, setProposalNotes] = useState('');
  const [proposalWaterBodies, setProposalWaterBodies] = useState<
    ProposalWaterBody[]
  >([]);
  const [routeDistanceMiles, setRouteDistanceMiles] = useState<number | null>(null);
  const [routeLoading, setRouteLoading] = useState(false);
  const [routeError, setRouteError] = useState('');
  const [fuelPricePerGallon, setFuelPricePerGallon] = useState('3.50');
  const [vehicleMpg, setVehicleMpg] = useState('25');
  const [manualTransportationCost, setManualTransportationCost] = useState('');

  const baseMonthlyPrice = proposalWaterBodies
    .filter((body) => body.include)
    .reduce((sum, body) => sum + effectiveWaterBodyPrice(body), 0);
  const serviceVisitsPerWeek = Math.max(
    1,
    ...proposalWaterBodies
      .filter((body) => body.include)
      .map((body) => Number.parseInt(body.frequency, 10) || 1),
  );
  const fuelPrice = Math.max(0, Number(fuelPricePerGallon) || 0);
  const mpg = Math.max(0, Number(vehicleMpg) || 0);
  const calculatedTransportationCost =
    routeDistanceMiles !== null && mpg > 0
      ? (routeDistanceMiles * 2 * serviceVisitsPerWeek * 52 / 12 / mpg) * fuelPrice
      : 0;
  const monthlyTransportationCost =
    routeDistanceMiles === null && manualTransportationCost.trim() !== ''
      ? Math.max(0, Number(manualTransportationCost) || 0)
      : calculatedTransportationCost;
  const baseMonthlyPriceWithTransportation = baseMonthlyPrice + monthlyTransportationCost;
  const adjustmentPercentage =
    managementStatus === 'VIP'
      ? Math.min(100, Math.max(0, Number(adjustments || 0)))
      : 0;
  const monthlyInvestment =
    baseMonthlyPriceWithTransportation * (1 - adjustmentPercentage / 100);
  const waterBodiesMonthlyInvestment =
    baseMonthlyPrice * (1 - adjustmentPercentage / 100);

  const [
    editForm,
    setEditForm,
  ] = useState<EditPropertyForm | null>(
    null,
  );

  const [editContacts, setEditContacts] =
    useState<EditContactForm[]>([]);

  const [editWaterBodies, setEditWaterBodies] =
    useState<WaterBodyForm[]>([]);

  const editContactEmails = editContacts.map((contact) =>
    contact.email.trim().toLowerCase(),
  );
  const editContactsAreValid =
    editContacts.some(
      (contact) => contact.role === 'PROPERTY_MANAGER',
    ) &&
    editContacts.every(
      (contact) =>
        Boolean(contact.role) &&
        /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
          contact.email.trim(),
        ),
    ) &&
    new Set(editContactEmails).size === editContactEmails.length &&
    editContacts.filter((contact) => contact.isPrimary).length === 1;

  const [isCreating, setIsCreating] =
    useState(false);

  const [creating, setCreating] =
    useState(false);

  const [createError, setCreateError] =
    useState('');

  const [createForm, setCreateForm] =
    useState<PropertyForm>(emptyPropertyForm);

  const [createContacts, setCreateContacts] =
    useState<ContactForm[]>([{ ...emptyContactForm }]);

  const [createWaterBodies, setCreateWaterBodies] =
    useState<WaterBodyForm[]>([]);

  const createWaterBodiesAreValid = createWaterBodies.every(
    (waterBody) => Boolean(
      waterBody.type &&
      waterBody.size &&
      waterBody.name.trim(),
    ),
  );

  const editWaterBodiesAreValid = editWaterBodies.every(
    (waterBody) => Boolean(
      waterBody.type &&
      waterBody.size &&
      waterBody.name.trim(),
    ),
  );

  const normalizedContactEmails = createContacts.map((contact) =>
    contact.email.trim().toLowerCase(),
  );
  const contactEmailsAreUnique =
    new Set(normalizedContactEmails).size ===
    normalizedContactEmails.length;
  const contactsAreValid =
    createContacts.some(
      (contact) => contact.role === 'PROPERTY_MANAGER',
    ) &&
    createContacts.every(
      (contact) =>
        Boolean(contact.role) &&
        /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
          contact.email.trim(),
        ),
    ) &&
    contactEmailsAreUnique &&
    createContacts.filter((contact) => contact.isPrimary).length === 1;

  const createFormIsValid =
    requiredPropertyFields.every((field) =>
      createForm[field].trim(),
    ) &&
    /^[A-Za-z]{2}$/.test(createForm.state.trim()) &&
    /^\d{5}(-\d{4})?$/.test(createForm.zipCode.trim()) &&
    isValidHttpUrl(createForm.sharepointFolderUrl) &&
    contactsAreValid &&
    createWaterBodiesAreValid;

  useEffect(() => {
    async function loadProperties() {
      try {
        const [response, deletedResponse] = await Promise.all([
          fetch(`${API_URL}/properties`),
          fetch(`${API_URL}/properties/deleted`),
        ]);

        if (!response.ok) {
          throw new Error(
            'Could not load properties',
          );
        }

        const data =
          await response.json();

        setProperties(data);

        if (deletedResponse.ok) {
          setDeletedProperties(await deletedResponse.json());
        }
      } catch (error) {
        console.error(error);
      } finally {
        setLoading(false);
      }
    }

    loadProperties();
  }, []);

  useEffect(() => {
    async function loadEstimateOpportunities() {
      try {
        const response = await fetch('/opportunities.csv');
        if (!response.ok) throw new Error('Could not load estimate opportunities');
        const [, ...rows] = parseCsvRows(await response.text());
        setEstimateOpportunities(rows.map((columns) => ({
          title: columns[0]?.trim() ?? '',
          propertyLink: columns[1]?.trim() ?? '',
          estimateNumber: columns[2]?.trim() ?? '',
          value: parseMoney(columns[3] ?? ''),
          status: columns[4]?.trim() || 'Unspecified',
          category: columns[5]?.trim() || 'Uncategorized',
          contractor: columns[6]?.trim() ?? '',
          opportunityName: (columns[7] ?? '').replace(/<br\s*\/?>(\s*)/gi, ' ').trim(),
          createdAt: columns[8]?.trim() ?? '',
          requestedBy: columns[9]?.trim() || 'Not specified',
          approvalDate: columns[10]?.trim() ?? '',
          approvedBy: columns[11]?.trim() ?? '',
          estimatedRepairDate: columns[12]?.trim() ?? '',
          technician: columns[14]?.trim() ?? '',
          actualRepairDate: columns[15]?.trim() ?? '',
          invoiceNumber: columns[16]?.trim() ?? '',
          invoiceValue: parseMoney(columns[17] ?? ''),
          invoiceDate: columns[18]?.trim() ?? '',
        })));
      } catch (error) {
        console.error(error);
      } finally {
        setEstimatesLoading(false);
      }
    }

    void loadEstimateOpportunities();
  }, []);

  useEffect(() => {
    const timer = window.setInterval(
      () => setReminderReferenceTime(Date.now()),
      60 * 60 * 1000,
    );

    return () => window.clearInterval(timer);
  }, []);

  const filteredProperties =
    useMemo(() => {
      const term =
        search.trim().toLowerCase();

      if (!term) {
        return properties;
      }

      return properties.filter(
        (property) => {
          const values = [
            property.name,
            property.city,
            property.state,
            property.segment,
            property.propertyType,
            property.managementCompany
              ?.name,
          ];

          return values.some(
            (value) =>
              value
                ?.toLowerCase()
                .includes(term),
          );
        },
      );
    }, [properties, search]);

  const dashboardStats = useMemo(() => {
    const typeCounts = filteredProperties.reduce<Record<string, number>>((counts, property) => {
      const type = property.propertyType ?? 'UNSPECIFIED';
      counts[type] = (counts[type] ?? 0) + 1;
      return counts;
    }, {});
    const managementCounts = filteredProperties.reduce<Record<string, number>>((counts, property) => {
      const company = property.managementCompany?.name ?? 'Unassigned';
      counts[company] = (counts[company] ?? 0) + 1;
      return counts;
    }, {});
    const proposalCounts = filteredProperties.reduce<Record<string, number>>((counts, property) => {
      property.salesActivities
        .filter((activity) => activity.type === 'PROPOSAL')
        .forEach((activity) => {
          const status = activity.status ?? 'CREATED';
          counts[status] = (counts[status] ?? 0) + 1;
        });
      return counts;
    }, {});
    return {
      typeCounts,
      managementCounts,
      proposalCounts,
      totalProposals: Object.values(proposalCounts).reduce((sum, count) => sum + count, 0),
      propertyCount: filteredProperties.length,
    };
  }, [filteredProperties]);

  const filteredEstimates = useMemo(() => {
    const term = estimateSearch.trim().toLowerCase();
    return estimateOpportunities.filter((estimate) =>
      (estimateStatus === 'ALL' || estimate.status === estimateStatus) &&
      (!term || [
        estimate.title,
        estimate.estimateNumber,
        estimate.opportunityName,
        estimate.category,
        estimate.requestedBy,
      ].some((value) => value.toLowerCase().includes(term))),
    );
  }, [estimateOpportunities, estimateSearch, estimateStatus]);

  const estimateStats = useMemo(() => ({
    total: estimateOpportunities.length,
    pending: estimateOpportunities.filter((estimate) => estimate.status === 'Pending').length,
    accepted: estimateOpportunities.filter((estimate) => estimate.status === 'Accepted').length,
    converted: estimateOpportunities.filter((estimate) => estimate.status === 'Converted').length,
    pipelineValue: estimateOpportunities
      .filter((estimate) => estimate.status === 'Pending' || estimate.status === 'Accepted')
      .reduce((sum, estimate) => sum + estimate.value, 0),
  }), [estimateOpportunities]);

  const proposalReminders = useMemo(() => {
    const followUpThreshold = reminderReferenceTime - 30 * 24 * 60 * 60 * 1000;

    return properties.flatMap((property) =>
      property.salesActivities
        .filter((activity) =>
          activity.type === 'PROPOSAL' &&
          activity.status === 'SENT' &&
          Boolean(activity.sentAt) &&
          new Date(activity.sentAt as string).getTime() <= followUpThreshold,
        )
        .map((activity) => ({
          activity,
          property,
          contact: property.contacts.find((contact) => contact.isPrimary) ?? property.contacts[0],
        })),
    ).sort(
      (first, second) =>
        new Date(first.activity.sentAt as string).getTime() -
        new Date(second.activity.sentAt as string).getTime(),
    );
  }, [properties, reminderReferenceTime]);

  const demoReminder = (() => {
    for (const property of properties) {
      const activity = property.salesActivities.find((item) => item.type === 'PROPOSAL');
      if (!activity) continue;

      return {
        activity,
        property,
        contact: property.contacts.find((contact) => contact.isPrimary) ?? property.contacts[0],
      };
    }

    return null;
  })();

  async function openProperty(
    id: string,
    reminderActivityId?: string,
  ) {
    try {
      setDetailLoading(true);

      const response = await fetch(
        `${API_URL}/properties/${id}`,
      );

      if (!response.ok) {
        throw new Error(
          'Could not load property details',
        );
      }

      const data =
        await response.json();

      setSelectedProperty(data);
      const previewActivity = reminderActivityId
        ? data.salesActivities.find((activity: SalesActivity) => activity.id === reminderActivityId)
        : data.salesActivities[0];
      setPreviewActivityId(previewActivity?.id ?? data.salesActivities[0]?.id ?? null);
      setProposalDraftNotes(previewActivity?.notes ?? data.salesActivities[0]?.notes ?? '');
      setFocusedReminderActivityId(reminderActivityId ?? null);
      setPropertyTab(reminderActivityId ? 'commercial' : 'overview');
      setIsEditing(false);
      setEditForm(null);
      setEditContacts([]);
      setEditWaterBodies([]);
    } catch (error) {
      console.error(error);
    } finally {
      setDetailLoading(false);
    }
  }

  function startEditing() {
    if (!selectedProperty) return;

    setEditForm(
      propertyToForm(
        selectedProperty,
      ),
    );

    setEditContacts(
      selectedProperty.contacts.length
        ? selectedProperty.contacts.map((relation) => ({
            contactId: relation.contact.id,
            firstName: relation.contact.firstName ?? '',
            lastName: relation.contact.lastName ?? '',
            role: relation.role ?? '',
            email: relation.contact.email ?? '',
            phone: relation.contact.phone ?? '',
            isPrimary: relation.isPrimary,
          }))
        : [{ ...emptyContactForm }],
    );
    setEditWaterBodies(
      selectedProperty.waterBodies.map((waterBody) => ({
        name: waterBody.name,
        type: waterBody.type,
        size: waterBody.size ?? 'MEDIUM',
      })),
    );

    setIsEditing(true);
  }

  function cancelEditing() {
    setIsEditing(false);
    setEditForm(null);
    setEditContacts([]);
    setEditWaterBodies([]);
  }

  function updateField(
    field: keyof EditPropertyForm,
    value: string,
  ) {
    if (!editForm) return;

    setEditForm({
      ...editForm,
      [field]: value,
    });
  }

  function updateEditContact(
    index: number,
    field: keyof ContactForm,
    value: string | boolean,
  ) {
    setEditContacts((current) =>
      current.map((contact, contactIndex) => ({
        ...contact,
        ...(contactIndex === index ? { [field]: value } : {}),
        ...(field === 'isPrimary' && value === true
          ? { isPrimary: contactIndex === index }
          : {}),
      })),
    );
  }

  function addEditContact() {
    setEditContacts((current) => [
      ...current,
      { ...emptyContactForm, role: '', isPrimary: false },
    ]);
  }

  function removeEditContact(index: number) {
    setEditContacts((current) => {
      const remaining = current.filter(
        (_, contactIndex) => contactIndex !== index,
      );
      if (remaining.length && !remaining.some((contact) => contact.isPrimary)) {
        remaining[0] = { ...remaining[0], isPrimary: true };
      }
      return remaining;
    });
  }

  function updateWaterBody(
    mode: 'create' | 'edit',
    index: number,
    field: keyof WaterBodyForm,
    value: string,
  ) {
    const setter = mode === 'create' ? setCreateWaterBodies : setEditWaterBodies;
    setter((current) =>
      current.map((waterBody, waterBodyIndex) =>
        waterBodyIndex === index
          ? { ...waterBody, [field]: value }
          : waterBody,
      ),
    );
  }

  function addWaterBody(mode: 'create' | 'edit') {
    const setter = mode === 'create' ? setCreateWaterBodies : setEditWaterBodies;
    setter((current) => [...current, { ...emptyWaterBodyForm }]);
  }

  function removeWaterBody(mode: 'create' | 'edit', index: number) {
    const setter = mode === 'create' ? setCreateWaterBodies : setEditWaterBodies;
    setter((current) =>
      current.filter((_, waterBodyIndex) => waterBodyIndex !== index),
    );
  }

  function updateCreateField(
    field: keyof PropertyForm,
    value: string,
  ) {
    setCreateForm((current) => ({
      ...current,
      [field]: value,
    }));
    setCreateError('');
  }

  function updateContactField(
    index: number,
    field: keyof ContactForm,
    value: string | boolean,
  ) {
    setCreateContacts((current) =>
      current.map((contact, contactIndex) => ({
        ...contact,
        ...(contactIndex === index ? { [field]: value } : {}),
        ...(field === 'isPrimary' && value === true
          ? { isPrimary: contactIndex === index }
          : {}),
      })),
    );
    setCreateError('');
  }

  function addContact() {
    setCreateContacts((current) => [
      ...current,
      {
        ...emptyContactForm,
        role: '',
        isPrimary: false,
      },
    ]);
  }

  function removeContact(index: number) {
    setCreateContacts((current) => {
      const remaining = current.filter(
        (_, contactIndex) => contactIndex !== index,
      );

      if (remaining.length > 0 && !remaining.some((item) => item.isPrimary)) {
        const managerIndex = remaining.findIndex(
          (item) => item.role === 'PROPERTY_MANAGER',
        );
        remaining[managerIndex >= 0 ? managerIndex : 0] = {
          ...remaining[managerIndex >= 0 ? managerIndex : 0],
          isPrimary: true,
        };
      }

      return remaining;
    });
  }

  function closeCreateForm() {
    if (creating) return;

    setIsCreating(false);
    setCreateForm(emptyPropertyForm);
    setCreateContacts([{ ...emptyContactForm }]);
    setCreateWaterBodies([]);
    setCreateError('');
  }

  async function createProperty(
    event: React.FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    if (!createFormIsValid || creating) return;

    try {
      setCreating(true);
      setCreateError('');

      const response = await fetch(
        `${API_URL}/properties`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            ...createForm,
            name: createForm.name.trim(),
            addressLine1:
              createForm.addressLine1.trim(),
            city: createForm.city.trim(),
            county: createForm.county.trim(),
            state: createForm.state.trim(),
            zipCode: createForm.zipCode.trim(),
            managementCompanyName:
              createForm.managementCompanyName.trim() ||
              undefined,
            maintenanceChiefInfo:
              createForm.maintenanceChiefInfo.trim() ||
              undefined,
            contacts: createContacts.map((contact) => ({
              firstName: contact.firstName.trim() || undefined,
              lastName: contact.lastName.trim() || undefined,
              role: contact.role,
              email: contact.email.trim(),
              phone: contact.phone.trim() || undefined,
              isPrimary: contact.isPrimary,
            })),
            waterBodies: createWaterBodies.map((waterBody) => ({
              name: waterBody.name.trim(),
              type: waterBody.type,
              size: waterBody.size || undefined,
              active: true,
            })),
          }),
        },
      );

      if (!response.ok) {
        throw new Error('Could not create property');
      }

      const createdProperty: Property =
        await response.json();

      setProperties((current) =>
        [...current, createdProperty].sort((a, b) =>
          a.name.localeCompare(b.name),
        ),
      );
      setIsCreating(false);
      setCreateForm(emptyPropertyForm);
      setCreateContacts([{ ...emptyContactForm }]);
      setCreateWaterBodies([]);
      setCreateError('');
    } catch (error) {
      console.error(error);
      setCreateError(
        'The property could not be created. Check the information and try again.',
      );
    } finally {
      setCreating(false);
    }
  }

  async function moveSelectedPropertyToTrash() {
    if (!selectedProperty) return;

    const confirmed = window.confirm(
      `Move "${selectedProperty.name}" to Deleted Properties? You can restore it later.`,
    );
    if (!confirmed) return;

    try {
      setSaving(true);
      const response = await fetch(
        `${API_URL}/properties/${selectedProperty.id}`,
        { method: 'DELETE' },
      );
      if (!response.ok) throw new Error('Could not delete property');

      const deletedProperty = await response.json();
      setProperties((current) =>
        current.filter((property) => property.id !== deletedProperty.id),
      );
      setDeletedProperties((current) => [deletedProperty, ...current]);
      setSelectedProperty(null);
      setIsEditing(false);
    } catch (error) {
      console.error(error);
      window.alert('The property could not be moved to Deleted Properties.');
    } finally {
      setSaving(false);
    }
  }

  async function restoreProperty(property: Property) {
    try {
      setTrashActionId(property.id);
      const response = await fetch(
        `${API_URL}/properties/${property.id}/restore`,
        { method: 'PATCH' },
      );
      if (!response.ok) throw new Error('Could not restore property');

      const restored = await response.json();
      setDeletedProperties((current) =>
        current.filter((item) => item.id !== property.id),
      );
      setProperties((current) =>
        [...current, restored].sort((a, b) => a.name.localeCompare(b.name)),
      );
    } catch (error) {
      console.error(error);
      window.alert('The property could not be restored.');
    } finally {
      setTrashActionId(null);
    }
  }

  async function permanentlyDeleteProperty(property: Property) {
    const confirmed = window.confirm(
      `Permanently delete "${property.name}"? This action cannot be undone.`,
    );
    if (!confirmed) return;

    try {
      setTrashActionId(property.id);
      const response = await fetch(
        `${API_URL}/properties/${property.id}/permanent`,
        { method: 'DELETE' },
      );
      if (!response.ok) throw new Error('Could not permanently delete property');

      setDeletedProperties((current) =>
        current.filter((item) => item.id !== property.id),
      );
    } catch (error) {
      console.error(error);
      window.alert('The property could not be permanently deleted.');
    } finally {
      setTrashActionId(null);
    }
  }

  async function retrySharePointFolder() {
    if (!selectedProperty || creatingSharePointFolder) return;

    try {
      setCreatingSharePointFolder(true);
      const response = await fetch(
        `${API_URL}/properties/${selectedProperty.id}/sharepoint-folder`,
        { method: 'POST' },
      );
      if (!response.ok) throw new Error('Could not create SharePoint folder');

      const updatedProperty = await response.json();
      setSelectedProperty(updatedProperty);
      setProperties((current) =>
        current.map((property) =>
          property.id === updatedProperty.id ? updatedProperty : property,
        ),
      );
    } catch (error) {
      console.error(error);
      window.alert(
        'The SharePoint folder could not be created. Check the connection and try again.',
      );
    } finally {
      setCreatingSharePointFolder(false);
    }
  }

  async function loadRouteDistance(destination: string) {
    setRouteDistanceMiles(null);
    setRouteError('');
    if (!destination.trim()) {
      setRouteError('Property address is not available.');
      return;
    }
    setRouteLoading(true);
    try {
      const geocode = async (address: string) => {
        const response = await fetch(
          `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=${encodeURIComponent(address)}`,
        );
        if (!response.ok) throw new Error('Geocoding failed');
        const results = (await response.json()) as Array<{ lat: string; lon: string }>;
        if (!results[0]) throw new Error(`Address not found: ${address}`);
        return { lat: Number(results[0].lat), lon: Number(results[0].lon) };
      };
      const [origin, target] = await Promise.all([
        geocode(serviceBaseAddress),
        geocode(destination),
      ]);
      const routeResponse = await fetch(
        `https://router.project-osrm.org/route/v1/driving/${origin.lon},${origin.lat};${target.lon},${target.lat}?overview=false`,
      );
      if (!routeResponse.ok) throw new Error('Route calculation failed');
      const routeData = await routeResponse.json() as { routes?: Array<{ distance: number }> };
      const meters = routeData.routes?.[0]?.distance;
      if (!meters) throw new Error('No driving route found');
      setRouteDistanceMiles(Number((meters / 1609.344).toFixed(1)));
    } catch (error) {
      console.error(error);
      setRouteError('Distance unavailable. Check the property address.');
    } finally {
      setRouteLoading(false);
    }
  }

  function openProposal() {
    if (!selectedProperty) return;
    setManualTransportationCost('');
    setProposalWaterBodies(
      selectedProperty.waterBodies.map((body) => {
        const type = body.type === 'POOL'
          ? 'SWIMMING_POOL'
          : body.type === 'FOUNTAIN'
            ? 'DECORATIVE_WATER_FEATURE'
            : body.type;
        return {
          name: body.name,
          type,
          include: body.active,
          category: body.size ?? (type === 'SWIMMING_POOL' ? 'MEDIUM' : 'MEDIUM'),
          monthlyPrice: type === 'SWIMMING_POOL'
            ? poolPrices[body.size ?? 'MEDIUM']?.[0] ?? 700
            : automaticWaterBodyPrices[type] ?? 150,
          frequency: '3x Weekly',
          disinfectionSystem: false,
          accessDifficulty: 'EASY',
          priceManuallyAdjusted: false,
          priceMode: 'SUGGESTED',
        };
      }),
    );
    setShowProposal(true);
    void loadRouteDistance(
      [selectedProperty.addressLine1, selectedProperty.city, selectedProperty.state, selectedProperty.zipCode]
        .filter(Boolean)
        .join(', '),
    );
  }

  function updateProposalWaterBody(
    index: number,
    changes: Partial<ProposalWaterBody>,
  ) {
    setProposalWaterBodies((current) =>
      current.map((body, bodyIndex) => {
        if (bodyIndex !== index) return body;
        const updated = { ...body, ...changes };
        if (changes.type) {
          updated.category = changes.type === 'SWIMMING_POOL' ? 'SMALL' : '';
        }
        const pricingVariableChanged = [
          'type',
          'category',
          'frequency',
          'disinfectionSystem',
          'accessDifficulty',
        ].some((field) => field in changes);
        if (pricingVariableChanged) {
          return {
            ...updated,
            monthlyPrice: calculateWaterBodyPrice(updated),
            priceManuallyAdjusted: false,
            priceMode: 'SUGGESTED',
          };
        }
        return updated;
      }),
    );
  }

  function buildProposalEmailBody() {
    if (!selectedProperty) return '';
    const includedBodies = proposalWaterBodies.filter((body) => body.include);
    const primaryContact =
      selectedProperty.contacts.find((relation) => relation.isPrimary) ??
      selectedProperty.contacts[0];
    const formattedInvestment = monthlyInvestment.toLocaleString('en-US', {
      style: 'currency',
      currency: 'USD',
    });
    const serviceSubject =
      includedBodies.length === 1
        ? formatLabel(includedBodies[0].type).toLowerCase()
        : 'pools and water bodies';
    const propertyAddress = [
      selectedProperty.addressLine1,
      selectedProperty.city,
      selectedProperty.state,
      selectedProperty.zipCode,
    ]
      .filter(Boolean)
      .join(', ');
    return [
      `Proposal BL-${new Date().getFullYear()}-${propertySku(selectedProperty.id).toUpperCase()}`,
      `Prepared for: ${selectedProperty.name}`,
      `Address: ${propertyAddress}`,
      `Management company: ${selectedProperty.managementCompany?.name ?? '-'}`,
      `Contact: ${primaryContact?.contact.firstName ?? '-'} | ${primaryContact?.contact.phone ?? '-'} | ${primaryContact?.contact.email ?? '-'}`,
      '',
      `We are pleased to present Blue Life Pools’ proposal for the monthly maintenance of the ${serviceSubject} at ${selectedProperty.name}. Our commitment is to provide professional, efficient, and high-quality service, ensuring that your facilities remain in optimal condition throughout the year.`,
      '',
      'Our proposal includes:',
      '✔ Comprehensive and scheduled maintenance to ensure optimal performance.',
      '✔ Regular monitoring and adjustment of chemical levels to maintain ideal water balance.',
      '✔ Cleaning and inspection of equipment to maximize efficiency and extend its lifespan.',
      '✔ Periodic reports on the condition of the facilities, providing full transparency and control.',
      '',
      `The monthly service fee is ${formattedInvestment}. This fee reflects our commitment to quality, reliability, and the support of a specialized team.`,
      '',
      'Service details:',
      ...includedBodies.map(
        (body) =>
          `• ${body.name} | ${body.frequency}`,
      ),
      managementStatus === 'VIP'
        ? '• Preferred Management Partner Pricing Applied'
        : '',
      proposalNotes.trim() ? `• Additional notes: ${proposalNotes.trim()}` : '',
      '',
      'Attached you will find the full details of our proposal for your review. Please do not hesitate to contact me with any questions or to discuss the next steps.',
      '',
      'We truly appreciate the opportunity to present this proposal and look forward to the possibility of working with you to maintain your facilities to the highest standards.',
      '',
      'Kind regards,',
      'Blue Life Pools',
    ].join('\n');
  }

  async function saveProposal(sendByEmail = false) {
    if (!selectedProperty || savingProposal) return;

    const includedBodies = proposalWaterBodies.filter((body) => body.include);
    if (includedBodies.length === 0) {
      window.alert('Include at least one water body in the proposal.');
      return;
    }

    const primaryContact =
      selectedProperty.contacts.find((relation) => relation.isPrimary) ??
      selectedProperty.contacts[0];
    const recipientEmail = primaryContact?.contact.email?.trim();
    if (sendByEmail && !recipientEmail) {
      window.alert('Add an email address to the primary contact before sending.');
      return;
    }
    const notes = buildProposalEmailBody();

    try {
      setSavingProposal(true);
      const response = await fetch(
        `${API_URL}/properties/${selectedProperty.id}/sales-activities`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type: 'PROPOSAL', notes }),
        },
      );
      if (!response.ok) throw new Error('Could not save proposal');
      let activity: SalesActivity = await response.json();
      if (sendByEmail) {
        const statusResponse = await fetch(
          `${API_URL}/properties/${selectedProperty.id}/sales-activities/${activity.id}/status`,
          {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: 'SENT' }),
          },
        );
        if (!statusResponse.ok) throw new Error('Could not register sent proposal');
        activity = await statusResponse.json();
      }
      setSelectedProperty({
        ...selectedProperty,
        salesActivities: [activity, ...selectedProperty.salesActivities],
      });
      setProperties((current) =>
        current.map((property) =>
          property.id === selectedProperty.id
            ? {
                ...property,
                salesActivities: [activity, ...property.salesActivities],
              }
            : property,
        ),
      );
      setPreviewActivityId(activity.id);
      setProposalDraftNotes(activity.notes ?? '');
      setShowProposal(false);
      if (sendByEmail && recipientEmail) {
        const subject = `Blue Life Pools Proposal - ${selectedProperty.name}`;
        window.location.href = `mailto:${recipientEmail}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(notes)}`;
      }
    } catch (error) {
      console.error(error);
      window.alert('The proposal could not be saved.');
    } finally {
      setSavingProposal(false);
    }
  }

  async function updateProposalStatus(
    activityId: string,
    status: 'SENT' | 'APPROVED' | 'REJECTED',
  ) {
    if (!selectedProperty) return null;
    const response = await fetch(
      `${API_URL}/properties/${selectedProperty.id}/sales-activities/${activityId}/status`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      },
    );
    if (!response.ok) {
      window.alert('The proposal status could not be updated.');
      return null;
    }
    const updated: SalesActivity = await response.json();
    if (activityId === focusedReminderActivityId && updated.status !== 'SENT') {
      setFocusedReminderActivityId(null);
    }
    const replaceActivity = (property: Property) => ({
      ...property,
      salesActivities: property.salesActivities.map((activity) =>
        activity.id === updated.id ? updated : activity,
      ),
    });
    setSelectedProperty((current) => (current ? replaceActivity(current) : current));
    setProperties((current) =>
      current.map((property) =>
        property.id === selectedProperty.id ? replaceActivity(property) : property,
      ),
    );
    return updated;
  }

  async function saveProposalText(activityId: string, notes: string) {
    if (!selectedProperty) return false;
    setSavingProposalText(true);
    try {
      const response = await fetch(
        `${API_URL}/properties/${selectedProperty.id}/sales-activities/${activityId}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ notes }),
        },
      );
      if (!response.ok) throw new Error('Could not save proposal text');
      const updated: SalesActivity = await response.json();
      const replaceActivity = (property: Property) => ({
        ...property,
        salesActivities: property.salesActivities.map((item) =>
          item.id === updated.id ? updated : item,
        ),
      });
      setSelectedProperty((current) => (current ? replaceActivity(current) : current));
      setProperties((current) =>
        current.map((property) =>
          property.id === selectedProperty.id ? replaceActivity(property) : property,
        ),
      );
      setProposalDraftNotes(updated.notes ?? '');
      return true;
    } catch (error) {
      console.error(error);
      window.alert('The proposal text could not be saved.');
      return false;
    } finally {
      setSavingProposalText(false);
    }
  }

  useEffect(() => {
    if (!selectedProperty || !focusedReminderActivityId) return;

    window.requestAnimationFrame(() => {
      document.getElementById('sales-activity')?.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      });
    });
  }, [selectedProperty, focusedReminderActivityId]);

  async function deleteProposal(activityId: string) {
    if (!selectedProperty) return;
    if (!window.confirm('Delete this proposal from Sales Activity?')) return;
    try {
      const response = await fetch(
        `${API_URL}/properties/${selectedProperty.id}/sales-activities/${activityId}`,
        { method: 'DELETE' },
      );
      if (!response.ok) throw new Error('Could not delete proposal');
      const remaining = selectedProperty.salesActivities.filter(
        (activity) => activity.id !== activityId,
      );
      setSelectedProperty({ ...selectedProperty, salesActivities: remaining });
      setProperties((current) =>
        current.map((property) =>
          property.id === selectedProperty.id
            ? { ...property, salesActivities: remaining }
            : property,
        ),
      );
      const nextActivity = remaining[0];
      setPreviewActivityId(nextActivity?.id ?? null);
      setProposalDraftNotes(nextActivity?.notes ?? '');
    } catch (error) {
      console.error(error);
      window.alert('The proposal could not be deleted.');
    }
  }

  async function saveProperty() {
    if (
      !selectedProperty ||
      !editForm
    ) {
      return;
    }

    try {
      setSaving(true);

      const response = await fetch(
        `${API_URL}/properties/${selectedProperty.id}`,
        {
          method: 'PATCH',

          headers: {
            'Content-Type':
              'application/json',
          },

          body: JSON.stringify({
            name:
              editForm.name.trim(),

            leadSource:
              editForm.leadSource ||
              undefined,

            propertyType:
              editForm.propertyType ||
              undefined,

            segment:
              editForm.segment ||
              undefined,

            managementCompanyName:
              editForm.managementCompanyName.trim(),

            addressLine1:
              editForm.addressLine1 ||
              undefined,

            city:
              editForm.city ||
              undefined,

            county:
              editForm.county ||
              undefined,

            state:
              editForm.state ||
              undefined,

            zipCode:
              editForm.zipCode ||
              undefined,

            sharepointFolderUrl:
              editForm
                .sharepointFolderUrl ||
              undefined,

            maintenanceChiefInfo:
              editForm
                .maintenanceChiefInfo ||
              undefined,

            contacts: editContacts.map((contact) => ({
              contactId: contact.contactId,
              firstName: contact.firstName.trim() || undefined,
              lastName: contact.lastName.trim() || undefined,
              role: contact.role,
              email: contact.email.trim(),
              phone: contact.phone.trim() || undefined,
              isPrimary: contact.isPrimary,
            })),
            waterBodies: editWaterBodies.map((waterBody) => ({
              name: waterBody.name.trim(),
              type: waterBody.type,
              size: waterBody.size || undefined,
              active: true,
            })),

          }),
        },
      );

      if (!response.ok) {
        const error =
          await response.json();

        console.error(error);

        window.alert(
          'Could not save property changes.',
        );

        return;
      }

      const updatedProperty =
        await response.json();

      const refreshedResponse =
        await fetch(
          `${API_URL}/properties/${selectedProperty.id}`,
        );

      let completeProperty =
        updatedProperty;

      if (
        refreshedResponse.ok
      ) {
        completeProperty =
          await refreshedResponse.json();
      }

      setSelectedProperty(
        completeProperty,
      );

      setProperties(
        properties.map(
          (property) =>
            property.id ===
            completeProperty.id
              ? completeProperty
              : property,
        ),
      );

      setIsEditing(false);
      setEditForm(null);
      setEditContacts([]);
      setEditWaterBodies([]);
    } catch (error) {
      console.error(error);

      window.alert(
        'Could not save property changes.',
      );
    } finally {
      setSaving(false);
    }
  }

  function navigateToArea(area: AppArea) {
    setActiveArea(area);
    setSelectedProperty(null);
    setShowDeleted(false);
  }

  function renderAppSidebar() {
    const areas: Array<{ id: AppArea; label: string; icon: string }> = [
      { id: 'home', label: 'Home', icon: '⌂' },
      { id: 'commercial', label: 'Commercial CRM', icon: '◎' },
      { id: 'estimates', label: 'Estimates', icon: '$' },
      { id: 'operations', label: 'Operations', icon: '◇' },
      { id: 'finance', label: 'Finance', icon: '▤' },
    ];

    return (
      <aside className="app-sidebar" aria-label="BlueLife areas">
        <div className="sidebar-brand">
          <span>BL</span>
          <div><strong>BlueLife</strong><small>Internal App</small></div>
        </div>
        <nav>
          {areas.map((area) => (
            <button
              type="button"
              className={activeArea === area.id ? 'sidebar-active' : ''}
              key={area.id}
              onClick={() => navigateToArea(area.id)}
            >
              <span aria-hidden="true">{area.icon}</span>
              {area.label}
            </button>
          ))}
        </nav>
        <div className="sidebar-footer">
          <span>BL</span>
          <div><strong>Blue Life Pools</strong><small>Team workspace</small></div>
        </div>
      </aside>
    );
  }

  function renderEstimatesPage() {
    const statuses = Array.from(new Set(estimateOpportunities.map((estimate) => estimate.status)))
      .filter(Boolean)
      .sort();

    return (
      <div className="page app-page">
        {renderAppSidebar()}
        <header className="area-page-header">
          <div>
            <span className="area-eyebrow">REPAIRS & REVENUE</span>
            <h1>Estimates</h1>
            <p>Track repair requests from QuickBooks estimate through approval, completion and invoice.</p>
          </div>
          <div className="area-header-actions">
            <span className="integration-pill"><i /> QuickBooks sync planned</span>
            <button className="primary-button" type="button" onClick={() => setShowRepairRequest(true)}>+ New repair request</button>
          </div>
        </header>

        {showRepairRequest && (
          <div className="modal-backdrop" role="presentation">
            <section className="property-modal repair-request-modal" role="dialog" aria-modal="true" aria-labelledby="repair-request-title">
              <div className="edit-panel-header">
                <div><h2 id="repair-request-title">New repair request</h2><p>Commercial and Operations can send work into the same estimate pipeline.</p></div>
                <button className="modal-close" type="button" aria-label="Close repair request" onClick={() => setShowRepairRequest(false)}>&times;</button>
              </div>
              <form onSubmit={(event) => {
                event.preventDefault();
                setEstimateOpportunities((current) => [{
                  title: repairRequest.property.trim(), propertyLink: repairRequest.property.trim(), estimateNumber: '', value: 0,
                  status: 'Requested', category: repairRequest.category.trim() || 'Uncategorized', contractor: '',
                  opportunityName: repairRequest.description.trim(), createdAt: new Date().toLocaleDateString('en-US'),
                  requestedBy: repairRequest.requestedBy, approvalDate: '', approvedBy: '', estimatedRepairDate: '',
                  technician: '', actualRepairDate: '', invoiceNumber: '', invoiceValue: 0, invoiceDate: '',
                }, ...current]);
                setRepairRequest({ property: '', description: '', category: '', requestedBy: 'Commercial' });
                setEstimateStatus('ALL');
                setShowRepairRequest(false);
              }}>
                <div className="form-grid">
                  <div className="form-field form-field-wide"><label>Property *</label><input required value={repairRequest.property} onChange={(event) => setRepairRequest((current) => ({ ...current, property: event.target.value }))} /></div>
                  <div className="form-field"><label>Requested by *</label><select value={repairRequest.requestedBy} onChange={(event) => setRepairRequest((current) => ({ ...current, requestedBy: event.target.value }))}><option>Commercial</option><option>Technician</option></select></div>
                  <div className="form-field"><label>Category</label><input placeholder="Pump, Filter, Leak..." value={repairRequest.category} onChange={(event) => setRepairRequest((current) => ({ ...current, category: event.target.value }))} /></div>
                  <div className="form-field form-field-wide"><label>Repair needed *</label><textarea required rows={5} value={repairRequest.description} onChange={(event) => setRepairRequest((current) => ({ ...current, description: event.target.value }))} /></div>
                </div>
                <div className="modal-actions"><button className="secondary-button" type="button" onClick={() => setShowRepairRequest(false)}>Cancel</button><button className="primary-button" type="submit" disabled={!repairRequest.property.trim() || !repairRequest.description.trim()}>Send to Estimates</button></div>
              </form>
            </section>
          </div>
        )}

        <section className="estimate-kpis">
          <article><span>Total opportunities</span><strong>{estimateStats.total.toLocaleString()}</strong><small>Imported from Teams</small></article>
          <article><span>Pending estimates</span><strong>{estimateStats.pending.toLocaleString()}</strong><small>Require customer decision</small></article>
          <article><span>Accepted</span><strong>{estimateStats.accepted.toLocaleString()}</strong><small>Ready for operations</small></article>
          <article><span>Open pipeline</span><strong>${estimateStats.pipelineValue.toLocaleString('en-US')}</strong><small>Pending + accepted value</small></article>
        </section>

        <section className="estimate-workflow">
          {[
            ['1', 'Request', 'Commercial or Operations'],
            ['2', 'Estimate', 'Created in QuickBooks'],
            ['3', 'Approval', 'Customer decision'],
            ['4', 'Repair', 'Technician & schedule'],
            ['5', 'Invoice', 'Finance closes cycle'],
          ].map(([number, title, subtitle]) => (
            <div key={number}><span>{number}</span><div><strong>{title}</strong><small>{subtitle}</small></div></div>
          ))}
        </section>

        <section className="estimates-table-card">
          <div className="section-header estimate-table-header">
            <div><h2>Repair opportunities</h2><p>{filteredEstimates.length.toLocaleString()} records in the current view.</p></div>
            <div className="estimate-filters">
              <input
                className="search"
                placeholder="Search property, estimate, category..."
                value={estimateSearch}
                onChange={(event) => setEstimateSearch(event.target.value)}
              />
              <select value={estimateStatus} onChange={(event) => setEstimateStatus(event.target.value)}>
                <option value="ALL">All statuses</option>
                {statuses.map((status) => <option value={status} key={status}>{status}</option>)}
              </select>
            </div>
          </div>
          {estimatesLoading ? (
            <p className="estimate-loading">Loading estimate history...</p>
          ) : (
            <div className="table-container estimates-table-wrap">
              <table className="estimates-table">
                <thead><tr><th>Property / Repair</th><th>Estimate</th><th>Category</th><th>Requested by</th><th>Status</th><th>Value</th><th>Next step</th></tr></thead>
                <tbody>
                  {filteredEstimates.slice(0, 250).map((estimate, index) => (
                    <tr key={`${estimate.estimateNumber}-${estimate.title}-${index}`}>
                      <td><strong>{estimate.title || 'Unnamed property'}</strong><small>{estimate.opportunityName || 'Repair details pending'}</small></td>
                      <td><strong>{estimate.estimateNumber ? `#${estimate.estimateNumber}` : 'Not created'}</strong><small>{estimate.createdAt || 'No date'}</small></td>
                      <td><span className="estimate-category">{estimate.category}</span></td>
                      <td>{estimate.requestedBy}</td>
                      <td><span className={`estimate-status estimate-${estimate.status.toLowerCase().replaceAll(' ', '-')}`}>{estimate.status}</span></td>
                      <td><strong>{estimate.value ? `$${estimate.value.toLocaleString('en-US')}` : '—'}</strong></td>
                      <td>{estimate.status === 'Requested' ? 'Create in QuickBooks' : estimate.status === 'Pending' ? 'Follow up approval' : estimate.status === 'Accepted' ? 'Schedule repair' : estimate.invoiceNumber ? `Invoice #${estimate.invoiceNumber}` : 'Review record'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {filteredEstimates.length > 250 && <p className="table-limit-note">Showing the first 250 results. Use search or status filters to narrow the view.</p>}
            </div>
          )}
        </section>
      </div>
    );
  }

  function renderAreaLanding(area: Exclude<AppArea, 'commercial' | 'estimates'>) {
    const content = {
      home: ['BlueLife Workspace', 'One internal system for commercial, repairs, operations and finance.', ['Commercial CRM', 'Estimates', 'Operations', 'Finance']],
      operations: ['Operations', 'Coordinate approved repairs, technicians, scheduled dates and completion.', ['Repair schedule', 'Technician workload', 'Completed work', 'Service alerts']],
      finance: ['Finance', 'Follow converted estimates through invoicing and payment reconciliation.', ['Ready to invoice', 'Invoices issued', 'Revenue', 'QuickBooks status']],
    }[area];

    return (
      <div className="page app-page area-landing-page">
        {renderAppSidebar()}
        <header className="area-page-header"><div><span className="area-eyebrow">BLUE LIFE INTERNAL APP</span><h1>{content[0]}</h1><p>{content[1]}</p></div></header>
        <section className="area-landing-grid">
          {(content[2] as string[]).map((item, index) => (
            <button type="button" key={item} onClick={() => area === 'home' && navigateToArea((['commercial', 'estimates', 'operations', 'finance'] as AppArea[])[index])}>
              <span>{String(index + 1).padStart(2, '0')}</span><strong>{item}</strong><small>{area === 'home' ? 'Open area →' : 'Module foundation ready'}</small>
            </button>
          ))}
        </section>
      </div>
    );
  }

  function renderProposalReminderCenter() {
    const demoReminderCount = showDemoReminder && demoReminder ? 1 : 0;
    const totalReminderCount = proposalReminders.length + demoReminderCount;

    return (
      <div className="proposal-reminder-center">
        <button
          className="proposal-reminder-button"
          type="button"
          aria-label={`${totalReminderCount} proposal follow-up reminders`}
          aria-expanded={showProposalReminders}
          onClick={() => setShowProposalReminders((current) => !current)}
        >
          <span aria-hidden="true">&#128276;</span>
          {totalReminderCount > 0 && (
            <strong>{totalReminderCount > 99 ? '99+' : totalReminderCount}</strong>
          )}
        </button>

        {showProposalReminders && (
          <aside className="proposal-reminder-panel" aria-label="Proposal follow-up reminders">
            <div className="proposal-reminder-header">
              <div>
                <h2>Proposal follow-ups</h2>
                <p>Sent over 30 days ago with no status response.</p>
              </div>
              <button
                type="button"
                aria-label="Close reminders"
                onClick={() => setShowProposalReminders(false)}
              >
                &times;
              </button>
            </div>

            {totalReminderCount === 0 ? (
              <div className="proposal-reminder-empty">
                <span aria-hidden="true">&#10003;</span>
                <strong>You're up to date</strong>
                <p>There are no overdue proposal follow-ups.</p>
              </div>
            ) : (
              <div className="proposal-reminder-list">
                {showDemoReminder && demoReminder && (() => {
                  const { activity, property, contact } = demoReminder;
                  const contactName = [contact?.contact.firstName, contact?.contact.lastName]
                    .filter(Boolean)
                    .join(' ');

                  return (
                    <article className="proposal-reminder-item proposal-reminder-demo" key={`demo-${activity.id}`}>
                      <button
                        className="proposal-reminder-property"
                        type="button"
                        onClick={() => {
                          setShowProposalReminders(false);
                          void openProperty(property.id, activity.id);
                        }}
                      >
                        <span>Demo · 31 days without response</span>
                        <strong>{property.name}</strong>
                        <small>{contactName || 'Primary contact'} · Test follow-up</small>
                      </button>
                      <button
                        className="proposal-reminder-demo-dismiss"
                        type="button"
                        aria-label="Remove demo notification"
                        onClick={() => setShowDemoReminder(false)}
                      >
                        &times;
                      </button>
                    </article>
                  );
                })()}
                {proposalReminders.map(({ activity, property, contact }) => {
                  const sentDate = new Date(activity.sentAt as string);
                  const daysWaiting = Math.floor((reminderReferenceTime - sentDate.getTime()) / (24 * 60 * 60 * 1000));
                  const email = contact?.contact.email;
                  const contactName = [contact?.contact.firstName, contact?.contact.lastName]
                    .filter(Boolean)
                    .join(' ');

                  return (
                    <article className="proposal-reminder-item" key={activity.id}>
                      <button
                        className="proposal-reminder-property"
                        type="button"
                        onClick={() => {
                          setShowProposalReminders(false);
                          void openProperty(property.id, activity.id);
                        }}
                      >
                        <span>{daysWaiting} days without response</span>
                        <strong>{property.name}</strong>
                        <small>
                          {contactName || 'Primary contact'} · Sent {sentDate.toLocaleDateString('en-US')}
                        </small>
                      </button>
                      {email ? (
                        <a
                          href={`mailto:${email}?subject=${encodeURIComponent(`Follow-up: Blue Life Pools Proposal - ${property.name}`)}`}
                        >
                          Follow up
                        </a>
                      ) : (
                        <span className="proposal-reminder-no-email">No email</span>
                      )}
                    </article>
                  );
                })}
              </div>
            )}

            <p className="proposal-reminder-note">
              A reminder disappears when the proposal is marked Approved or Rejected.
            </p>
          </aside>
        )}
      </div>
    );
  }

  if (loading) {
    return (
      <div className="page">
        <p>
          Loading properties...
        </p>
      </div>
    );
  }

  if (activeArea === 'estimates') return renderEstimatesPage();
  if (activeArea === 'home' || activeArea === 'operations' || activeArea === 'finance') {
    return renderAreaLanding(activeArea);
  }

  if (
    selectedProperty
  ) {
    const normalizedPropertyName = selectedProperty.name.trim().toLowerCase();
    const propertyEstimates = estimateOpportunities.filter((estimate) => {
      const estimateProperty = estimate.title.trim().toLowerCase();
      if (!estimateProperty) return false;
      return estimateProperty === normalizedPropertyName ||
        estimateProperty.includes(normalizedPropertyName) ||
        normalizedPropertyName.includes(estimateProperty);
    });
    const approvedProposals = selectedProperty.salesActivities.filter((activity) => activity.status === 'APPROVED').length;
    return (
      <div className="page">
        <div className="property-detail-nav">
        <button
          className="back-button"
          onClick={() => {
            setSelectedProperty(
              null,
            );

            setIsEditing(false);
            setEditForm(null);
          }}
        >
          ← Back to Properties
        </button>
          {renderProposalReminderCenter()}
        </div>

        <header className="property-header">
          <div>
            <h1>
              {selectedProperty.name}
            </h1>

            <p>
              {selectedProperty.city ??
                '-'}

              {selectedProperty.state
                ? `, ${selectedProperty.state}`
                : ''}
            </p>
          </div>

          <div className="property-header-actions">
            {!isEditing && (
              <button
                className="danger-button"
                onClick={moveSelectedPropertyToTrash}
                disabled={saving}
              >
                Delete Property
              </button>
            )}

          </div>
        </header>

        <nav className="property-tabs" aria-label="Property workspace">
          {([
            ['overview', 'Overview'],
            ['commercial', 'Commercial'],
            ['estimates', `Estimates (${propertyEstimates.length})`],
            ['contracts', 'Contracts'],
          ] as Array<[PropertyTab, string]>).map(([tab, label]) => (
            <button type="button" className={propertyTab === tab ? 'property-tab-active' : ''} key={tab} onClick={() => setPropertyTab(tab)}>
              {label}
            </button>
          ))}
        </nav>

        {propertyTab === 'overview' && (
          <section className="property-command-center">
            <div className="property-command-heading">
              <h2>Property Journey</h2>
            </div>
            <div className="property-processes">
              <div>
                <div className="process-title"><strong>Proposal journey</strong><span>{approvedProposals ? 'Contract stage' : 'Commercial stage'}</span></div>
                <div className="process-track">
                  <span className="process-complete">Property created</span>
                  <span className={selectedProperty.salesActivities.length ? 'process-complete' : ''}>Proposal</span>
                  <span className={approvedProposals ? 'process-complete' : ''}>Contract</span>
                  <span>Service start</span>
                </div>
              </div>
            </div>
          </section>
        )}

        {(propertyTab === 'overview' || propertyTab === 'commercial') && (propertyTab === 'overview' && isEditing &&
        editForm ? (
          <section className="edit-panel property-overview-card">
            <div className="edit-panel-header">
              <div>
                <h2>
                  Property information
                </h2>

                <p>
                  Edit the general details in one place.
                </p>
              </div>

              <div className="edit-actions">
                <button
                  className="secondary-button"
                  onClick={
                    cancelEditing
                  }
                  disabled={saving}
                >
                  Cancel
                </button>

                <button
                  className="primary-button"
                  onClick={
                    saveProperty
                  }
                  disabled={
                    saving ||
                    !editContactsAreValid ||
                    !editWaterBodiesAreValid
                  }
                >
                  {saving
                    ? 'Saving...'
                    : 'Save Changes'}
                </button>
              </div>
            </div>

            <div className="form-grid">
              <div className="form-field form-field-wide">
                <label>
                  Property Name
                </label>

                <input
                  value={
                    editForm.name
                  }
                  onChange={(
                    event,
                  ) =>
                    updateField(
                      'name',
                      event.target
                        .value,
                    )
                  }
                />
              </div>

              <div className="form-field">
                <label>
                  Property Type
                </label>

                <select
                  value={
                    editForm.propertyType
                  }
                  onChange={(
                    event,
                  ) =>
                    updateField(
                      'propertyType',
                      event.target
                        .value,
                    )
                  }
                >
                  <option value="">
                    Select type
                  </option>

                  <option value="COMMERCIAL">
                    Commercial
                  </option>

                  <option value="RESIDENTIAL">
                    Residential
                  </option>
                </select>
              </div>

              <div className="form-field">
                <label>
                  Segment
                </label>

                <select
                  value={
                    editForm.segment
                  }
                  onChange={(
                    event,
                  ) =>
                    updateField(
                      'segment',
                      event.target
                        .value,
                    )
                  }
                >
                  <option value="">
                    Select segment
                  </option>

                  <option value="MULTIFAMILY">
                    Multifamily
                  </option>

                  <option value="HOA">
                    HOA
                  </option>

                  <option value="HOTEL">
                    Hotel
                  </option>

                  <option value="SINGLE_FAMILY">
                    Single Family
                  </option>
                </select>
              </div>

              <div className="form-field">
                <label>
                  Management Company
                </label>

                <input
                  value={editForm.managementCompanyName}
                  onChange={(event) =>
                    updateField(
                      'managementCompanyName',
                      event.target.value,
                    )
                  }
                  placeholder="Example: ABC Property Management"
                />
              </div>

              <div className="form-field">
                <label>
                  Lead Source
                </label>

                <select
                  value={
                    editForm.leadSource
                  }
                  onChange={(
                    event,
                  ) =>
                    updateField(
                      'leadSource',
                      event.target
                        .value,
                    )
                  }
                >
                  <option value="">
                    Select source
                  </option>

                  <option value="ROUTE">
                    Route
                  </option>

                  <option value="REFERRAL">
                    Referral
                  </option>
                </select>
              </div>

              <div className="form-field form-field-wide">
                <label>
                  Address
                </label>

                <input
                  value={
                    editForm.addressLine1
                  }
                  onChange={(
                    event,
                  ) =>
                    updateField(
                      'addressLine1',
                      event.target
                        .value,
                    )
                  }
                />
              </div>

              <div className="form-field">
                <label>
                  City
                </label>

                <input
                  value={
                    editForm.city
                  }
                  onChange={(
                    event,
                  ) =>
                    updateField(
                      'city',
                      event.target
                        .value,
                    )
                  }
                />
              </div>

              <div className="form-field">
                <label>
                  County
                </label>

                <input
                  value={
                    editForm.county
                  }
                  onChange={(
                    event,
                  ) =>
                    updateField(
                      'county',
                      event.target
                        .value,
                    )
                  }
                />
              </div>

              <div className="form-field">
                <label>
                  State
                </label>

                <input
                  value={
                    editForm.state
                  }
                  onChange={(
                    event,
                  ) =>
                    updateField(
                      'state',
                      event.target
                        .value,
                    )
                  }
                />
              </div>

              <div className="form-field">
                <label>
                  ZIP Code
                </label>

                <input
                  value={
                    editForm.zipCode
                  }
                  onChange={(
                    event,
                  ) =>
                    updateField(
                      'zipCode',
                      event.target
                        .value,
                    )
                  }
                />
              </div>

              <div className="form-field form-field-wide">
                <label>
                  SharePoint Folder URL
                </label>

                <input
                  value={
                    editForm.sharepointFolderUrl
                  }
                  onChange={(
                    event,
                  ) =>
                    updateField(
                      'sharepointFolderUrl',
                      event.target
                        .value,
                    )
                  }
                />
              </div>

              <div className="form-section-title form-field-wide">
                <div>
                  <h3>Contacts</h3>
                  <p>Edit existing contacts or add a new one.</p>
                </div>
                <button
                  className="secondary-button"
                  type="button"
                  onClick={addEditContact}
                >
                  + Add contact
                </button>
              </div>

              <div className="contacts-editor form-field-wide">
                {editContacts.map((contact, index) => (
                  <div
                    className="contact-editor"
                    key={contact.contactId ?? `new-${index}`}
                  >
                    <div className="contact-editor-header">
                      <strong>Contact {index + 1}</strong>
                      {editContacts.length > 1 && (
                        <button
                          className="delete-button"
                          type="button"
                          onClick={() => removeEditContact(index)}
                        >
                          Remove
                        </button>
                      )}
                    </div>

                    <div className="form-grid contact-fields">
                      <div className="form-field">
                        <label>Role *</label>
                        <select
                          value={contact.role}
                          onChange={(event) =>
                            updateEditContact(index, 'role', event.target.value)
                          }
                        >
                          <option value="">Select role</option>
                          <option value="PROPERTY_MANAGER">Property Manager</option>
                          <option value="REGIONAL_MANAGER">Regional Manager</option>
                          <option value="MAINTENANCE_CHIEF">Maintenance Chief</option>
                          <option value="OTHER">Other</option>
                        </select>
                      </div>

                      <div className="form-field">
                        <label>Email *</label>
                        <input
                          type="email"
                          value={contact.email}
                          onChange={(event) =>
                            updateEditContact(index, 'email', event.target.value)
                          }
                        />
                      </div>

                      <div className="form-field">
                        <label>First Name (optional)</label>
                        <input
                          value={contact.firstName}
                          onChange={(event) =>
                            updateEditContact(index, 'firstName', event.target.value)
                          }
                        />
                      </div>

                      <div className="form-field">
                        <label>Last Name (optional)</label>
                        <input
                          value={contact.lastName}
                          onChange={(event) =>
                            updateEditContact(index, 'lastName', event.target.value)
                          }
                        />
                      </div>

                      <div className="form-field">
                        <label>Phone (optional)</label>
                        <input
                          type="tel"
                          value={contact.phone}
                          onChange={(event) =>
                            updateEditContact(index, 'phone', event.target.value)
                          }
                        />
                      </div>

                      <label className="primary-contact-check">
                        <input
                          type="checkbox"
                          checked={contact.isPrimary}
                          onChange={() =>
                            updateEditContact(index, 'isPrimary', true)
                          }
                        />
                        Primary contact
                      </label>
                    </div>
                  </div>
                ))}

                {!editContacts.some(
                  (contact) => contact.role === 'PROPERTY_MANAGER',
                ) && (
                  <span className="field-error">
                    Add at least one Property Manager.
                  </span>
                )}
                {new Set(editContactEmails).size !==
                  editContactEmails.length && (
                  <span className="field-error">
                    Contact email addresses cannot be repeated.
                  </span>
                )}
              </div>

              <WaterBodiesEditor
                bodies={editWaterBodies}
                idPrefix="edit-water-body"
                onAdd={() => addWaterBody('edit')}
                onUpdate={(index, field, value) =>
                  updateWaterBody('edit', index, field, value)
                }
                onRemove={(index) => removeWaterBody('edit', index)}
              />

            </div>
          </section>
        ) : (
          <div className="property-grid">
            <section className={`detail-card detail-card-wide property-overview-card ${propertyTab !== 'overview' ? 'tab-panel-hidden' : ''}`}>
              <div className="overview-header">
                <div>
                  <h2>Property information</h2>
                  <p>General details, location and key contacts.</p>
                </div>

                <button
                  className="primary-button"
                  onClick={startEditing}
                >
                  Edit information
                </button>
              </div>

              <div className="overview-grid">
            <div className="detail-section">
              <h2>
                General Information
              </h2>

              <div className="detail-list">
                <div>
                  <span>
                    Property Type
                  </span>

                  <strong>
                    {formatLabel(
                      selectedProperty
                        .propertyType,
                    )}
                  </strong>
                </div>

                <div>
                  <span>
                    Segment
                  </span>

                  <strong>
                    {formatLabel(
                      selectedProperty
                        .segment,
                    )}
                  </strong>
                </div>

                <div>
                  <span>
                    Lead Source
                  </span>

                  <strong>
                    {formatLabel(
                      selectedProperty
                        .leadSource,
                    )}
                  </strong>
                </div>

                <div>
                  <span>
                    Management Company
                  </span>

                  <strong>
                    {selectedProperty
                      .managementCompany
                      ?.name ?? '-'}
                  </strong>
                </div>
              </div>
            </div>

            <div className="detail-section">
              <h2>
                Address
              </h2>

              <div className="detail-list">
                <div>
                  <span>
                    Address
                  </span>

                  <strong>
                    {selectedProperty
                      .addressLine1 ??
                      '-'}
                  </strong>
                </div>

                <div>
                  <span>
                    City
                  </span>

                  <strong>
                    {selectedProperty
                      .city ?? '-'}
                  </strong>
                </div>

                <div>
                  <span>
                    County
                  </span>

                  <strong>
                    {selectedProperty
                      .county ?? '-'}
                  </strong>
                </div>

                <div>
                  <span>
                    State / ZIP
                  </span>

                  <strong>
                    {selectedProperty
                      .state ?? '-'}{' '}
                    {selectedProperty
                      .zipCode ?? ''}
                  </strong>
                </div>
              </div>
            </div>

            <div className="detail-section detail-section-wide">
              <h2>
                Contacts
              </h2>

              {selectedProperty
                .contacts.length ===
              0 ? (
                <p className="empty-text">
                  No contacts
                  registered.
                </p>
              ) : (
                <div className="contact-grid">
                  {selectedProperty
                    .contacts.map(
                      (relation) => (
                        <div
                          className="contact-item"
                          key={
                            relation.id
                          }
                        >
                          <div>
                            <strong>
                              {relation
                                .contact
                                .firstName ??
                                'Unnamed Contact'}
                            </strong>

                            <span>
                              {formatLabel(
                                relation.role,
                              )}
                            </span>
                          </div>

                          <p>
                            {relation
                              .contact
                              .email ??
                              '-'}
                          </p>

                          <p>
                            {relation
                              .contact
                              .phone ??
                              '-'}
                          </p>
                        </div>
                      ),
                    )}
                </div>
              )}
            </div>

            <div className="detail-section">
              <h2>
                Water Bodies
              </h2>

              {selectedProperty
                .waterBodies.length ===
              0 ? (
                <p className="empty-text">
                  No water bodies
                  registered.
                </p>
              ) : (
                <div className="water-body-details">
                  <strong className="water-body-total">
                    {selectedProperty.waterBodies.length} total
                  </strong>
                  <div className="tag-list">
                    {selectedProperty
                      .waterBodies.map(
                      (
                        waterBody,
                      ) => (
                        <span
                          className="tag"
                          key={
                            waterBody.id
                          }
                        >
                          {formatLabel(waterBody.type)}: {waterBody.name}
                          {waterBody.size
                            ? ` · ${formatLabel(waterBody.size)}`
                            : ''}
                        </span>
                      ),
                    )}
                  </div>
                </div>
              )}
            </div>

            <div className="detail-section">
              <h2>
                SharePoint
              </h2>

              {selectedProperty
                .sharepointFolderUrl ? (
                <a
                  className="sharepoint-link"
                  href={
                    selectedProperty
                      .sharepointFolderUrl
                  }
                  target="_blank"
                  rel="noreferrer"
                >
                  Open Property Folder
                </a>
              ) : (
                <div className="sharepoint-pending">
                  <p className="empty-text">
                    The SharePoint folder is not available yet.
                  </p>
                  <button
                    className="secondary-button"
                    onClick={retrySharePointFolder}
                    disabled={creatingSharePointFolder}
                  >
                    {creatingSharePointFolder
                      ? 'Creating folder...'
                      : 'Retry SharePoint'}
                  </button>
                </div>
              )}
            </div>

              </div>
            </section>

            <section
              id="sales-activity"
              className={`detail-card detail-card-wide ${propertyTab !== 'commercial' ? 'tab-panel-hidden' : ''} ${focusedReminderActivityId ? 'sales-activity-follow-up' : ''}`}
            >
              <div className="card-header">
                <h2>Sales Activity</h2>
                <button
                  className="primary-button"
                  onClick={openProposal}
                >
                  Generate Proposal
                </button>
              </div>

              {focusedReminderActivityId && (() => {
                const reminderActivity = selectedProperty.salesActivities.find(
                  (activity) => activity.id === focusedReminderActivityId,
                );
                if (!reminderActivity) return null;
                const isDemoFollowUp = showDemoReminder && demoReminder?.activity.id === reminderActivity.id;
                const followUpSentAt = isDemoFollowUp
                  ? new Date(reminderReferenceTime - 31 * 24 * 60 * 60 * 1000)
                  : reminderActivity.sentAt
                    ? new Date(reminderActivity.sentAt)
                    : null;
                if (!followUpSentAt) return null;
                const daysWaiting = Math.floor(
                  (reminderReferenceTime - followUpSentAt.getTime()) /
                  (24 * 60 * 60 * 1000),
                );

                return (
                  <div className="sales-follow-up-banner">
                    <div>
                      <strong>{isDemoFollowUp ? 'Demo: this proposal needs follow-up' : 'This proposal needs follow-up'}</strong>
                      <span>
                        Sent {followUpSentAt.toLocaleDateString('en-US')} · {daysWaiting} days without a recorded response
                      </span>
                    </div>
                    <button type="button" onClick={() => setFocusedReminderActivityId(null)}>
                      Dismiss
                    </button>
                  </div>
                );
              })()}

              {selectedProperty
                .salesActivities
                .length === 0 ? (
                <p className="empty-text">
                  No sales activity
                  registered.
                </p>
              ) : (
                <div className="sales-activity-workspace">
                  <div className="proposal-board" aria-label="Proposal status board">
                    {proposalBoardStatuses.map((status) => {
                      const activities = selectedProperty.salesActivities.filter(
                        (activity) => (activity.status ?? 'CREATED') === status,
                      );

                      return (
                        <section className="proposal-board-column" key={status}>
                          <div className="proposal-board-heading">
                            <span className={`proposal-board-dot status-${status.toLowerCase()}`} />
                            <h3>{formatLabel(status)}</h3>
                            <strong>{activities.length}</strong>
                          </div>
                          <div className="proposal-board-cards">
                            {activities.length === 0 && (
                              <p className="proposal-board-empty">No proposals</p>
                            )}
                    {activities.map(
                      (activity) => (
                        <button
                          type="button"
                          className={`proposal-board-card ${
                            (previewActivityId ?? selectedProperty.salesActivities[0]?.id) === activity.id
                              ? 'activity-selected'
                              : ''
                          } ${focusedReminderActivityId === activity.id ? 'proposal-follow-up-card' : ''}`}
                          key={
                            activity.id
                          }
                          onClick={() => {
                            setPreviewActivityId(activity.id);
                            setProposalDraftNotes(activity.notes ?? '');
                            if (focusedReminderActivityId !== activity.id) {
                              setFocusedReminderActivityId(null);
                            }
                          }}
                        >
                          <span>{formatLabel(activity.type)}</span>
                          <strong>{selectedProperty.name}</strong>

                          <small>
                            Created {new Date(activity.occurredAt).toLocaleDateString('en-US')}
                            {activity.sentAt
                              ? ` · Sent ${new Date(activity.sentAt).toLocaleDateString('en-US')}`
                              : ''}
                            {activity.approvedAt
                              ? ` · Approved ${new Date(activity.approvedAt).toLocaleDateString('en-US')}`
                              : ''}
                            {activity.rejectedAt
                              ? ` · Rejected ${new Date(activity.rejectedAt).toLocaleDateString('en-US')}`
                              : ''}
                          </small>
                        </button>
                      ),
                    )}
                          </div>
                        </section>
                      );
                    })}
                  </div>

                  {(() => {
                    const activity =
                      selectedProperty.salesActivities.find(
                        (item) => item.id === previewActivityId,
                      ) ?? selectedProperty.salesActivities[0];
                    const primaryContact =
                      selectedProperty.contacts.find((contact) => contact.isPrimary) ??
                      selectedProperty.contacts[0];
                    if (!activity) return null;
                    return (
                      <aside className="sales-email-preview" aria-label="Proposal email preview">
                        <div className="email-preview-header">
                          <span>Email preview</span>
                          <strong>Blue Life Pools</strong>
                        </div>
                        <div className="email-preview-meta">
                          <span><b>To:</b> {primaryContact?.contact.email ?? 'No primary contact email'}</span>
                          <span><b>Subject:</b> Blue Life Pools Proposal - {selectedProperty.name}</span>
                          <span><b>Created:</b> {new Date(activity.occurredAt).toLocaleString('en-US')}</span>
                          <span><b>Sent:</b> {activity.sentAt ? new Date(activity.sentAt).toLocaleString('en-US') : 'Not sent yet'}</span>
                          <span><b>Approved:</b> {activity.approvedAt ? new Date(activity.approvedAt).toLocaleString('en-US') : 'Not approved yet'}</span>
                          <span><b>Rejected:</b> {activity.rejectedAt ? new Date(activity.rejectedAt).toLocaleString('en-US') : 'Not rejected yet'}</span>
                          <span className={`proposal-status status-${(activity.status ?? 'CREATED').toLowerCase()}`}>
                            {formatLabel(activity.status ?? 'CREATED')}
                          </span>
                        </div>
                        <textarea
                          className="email-preview-editor"
                          aria-label="Editable proposal email text"
                          disabled={activity.status === 'APPROVED' || activity.status === 'REJECTED'}
                          value={
                            (previewActivityId === activity.id
                              ? proposalDraftNotes
                              : activity.notes) ?? ''
                          }
                          onChange={(event) => setProposalDraftNotes(event.target.value)}
                          onBlur={() => {
                            const notes = previewActivityId === activity.id
                              ? proposalDraftNotes
                              : activity.notes ?? '';
                            if (notes !== (activity.notes ?? '')) {
                              void saveProposalText(activity.id, notes);
                            }
                          }}
                        />
                        <div className="email-preview-actions">
                          <button
                            className="primary-button"
                            type="button"
                            disabled={!primaryContact?.contact.email || !(previewActivityId === activity.id ? proposalDraftNotes : activity.notes)}
                            onClick={async () => {
                              const email = primaryContact?.contact.email;
                              const notes = previewActivityId === activity.id
                                ? proposalDraftNotes
                                : activity.notes ?? '';
                              if (!email || !notes) return;
                              const saved = await saveProposalText(activity.id, notes);
                              if (!saved) return;
                              const updated = await updateProposalStatus(activity.id, 'SENT');
                              if (!updated) return;
                              const subject = `Blue Life Pools Proposal - ${selectedProperty.name}`;
                              window.location.href = `mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(notes)}`;
                            }}
                          >
                            {activity.status === 'SENT' || activity.status === 'APPROVED'
                              ? 'Send Again'
                              : 'Send Proposal'}
                          </button>
                          <label className="status-control">
                            <select
                              value={activity.status === 'APPROVED' || activity.status === 'REJECTED' ? activity.status : ''}
                              onChange={(event) =>
                                event.target.value && updateProposalStatus(
                                  activity.id,
                                  event.target.value as 'APPROVED' | 'REJECTED',
                                )
                              }
                            >
                              <option value="">Set status...</option>
                              <option value="APPROVED">Approved</option>
                              <option value="REJECTED">Rejected</option>
                            </select>
                          </label>
                          <button
                            className="delete-proposal-icon delete-proposal-bottom"
                            type="button"
                            aria-label="Delete proposal"
                            title="Delete proposal"
                            onClick={() => deleteProposal(activity.id)}
                          >
                            🗑
                          </button>
                        </div>
                      </aside>
                    );
                  })()}
                </div>
              )}
            </section>
          </div>
        ))}

        {propertyTab === 'estimates' && (
          <section className="detail-card property-tab-panel">
            <div className="card-header"><div><h2>Estimates & repairs</h2><p>QuickBooks estimates associated with this property.</p></div><button className="primary-button" type="button" onClick={() => { setRepairRequest((current) => ({ ...current, property: selectedProperty.name, requestedBy: 'Commercial' })); setShowRepairRequest(true); }}>+ Request repair</button></div>
            {propertyEstimates.length === 0 ? <div className="property-tab-empty"><strong>No estimates found</strong><p>Create a repair request to start the QuickBooks estimate workflow.</p></div> : (
              <div className="estimate-journey-list">
                {propertyEstimates.map((estimate, index) => {
                  const estimateCreated = Boolean(estimate.estimateNumber);
                  const customerApproved = Boolean(estimate.approvalDate) || ['Accepted', 'Converted', 'Repair Done'].includes(estimate.status);
                  const repairStarted = Boolean(estimate.estimatedRepairDate || estimate.actualRepairDate) || ['Converted', 'Repair Done'].includes(estimate.status);
                  const invoiced = Boolean(estimate.invoiceNumber || estimate.invoiceDate);
                  const nextAction = !estimateCreated
                    ? 'Create estimate in QuickBooks'
                    : !customerApproved
                      ? 'Send or follow up with customer'
                      : !repairStarted
                        ? 'Assign technician and schedule repair'
                        : !invoiced
                          ? 'Complete repair and create invoice'
                          : 'Workflow complete';

                  return (
                    <article className="estimate-journey-card" key={`${estimate.estimateNumber}-${index}`}>
                      <div className="estimate-journey-header">
                        <div><span>{estimate.estimateNumber ? `ESTIMATE #${estimate.estimateNumber}` : 'NEW REQUEST'}</span><h3>{estimate.opportunityName || estimate.category}</h3><small>{estimate.category} · Requested by {estimate.requestedBy}</small></div>
                        <div><span className={`estimate-status estimate-${estimate.status.toLowerCase().replaceAll(' ', '-')}`}>{estimate.status}</span><strong>{estimate.value ? `$${estimate.value.toLocaleString('en-US')}` : 'Value pending'}</strong></div>
                      </div>
                      <div className="estimate-process-track">
                        <span className="process-complete">Requested</span>
                        <span className={estimateCreated ? 'process-complete' : ''}>QuickBooks estimate</span>
                        <span className={customerApproved ? 'process-complete' : ''}>Customer approval</span>
                        <span className={repairStarted ? 'process-complete' : ''}>Repair</span>
                        <span className={invoiced ? 'process-complete' : ''}>Invoice</span>
                      </div>
                      <div className="estimate-next-action"><span>Next action</span><strong>{nextAction}</strong></div>
                    </article>
                  );
                })}
              </div>
            )}
          </section>
        )}

        {propertyTab === 'contracts' && (
          <section className="detail-card property-tab-panel">
            <div className="card-header"><div><h2>Contracts</h2><p>Maintenance agreements created after an approved commercial proposal.</p></div><button className="secondary-button" type="button">+ Add contract</button></div>
            {approvedProposals === 0 ? <div className="property-tab-empty"><strong>No active maintenance contract</strong><p>When a maintenance proposal is approved, its contract stage will appear here.</p></div> : <div className="contract-summary"><div><span>Status</span><strong>Ready for contract</strong></div><div><span>Approved proposals</span><strong>{approvedProposals}</strong></div><div><span>SharePoint</span><strong>{selectedProperty.sharepointFolderUrl ? 'Folder ready' : 'Folder pending'}</strong></div></div>}
          </section>
        )}

        {showRepairRequest && (
          <div className="modal-backdrop" role="presentation">
            <section className="property-modal repair-request-modal" role="dialog" aria-modal="true" aria-labelledby="property-repair-request-title">
              <div className="edit-panel-header"><div><h2 id="property-repair-request-title">New repair request</h2><p>This request will enter the estimate workflow for {selectedProperty.name}.</p></div><button className="modal-close" type="button" onClick={() => setShowRepairRequest(false)}>&times;</button></div>
              <form onSubmit={(event) => { event.preventDefault(); setEstimateOpportunities((current) => [{ title: selectedProperty.name, propertyLink: selectedProperty.name, estimateNumber: '', value: 0, status: 'Requested', category: repairRequest.category.trim() || 'Uncategorized', contractor: '', opportunityName: repairRequest.description.trim(), createdAt: new Date().toLocaleDateString('en-US'), requestedBy: repairRequest.requestedBy, approvalDate: '', approvedBy: '', estimatedRepairDate: '', technician: '', actualRepairDate: '', invoiceNumber: '', invoiceValue: 0, invoiceDate: '' }, ...current]); setRepairRequest({ property: '', description: '', category: '', requestedBy: 'Commercial' }); setShowRepairRequest(false); }}><div className="form-grid"><div className="form-field"><label>Requested by</label><select value={repairRequest.requestedBy} onChange={(event) => setRepairRequest((current) => ({ ...current, requestedBy: event.target.value }))}><option>Commercial</option><option>Technician</option></select></div><div className="form-field"><label>Category</label><input value={repairRequest.category} onChange={(event) => setRepairRequest((current) => ({ ...current, category: event.target.value }))} /></div><div className="form-field form-field-wide"><label>Repair needed *</label><textarea required rows={5} value={repairRequest.description} onChange={(event) => setRepairRequest((current) => ({ ...current, description: event.target.value }))} /></div></div><div className="modal-actions"><button className="secondary-button" type="button" onClick={() => setShowRepairRequest(false)}>Cancel</button><button className="primary-button" type="submit" disabled={!repairRequest.description.trim()}>Send to Estimates</button></div></form>
            </section>
          </div>
        )}

        {showProposal && (
          <div className="modal-backdrop" role="presentation">
            <section
              className="property-modal proposal-modal"
              role="dialog"
              aria-modal="true"
              aria-labelledby="proposal-title"
            >
              <div className="edit-panel-header">
                <div>
                  <h2 id="proposal-title">Generate Proposal</h2>
                  <p>Pricing Calculator and monthly service proposal.</p>
                </div>
                <button
                  className="modal-close"
                  onClick={() => setShowProposal(false)}
                  disabled={savingProposal}
                  aria-label="Close proposal"
                >
                  ×
                </button>
              </div>

              <div className="proposal-property-summary">
                <div>
                  <span>Property</span>
                  <strong>{selectedProperty.name}</strong>
                </div>
                <div>
                  <span>Address</span>
                  <strong>
                    {[selectedProperty.addressLine1, selectedProperty.city,
                      selectedProperty.state, selectedProperty.zipCode]
                      .filter(Boolean)
                      .join(', ')}
                  </strong>
                </div>
                <div>
                  <span>Water bodies</span>
                  <strong>{selectedProperty.waterBodies.length}</strong>
                </div>
                <div>
                  <span>Management Company</span>
                  <strong>
                    {selectedProperty.managementCompany?.name ?? 'Not assigned'}
                  </strong>
                </div>
              </div>

              <div className="proposal-map-wrap">
                <iframe
                  className="property-map"
                  title={`Map of ${selectedProperty.name}`}
                  loading="lazy"
                  src={`https://www.google.com/maps?q=${encodeURIComponent(
                    `${serviceBaseAddress} to ${[selectedProperty.addressLine1, selectedProperty.city,
                      selectedProperty.state, selectedProperty.zipCode]
                      .filter(Boolean)
                      .join(', ')}`,
                  )}&output=embed`}
                />
                <div className="map-price-pin">
                  <span>Monthly Proposal</span>
                  <strong>${monthlyInvestment.toLocaleString('en-US')}</strong>
                </div>
              </div>
              <div className="route-distance-card">
                <span>Route from {serviceBaseAddress}</span>
                <strong>
                  {routeLoading
                    ? 'Calculating route...'
                    : routeDistanceMiles !== null
                      ? `${routeDistanceMiles.toLocaleString('en-US')} miles traveled`
                      : routeError || 'Distance not available'}
                </strong>
              </div>

              <div className="transport-cost-card">
                <div className="proposal-section-heading">
                  <div>
                    <h3>Transportation Cost</h3>
                    <p>Estimated round-trip fuel cost is included in the monthly proposal.</p>
                  </div>
                </div>
                <div className="transport-inputs">
                  <div className="form-field">
                    <label htmlFor="fuel-price">Gas price ($ / gallon)</label>
                    <input
                      id="fuel-price"
                      type="number"
                      min="0"
                      step="0.01"
                      value={fuelPricePerGallon}
                      onChange={(event) => setFuelPricePerGallon(event.target.value)}
                    />
                  </div>
                  <div className="form-field">
                    <label htmlFor="vehicle-mpg">Vehicle efficiency (miles / gallon)</label>
                    <input
                      id="vehicle-mpg"
                      type="number"
                      min="1"
                      step="0.1"
                      value={vehicleMpg}
                      onChange={(event) => setVehicleMpg(event.target.value)}
                    />
                  </div>
                  <div className="transport-formula">
                    {routeDistanceMiles !== null
                      ? `${routeDistanceMiles} mi one way × 2 × ${serviceVisitsPerWeek} visits/week`
                      : 'Waiting for route distance'}
                  </div>
                </div>
                <div className="transport-subtotal investment-result">
                  <span>Monthly transportation</span>
                  {routeDistanceMiles === null && routeError ? (
                    <input
                      className="manual-transport-input"
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="Enter amount"
                      aria-label="Manual monthly transportation cost"
                      value={manualTransportationCost}
                      onChange={(event) => setManualTransportationCost(event.target.value)}
                    />
                  ) : (
                    <strong>${monthlyTransportationCost.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>
                  )}
                </div>
              </div>

              <div className="proposal-inputs">
                <div className="form-field">
                  <label>Management Status</label>
                  <select
                    value={managementStatus}
                    onChange={(event) => {
                      setManagementStatus(event.target.value);
                      if (event.target.value !== 'VIP') setAdjustments('0');
                    }}
                  >
                    <option value="CURRENT">Current</option>
                    <option value="VIP">VIP</option>
                  </select>
                </div>
                {managementStatus === 'VIP' && (
                  <div className="form-field">
                    <label>Adjustment Discount (%)</label>
                    <input
                      type="number"
                      min="0"
                      max="100"
                      step="1"
                      value={adjustments}
                      onChange={(event) => {
                        const value = event.target.value;
                        setAdjustments(
                          value === ''
                            ? ''
                            : String(
                                Math.min(100, Math.max(0, Number(value))),
                              ),
                        );
                      }}
                    />
                  </div>
                )}
              </div>

              <div className="chemical-calculator proposal-water-bodies-card">
                <div className="proposal-section-heading">
                  <div>
                    <h3>Water Bodies Pricing</h3>
                    <p>Only included items are added to the proposal.</p>
                  </div>
                </div>

                <div className="table-container">
                  <table className="calculator-table">
                    <thead>
                      <tr>
                        <th aria-label="Include" />
                        <th>Water Body</th>
                        <th>Type</th>
                        <th>Size</th>
                        <th>Frequency<br /><span className="table-heading-subtitle">Weekly</span></th>
                        <th>Disinfection</th>
                        <th>Access</th>
                        <th><strong>Price</strong><br /><span className="table-heading-subtitle">Monthly</span></th>
                      </tr>
                    </thead>
                    <tbody>
                      {proposalWaterBodies.map((body, index) => (
                        <tr key={`${body.name}-${index}`}>
                          <td>
                            <input
                              type="checkbox"
                              checked={body.include}
                              onChange={(event) =>
                                updateProposalWaterBody(index, {
                                  include: event.target.checked,
                                })
                              }
                            />
                          </td>
                          <td><strong>{body.name}</strong></td>
                          <td>
                            <select
                              value={body.type}
                              onChange={(event) =>
                                updateProposalWaterBody(index, {
                                  type: event.target.value,
                                })
                              }
                            >
                              <option value="SWIMMING_POOL">Pool</option>
                              <option value="SPA">Spa</option>
                              <option value="KIDDIE_POOL">Kiddie Pool</option>
                              <option value="SPLASH_PAD">Splash Pad</option>
                              <option value="DECORATIVE_WATER_FEATURE">Decorative Water Feature</option>
                            </select>
                          </td>
                          <td>
                            <select
                              value={body.category}
                              onChange={(event) =>
                                updateProposalWaterBody(index, {
                                  category: event.target.value,
                                })
                              }
                            >
                              <option value="">Select size</option>
                              <option value="SMALL">Small</option>
                              <option value="MEDIUM">Medium</option>
                              <option value="LARGE">Large</option>
                              <option value="EXTRA_LARGE">Extra Large</option>
                            </select>
                          </td>
                          <td>
                            <select
                              value={body.frequency}
                              onChange={(event) =>
                                updateProposalWaterBody(index, {
                                  frequency: event.target.value,
                                })
                              }
                            >
                              <option value="1x Weekly">1x</option>
                              <option value="2x Weekly">2x</option>
                              <option value="3x Weekly">3x</option>
                              <option value="5x Weekly">5x</option>
                              <option value="7x Weekly">7x</option>
                            </select>
                          </td>
                          <td>
                            <select
                              value={body.disinfectionSystem ? 'YES' : 'NO'}
                              onChange={(event) =>
                                updateProposalWaterBody(index, {
                                  disinfectionSystem: event.target.value === 'YES',
                                })
                              }
                            >
                              <option value="NO">No</option>
                              <option value="YES">Yes</option>
                            </select>
                          </td>
                          <td>
                            <select
                              value={body.accessDifficulty}
                              onChange={(event) =>
                                updateProposalWaterBody(index, {
                                  accessDifficulty: event.target.value as ProposalWaterBody['accessDifficulty'],
                                })
                              }
                            >
                              <option value="EASY">Easy</option>
                              <option value="MEDIUM">Medium</option>
                              <option value="DIFFICULT">Difficult</option>
                            </select>
                          </td>
                          <td>
                            <select
                              className="water-body-price-select"
                              aria-label={`Suggested monthly price for ${body.name}`}
                              value={body.priceMode === 'CUSTOM' ? 'CUSTOM' : String(body.monthlyPrice)}
                              onChange={(event) => {
                                if (event.target.value === 'CUSTOM') {
                                  updateProposalWaterBody(index, {
                                    priceMode: 'CUSTOM',
                                    priceManuallyAdjusted: true,
                                  });
                                  return;
                                }
                                updateProposalWaterBody(index, {
                                  monthlyPrice: Number(event.target.value),
                                  priceMode: 'SUGGESTED',
                                  priceManuallyAdjusted: true,
                                });
                              }}
                            >
                              <option value={effectiveWaterBodyPrice(body)}>
                                Calculated ${effectiveWaterBodyPrice(body).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                              </option>
                              {suggestedPricesForWaterBody(body).map((price) => (
                                <option value={price} key={price}>
                                  ${price.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                                </option>
                              ))}
                              <option value="CUSTOM">Custom amount...</option>
                            </select>
                            {body.priceMode === 'CUSTOM' && (
                              <input
                                className="water-body-price-input"
                                type="number"
                                min="0"
                                step="0.01"
                                aria-label={`Custom monthly price for ${body.name}`}
                                value={body.monthlyPrice.toFixed(2)}
                                onChange={(event) =>
                                  updateProposalWaterBody(index, {
                                    monthlyPrice: Math.max(0, Number(event.target.value) || 0),
                                    priceManuallyAdjusted: true,
                                  })
                                }
                              />
                            )}
                            {body.priceManuallyAdjusted && (
                              <small className="manual-price-label">Commercial price</small>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="water-bodies-subtotal investment-result">
                  <span>Water Bodies Monthly Subtotal</span>
                  <strong>${waterBodiesMonthlyInvestment.toLocaleString('en-US')} / month</strong>
                  {managementStatus === 'VIP' && (
                    <small>Preferred Management Partner Pricing Applied</small>
                  )}
                </div>
              </div>

              <div className="form-field proposal-recommendation">
                <label>Internal Notes (optional)</label>
                <textarea
                  rows={4}
                  value={proposalNotes}
                  onChange={(event) => setProposalNotes(event.target.value)}
                />
              </div>

              <div className="final-proposal-total">
                <span>Final Monthly Proposal</span>
                <strong>${monthlyInvestment.toLocaleString('en-US')} / month</strong>
              </div>

              <div className="modal-actions">
                <button
                  className="secondary-button"
                  onClick={() => setShowProposal(false)}
                  disabled={savingProposal}
                >
                  Cancel
                </button>
                <button
                  className="secondary-button"
                  onClick={() => saveProposal(false)}
                  disabled={savingProposal}
                >
                  {savingProposal ? 'Saving proposal...' : 'Save Proposal'}
                </button>
              </div>
            </section>
          </div>
        )}
      </div>
    );
  }

  if (showDeleted) {
    return (
      <div className="page">
        <button
          className="back-button"
          onClick={() => setShowDeleted(false)}
        >
          ← Back to Properties
        </button>

        <header className="header">
          <div>
            <h1>Deleted Properties</h1>
            <p>Restore a property or remove it permanently.</p>
          </div>
        </header>

        <section className="properties-section">
          {deletedProperties.length === 0 ? (
            <div className="trash-empty">
              <h2>No deleted properties</h2>
              <p>Properties moved to the trash will appear here.</p>
            </div>
          ) : (
            <div className="table-container">
              <table>
                <thead>
                  <tr>
                    <th>Property</th>
                    <th>City</th>
                    <th>Deleted</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {deletedProperties.map((property) => (
                    <tr key={property.id}>
                      <td><strong>{property.name}</strong></td>
                      <td>
                        {property.city ?? '-'}
                        {property.state ? `, ${property.state}` : ''}
                      </td>
                      <td>
                        {property.deletedAt
                          ? new Date(property.deletedAt).toLocaleDateString('en-US')
                          : '-'}
                      </td>
                      <td>
                        <div className="trash-actions">
                          <button
                            className="secondary-button"
                            onClick={() => restoreProperty(property)}
                            disabled={trashActionId === property.id}
                          >
                            Restore
                          </button>
                          <button
                            className="danger-link-button"
                            onClick={() => permanentlyDeleteProperty(property)}
                            disabled={trashActionId === property.id}
                          >
                            Delete permanently
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    );
  }

  return (
    <div className="page">
      <header className="header">
        <div>
          <h1>
            BlueLife CRM
          </h1>

          <p>
            Property Management
          </p>
        </div>

        <div className="header-actions">
          {renderProposalReminderCenter()}
          <button
            className="secondary-button"
            onClick={() => setShowDeleted(true)}
          >
            Deleted Properties ({deletedProperties.length})
          </button>
          <button
            className="primary-button"
            onClick={() => setIsCreating(true)}
          >
            + New Property
          </button>
        </div>
      </header>

      {isCreating && (
        <div className="modal-backdrop" role="presentation">
          <section
            className="property-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="new-property-title"
          >
            <div className="edit-panel-header">
              <div>
                <h2 id="new-property-title">New Property</h2>
                <p>
                  Complete all required fields marked with *.
                </p>
              </div>

              <button
                className="modal-close"
                type="button"
                onClick={closeCreateForm}
                disabled={creating}
                aria-label="Close new property form"
              >
                ×
              </button>
            </div>

            <form onSubmit={createProperty} noValidate>
              <div className="form-grid">
                <div className="form-field form-field-wide">
                  <label htmlFor="new-name">Property Name *</label>
                  <input
                    id="new-name"
                    autoFocus
                    required
                    value={createForm.name}
                    onChange={(event) =>
                      updateCreateField('name', event.target.value)
                    }
                  />
                </div>

                <div className="form-field">
                  <label htmlFor="new-type">Property Type *</label>
                  <select
                    id="new-type"
                    required
                    value={createForm.propertyType}
                    onChange={(event) =>
                      updateCreateField('propertyType', event.target.value)
                    }
                  >
                    <option value="">Select type</option>
                    <option value="COMMERCIAL">Commercial</option>
                    <option value="RESIDENTIAL">Residential</option>
                  </select>
                </div>

                <div className="form-field">
                  <label htmlFor="new-segment">Segment *</label>
                  <select
                    id="new-segment"
                    required
                    value={createForm.segment}
                    onChange={(event) =>
                      updateCreateField('segment', event.target.value)
                    }
                  >
                    <option value="">Select segment</option>
                    <option value="MULTIFAMILY">Multifamily</option>
                    <option value="HOA">HOA</option>
                    <option value="HOTEL">Hotel</option>
                    <option value="SINGLE_FAMILY">Single Family</option>
                  </select>
                </div>

                <div className="form-field">
                  <label htmlFor="new-management">Management Company</label>
                  <input
                    id="new-management"
                    value={createForm.managementCompanyName}
                    onChange={(event) =>
                      updateCreateField(
                        'managementCompanyName',
                        event.target.value,
                      )
                    }
                    placeholder="Example: ABC Property Management"
                  />
                </div>

                <div className="form-field">
                  <label htmlFor="new-source">Lead Source *</label>
                  <select
                    id="new-source"
                    required
                    value={createForm.leadSource}
                    onChange={(event) =>
                      updateCreateField('leadSource', event.target.value)
                    }
                  >
                    <option value="">Select source</option>
                    <option value="ROUTE">Route</option>
                    <option value="REFERRAL">Referral</option>
                  </select>
                </div>

                <div className="form-field form-field-wide">
                  <label htmlFor="new-address">Address *</label>
                  <input
                    id="new-address"
                    required
                    value={createForm.addressLine1}
                    onChange={(event) =>
                      updateCreateField('addressLine1', event.target.value)
                    }
                  />
                </div>

                {([
                  ['city', 'City'],
                  ['county', 'County'],
                  ['state', 'State'],
                  ['zipCode', 'ZIP Code'],
                ] as Array<[keyof PropertyForm, string]>).map(
                  ([field, label]) => (
                    <div className="form-field" key={field}>
                      <label htmlFor={`new-${field}`}>{label} *</label>
                      <input
                        id={`new-${field}`}
                        required
                        value={createForm[field]}
                        onChange={(event) =>
                          updateCreateField(field, event.target.value)
                        }
                      />
                      {field === 'state' &&
                        createForm.state &&
                        !/^[A-Za-z]{2}$/.test(
                          createForm.state.trim(),
                        ) && (
                          <span className="field-error">
                            Use the 2-letter state code, for example FL.
                          </span>
                        )}
                      {field === 'zipCode' &&
                        createForm.zipCode &&
                        !/^\d{5}(-\d{4})?$/.test(
                          createForm.zipCode.trim(),
                        ) && (
                          <span className="field-error">
                            Enter a valid ZIP code (12345 or 12345-6789).
                          </span>
                        )}
                    </div>
                  ),
                )}

                <WaterBodiesEditor
                  bodies={createWaterBodies}
                  idPrefix="new-water-body"
                  onAdd={() => addWaterBody('create')}
                  onUpdate={(index, field, value) =>
                    updateWaterBody('create', index, field, value)
                  }
                  onRemove={(index) => removeWaterBody('create', index)}
                />

                <div className="form-section-title form-field-wide">
                  <div>
                    <h3>Contacts</h3>
                    <p>
                      A Property Manager with a valid email is required.
                    </p>
                  </div>
                  <button
                    className="secondary-button"
                    type="button"
                    onClick={addContact}
                  >
                    + Add contact
                  </button>
                </div>

                <div className="contacts-editor form-field-wide">
                  {createContacts.map((contact, index) => (
                    <div className="contact-editor" key={index}>
                      <div className="contact-editor-header">
                        <strong>Contact {index + 1}</strong>
                        {createContacts.length > 1 && (
                          <button
                            className="delete-button"
                            type="button"
                            onClick={() => removeContact(index)}
                          >
                            Remove
                          </button>
                        )}
                      </div>

                      <div className="form-grid contact-fields">
                        <div className="form-field">
                          <label htmlFor={`contact-role-${index}`}>Role *</label>
                          <select
                            id={`contact-role-${index}`}
                            required
                            value={contact.role}
                            onChange={(event) =>
                              updateContactField(index, 'role', event.target.value)
                            }
                          >
                            <option value="">Select role</option>
                            <option value="PROPERTY_MANAGER">Property Manager</option>
                            <option value="REGIONAL_MANAGER">Regional Manager</option>
                            <option value="MAINTENANCE_CHIEF">Maintenance Chief</option>
                            <option value="OTHER">Other</option>
                          </select>
                        </div>

                        <div className="form-field">
                          <label htmlFor={`contact-email-${index}`}>Email *</label>
                          <input
                            id={`contact-email-${index}`}
                            type="email"
                            required
                            value={contact.email}
                            onChange={(event) =>
                              updateContactField(index, 'email', event.target.value)
                            }
                          />
                        </div>

                        <div className="form-field">
                          <label htmlFor={`contact-first-name-${index}`}>
                            First Name (optional)
                          </label>
                          <input
                            id={`contact-first-name-${index}`}
                            value={contact.firstName}
                            onChange={(event) =>
                              updateContactField(index, 'firstName', event.target.value)
                            }
                          />
                        </div>

                        <div className="form-field">
                          <label htmlFor={`contact-last-name-${index}`}>
                            Last Name (optional)
                          </label>
                          <input
                            id={`contact-last-name-${index}`}
                            value={contact.lastName}
                            onChange={(event) =>
                              updateContactField(index, 'lastName', event.target.value)
                            }
                          />
                        </div>

                        <div className="form-field">
                          <label htmlFor={`contact-phone-${index}`}>
                            Phone (optional)
                          </label>
                          <input
                            id={`contact-phone-${index}`}
                            type="tel"
                            value={contact.phone}
                            onChange={(event) =>
                              updateContactField(index, 'phone', event.target.value)
                            }
                          />
                        </div>

                        <label className="primary-contact-check">
                          <input
                            type="checkbox"
                            checked={contact.isPrimary}
                            onChange={() =>
                              updateContactField(index, 'isPrimary', true)
                            }
                          />
                          Primary contact
                        </label>
                      </div>
                    </div>
                  ))}

                  {!createContacts.some(
                    (contact) => contact.role === 'PROPERTY_MANAGER',
                  ) && (
                    <span className="field-error">
                      Add at least one Property Manager.
                    </span>
                  )}
                  {!contactEmailsAreUnique && (
                    <span className="field-error">
                      Contact email addresses cannot be repeated.
                    </span>
                  )}
                </div>

              </div>

              {createError && (
                <p className="form-error" role="alert">
                  {createError}
                </p>
              )}

              <div className="modal-actions">
                <button
                  className="secondary-button"
                  type="button"
                  onClick={closeCreateForm}
                  disabled={creating}
                >
                  Cancel
                </button>
                <button
                  className="primary-button"
                  type="submit"
                  disabled={!createFormIsValid || creating}
                >
                  {creating ? 'Creating...' : 'Create Property'}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}

      <section className="dashboard-section">
        <div className="section-header dashboard-header">
          <div>
            <h2>Property Insights</h2>
            <p>Portfolio and proposal activity for the current search.</p>
          </div>
        </div>
        <div className="dashboard-kpis">
          <div className="dashboard-kpi">
            <span>Active properties</span>
            <strong>{dashboardStats.propertyCount}</strong>
          </div>
          <div className="dashboard-kpi">
            <span>Management companies</span>
            <strong>{Object.keys(dashboardStats.managementCounts).filter((name) => name !== 'Unassigned').length}</strong>
          </div>
          <div className="dashboard-kpi">
            <span>Total proposals</span>
            <strong>{dashboardStats.totalProposals}</strong>
          </div>
        </div>

        <div className="dashboard-charts">
          <div className="dashboard-chart-card">
            <h3>Properties by type</h3>
            <div className="donut-chart-wrap">
              <div
                className="donut-chart"
                style={{
                  background: (() => {
                    const entries = Object.entries(dashboardStats.typeCounts);
                    if (!entries.length) return '#cfe5f0';
                    let cursor = 0;
                    const colors = ['#0c71c3', '#2ea3f2', '#34e2e4', '#82c0c7'];
                    return `conic-gradient(${entries.map(([, count], index) => {
                      const start = cursor;
                      cursor += (count / dashboardStats.propertyCount) * 100;
                      return `${colors[index % colors.length]} ${start}% ${cursor}%`;
                    }).join(', ')})`;
                  })(),
                }}
              />
              <div className="chart-legend">
                {Object.entries(dashboardStats.typeCounts).map(([type, count], index) => (
                  <div key={type}>
                    <span className="legend-dot" style={{ background: ['#0c71c3', '#2ea3f2', '#34e2e4', '#82c0c7'][index % 4] }} />
                    <span>{formatLabel(type)}</span>
                    <strong>{count}</strong>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="dashboard-chart-card">
            <h3>Properties by management</h3>
            <div className="bar-chart">
              {Object.entries(dashboardStats.managementCounts)
                .sort(([, first], [, second]) => second - first)
                .slice(0, 6)
                .map(([company, count]) => {
                  const maximum = Math.max(...Object.values(dashboardStats.managementCounts), 1);
                  return (
                    <div className="bar-row" key={company}>
                      <span title={company}>{company}</span>
                      <div className="bar-track"><i style={{ width: `${(count / maximum) * 100}%` }} /></div>
                      <strong>{count}</strong>
                    </div>
                  );
                })}
            </div>
          </div>

          <div className="dashboard-chart-card proposal-status-chart">
            <h3>Proposals by status</h3>
            <div className="status-summary-list">
              {['CREATED', 'SENT', 'APPROVED', 'REJECTED'].map((status) => (
                <div key={status}>
                  <span className={`proposal-status status-${status.toLowerCase()}`}>{formatLabel(status)}</span>
                  <strong>{dashboardStats.proposalCounts[status] ?? 0}</strong>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="properties-section">
        <div className="section-header">
          <div>
            <h2>
              Properties
            </h2>

            <p>
              Prospects and properties
              registered in BlueLife.
            </p>
          </div>

          <input
            className="search"
            placeholder="Search by property, city, management..."
            value={search}
            onChange={(event) =>
              setSearch(
                event.target.value,
              )
            }
          />
        </div>

        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>
                  Property
                </th>
                <th>
                  SKU
                </th>
                <th>
                  City
                </th>
                <th>
                  Type
                </th>
                <th>
                  Segment
                </th>
                <th>
                  Management
                </th>
                <th>
                  Proposals
                </th>
              </tr>
            </thead>

            <tbody>
              {filteredProperties.map(
                (property) => (
                  <tr
                    key={
                      property.id
                    }
                    className="clickable-row"
                    onClick={() =>
                      openProperty(
                        property.id,
                      )
                    }
                  >
                    <td>
                      <strong>
                        {
                          property.name
                        }
                      </strong>
                    </td>

                    <td>
                      <span className="sku-code">
                        {propertySku(property.id)}
                      </span>
                    </td>

                    <td>
                      {property.city ??
                        '-'}

                      {property.state
                        ? `, ${property.state}`
                        : ''}
                    </td>

                    <td>
                      {formatLabel(
                        property.propertyType,
                      )}
                    </td>

                    <td>
                      {formatLabel(
                        property.segment,
                      )}
                    </td>

                    <td>
                      {property
                        .managementCompany
                        ?.name ?? '-'}
                    </td>

                    <td>
                      <span className="proposal-count">
                        {property.salesActivities.filter(
                          (activity) => activity.type === 'PROPOSAL',
                        ).length}
                      </span>
                    </td>

                  </tr>
                ),
              )}
            </tbody>
          </table>
        </div>
      </section>

      {detailLoading && (
        <div className="loading-overlay">
          Loading property...
        </div>
      )}
    </div>
  );
}

export default App;
