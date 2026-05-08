import React, { useEffect, useMemo, useRef, useState } from "react";
import Card from "../components/Card";
import Pagination, { usePagination } from "../components/Pagination";
import SearchBar, { buildSuggestions, useSearch } from "../components/SearchBar";
import { api, forceDownloadAuthorized, viewAuthorized } from "../api";
import { getBookingType, getRole } from "../auth";
import { getBookingProfile } from "../bookingProfiles";

const blankForm = {
  billing_mode: "line_item",
  status: "draft",
  package_amount: 0,
  discount_amount: 0,
  tax_percent: 18,
  other_amount: 0,
  damage_charge_amount: 0,
  damage_charge_note: "",
  off_days_payable: false,
  amount_received: 0,
  payment_received_at: "",
  payment_mode: "",
  payment_details: "",
  payment_committed_date: "",
  notes: "",
};

function money(value) {
  return Number(value || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 });
}

function totalLineItems(lines) {
  return lines.reduce((sum, item) => sum + Number(item.amount || 0), 0);
}

function LedgerSection({ title, meta, defaultOpen = false, children }) {
  return (
    <details className="ledgerSection" open={defaultOpen}>
      <summary className="ledgerSectionSummary">
        <span>{title}</span>
        <strong>{meta}</strong>
      </summary>
      <div className="ledgerSectionBody">{children}</div>
    </details>
  );
}

