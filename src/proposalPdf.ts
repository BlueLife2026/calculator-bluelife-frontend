import { jsPDF } from 'jspdf';
import type { ProposalService } from './proposalServices';

export type ProposalPdfWaterBody = {
  description: string;
  type: string;
  frequency: string;
  baseMonthlyCost: number;
};

export type ProposalPdfData = {
  proposalNumber: string;
  proposalDate: Date;
  clientName: string;
  propertyName: string;
  address: string;
  contactName: string;
  email: string;
  phone: string;
  waterBodies: ProposalPdfWaterBody[];
  services: ProposalService[];
  monthlyTransportationCost: number;
  discountPercentage: number;
  totalMonthlyInvestment: number;
};

export type ProposalLineAllocation = ProposalPdfWaterBody & {
  serviceCents: number;
  fuelCents: number;
  grossCents: number;
  discountCents: number;
  monthlyCents: number;
};

const pageWidth = 612;
const pageHeight = 792;
const margin = 28;
const contentWidth = pageWidth - margin * 2;
const footerTop = 758;
const navy = [10, 52, 139] as const;
const blue = [0, 111, 202] as const;
const cyan = [12, 169, 221] as const;
const orange = [255, 148, 18] as const;
const paleBlue = [237, 247, 255] as const;
const mediumBlue = [104, 139, 195] as const;
const ink = [11, 48, 133] as const;

function dollarsToCents(value: number) {
  return Math.round(Math.max(0, value) * 100);
}

function clampPercentage(value: number) {
  return Math.min(100, Math.max(0, Number.isFinite(value) ? value : 0));
}

/**
 * Splits fuel as evenly as possible, applies the discount to every body, and
 * reconciles whole-dollar rounding so the visible rows always equal the calculator total.
 */
export function allocateProposalCosts(
  waterBodies: ProposalPdfWaterBody[],
  monthlyTransportationCost: number,
  discountPercentage: number,
  totalMonthlyInvestment: number,
): ProposalLineAllocation[] {
  if (waterBodies.length === 0) return [];

  const fuelTotalCents = dollarsToCents(monthlyTransportationCost);
  const equalFuelCents = Math.floor(fuelTotalCents / waterBodies.length);
  const fuelRemainderCents = fuelTotalCents % waterBodies.length;
  const discountMultiplier = 1 - clampPercentage(discountPercentage) / 100;

  const draft = waterBodies.map((body, index) => {
    const serviceCents = dollarsToCents(body.baseMonthlyCost);
    const fuelCents = equalFuelCents + (index < fuelRemainderCents ? 1 : 0);
    const grossCents = serviceCents + fuelCents;
    const exactMonthlyCents = grossCents * discountMultiplier;

    return {
      ...body,
      serviceCents,
      fuelCents,
      grossCents,
      exactMonthlyCents,
      monthlyCents: Math.floor(exactMonthlyCents / 100) * 100,
    };
  });

  const targetTotalCents = Math.round(Math.max(0, totalMonthlyInvestment)) * 100;
  let centsToReconcile =
    targetTotalCents - draft.reduce((sum, line) => sum + line.monthlyCents, 0);
  const reconciliationOrder = draft
    .map((line, index) => ({
      index,
      fraction: line.exactMonthlyCents / 100 - Math.floor(line.exactMonthlyCents / 100),
    }))
    .sort((left, right) =>
      centsToReconcile >= 0
        ? right.fraction - left.fraction || left.index - right.index
        : left.fraction - right.fraction || right.index - left.index,
    );

  let cursor = 0;
  while (centsToReconcile !== 0 && reconciliationOrder.length > 0) {
    const line = draft[reconciliationOrder[cursor % reconciliationOrder.length].index];
    if (centsToReconcile > 0) {
      line.monthlyCents += 100;
      centsToReconcile -= 100;
    } else if (line.monthlyCents >= 100) {
      line.monthlyCents -= 100;
      centsToReconcile += 100;
    }
    cursor += 1;
  }

  return draft.map((line) => {
    const { exactMonthlyCents, ...allocation } = line;
    void exactMonthlyCents;
    return {
      ...allocation,
      discountCents: allocation.grossCents - allocation.monthlyCents,
    };
  });
}

function formatCurrency(cents: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

function safeFilePart(value: string) {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'property';
}

async function loadImageAsDataUrl(url: string) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Could not load proposal image: ${response.status}`);
  const blob = await response.blob();
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error('Could not read proposal image.'));
    reader.readAsDataURL(blob);
  });
}

function setTextColor(doc: jsPDF, color: readonly [number, number, number]) {
  doc.setTextColor(color[0], color[1], color[2]);
}

function setFillColor(doc: jsPDF, color: readonly [number, number, number]) {
  doc.setFillColor(color[0], color[1], color[2]);
}

function setDrawColor(doc: jsPDF, color: readonly [number, number, number]) {
  doc.setDrawColor(color[0], color[1], color[2]);
}

function drawBrand(doc: jsPDF, x: number, y: number, compact = false) {
  const scale = compact ? 0.72 : 1;
  doc.setLineCap('round');
  doc.setLineWidth(compact ? 2.2 : 3.2);
  setDrawColor(doc, cyan);
  doc.lines(
    [
      [8 * scale, -5 * scale, 14 * scale, -5 * scale, 20 * scale, 0],
      [8 * scale, 5 * scale, 14 * scale, 5 * scale, 20 * scale, 0],
    ],
    x + 12 * scale,
    y,
    [1, 1],
    'S',
  );
  setDrawColor(doc, blue);
  doc.lines(
    [
      [8 * scale, 6 * scale, 14 * scale, 6 * scale, 20 * scale, 0],
      [8 * scale, -6 * scale, 14 * scale, -6 * scale, 20 * scale, 0],
    ],
    x + 50 * scale,
    y,
    [1, 1],
    'S',
  );
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(compact ? 16 : 25);
  setTextColor(doc, navy);
  doc.text('BLUE LIFE', x, y + (compact ? 21 : 32));
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(compact ? 5 : 7);
  doc.setCharSpace(compact ? 1.6 : 2.4);
  setTextColor(doc, cyan);
  doc.text('POOL SERVICE', x + (compact ? 3 : 5), y + (compact ? 30 : 44));
  doc.setCharSpace(0);
}

function drawHeroHeader(
  doc: jsPDF,
  headerImage: string | null,
  logoImage: string | null,
  proposalNumber: string,
) {
  setFillColor(doc, [255, 255, 255]);
  doc.rect(0, 0, pageWidth, 112, 'F');
  if (headerImage) {
    doc.addImage(headerImage, 'PNG', 165, 0, pageWidth - 165, 112, undefined, 'FAST');
  } else {
    setFillColor(doc, paleBlue);
    doc.rect(165, 0, pageWidth - 165, 112, 'F');
  }
  if (logoImage) {
    doc.addImage(logoImage, 'PNG', 28, 6, 117, 83, undefined, 'FAST');
  } else {
    drawBrand(doc, 30, 21);
  }
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.2);
  setTextColor(doc, navy);
  doc.text('CPC 1461225  |  LICENSED & INSURED', 30, 99);
  doc.setFontSize(5.8);
  setTextColor(doc, mediumBlue);
  doc.text(proposalNumber, 30, 108);
}

function drawCompactHeader(doc: jsPDF, logoImage: string | null, proposalNumber: string) {
  if (logoImage) {
    doc.addImage(logoImage, 'PNG', margin, 5, 54, 38, undefined, 'FAST');
  } else {
    drawBrand(doc, margin, 11, true);
  }
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  setTextColor(doc, mediumBlue);
  doc.text(proposalNumber, pageWidth - margin, 31, { align: 'right' });
  setDrawColor(doc, [193, 222, 245]);
  doc.setLineWidth(0.8);
  doc.line(margin, 48, pageWidth - margin, 48);
}

function drawSectionTitle(doc: jsPDF, title: string, y: number) {
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  setTextColor(doc, ink);
  doc.text(title, margin + 2, y + 16);
  const textWidth = doc.getTextWidth(title);
  setDrawColor(doc, blue);
  doc.setLineWidth(0.8);
  doc.line(margin + textWidth + 16, y + 12, pageWidth - margin, y + 12);
  setDrawColor(doc, orange);
  doc.setLineWidth(2.8);
  doc.line(margin + 2, y + 25, margin + 31, y + 25);
  return y + 34;
}

function drawDetail(
  doc: jsPDF,
  label: string,
  value: string,
  x: number,
  y: number,
  labelWidth: number,
  maxValueWidth: number,
) {
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  setTextColor(doc, mediumBlue);
  doc.text(`${label}:`, x, y);
  setTextColor(doc, ink);
  const lines = doc.splitTextToSize(value || '-', maxValueWidth) as string[];
  doc.text(lines.slice(0, 2), x + labelWidth, y);
}

function drawProposalDetails(doc: jsPDF, data: ProposalPdfData, startY: number) {
  const y = drawSectionTitle(doc, 'Proposal details', startY);
  const leftX = margin + 4;
  const rightX = 305;
  const formattedDate = new Intl.DateTimeFormat('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  }).format(data.proposalDate);

  drawDetail(doc, "Today's date", formattedDate, leftX, y + 5, 78, 165);
  drawDetail(doc, 'Client', data.clientName, leftX, y + 23, 78, 165);
  drawDetail(doc, 'Property', data.propertyName, leftX, y + 41, 78, 165);
  drawDetail(doc, 'Address', data.address, rightX, y + 5, 48, 222);
  drawDetail(doc, 'Email', data.email, rightX, y + 29, 48, 222);
  drawDetail(doc, 'Phone', data.phone, rightX, y + 47, 48, 222);

  return y + 64;
}

function drawWaterTableHeader(doc: jsPDF, y: number) {
  const widths = [34, 171, 121, 230];
  setFillColor(doc, paleBlue);
  setDrawColor(doc, [202, 226, 245]);
  doc.roundedRect(margin, y, contentWidth, 24, 5, 5, 'FD');
  let x = margin;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6.5);
  doc.setCharSpace(1);
  setTextColor(doc, blue);
  ['#', 'DESCRIPTION', 'TYPE', 'MONTHLY COST'].forEach((heading, index) => {
    doc.text(heading, x + (index === 0 ? widths[index] / 2 : 12), y + 15, {
      align: index === 0 ? 'center' : 'left',
    });
    if (index > 0) doc.line(x, y, x, y + 24);
    x += widths[index];
  });
  doc.setCharSpace(0);
  return y + 24;
}

function drawWaterTableRow(
  doc: jsPDF,
  line: ProposalLineAllocation,
  index: number,
  y: number,
) {
  const widths = [34, 171, 121, 230];
  const rowHeight = 30;
  setDrawColor(doc, [207, 228, 245]);
  setFillColor(doc, index % 2 === 0 ? [255, 255, 255] : [249, 252, 255]);
  doc.rect(margin, y, contentWidth, rowHeight, 'FD');
  let x = margin;
  for (let column = 1; column < widths.length; column += 1) {
    x += widths[column - 1];
    doc.line(x, y, x, y + rowHeight);
  }

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  setTextColor(doc, ink);
  doc.text(String(index + 1), margin + widths[0] / 2, y + 17, { align: 'center' });

  const descriptionX = margin + widths[0] + 12;
  doc.setFont('helvetica', 'bold');
  const descriptionLines = doc.splitTextToSize(line.description, widths[1] - 22) as string[];
  doc.text(descriptionLines.slice(0, 1), descriptionX, y + 11);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.8);
  setTextColor(doc, mediumBlue);
  doc.text(line.frequency, descriptionX, y + 22);

  const typeX = margin + widths[0] + widths[1] + 12;
  doc.setFontSize(8);
  setTextColor(doc, ink);
  const typeLines = doc.splitTextToSize(line.type, widths[2] - 20) as string[];
  doc.text(typeLines.slice(0, 2), typeX, y + 12);

  const costRight = pageWidth - margin - 12;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10.5);
  doc.text(formatCurrency(line.monthlyCents), costRight, y + 18, { align: 'right' });
  return y + rowHeight;
}

function drawServices(doc: jsPDF, services: ProposalService[], startY: number) {
  let y = drawSectionTitle(doc, 'Services', startY);
  const columnWidth = contentWidth / 4;
  services.forEach((service, index) => {
    const column = index % 4;
    const row = Math.floor(index / 4);
    const x = margin + column * columnWidth;
    const itemY = y + row * 25;
    setFillColor(doc, column % 2 === 0 ? paleBlue : [247, 251, 255]);
    doc.circle(x + 10, itemY + 10, 7, 'F');
    setDrawColor(doc, orange);
    doc.setLineWidth(1.4);
    doc.line(x + 7, itemY + 10, x + 9, itemY + 13);
    doc.line(x + 9, itemY + 13, x + 14, itemY + 7);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.2);
    setTextColor(doc, ink);
    const lines = doc.splitTextToSize(service, columnWidth - 28) as string[];
    const centeredLines = lines.slice(0, 2);
    const textY = itemY + 12.5 - (centeredLines.length - 1) * 3.8;
    doc.text(centeredLines, x + 23, textY, { lineHeightFactor: 1.05 });
  });
  return y + Math.max(28, Math.ceil(services.length / 4) * 25 + 3);
}

function drawInvestment(
  doc: jsPDF,
  data: ProposalPdfData,
  frequencyLabel: string,
  startY: number,
) {
  const height = 62;
  const halfWidth = contentWidth / 2;
  const leftIconX = margin + 42;
  const leftTextX = margin + 87;
  const rightStartX = margin + halfWidth;
  const rightIconX = rightStartX + 42;
  const rightTextX = rightStartX + 87;
  setFillColor(doc, paleBlue);
  doc.roundedRect(margin, startY, contentWidth, height, 9, 9, 'F');
  setFillColor(doc, navy);
  doc.roundedRect(margin, startY, halfWidth, height, 9, 9, 'F');
  doc.rect(rightStartX - 10, startY, 10, height, 'F');

  setDrawColor(doc, [214, 240, 255]);
  doc.setLineWidth(1.7);
  doc.circle(leftIconX, startY + 31, 20, 'S');
  doc.circle(leftIconX, startY + 31, 16.5, 'S');
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(24);
  doc.setTextColor(255, 255, 255);
  doc.text('$', leftIconX, startY + 39, { align: 'center' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setCharSpace(2.1);
  doc.setTextColor(255, 255, 255);
  doc.text('INVESTMENT', leftTextX, startY + 17);
  doc.setCharSpace(0);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(23);
  doc.text(formatCurrency(dollarsToCents(data.totalMonthlyInvestment)), leftTextX, startY + 42);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.text('per month', leftTextX, startY + 54);
  setDrawColor(doc, [139, 205, 242]);
  doc.setLineWidth(0.9);
  doc.line(rightStartX - 34, startY + 14, rightStartX - 34, startY + 49);

  setFillColor(doc, [218, 239, 253]);
  doc.circle(rightIconX, startY + 31, 22, 'F');
  setDrawColor(doc, blue);
  doc.setLineWidth(1.2);
  doc.rect(rightIconX - 9, startY + 23, 18, 17, 'S');
  doc.line(rightIconX - 5, startY + 19, rightIconX - 5, startY + 26);
  doc.line(rightIconX + 5, startY + 19, rightIconX + 5, startY + 26);
  doc.line(rightIconX - 9, startY + 28, rightIconX + 9, startY + 28);
  setFillColor(doc, orange);
  [
    [-5, 32], [0, 32], [5, 32],
    [-5, 37], [0, 37], [5, 37],
  ].forEach(([x, y]) => doc.circle(rightIconX + x, startY + y, 1.2, 'F'));
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setCharSpace(2.1);
  setTextColor(doc, blue);
  doc.text('FREQUENCY', rightTextX, startY + 17);
  doc.setCharSpace(0);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  setTextColor(doc, ink);
  doc.text(frequencyLabel, rightTextX, startY + 43);
  return startY + height;
}

function drawNextSteps(doc: jsPDF, startY: number) {
  const y = drawSectionTitle(doc, 'Next steps', startY);
  const itemsY = y + 14;
  const steps = [
    'Review this proposal and confirm scope and investment.',
    'Contact us with any questions - no commitment required.',
    'Upon approval, our team prepares the service agreement.',
    'Service begins on the agreed start date.',
  ];
  const columnWidth = contentWidth / 4;
  steps.forEach((step, index) => {
    const x = margin + index * columnWidth;
    setFillColor(doc, orange);
    const circleCenterY = itemsY + 16;
    doc.circle(x + 13, circleCenterY, 12, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(255, 255, 255);
    doc.text(String(index + 1), x + 13, circleCenterY + 4, { align: 'center' });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.8);
    setTextColor(doc, ink);
    const lines = doc.splitTextToSize(step, columnWidth - 39) as string[];
    const centeredLines = lines.slice(0, 4);
    const textY = circleCenterY + 2.5 - (centeredLines.length - 1) * 3.6;
    doc.text(centeredLines, x + 31, textY, { lineHeightFactor: 1.05 });
  });
  return itemsY + 44;
}

function drawClosingMessage(doc: jsPDF, startY: number) {
  const height = 54;
  const dividerX = pageWidth / 2;
  const leftCenterX = margin + (dividerX - margin) / 2;
  const rightCenterX = dividerX + (pageWidth - margin - dividerX) / 2;
  setFillColor(doc, paleBlue);
  doc.roundedRect(margin, startY, contentWidth, height, 8, 8, 'F');
  setDrawColor(doc, [186, 218, 242]);
  doc.setLineWidth(1);
  doc.line(dividerX, startY + 7, dividerX, startY + height - 7);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.1);
  setTextColor(doc, ink);
  doc.text(
    'Ximena Montoya  ·  Sales & Marketing',
    leftCenterX,
    startY + 13,
    { align: 'center' },
  );
  doc.setFontSize(6.8);
  doc.text(
    '(813) 438-3010  ·  ximenam@bluelifepools.com',
    leftCenterX,
    startY + 27,
    { align: 'center' },
  );
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6.6);
  doc.text(
    '(813) 597-5009  ·  service@bluelifepools.com  ·  bluelifepools.com',
    leftCenterX,
    startY + 42,
    { align: 'center' },
  );

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.text(
    'Thank you for considering Blue Life Pool Service.',
    rightCenterX,
    startY + 13,
    { align: 'center' },
  );
  doc.text(
    'This is a budget proposal — not a service agreement.',
    rightCenterX,
    startY + 27,
    { align: 'center' },
  );
  doc.text(
    'We are happy to adjust scope or frequency to match your needs.',
    rightCenterX,
    startY + 41,
    { align: 'center' },
  );
  setDrawColor(doc, orange);
  doc.setLineWidth(1.8);
  doc.line(rightCenterX - 21, startY + 48, rightCenterX + 21, startY + 48);
  return startY + height;
}

function drawPageFooters(doc: jsPDF, proposalNumber: string) {
  const pageCount = doc.getNumberOfPages();
  const footerItems = [
    'LICENSED & INSURED',
    'DIGITAL REPORT EVERY VISIT',
    'FREE ESTIMATES',
    'QUICK EMERGENCY RESPONSE',
  ];
  const footerColumnWidth = contentWidth / footerItems.length;
  for (let page = 1; page <= pageCount; page += 1) {
    doc.setPage(page);
    setFillColor(doc, navy);
    doc.rect(0, footerTop, pageWidth, pageHeight - footerTop, 'F');
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(5.5);
    doc.setCharSpace(0.7);
    doc.setTextColor(255, 255, 255);
    footerItems.forEach((item, index) => {
      doc.text(
        item,
        margin + footerColumnWidth * index + footerColumnWidth / 2,
        footerTop + 20,
        { align: 'center' },
      );
      if (index > 0) {
        setDrawColor(doc, [139, 205, 242]);
        doc.setLineWidth(0.7);
        const separatorX = margin + footerColumnWidth * index;
        doc.line(separatorX, footerTop + 10, separatorX, footerTop + 25);
      }
    });
    doc.setCharSpace(0);
    doc.setFontSize(6);
    setTextColor(doc, mediumBlue);
    doc.text(`${proposalNumber}  |  ${page}/${pageCount}`, pageWidth - margin, footerTop - 6, {
      align: 'right',
    });
  }
}

export async function createProposalPdf(data: ProposalPdfData) {
  const doc = new jsPDF({ unit: 'pt', format: 'letter', orientation: 'portrait' });
  const allocations = allocateProposalCosts(
    data.waterBodies,
    data.monthlyTransportationCost,
    data.discountPercentage,
    data.totalMonthlyInvestment,
  );
  let headerImage: string | null = null;
  let logoImage: string | null = null;
  try {
    headerImage = await loadImageAsDataUrl('/proposal-pool-header-fade.png');
  } catch (error) {
    console.warn('Proposal header image was unavailable; using the vector fallback.', error);
  }
  try {
    logoImage = await loadImageAsDataUrl('/blue-life-logo.png');
  } catch (error) {
    console.warn('Blue Life logo was unavailable; using the vector fallback.', error);
  }

  drawHeroHeader(doc, headerImage, logoImage, data.proposalNumber);
  let y = drawProposalDetails(doc, data, 123);

  const newPage = () => {
    doc.addPage();
    drawCompactHeader(doc, logoImage, data.proposalNumber);
    y = 62;
  };
  const ensureSpace = (height: number) => {
    if (y + height > footerTop - 6) newPage();
  };

  y = drawSectionTitle(doc, 'Water bodies', y + 2);
  y = drawWaterTableHeader(doc, y);
  allocations.forEach((line, index) => {
    if (y + 30 > footerTop - 6) {
      newPage();
      y = drawSectionTitle(doc, 'Water bodies (continued)', y);
      y = drawWaterTableHeader(doc, y);
    }
    y = drawWaterTableRow(doc, line, index, y);
  });

  const servicesHeight = 45 + Math.max(28, Math.ceil(data.services.length / 4) * 25 + 3);
  ensureSpace(servicesHeight);
  y = drawServices(doc, data.services, y + 8);

  ensureSpace(72);
  const weeklyVisits = data.waterBodies.map((body) => Number.parseInt(body.frequency, 10) || 1);
  const minWeeklyVisits = Math.min(...weeklyVisits);
  const maxWeeklyVisits = Math.max(...weeklyVisits);
  const frequencyLabel = minWeeklyVisits === maxWeeklyVisits
    ? `${maxWeeklyVisits} visits per week`
    : `${minWeeklyVisits}-${maxWeeklyVisits} visits per week`;
  y = drawInvestment(doc, data, frequencyLabel, y + 8);

  ensureSpace(106);
  y = drawNextSteps(doc, y + 9);

  ensureSpace(62);
  drawClosingMessage(doc, y + 5);
  drawPageFooters(doc, data.proposalNumber);

  doc.setProperties({
    title: `${data.proposalNumber} - ${data.propertyName}`,
    subject: 'Monthly pool service proposal',
    author: 'Blue Life Pool Service LLC',
    creator: 'Blue Life CRM',
  });

  return {
    blob: doc.output('blob'),
    fileName: `${safeFilePart(data.propertyName)}-${data.proposalNumber}.pdf`,
    allocations,
  };
}