export default function AccountsPage() {
  const role = getRole();
  const bookingProfile = getBookingProfile(getBookingType());
  const supportsServiceJobs = Boolean(bookingProfile.features.serviceJobs);
  const [activeSection, setActiveSection] = useState("overview");
  const [bookings, setBookings] = useState([]);
  const [selectedBookingId, setSelectedBookingId] = useState("");
  const [estimate, setEstimate] = useState(null);
  const [lineItems, setLineItems] = useState([]);
  const [payoutItems, setPayoutItems] = useState([]);
  const [form, setForm] = useState(blankForm);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [ledger, setLedger] = useState(null);
  const [paymentDraft, setPaymentDraft] = useState(null);
  const [barterDraft, setBarterDraft] = useState(null);
  const [paymentHistory, setPaymentHistory] = useState(null);
  const [overviewDetail, setOverviewDetail] = useState(null);
  const [tallyDetail, setTallyDetail] = useState(null);
  const [billingSearch, setBillingSearch] = useState("");
  const [workspaceSearch, setWorkspaceSearch] = useState("");
  const [ledgerSearch, setLedgerSearch] = useState("");
  const [invoiceSearch, setInvoiceSearch] = useState("");
  const [inboundSearch, setInboundSearch] = useState("");
  const workspaceRef = useRef(null);

  function scrollWorkspaceIntoFocus() {
    window.setTimeout(() => {
      const node = workspaceRef.current || document.getElementById("accounts-workspace");
      if (node) {
        node.scrollIntoView({ behavior: "smooth", block: "start" });
        if (typeof node.focus === "function") node.focus({ preventScroll: true });
      }
    }, 80);
  }

  const billingBookings = useSearch(bookings, billingSearch);
  const workspaceBookings = useSearch(bookings, workspaceSearch);
  const pgBookings = usePagination(billingBookings, 10);
  const pgWorkspaceBookings = usePagination(workspaceBookings, 10);
  const selectedBooking = bookings.find(booking => booking.id === Number(selectedBookingId));
  const existingInvoice = estimate?.invoice || selectedBooking?.invoice || null;
  const lockedForUser = Boolean(existingInvoice && role !== "admin");
  const billedBookings = useMemo(() => bookings.filter(booking => booking.invoice), [bookings]);
  const searchedBilledBookings = useSearch(billedBookings, invoiceSearch);
  const pgInvoices = usePagination(searchedBilledBookings, 10);
  const inboundBills = useMemo(() => ledger ? [...(ledger.vendor_bills || []).map(row => ({ ...row, type: "Vendor" })), ...(supportsServiceJobs ? (ledger.service_bills || []).map(row => ({ ...row, type: "Service" })) : [])] : [], [ledger, supportsServiceJobs]);
  const searchedInboundBills = useSearch(inboundBills, inboundSearch);
  const pgInboundBills = usePagination(searchedInboundBills, 10);
  const ledgerReceivables = useSearch(ledger?.client_receivables || [], ledgerSearch);
  const ledgerManpower = useSearch(ledger?.manpower_payouts || [], ledgerSearch);
  const ledgerVendors = useSearch(ledger?.vendor_bills || [], ledgerSearch);
  const ledgerServices = useSearch(supportsServiceJobs ? (ledger?.service_bills || []) : [], ledgerSearch);
  const pgLedgerReceivables = usePagination(ledgerReceivables, 10);
  const pgLedgerManpower = usePagination(ledgerManpower, 10);
  const pgLedgerVendors = usePagination(ledgerVendors, 10);
  const pgLedgerServices = usePagination(ledgerServices, 10);
  const hasManpowerPayout = payoutItems.some(item => Number(item.crew_count || 0) > 0 || Number(item.amount || 0) > 0);
  const invoiceByNumber = useMemo(() => {
    const mapped = {};
    billedBookings.forEach(booking => {
      if (booking.invoice?.invoice_number) mapped[booking.invoice.invoice_number] = booking;
    });
    return mapped;
  }, [billedBookings]);
  const overviewCards = useMemo(() => {
    if (!ledger) return [];
    const receivables = ledger.client_receivables || [];
    const manpower = ledger.manpower_payouts || [];
    const vendors = ledger.vendor_bills || [];
    const services = supportsServiceJobs ? (ledger.service_bills || []) : [];
    const dueReceivables = receivables.filter(row => Number(row.amount_due || 0) > 0);
    const committedReceivables = [...dueReceivables].sort((a, b) => String(a.payment_committed_date || "9999-99-99").localeCompare(String(b.payment_committed_date || "9999-99-99")));
    const payoutPending = manpower.filter(row => Number(row.balance_due || 0) > 0);
    const vendorPending = vendors.filter(row => Number(row.due_amount || 0) > 0);
    const servicePending = services.filter(row => Number(row.due_amount || 0) > 0);
    const outboundDue = Number(ledger.summary?.manpower_due || 0) + Number(ledger.summary?.vendor_due || 0) + (supportsServiceJobs ? Number(ledger.summary?.service_due || 0) : 0);
    return [
      {
        title: "Inbound Receivables / Part Payments",
        value: `INR ${money(ledger.summary?.client_due)}`,
        subtitle: `${dueReceivables.length} invoices pending from clients`,
        cta: "Go to Part Payments",
        section: "ledger",
        rows: committedReceivables.map(row => ({
          Reference: row.invoice_number,
          Party: row.client_name,
          Amount: `INR ${money(row.amount_due)}`,
          Date: row.payment_committed_date || "No committed date",
          Details: row.details || "-",
        })),
      },
      {
        title: "Outbound Part Payments",
        value: `INR ${money(outboundDue)}`,
        subtitle: `${payoutPending.length + vendorPending.length + servicePending.length} payout/bill entries pending`,
        cta: "Go to Part Payments",
        section: "ledger",
        rows: [
          ...payoutPending.map(row => ({ Reference: row.reference, Party: row.role, Amount: `INR ${money(row.balance_due)}`, Date: row.payment_date || "-", Details: row.details || "-" })),
          ...vendorPending.map(row => ({ Reference: row.reference, Party: row.vendor_name, Amount: `INR ${money(row.due_amount)}`, Date: row.payment_date || "-", Details: row.details || "-" })),
          ...servicePending.map(row => ({ Reference: row.reference, Party: row.vendor_name, Amount: `INR ${money(row.due_amount)}`, Date: row.payment_date || "-", Details: row.details || "-" })),
        ],
      },
      {
        title: "Client Bills Raised",
        value: `INR ${money(ledger.summary?.client_total_billed)}`,
        subtitle: `Received INR ${money(ledger.summary?.client_received)} across ${receivables.length} invoices`,
        cta: "Go to Saved Invoices",
        section: "invoices",
        rows: receivables.map(row => ({
          Reference: row.invoice_number,
          Party: row.client_name,
          Amount: `INR ${money(row.total_amount)}`,
          Date: row.payment_received_at || row.payment_committed_date || "-",
          Details: `Received INR ${money(row.amount_received)} · Due INR ${money(row.amount_due)}`,
        })),
      },
      {
        title: "Net Cash Position",
        value: `INR ${money(ledger.summary?.net_cash_position)}`,
        subtitle: "Received amount minus pending manpower, vendor, and service outflows",
        cta: "Go to Overview",
        section: "overview",
        rows: [
          { Reference: "Client received", Party: "Inbound", Amount: `INR ${money(ledger.summary?.client_received)}`, Date: "-", Details: "Cash already received" },
          { Reference: "Manpower due", Party: "Outbound", Amount: `INR ${money(ledger.summary?.manpower_due)}`, Date: "-", Details: "Internal crew payouts pending" },
          { Reference: "Vendor due", Party: "Outbound", Amount: `INR ${money(ledger.summary?.vendor_due)}`, Date: "-", Details: "Vendor procurement bills pending" },
          ...(supportsServiceJobs ? [{ Reference: "Service due", Party: "Outbound", Amount: `INR ${money(ledger.summary?.service_due)}`, Date: "-", Details: "Repair/service bills pending" }] : []),
        ],
      },
      {
        title: "Unbilled Bookings",
        value: `${bookings.filter(booking => !booking.invoice).length}`,
        subtitle: "Events still waiting for invoice creation",
        cta: "Go to Booking Billing",
        section: "billing",
        rows: bookings.filter(booking => !booking.invoice).map(booking => ({
          Reference: booking.job_card_id,
          Party: booking.client_name,
          Amount: "Not billed",
          Date: booking.status,
          Details: booking.project_title,
        })),
      },
    ];
  }, [ledger, bookings, supportsServiceJobs]);

  const totals = useMemo(() => {
    const lineSubtotal = form.billing_mode === "package" ? Number(form.package_amount || 0) : totalLineItems(lineItems);
    const subtotal = Math.max(0, lineSubtotal + Number(form.other_amount || 0) + Number(form.damage_charge_amount || 0) - Number(form.discount_amount || 0));
    const tax = subtotal * (Number(form.tax_percent || 0) / 100);
    const total = subtotal + tax;
    const payout = payoutItems.reduce((sum, item) => sum + Number(item.amount || 0), 0);
    return { subtotal, tax, total, payout, margin: subtotal - payout };
  }, [form, lineItems, payoutItems]);

  function load() {
    api.accountsBookings()
      .then(setBookings)
      .catch(error => setMessage(String(error.message || error)));
    api.accountsLedger()
      .then(setLedger)
      .catch(error => setMessage(String(error.message || error)));
  }

  useEffect(() => { load(); }, []);

  async function loadEstimate(bookingId, offDaysPayable = form.off_days_payable, useFreshEstimate = false) {
    setSelectedBookingId(String(bookingId));
    setActiveSection("billing");
    scrollWorkspaceIntoFocus();
    setLoading(true);
    try {
      const data = await api.accountEstimate(bookingId, offDaysPayable);
      setEstimate(data);
      const invoice = data.invoice;
      if (invoice && !useFreshEstimate) {
        const savedItems = invoice.line_items || [];
        const damageCharge = savedItems.find(item => item.category === "damage_missing");
        setLineItems(savedItems.filter(item => item.category !== "damage_missing"));
        setPayoutItems(invoice.payout_items || []);
        setForm({
          billing_mode: invoice.billing_mode || "line_item",
          status: invoice.status || "draft",
          package_amount: invoice.package_amount || 0,
          discount_amount: invoice.discount_amount || 0,
          tax_percent: invoice.tax_percent ?? 18,
          other_amount: invoice.other_amount || 0,
          damage_charge_amount: Number(damageCharge?.amount || 0),
          damage_charge_note: damageCharge?.label || "",
          off_days_payable: Boolean(invoice.off_days_payable),
          amount_received: invoice.amount_received || 0,
          payment_received_at: invoice.payment_received_at || "",
          payment_mode: invoice.payment_mode || "",
          payment_details: invoice.payment_details || "",
          payment_committed_date: invoice.payment_committed_date || "",
          notes: invoice.notes || "",
        });
      } else {
        setLineItems(data.line_items || []);
        setPayoutItems(data.payout_items || []);
        if (useFreshEstimate) {
          setForm(prev => ({
            ...prev,
            off_days_payable: Boolean(data.off_days_payable),
            package_amount: prev.billing_mode === "package" ? prev.package_amount : (prev.package_amount || data.subtotal_amount || 0),
          }));
        } else {
          setForm({ ...blankForm, off_days_payable: Boolean(data.off_days_payable), package_amount: data.subtotal_amount || 0 });
        }
      }
    } catch (error) {
      setMessage(String(error.message || error));
    }
    setLoading(false);
  }

  async function refreshInternalPayoutDays(offDaysPayable) {
    if (!selectedBookingId) return;
    try {
      const data = await api.accountEstimate(selectedBookingId, offDaysPayable);
      // Off days payable affects BOTH manpower payout days AND the billing-side manpower line items,
      // so rehydrate both line_items and payout_items from the fresh estimate.
      setEstimate(prev => ({ ...(prev || {}), ...data }));
      setLineItems(data.line_items || []);
      setPayoutItems(data.payout_items || []);
      setForm(prev => ({ ...prev, off_days_payable: Boolean(data.off_days_payable) }));
    } catch (error) {
      setMessage(String(error.message || error));
    }
  }

  function updateLine(index, patch) {
    setLineItems(items => items.map((item, i) => {
      if (i !== index) return item;
      const next = { ...item, ...patch };
      if ("quantity" in patch || "rate" in patch) {
        next.amount = Number(next.quantity || 0) * Number(next.rate || 0);
      }
      return next;
    }));
  }

  function updatePayout(index, patch) {
    setPayoutItems(items => items.map((item, i) => {
      if (i !== index) return item;
      const next = { ...item, ...patch };
      if ("days" in patch || "crew_count" in patch || "payout_rate" in patch) {
        next.amount = Number(next.days || 0) * Number(next.crew_count || 0) * Number(next.payout_rate || 0);
      }
      return next;
    }));
  }

  async function viewInvoice(invoice) {
    if (!invoice?.id) return;
    try {
      await viewAuthorized(api.accountInvoicePdfUrl(invoice.id), `${invoice.invoice_number || `invoice_${invoice.id}`}.pdf`);
    } catch (error) {
      setMessage(String(error.message || error));
    }
  }

  async function downloadInvoice(invoice) {
    if (!invoice?.id) return;
    try {
      await forceDownloadAuthorized(api.accountInvoicePdfUrl(invoice.id), `${invoice.invoice_number || `invoice_${invoice.id}`}.pdf`);
    } catch (error) {
      setMessage(String(error.message || error));
    }
  }

  function viewLedgerInvoice(invoiceNumber) {
    const invoice = invoiceByNumber[invoiceNumber]?.invoice;
    if (invoice) viewInvoice(invoice);
  }

  function downloadLedgerInvoice(invoiceNumber) {
    const invoice = invoiceByNumber[invoiceNumber]?.invoice;
    if (invoice) downloadInvoice(invoice);
  }

  function openPayment(entryType, reference, label, balanceDue) {
    const maxAmount = Math.max(0, Number(balanceDue || 0));
    if (maxAmount <= 0) {
      setMessage("No pending balance is left against this reference. Payment entry is not required.");
      return;
    }
    setPaymentDraft({
      entry_type: entryType,
      reference,
      label,
      max_amount: maxAmount,
      payment_kind: "part",
      amount: 0,
      payment_date: new Date().toISOString().slice(0, 10),
      payment_mode: "",
      details: "",
    });
  }

  async function saveLedgerPayment() {
    if (!paymentDraft) return;
    const maxAmount = Math.max(0, Number(paymentDraft.max_amount || 0));
    const requestedAmount = paymentDraft.payment_kind === "full" ? maxAmount : Number(paymentDraft.amount || 0);
    if (requestedAmount <= 0) { setMessage("Enter a payment amount greater than zero."); return; }
    if (requestedAmount > maxAmount) { setMessage(`Payment cannot exceed pending balance INR ${money(maxAmount)}.`); return; }
    try {
      const data = await api.recordLedgerPayment({ ...paymentDraft, amount: requestedAmount });
      setLedger(data);
      setPaymentDraft(null);
      load();
      setMessage(`${paymentDraft.payment_kind === "full" ? "Full" : "Part"} payment entry saved.`);
    } catch (error) {
      setMessage(String(error.message || error));
    }
  }

  function openBarter() {
    const clientRef = ledger?.client_receivables?.find(row => Number(row.amount_due || 0) > 0)?.invoice_number || "";
    const vendorRef = ledger?.vendor_bills?.find(row => Number(row.due_amount || 0) > 0)?.reference || "";
    setBarterDraft({ client_reference: clientRef, vendor_reference: vendorRef, amount: 0, notes: "" });
  }

  async function saveBarter() {
    if (!barterDraft) return;
    try {
      await api.recordBarter(barterDraft);
      setBarterDraft(null);
      load();
      setMessage("Vendor-as-client barter saved.");
    } catch (error) {
      setMessage(String(error.message || error));
    }
  }

  async function pushTally(invoice, mode = "invoice") {
    if (!invoice?.id) return;
    try {
      const result = mode === "receipt" ? await api.pushReceiptToTally(invoice.id) : await api.pushInvoiceToTally(invoice.id);
      setMessage(`Tally ${mode} sync queued. Job #${result.job_id}.`);
      load();
    } catch (error) {
      setMessage(String(error.message || error));
    }
  }

  async function resyncTally(invoice) {
    if (!invoice?.id) return;
    try {
      const result = await api.resyncInvoiceToTally(invoice.id);
      setMessage(`Tally re-sync queued. Job #${result.job_id}.`);
      load();
    } catch (error) {
      setMessage(String(error.message || error));
    }
  }

  async function showTallyStatus(invoice) {
    if (!invoice?.id) return;
    try {
      const [status, history] = await Promise.all([api.tallyStatus(invoice.id), api.tallyHistory(invoice.id)]);
      setTallyDetail({ invoice, status, history });
    } catch (error) {
      setMessage(String(error.message || error));
    }
  }

  async function saveInvoice() {
    if (!selectedBookingId) {
      setMessage("Select a booking first.");
      return;
    }
    if (lockedForUser) {
      setMessage("This bill already exists. Only admin can modify it.");
      return;
    }
    const finalStatuses = ["approved", "sent", "paid", "full_invoice", "final_invoice"];
    if (finalStatuses.includes(String(form.status || "").toLowerCase()) && !["returned", "closed", "completed"].includes(String(estimate?.booking_status || "").toLowerCase())) {
      setMessage("Full/final invoice is blocked until the booking is returned or closed. Use Draft / Part Invoice before return.");
      return;
    }
    setSaving(true);
    try {
      const billingLineItems = Number(form.damage_charge_amount || 0) > 0
        ? [...lineItems, { category: "damage_missing", label: form.damage_charge_note || "Damage / missing item charge", quantity: 1, rate: Number(form.damage_charge_amount || 0), amount: Number(form.damage_charge_amount || 0) }]
        : lineItems;
      const payload = {
        booking_id: Number(selectedBookingId),
        billing_mode: form.billing_mode,
        status: form.status,
        package_amount: Number(form.package_amount || 0),
        equipment_amount: lineItems.filter(item => ["day", "equipment"].includes(item.category)).reduce((sum, item) => sum + Number(item.amount || 0), 0),
        manpower_amount: lineItems.filter(item => item.category === "manpower").reduce((sum, item) => sum + Number(item.amount || 0), 0),
        logistics_amount: lineItems.filter(item => item.category === "logistics").reduce((sum, item) => sum + Number(item.amount || 0), 0),
        other_amount: Number(form.other_amount || 0),
        discount_amount: Number(form.discount_amount || 0),
        tax_percent: Number(form.tax_percent || 0),
        manpower_payout_amount: totals.payout,
        off_days_payable: Boolean(form.off_days_payable),
        amount_received: Number(form.amount_received || 0),
        payment_received_at: form.payment_received_at || null,
        payment_mode: form.payment_mode || null,
        payment_details: form.payment_details || null,
        payment_committed_date: form.payment_committed_date || null,
        line_items: billingLineItems,
        payout_items: payoutItems,
        notes: form.notes,
      };
      const saved = existingInvoice
        ? await api.updateAccountInvoice(existingInvoice.id, payload)
        : await api.saveAccountInvoice(payload);
      setMessage(`Bill ${saved.invoice_number} saved. Total INR ${money(saved.total_amount)}.`);
      await loadEstimate(selectedBookingId);
      load();
    } catch (error) {
      setMessage(String(error.message || error));
    }
    setSaving(false);
  }

  return (
    <div className="page">
      <h1 className="pageTitle">Accounts & Event Billing</h1>
      <div className="sectionJumpBar">
        <button className={activeSection === "overview" ? "activeSectionTab" : ""} type="button" onClick={() => setActiveSection("overview")}>Overview</button>
        <button className={activeSection === "billing" ? "activeSectionTab" : ""} type="button" onClick={() => setActiveSection("billing")}>Booking Billing</button>
        <button className={activeSection === "ledger" ? "activeSectionTab" : ""} type="button" onClick={() => setActiveSection("ledger")}>Part Payments / Ledger</button>
        <button className={activeSection === "invoices" ? "activeSectionTab" : ""} type="button" onClick={() => setActiveSection("invoices")}>Saved Invoices</button>
      </div>
      {message ? <div className="messageBar">{message} <button className="dismissBtn" onClick={() => setMessage("")}>Dismiss</button></div> : null}

      {barterDraft ? <div className="modalOverlay">
        <div className="modalCard profileModal">
          <div className="modalHeader">
            <h2>Vendor-as-Client Barter</h2>
            <button className="ghostBtn compactBtn" type="button" onClick={() => setBarterDraft(null)}>Close</button>
          </div>
          <div className="formGrid">
            <label className="fieldLabel">Bill Vendor As Client</label>
            <select value={barterDraft.client_reference || ""} onChange={event => setBarterDraft({ ...barterDraft, client_reference: event.target.value })}>
              <option value="">Select invoice</option>
              {(ledger?.client_receivables || []).map(row => <option key={row.invoice_number} value={row.invoice_number}>{row.invoice_number} / {row.client_name} / Due INR {money(row.amount_due)}</option>)}
            </select>
            <label className="fieldLabel">Vendor Payment Bill</label>
            <select value={barterDraft.vendor_reference || ""} onChange={event => setBarterDraft({ ...barterDraft, vendor_reference: event.target.value })}>
              <option value="">Select vendor bill</option>
              {(ledger?.vendor_bills || []).map(row => <option key={row.reference} value={row.reference}>{row.reference} / {row.vendor_name} / Due INR {money(row.due_amount)}</option>)}
            </select>
            <label className="fieldLabel">Amount</label>
            <input type="number" value={barterDraft.amount || 0} onChange={event => setBarterDraft({ ...barterDraft, amount: Number(event.target.value || 0) })} />
            <label className="fieldLabel">Notes</label>
            <input value={barterDraft.notes || ""} onChange={event => setBarterDraft({ ...barterDraft, notes: event.target.value })} placeholder="Adjustment note" />
          </div>
          <div className="modalFooter">
            <button className="ghostBtn" type="button" onClick={() => setBarterDraft(null)}>Cancel</button>
            <button className="primaryBtn" type="button" onClick={saveBarter}>Settle by Barter</button>
          </div>
        </div>
      </div> : null}

      {paymentHistory ? <div className="modalOverlay">
        <div className="modalCard profileModal">
          <div className="modalHeader">
            <h2>Part Payment History</h2>
            <button className="ghostBtn compactBtn" type="button" onClick={() => setPaymentHistory(null)}>Close</button>
          </div>
          <p className="helperText">{paymentHistory.label}</p>
          <div className="tableWrap">
            <table>
              <thead><tr><th>Date</th><th>Amount</th><th>Mode</th><th>Details</th><th>By</th></tr></thead>
              <tbody>
                {(paymentHistory.payments || []).length === 0 ? <tr><td colSpan="5" className="helperText">No part payments recorded yet.</td></tr> : paymentHistory.payments.map((row, index) => (
                  <tr key={`${row.created_at || row.payment_date}-${index}`}>
                    <td>{row.payment_date || "-"}</td>
                    <td>INR {money(row.amount)}</td>
                    <td>{row.payment_mode || "-"}</td>
                    <td>{row.details || "-"}</td>
                    <td>{row.created_by || "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="modalFooter">
            <button className="ghostBtn" type="button" onClick={() => setPaymentHistory(null)}>Close</button>
          </div>
        </div>
      </div> : null}

      {paymentDraft ? <div className="modalOverlay">
        <div className="modalCard profileModal accountsPaymentModal">
          <div className="modalHeader">
            <h2>{paymentDraft.entry_type === "client" ? "Receive Payment" : "Make Payment"}</h2>
            <button className="ghostBtn compactBtn" type="button" onClick={() => setPaymentDraft(null)}>Close</button>
          </div>
          <p className="helperText">{paymentDraft.label}</p>
          <div className="accountsSummaryGrid paymentSummaryGrid">
            <div><span>Reference</span><strong>{paymentDraft.reference}</strong></div>
            <div><span>Pending Balance</span><strong>INR {money(paymentDraft.max_amount)}</strong></div>
            <div><span>Action</span><strong>{paymentDraft.entry_type === "client" ? "Receive from client" : "Pay vendor / manpower"}</strong></div>
          </div>
          <div className="formGrid paymentFormGrid">
            <label className="fieldLabel">Payment Type</label>
            <select value={paymentDraft.payment_kind || "part"} onChange={event => setPaymentDraft({ ...paymentDraft, payment_kind: event.target.value, amount: event.target.value === "full" ? paymentDraft.max_amount : paymentDraft.amount })}>
              <option value="part">Part Payment</option>
              <option value="full">Full Payment</option>
            </select>
            <label className="fieldLabel">Amount</label>
            <input type="number" min="0" max={paymentDraft.max_amount || 0} disabled={paymentDraft.payment_kind === "full"} value={paymentDraft.payment_kind === "full" ? paymentDraft.max_amount : paymentDraft.amount} onChange={event => {
              const maxAmount = Number(paymentDraft.max_amount || 0);
              const value = Math.min(maxAmount, Math.max(0, Number(event.target.value || 0)));
              setPaymentDraft({ ...paymentDraft, amount: value });
            }} />
            <label className="fieldLabel">Payment Date</label>
            <input type="date" value={paymentDraft.payment_date || ""} onChange={event => setPaymentDraft({ ...paymentDraft, payment_date: event.target.value })} />
            <label className="fieldLabel">Mode</label>
            <select value={paymentDraft.payment_mode || ""} onChange={event => setPaymentDraft({ ...paymentDraft, payment_mode: event.target.value })}>
              <option value="">Select mode</option><option>bank_transfer</option><option>upi</option><option>cheque</option><option>cash</option><option>adjustment</option>
            </select>
            <label className="fieldLabel full">Details</label>
            <input className="full" value={paymentDraft.details || ""} onChange={event => setPaymentDraft({ ...paymentDraft, details: event.target.value })} placeholder="UTR / voucher / cheque no. / approval note" />
          </div>
          <div className="qcWarning">System will not allow receipt/payment above INR {money(paymentDraft.max_amount)}.</div>
          <div className="modalFooter">
            <button className="ghostBtn" type="button" onClick={() => setPaymentDraft(null)}>Cancel</button>
            <button className="primaryBtn" type="button" onClick={saveLedgerPayment} disabled={Number(paymentDraft.max_amount || 0) <= 0}>Save {paymentDraft.payment_kind === "full" ? "Full" : "Part"} Payment</button>
          </div>
        </div>
      </div> : null}

      {overviewDetail ? <div className="modalOverlay">
        <div className="modalCard">
          <div className="modalHeader">
            <h2>{overviewDetail.title}</h2>
            <button className="ghostBtn compactBtn" type="button" onClick={() => setOverviewDetail(null)}>Close</button>
          </div>
          <p className="helperText">{overviewDetail.subtitle}</p>
          <div className="tableWrap">
            <table>
              <thead><tr><th>Reference</th><th>Party</th><th>Amount</th><th>Date / Status</th><th>Details</th></tr></thead>
              <tbody>
                {(overviewDetail.rows || []).length === 0 ? <tr><td colSpan="5" className="helperText">No entries for this view.</td></tr> : overviewDetail.rows.map((row, index) => (
                  <tr key={`${row.Reference}-${index}`}>
                    <td>{row.Reference}</td><td>{row.Party}</td><td>{row.Amount}</td><td>{row.Date}</td><td>{row.Details}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="modalFooter">
            <button className="ghostBtn" type="button" onClick={() => setOverviewDetail(null)}>Close</button>
            <button className="primaryBtn" type="button" onClick={() => { setActiveSection(overviewDetail.section); setOverviewDetail(null); }}>{overviewDetail.cta}</button>
          </div>
        </div>
      </div> : null}

      {tallyDetail ? <div className="modalOverlay">
        <div className="modalCard">
          <div className="modalHeader">
            <h2>Tally Sync Status</h2>
            <button className="ghostBtn compactBtn" type="button" onClick={() => setTallyDetail(null)}>Close</button>
          </div>
          <div className="accountsSummaryGrid">
            <div><span>Invoice</span><strong>{tallyDetail.invoice.invoice_number}</strong></div>
            <div><span>Status</span><strong>{tallyDetail.status.status || "not_synced"}</strong></div>
            <div><span>Voucher No.</span><strong>{tallyDetail.status.voucher_number || "-"}</strong></div>
            <div><span>Outstanding</span><strong>{tallyDetail.status.outstanding_amount ?? "-"}</strong></div>
            <div><span>Last Sync</span><strong>{tallyDetail.status.last_sync_time || "-"}</strong></div>
          </div>
          {tallyDetail.status.last_error ? <div className="messageBar">{tallyDetail.status.last_error}</div> : null}
          <div className="tableWrap">
            <table>
              <thead><tr><th>Job</th><th>Type</th><th>Status</th><th>Retries</th><th>Error</th><th>Processed</th></tr></thead>
              <tbody>
                {(tallyDetail.history || []).map(job => (
                  <tr key={job.id}><td>{job.id}</td><td>{job.job_type}</td><td>{job.status}</td><td>{job.retry_count}</td><td>{job.last_error || "-"}</td><td>{job.processed_at || "-"}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="modalFooter">
            <button className="ghostBtn" type="button" onClick={() => setTallyDetail(null)}>Close</button>
            <button className="primaryBtn" type="button" onClick={() => { setActiveSection("ledger"); setTallyDetail(null); }}>Go to Accounts Ledger</button>
          </div>
        </div>
      </div> : null}

      {activeSection === "overview" ? <Card title="Accounts Overview">
        {!ledger ? <div className="helperText">Loading overview...</div> : (
          <div className="overviewMetricGrid">
            {overviewCards.map(card => (
              <button className="overviewMetricCard" type="button" key={card.title} onClick={() => setOverviewDetail(card)}>
                <span>{card.title}</span>
                <strong>{card.value}</strong>
                <small>{card.subtitle}</small>
              </button>
            ))}
          </div>
        )}
      </Card> : null}

      {activeSection === "billing" ? <>
      <div className="grid2" id="accounts-billable">
        <Card title="Billable Events">
          <div className="listToolbar">
            <SearchBar value={billingSearch} onChange={value => { setBillingSearch(value); pgBookings.setPage(1); }} suggestions={buildSuggestions(bookings)} placeholder="Search billable events by job card, invoice, project, client, status..." />
            <span className="helperText">{billingBookings.length} event(s)</span>
          </div>
          <div className="tableWrap">
            <table>
              <thead><tr><th>Job Card</th><th>Project</th><th>Client</th><th>Status</th><th>Bill</th><th>Action</th></tr></thead>
              <tbody>
                {pgBookings.pageData.map(booking => (
                  <tr key={booking.id}>
                    <td>
                      {booking.job_card_id}
                      {(booking.supplementary_job_cards || []).length > 0 ? <div className="helperText">Includes: {(booking.supplementary_job_cards || []).join(", ")}</div> : null}
                    </td>
                    <td>{booking.project_title}</td>
                    <td>{booking.client_name}</td>
                    <td><span className={`statusBadge status-${booking.status}`}>{booking.status}</span></td>
                    <td>{booking.invoice ? `${booking.invoice.invoice_number} / INR ${money(booking.invoice.total_amount)}` : "Not billed"}</td>
                    <td>
                      <div className="invoiceActionGroup">
                        <button className="ghostBtn compactBtn" type="button" onClick={() => loadEstimate(booking.id)}>Open</button>
                        <button className="ghostBtn compactBtn" type="button" disabled={!booking.invoice} onClick={() => viewInvoice(booking.invoice)}>View PDF</button>
                        <button className="downloadBtn compactBtn" type="button" disabled={!booking.invoice} onClick={() => downloadInvoice(booking.invoice)}>Download PDF</button>
                        <button className="primaryBtn compactBtn" type="button" disabled={!booking.invoice} onClick={() => pushTally(booking.invoice)}>Push to Tally</button>
                        <button className="ghostBtn compactBtn" type="button" disabled={!booking.invoice} onClick={() => showTallyStatus(booking.invoice)}>{booking.invoice?.tally_status?.voucher_number || "Sync Status"}</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination total={pgBookings.total} page={pgBookings.page} pageSize={pgBookings.pageSize} onPageChange={pgBookings.setPage} onPageSizeChange={pgBookings.setPageSize} />
        </Card>

        <Card title="Billing Business Logic">
          <ul className="alertList">
            <li>Travel, setup, technical, event, off, packup/end, and return days are counted separately from the booking calendar.</li>
            <li>Line item mode bills days, equipment, manpower, and logistics separately. Package mode bills one package amount but still tracks manpower payout and margin.</li>
            <li>First bill can be created by Accounts/Admin permission. Any modification after creation is admin-only.</li>
            <li>Operational edits to bookings and core master records are now admin-only after creation.</li>
          </ul>
        </Card>
      </div>

      <div id="accounts-workspace" ref={workspaceRef} tabIndex="-1">
      <Card title={estimate ? `Billing: ${estimate.job_card_id} - ${estimate.project_title}` : "Billing Workspace"}>
        {!estimate ? (
          <div className="accountsWorkspace">
            <div className="helperText">Select any billable event above or below to calculate or review billing.</div>
            <div className="listToolbar">
              <SearchBar value={workspaceSearch} onChange={value => { setWorkspaceSearch(value); pgWorkspaceBookings.setPage(1); }} suggestions={buildSuggestions(bookings)} placeholder="Search workspace by job card, project, client, invoice..." />
              <span className="helperText">{workspaceBookings.length} event(s)</span>
            </div>
            <div className="tableWrap">
              <table>
                <thead><tr><th>Job Card</th><th>Project</th><th>Client</th><th>Status</th><th>Bill</th><th>Actions</th></tr></thead>
                <tbody>
                  {pgWorkspaceBookings.pageData.map(booking => (
                    <tr key={booking.id}>
                      <td>
                        {booking.job_card_id}
                        {(booking.supplementary_job_cards || []).length > 0 ? <div className="helperText">Includes: {(booking.supplementary_job_cards || []).join(", ")}</div> : null}
                      </td>
                      <td>{booking.project_title}</td>
                      <td>{booking.client_name}</td>
                      <td><span className={`statusBadge status-${booking.status}`}>{booking.status}</span></td>
                      <td>{booking.invoice ? `${booking.invoice.invoice_number} / INR ${money(booking.invoice.total_amount)}` : "Not billed"}</td>
                      <td>
                        <div className="invoiceActionGroup">
                          <button className="primaryBtn compactBtn" type="button" onClick={() => loadEstimate(booking.id)}>Open Workspace</button>
                          <button className="ghostBtn compactBtn" type="button" disabled={!booking.invoice} onClick={() => viewInvoice(booking.invoice)}>View PDF</button>
                          <button className="downloadBtn compactBtn" type="button" disabled={!booking.invoice} onClick={() => downloadInvoice(booking.invoice)}>Download PDF</button>
                          <button className="primaryBtn compactBtn" type="button" disabled={!booking.invoice} onClick={() => pushTally(booking.invoice)}>Push to Tally</button>
                          <button className="ghostBtn compactBtn" type="button" disabled={!booking.invoice} onClick={() => showTallyStatus(booking.invoice)}>{booking.invoice?.tally_status?.voucher_number || "Sync Status"}</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination total={pgWorkspaceBookings.total} page={pgWorkspaceBookings.page} pageSize={pgWorkspaceBookings.pageSize} onPageChange={pgWorkspaceBookings.setPage} onPageSizeChange={pgWorkspaceBookings.setPageSize} />
          </div>
        ) : (
          <div className="accountsWorkspace">
            {lockedForUser ? <div className="qcWarning">This bill already exists. Modification is locked for non-admin users.</div> : null}
            {estimate && !["returned", "closed", "completed"].includes(String(estimate.booking_status || "").toLowerCase()) ? <div className="qcWarning">Booking is not returned/closed yet. Full invoice is blocked; only Draft / Part Invoice is allowed.</div> : null}
            {loading ? <div className="helperText">Loading estimate...</div> : null}

            <div className="accountsSummaryGrid">
              <div><span>Client</span><strong>{estimate.client_name}</strong></div>
              <div><span>Destination</span><strong>{estimate.destination}</strong></div>
              <div><span>Booking Status</span><strong>{estimate.booking_status}</strong></div>
              <div><span>Project Status</span><strong>{estimate.project_status}</strong></div>
              <div><span>Activity Billing Units</span><strong>{estimate.activity_billing_units || 0}</strong></div>
              <div><span>Distinct Calendar Days</span><strong>{estimate.distinct_calendar_days || 0}</strong></div>
              {hasManpowerPayout ? <div><span>Payout Days / Crew</span><strong>{estimate.manpower_payout_days || 0}</strong></div> : null}
              {(estimate.supplementary_job_cards || []).length > 0 ? <div><span>Supplementary Cards Included</span><strong>{estimate.supplementary_job_cards.join(", ")}</strong></div> : null}
            </div>

            <div className="billingDayGrid">
              {Object.entries(estimate.billing_days || {}).map(([key, day]) => (
                <div key={key} className="billingDayCard">
                  <span>{day.label}</span>
                  <strong>{day.count}</strong>
                  <small>{(day.dates || []).join(", ") || "-"}</small>
                </div>
              ))}
            </div>

            <div className="formGrid accountsForm">
              <label className="fieldLabel">Billing Mode</label>
              <select value={form.billing_mode} disabled={lockedForUser} onChange={event => setForm({ ...form, billing_mode: event.target.value })}>
                <option value="line_item">Line item billing</option>
                <option value="package">Package billing</option>
              </select>
              <label className="fieldLabel">Bill Status</label>
              <select value={form.status} disabled={lockedForUser} onChange={event => setForm({ ...form, status: event.target.value })}>
                <option value="draft">Draft / Working Bill</option>
                <option value="part_invoice">Part Invoice</option>
                <option value="approved">Full Invoice - Approved</option>
                <option value="sent">Full Invoice - Sent</option>
                <option value="paid">Paid / Closed Invoice</option>
                <option value="cancelled">Cancelled</option>
              </select>
              <label className="fieldLabel">Package Amount</label>
              <input type="number" value={form.package_amount} disabled={lockedForUser || form.billing_mode !== "package"} onChange={event => setForm({ ...form, package_amount: event.target.value })} />
              <label className="fieldLabel">Other Charges</label>
              <input type="number" value={form.other_amount} disabled={lockedForUser} onChange={event => setForm({ ...form, other_amount: event.target.value })} />
              <label className="fieldLabel">Damage / Missing Charge</label>
              <input type="number" value={form.damage_charge_amount || 0} disabled={lockedForUser} onChange={event => setForm({ ...form, damage_charge_amount: event.target.value })} />
              <label className="fieldLabel full">Damage / Missing Charge Note</label>
              <input className="full" value={form.damage_charge_note || ""} disabled={lockedForUser} onChange={event => setForm({ ...form, damage_charge_note: event.target.value })} placeholder="Example: Lens cap missing / Tripod damaged / Client-approved charge" />
              <label className="fieldLabel">Discount</label>
              <input type="number" value={form.discount_amount} disabled={lockedForUser} onChange={event => setForm({ ...form, discount_amount: event.target.value })} />
              <label className="fieldLabel">Tax %</label>
              <input type="number" value={form.tax_percent} disabled={lockedForUser} onChange={event => setForm({ ...form, tax_percent: event.target.value })} />
              <label className="fieldLabel">Payment Committed Date</label>
              <input type="date" value={form.payment_committed_date || ""} disabled={lockedForUser} onChange={event => setForm({ ...form, payment_committed_date: event.target.value })} />
              {/* Receipt details, modes, and payouts stay in Accounts Ledger. */}
              <label className="qcCheckLabel">
                <input
                  type="checkbox"
                  checked={Boolean(form.off_days_payable)}
                  disabled={lockedForUser}
                  onChange={event => {
                    const checked = event.target.checked;
                    setForm({ ...form, off_days_payable: checked });
                    refreshInternalPayoutDays(checked);
                  }}
                />
                <span>Off days are payable to manpower (internal payout only)</span>
              </label>
              <label className="fieldLabel full">Notes</label>
              <textarea className="full" value={form.notes} disabled={lockedForUser} onChange={event => setForm({ ...form, notes: event.target.value })} placeholder="Billing notes, package terms, client approval reference..." />
            </div>

            <h3 className="sectionTitle">Billing Line Items</h3>
            <div className="tableWrap">
              <table>
                <thead><tr><th>Category</th><th>Description</th><th>Qty</th><th>Rate</th><th>Amount</th></tr></thead>
                <tbody>
                  {lineItems.map((item, index) => (
                    <tr key={`${item.category}-${item.label}-${index}`}>
                      <td>{item.category}</td>
                      <td>{item.label}</td>
                      <td><input className="tableInput" type="number" value={item.quantity || 0} disabled={lockedForUser || form.billing_mode === "package"} onChange={event => updateLine(index, { quantity: event.target.value })} /></td>
                      <td><input className="tableInput" type="number" value={item.rate || 0} disabled={lockedForUser || form.billing_mode === "package"} onChange={event => updateLine(index, { rate: event.target.value })} /></td>
                      <td>INR {money(item.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {hasManpowerPayout ? <>
              <h3 className="sectionTitle">Manpower Payouts</h3>
              <div className="tableWrap">
                <table>
                  <thead><tr><th>Role</th><th>Crew</th><th>Days</th><th>Payout Rate</th><th>Payout</th></tr></thead>
                  <tbody>
                    {payoutItems.map((item, index) => (
                      <tr key={`${item.role}-${index}`}>
                        <td>{item.role}</td>
                        <td><input className="tableInput" type="number" value={item.crew_count || 0} disabled={lockedForUser} onChange={event => updatePayout(index, { crew_count: event.target.value })} /></td>
                        <td><input className="tableInput" type="number" value={item.days || 0} disabled={lockedForUser} onChange={event => updatePayout(index, { days: event.target.value })} /></td>
                        <td><input className="tableInput" type="number" value={item.payout_rate || 0} disabled={lockedForUser} onChange={event => updatePayout(index, { payout_rate: event.target.value })} /></td>
                        <td>INR {money(item.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </> : null}

            <div className="accountsTotals">
              <div><span>Subtotal</span><strong>INR {money(totals.subtotal)}</strong></div>
              <div><span>Tax</span><strong>INR {money(totals.tax)}</strong></div>
              <div><span>Total Bill</span><strong>INR {money(totals.total)}</strong></div>
              <div><span>Client Due</span><strong>INR {money(totals.total - Number(form.amount_received || 0))}</strong></div>
              {hasManpowerPayout ? <div><span>Manpower Payout</span><strong>INR {money(totals.payout)}</strong></div> : null}
              <div><span>Estimated Margin (excl. GST)</span><strong>INR {money(totals.margin)}</strong></div>
            </div>

            <div className="modalFooter">
              <button className="ghostBtn" type="button" onClick={() => { setForm(prev => ({ ...prev, billing_mode: "line_item" })); loadEstimate(selectedBookingId, form.off_days_payable, true); }}>Recalculate</button>
              <button className="ghostBtn" type="button" onClick={() => setActiveSection("ledger")}>Part Payment</button>
              <button className="ghostBtn" type="button" disabled={!existingInvoice} onClick={() => viewInvoice(existingInvoice)}>View PDF</button>
              <button className="downloadBtn" type="button" disabled={!existingInvoice} onClick={() => downloadInvoice(existingInvoice)}>Download PDF</button>
              <button className="primaryBtn" type="button" disabled={!existingInvoice} onClick={() => pushTally(existingInvoice)}>Push to Tally</button>
              <button className="ghostBtn" type="button" disabled={!existingInvoice} onClick={() => resyncTally(existingInvoice)}>Re-sync</button>
              <button className="ghostBtn" type="button" disabled={!existingInvoice} onClick={() => showTallyStatus(existingInvoice)}>Sync Status</button>
              <button className="primaryBtn" type="button" disabled={saving || lockedForUser} onClick={saveInvoice}>
                {saving ? "Saving..." : existingInvoice ? "Update Bill" : "Create Bill"}
              </button>
            </div>
          </div>
        )}
      </Card>
      </div>
      </> : null}

      {activeSection === "ledger" ? <>
      <div id="accounts-ledger">
      <Card title="Part Payments / Accounts Ledger">
        {!ledger ? <div className="helperText">Loading ledger...</div> : (
          <div className="accountsWorkspace">
            <div className="accountsSummaryGrid">
              <div><span>Total Outbound Bills</span><strong>INR {money(ledger.summary?.client_total_billed)}</strong></div>
              <div><span>Client Amount Received</span><strong>INR {money(ledger.summary?.client_received)}</strong></div>
              <div><span>Client Amount Due</span><strong>INR {money(ledger.summary?.client_due)}</strong></div>
              <div><span>Manpower Due</span><strong>INR {money(ledger.summary?.manpower_due)}</strong></div>
              <div><span>Vendor Due</span><strong>INR {money(ledger.summary?.vendor_due)}</strong></div>
              {supportsServiceJobs && <div><span>Service Due</span><strong>INR {money(ledger.summary?.service_due)}</strong></div>}
              <div><span>Net Cash Position</span><strong>INR {money(ledger.summary?.net_cash_position)}</strong></div>
            </div>
            <div className="listToolbar">
              <SearchBar value={ledgerSearch} onChange={value => { setLedgerSearch(value); pgLedgerReceivables.setPage(1); pgLedgerManpower.setPage(1); pgLedgerVendors.setPage(1); pgLedgerServices.setPage(1); }} suggestions={buildSuggestions([...(ledger.client_receivables || []), ...(ledger.manpower_payouts || []), ...(ledger.vendor_bills || []), ...(supportsServiceJobs ? (ledger.service_bills || []) : [])])} placeholder="Search ledger by invoice, job card, client, vendor, role, amount, due date..." />
              <button className="primaryBtn compactBtn" type="button" onClick={openBarter}>Vendor-as-Client Barter</button>
            </div>

            <LedgerSection title="Total Outbound Bills Status" meta={`${ledgerReceivables.length} invoices · Due INR ${money(ledger.summary?.client_due)}`} defaultOpen>
              <div className="tableWrap">
                <table>
                  <thead><tr><th>Invoice</th><th>Client</th><th>Job Card</th><th>Total</th><th>Received</th><th>Due</th><th>Committed Date</th><th>Mode / Details</th><th>Actions</th></tr></thead>
                  <tbody>
                    {pgLedgerReceivables.pageData.map(row => {
                      const invoice = invoiceByNumber[row.invoice_number]?.invoice;
                      return (
                        <tr key={row.invoice_number}>
                          <td>{row.invoice_number}</td><td>{row.client_name}</td><td>{row.job_card_id}</td>
                          <td>INR {money(row.total_amount)}</td><td>INR {money(row.amount_received)}</td><td>INR {money(row.amount_due)}</td>
                          <td>{row.payment_committed_date || "-"}</td><td>{row.payment_mode} · {row.details}</td>
                          <td>
                            <div className="invoiceActionGroup ledgerRowActions">
                              <button className="ghostBtn compactBtn" type="button" disabled={!invoice} onClick={() => viewLedgerInvoice(row.invoice_number)}>View PDF</button>
                              <button className="downloadBtn compactBtn" type="button" disabled={!invoice} onClick={() => downloadLedgerInvoice(row.invoice_number)}>Download</button>
	                              <button className="ghostBtn compactBtn" type="button" disabled={!invoice} onClick={() => showTallyStatus(invoice)}>Voucher {invoice?.tally_status?.voucher_number || "-"}</button>
	                              <button className="primaryBtn compactBtn" type="button" disabled={Number(row.amount_due || 0) <= 0} onClick={() => openPayment("client", row.invoice_number, `${row.client_name} / ${row.invoice_number}`, row.amount_due)}>{Number(row.amount_due || 0) <= 0 ? "Paid" : "Receive"}</button>
	                              <button className="ghostBtn compactBtn" type="button" onClick={() => setPaymentHistory({ label: `${row.client_name} / ${row.invoice_number}`, payments: row.payments || [] })}>History</button>
	                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <Pagination total={pgLedgerReceivables.total} page={pgLedgerReceivables.page} pageSize={pgLedgerReceivables.pageSize} onPageChange={pgLedgerReceivables.setPage} onPageSizeChange={pgLedgerReceivables.setPageSize} />
            </LedgerSection>

            <LedgerSection title="Manpower Payouts" meta={`${ledgerManpower.length} rows · Due INR ${money(ledger.summary?.manpower_due)}`}>
              <div className="tableWrap">
                <table>
                  <thead><tr><th>Invoice</th><th>Job Card</th><th>Role</th><th>Crew</th><th>Days</th><th>Due</th><th>Paid</th><th>Balance</th><th>Mode / Details</th><th>Actions</th></tr></thead>
                  <tbody>
                    {pgLedgerManpower.pageData.length === 0 ? <tr><td colSpan="10" className="helperText">No manpower payout due.</td></tr> : pgLedgerManpower.pageData.map((row, index) => {
                      const invoice = invoiceByNumber[row.invoice_number]?.invoice;
                      return (
                        <tr key={`${row.invoice_number}-${row.role}-${index}`}>
                          <td>{row.invoice_number}</td><td>{row.job_card_id}</td><td>{row.role}</td><td>{row.crew_count}</td><td>{row.days}</td>
                          <td>INR {money(row.amount_due)}</td><td>INR {money(row.amount_paid)}</td><td>INR {money(row.balance_due)}</td><td>{row.payment_mode} · {row.details}</td>
                          <td>
	                            <div className="invoiceActionGroup ledgerRowActions">
	                              <button className="primaryBtn compactBtn" type="button" disabled={Number(row.balance_due || 0) <= 0} onClick={() => openPayment("manpower", row.reference, `${row.role} / ${row.job_card_id}`, row.balance_due)}>{Number(row.balance_due || 0) <= 0 ? "Paid" : "Pay"}</button>
	                              <button className="ghostBtn compactBtn" type="button" onClick={() => setPaymentHistory({ label: `${row.role} / ${row.job_card_id}`, payments: row.payments || [] })}>History</button>
	                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <Pagination total={pgLedgerManpower.total} page={pgLedgerManpower.page} pageSize={pgLedgerManpower.pageSize} onPageChange={pgLedgerManpower.setPage} onPageSizeChange={pgLedgerManpower.setPageSize} />
            </LedgerSection>

            <LedgerSection title="Vendor Bills" meta={`${ledgerVendors.length} entries · Due INR ${money(ledger.summary?.vendor_due)}`}>
              <div className="tableWrap">
                <table>
                  <thead><tr><th>Reference</th><th>Vendor</th><th>Category</th><th>Status</th><th>Bill</th><th>Paid</th><th>Due</th><th>Mode / Details</th><th>Actions</th></tr></thead>
                  <tbody>
                    {pgLedgerVendors.pageData.map(row => (
                      <tr key={row.reference}>
                        <td>{row.reference}</td><td>{row.vendor_name}</td><td>{row.category}</td><td>{row.status}</td>
                        <td>INR {money(row.bill_amount)}</td><td>INR {money(row.paid_amount)}</td><td>INR {money(row.due_amount)}</td><td>{row.payment_mode} · {row.details}</td>
                        <td><div className="invoiceActionGroup ledgerRowActions"><button className="primaryBtn compactBtn" type="button" disabled={Number(row.due_amount || 0) <= 0} onClick={() => openPayment("vendor", row.reference, `${row.vendor_name} / ${row.reference}`, row.due_amount)}>{Number(row.due_amount || 0) <= 0 ? "Paid" : "Pay Vendor"}</button><button className="ghostBtn compactBtn" type="button" onClick={() => setPaymentHistory({ label: `${row.vendor_name} / ${row.reference}`, payments: row.payments || [] })}>History</button></div></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Pagination total={pgLedgerVendors.total} page={pgLedgerVendors.page} pageSize={pgLedgerVendors.pageSize} onPageChange={pgLedgerVendors.setPage} onPageSizeChange={pgLedgerVendors.setPageSize} />
            </LedgerSection>

            {supportsServiceJobs && <LedgerSection title="Service Bills" meta={`${ledgerServices.length} entries · Due INR ${money(ledger.summary?.service_due)}`}>
              <div className="tableWrap">
                <table>
                  <thead><tr><th>Reference</th><th>Vendor</th><th>Status</th><th>Bill</th><th>Paid</th><th>Due</th><th>Mode / Details</th><th>Actions</th></tr></thead>
                  <tbody>
                    {pgLedgerServices.pageData.map(row => (
                      <tr key={row.reference}>
                        <td>{row.reference}</td><td>{row.vendor_name}</td><td>{row.status}</td>
                        <td>INR {money(row.bill_amount)}</td><td>INR {money(row.paid_amount)}</td><td>INR {money(row.due_amount)}</td><td>{row.payment_mode} · {row.details}</td>
                        <td><div className="invoiceActionGroup ledgerRowActions"><button className="primaryBtn compactBtn" type="button" disabled={Number(row.due_amount || 0) <= 0} onClick={() => openPayment("service", row.reference, `${row.vendor_name} / ${row.reference}`, row.due_amount)}>{Number(row.due_amount || 0) <= 0 ? "Paid" : "Pay Service"}</button><button className="ghostBtn compactBtn" type="button" onClick={() => setPaymentHistory({ label: `${row.vendor_name} / ${row.reference}`, payments: row.payments || [] })}>History</button></div></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Pagination total={pgLedgerServices.total} page={pgLedgerServices.page} pageSize={pgLedgerServices.pageSize} onPageChange={pgLedgerServices.setPage} onPageSizeChange={pgLedgerServices.setPageSize} />
            </LedgerSection>}
          </div>
        )}
      </Card>
      </div>
      </> : null}

      {activeSection === "invoices" ? <div id="accounts-invoices" className="grid2">
        <Card title="Saved Outbound Client Invoices">
          <div className="listToolbar">
            <SearchBar value={invoiceSearch} onChange={value => { setInvoiceSearch(value); pgInvoices.setPage(1); }} suggestions={buildSuggestions(billedBookings)} placeholder="Search invoices by invoice no, job card, project, client, amount, status..." />
            <span className="helperText">{searchedBilledBookings.length} invoice(s)</span>
          </div>
          {billedBookings.length === 0 ? <div className="helperText">No outbound invoices created yet.</div> : (
            <div className="tableWrap">
              <table>
                <thead><tr><th>Invoice</th><th>Job Card</th><th>Project</th><th>Status</th><th>Committed Date</th><th>Total</th><th>Actions</th></tr></thead>
                <tbody>
                  {pgInvoices.pageData.map(booking => (
                    <tr key={booking.invoice.id}>
                      <td>{booking.invoice.invoice_number}</td>
                      <td>{booking.job_card_id}</td>
                      <td>{booking.project_title}</td>
                      <td><span className={`statusBadge status-${booking.invoice.status}`}>{booking.invoice.status}</span></td>
                      <td>{booking.invoice.payment_committed_date || "-"}</td>
                      <td>INR {money(booking.invoice.total_amount)}</td>
                      <td>
                        <div className="invoiceActionGroup">
                          <button className="ghostBtn compactBtn" type="button" onClick={() => loadEstimate(booking.id)}>Open Bill</button>
                          <button className="ghostBtn compactBtn" type="button" onClick={() => viewInvoice(booking.invoice)}>View PDF</button>
                          <button className="downloadBtn compactBtn" type="button" onClick={() => downloadInvoice(booking.invoice)}>Download PDF</button>
                          <button className="primaryBtn compactBtn" type="button" onClick={() => pushTally(booking.invoice)}>Push to Tally</button>
                          <button className="ghostBtn compactBtn" type="button" onClick={() => resyncTally(booking.invoice)}>Re-sync</button>
                          <button className="ghostBtn compactBtn" type="button" onClick={() => showTallyStatus(booking.invoice)}>{booking.invoice?.tally_status?.voucher_number || "Sync Status"}</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <Pagination total={pgInvoices.total} page={pgInvoices.page} pageSize={pgInvoices.pageSize} onPageChange={pgInvoices.setPage} onPageSizeChange={pgInvoices.setPageSize} />
            </div>
          )}
        </Card>
        <Card title="Saved Inbound Bills">
          <div className="listToolbar">
            <SearchBar value={inboundSearch} onChange={value => { setInboundSearch(value); pgInboundBills.setPage(1); }} suggestions={buildSuggestions(inboundBills)} placeholder="Search inbound bills by reference, party, vendor, type, due..." />
            <span className="helperText">{searchedInboundBills.length} bill(s)</span>
          </div>
          {!ledger ? <div className="helperText">Loading inbound bills...</div> : (
            <div className="tableWrap">
              <table>
                <thead><tr><th>Reference</th><th>Type</th><th>Party</th><th>Bill</th><th>Paid</th><th>Due</th></tr></thead>
                <tbody>
                  {pgInboundBills.pageData.map(row => (
                    <tr key={`${row.type}-${row.reference}`}>
                      <td>{row.reference}</td><td>{row.type}</td><td>{row.vendor_name}</td>
                      <td>INR {money(row.bill_amount)}</td><td>INR {money(row.paid_amount)}</td><td>INR {money(row.due_amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <Pagination total={pgInboundBills.total} page={pgInboundBills.page} pageSize={pgInboundBills.pageSize} onPageChange={pgInboundBills.setPage} onPageSizeChange={pgInboundBills.setPageSize} />
            </div>
          )}
        </Card>
      </div> : null}
    </div>
  );
}
