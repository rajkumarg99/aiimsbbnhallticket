import React, { useState, useEffect, useMemo, useRef } from "react";
import {
  GraduationCap, ShieldCheck, Upload, CheckCircle2, XCircle, Search,
  Download, Printer, LogOut, ArrowLeft, Home, AlertCircle, Loader2, ClipboardList,
  BarChart3, QrCode, FileSpreadsheet, Eye, ChevronRight, Building2, KeyRound, Users
} from "lucide-react";
import { supabase } from "./supabaseClient.js";
import Papa from "papaparse";

let __subjSeq = 0;
function subjId() {
  __subjSeq += 1;
  return "sub_" + Date.now().toString(36) + "_" + __subjSeq;
}

let __genSeq = 0;
function genId(prefix) {
  __genSeq += 1;
  return prefix + "_" + Date.now().toString(36) + "_" + __genSeq;
}

function subj(name, fee) {
  return { id: subjId(), name, fee, date: "", dateTo: "", linkGroup: "" };
}

const DEFAULT_COURSES = {
  "I MBBS": { code: "MB1", subjects: [subj("Anatomy", 100), subj("Physiology", 100), subj("Biochemistry", 100)] },
  "II MBBS": { code: "MB2", subjects: [subj("Microbiology", 100), subj("Pathology", 100), subj("Pharmacology", 100), subj("FMT", 100)] },
  "III MBBS": { code: "MB3", subjects: [subj("OBGY", 100), subj("General Surgery", 100), subj("CMFM", 100), subj("General Medicine", 100), subj("Paediatrics", 100)] },
  "B.Sc Nursing I Year": { code: "BN1", feeTier: "tier1", subjects: [subj("English", 5), subj("Computer", 5), subj("Regional Language", 5), subj("Anatomy & Physiology", 5), subj("Nutrition & Biochemistry", 5), subj("Psychology", 5), subj("Nursing Foundation", 5), subj("Practical", 5)] },
  "B.Sc Nursing II Year": { code: "BN2", feeTier: "tier2", subjects: [subj("Community Health Nursing", 10), subj("Medical Surgical Nursing I", 10), subj("Microbiology", 10), subj("Pathology & Genetics", 10), subj("Pharmacology", 10), subj("Practical", 10)] },
  "B.Sc Nursing III Year": { code: "BN3", feeTier: "tier2", subjects: [subj("Medical Surgical Nursing II", 8), subj("Child Health Nursing", 8), subj("Mental Health Nursing", 8), subj("Obstetrical & Gynaecology Nursing", 8), subj("MSN II Practical", 7), subj("Child Health Nursing Practical", 7), subj("Mental Health Practical", 7), subj("OBG Nursing Practical", 7)] },
  "M.Sc Nursing I Year": { code: "MN1", subjects: [subj("Advanced Nursing Practice", 12), subj("Nursing Research & Statistics", 12), subj("Nursing Education", 12), subj("Clinical Specialty", 12), subj("Practical", 12)] },
  "BMLS - I Year B.Sc (A&H)": { code: "BMLS1", feeTier: "tier1", subjects: [subj("Anatomy & Physiology", 8), subj("General Microbiology", 8), subj("Basics of Haematology", 8), subj("Basics of Biochemistry", 8), subj("Practical", 8)] },
  "BMRIT - I Year B.Sc (A&H)": { code: "BMRIT1", feeTier: "tier1", subjects: [subj("Anatomy & Physiology", 8), subj("Radiography Processing Techniques", 8), subj("Physics of Conventional Radiography", 8), subj("Biostatistics", 8), subj("Practical", 8)] },
  "BOTT - I Year B.Sc (A&H)": { code: "BOTT1", feeTier: "tier1", subjects: [subj("Anatomy & Physiology", 8), subj("Basics in Anaesthesia", 8), subj("Basics in Surgery Fundamentals", 8), subj("Pharmacology & Biostatistics", 8), subj("Practical", 8)] },
  "BHI - I Year B.Sc (A&H)": { code: "BHI1", feeTier: "tier1", subjects: [subj("Anatomy & Physiology", 7), subj("Basic Microbiology, Pharmacology & Pathology", 7), subj("Foundation of HIMS", 7), subj("Medical Ethics & Professional Values", 7), subj("Fundamentals of IT", 6), subj("Practical", 6)] },
  "ECG - I Year B.Sc (A&H)": { code: "ECG1", feeTier: "tier1", subjects: [subj("Anatomy & Physiology", 8), subj("Basic Biochemistry", 8), subj("Applied Microbiology", 8), subj("Applied Pathology", 8), subj("Practical", 8)] },
};

function seedCourses() {
  const seeded = {};
  Object.entries(DEFAULT_COURSES).forEach(([name, data]) => {
    seeded[name] = { id: genId("course"), ...data, subjects: data.subjects.map((s) => ({ ...s })), active: true };
  });
  return seeded;
}

// Fee rules:
// - "flat" (default, no feeTier set): sum of each selected subject's individual fee (MBBS, M.Sc Nursing).
// - "tier1" (I Year B.Sc Nursing / B.Sc Allied Health): 1 subject = ₹20, 2+ subjects = ₹40.
// - "tier2" (II & III Year B.Sc Nursing / B.Sc Allied Health): 1 subject = ₹20, 2 subjects = ₹30, 3+ subjects = ₹60.
function computeFee(courses, courseName, subjectNames) {
  const courseData = courses[courseName];
  if (!courseData) return { count: 0, total: 0, subjects: [] };
  const chosen = courseData.subjects.filter((s) => subjectNames.includes(s.name));
  const count = chosen.length;
  let total;
  if (courseData.feeTier === "tier1") {
    total = count === 0 ? 0 : count === 1 ? 20 : 40;
  } else if (courseData.feeTier === "tier2") {
    total = count === 0 ? 0 : count === 1 ? 20 : count === 2 ? 30 : 60;
  } else if (courseData.feeTier === "tier3") {
    total = count === 0 ? 0 : 200;
  } else {
    total = chosen.reduce((s, x) => s + x.fee, 0);
  }
  return { count, total, subjects: chosen.map((s) => ({ id: s.id, name: s.name, date: s.date || "", dateTo: s.dateTo || "" })) };
}

// Resolves a subject snapshot (stored on an application) against the current
// course configuration by id, so that renaming a subject or correcting its
// exam date later is reflected on already-submitted applications. Falls back
// to the stored snapshot (matching by name) for older records that predate
// subject ids, or if the subject has since been removed from the course.
function liveSubject(courses, courseName, rec) {
  const list = courses?.[courseName]?.subjects || [];
  const found = (rec.id && list.find((s) => s.id === rec.id)) || list.find((s) => s.name === rec.name);
  return found || rec;
}

function formatExamDate(iso) {
  if (!iso) return "Date to be announced";
  try {
    const d = new Date(iso + "T00:00:00");
    return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
  } catch (e) {
    return iso;
  }
}

function formatExamDateRange(s) {
  if (!s.date) return "Date to be announced";
  if (s.dateTo && s.dateTo !== s.date) return `${formatExamDate(s.date)} – ${formatExamDate(s.dateTo)}`;
  return formatExamDate(s.date);
}

function sanitizeRollNo(value, allowedSpecialChars) {
  const specials = (allowedSpecialChars !== undefined ? allowedSpecialChars : ",\\/-").split("");
  const escapedClass = specials.map((c) => "\\" + c).join("");
  const pattern = new RegExp("[^A-Z0-9" + escapedClass + "]", "g");
  return (value || "").trim().toUpperCase().replace(pattern, "");
}

function normalizeDob(value) {
  const v = (value || "").trim();
  if (!v) return "";
  // Already YYYY-MM-DD (what the <input type="date"> picker always produces)
  if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(v)) {
    const [y, m, d] = v.split("-");
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  // DD-MM-YYYY or DD/MM/YYYY (common in Indian CSVs / Excel exports)
  const dmy = v.match(/^(\d{1,2})[-\/](\d{1,2})[-\/](\d{4})$/);
  if (dmy) {
    const [, d, m, y] = dmy;
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  return v;
}

function formatDateTime(iso) {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" });
  } catch (e) {
    return iso;
  }
}

function getRegistrationWindowStatus(settings) {
  if (settings?.studentLoginEnabled === false) return { open: false, reason: "disabled", opensAt: null, closesAt: null };
  const now = new Date();
  const opensAt = settings?.registrationOpensAt ? new Date(settings.registrationOpensAt) : null;
  const closesAt = settings?.registrationClosesAt ? new Date(settings.registrationClosesAt) : null;
  if (opensAt && now < opensAt) return { open: false, reason: "not_yet_open", opensAt, closesAt };
  if (closesAt && now > closesAt) return { open: false, reason: "closed", opensAt, closesAt };
  return { open: true, reason: "open", opensAt, closesAt };
}

function buildLink(settings, query) {
  let base = (settings?.publicBaseUrl || "").trim();
  if (!base) {
    try {
      const loc = window.location;
      if (loc && /^https?:$/.test(loc.protocol) && loc.hostname && loc.hostname !== "null") {
        base = loc.origin + loc.pathname;
      }
    } catch (e) {}
  }
  if (!base) {
    return { url: `(set "Public site URL" in Settings, then) yourdomain.example/?${query}`, resolved: false };
  }
  if (!/^https?:\/\//i.test(base)) base = "https://" + base;
  const sep = base.includes("?") ? "&" : "?";
  return { url: `${base}${sep}${query}`, resolved: true };
}

function LinkRow({ url }) {
  const ref = useRef(null);
  const [copied, setCopied] = useState(false);
  function copy() {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(url).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }).catch(() => {
        if (ref.current) { ref.current.select(); }
      });
    } else if (ref.current) {
      ref.current.select();
      try { document.execCommand("copy"); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch (e) {}
    }
  }
  return (
    <div style={{ display: "flex", gap: 6, marginTop: 8, alignItems: "center" }}>
      <input ref={ref} readOnly value={url} onFocus={(e) => e.target.select()} style={{ ...inputStyle, fontSize: 11.5, flex: 1 }} />
      <Btn variant="outline" onClick={copy} style={{ flexShrink: 0 }}>{copied ? "Copied!" : "Copy"}</Btn>
    </div>
  );
}

function defaultSettings() {
  return {
    instituteName: "All India Institute of Medical Sciences, Bibinagar",
    publicBaseUrl: "",
    examCentre: "AIIMS Bibinagar — Examination Hall, Block A",
    signatoryTitle: "Dean (Examination), AIIMS Bibinagar",
    signatoryImageUrl: null,
    signatureMissingMessage: "Signature Not Uploaded",
    instructions: [
      "This Admit Card shall be deemed void in case the student at any stage is declared ineligible by the competent authority.",
      "Reporting time 9:30 AM; after 9:45 AM students will not be allowed into the Examination Hall.",
      "The Identity Card and Admit Card of students will be checked at the entry point and examinee(s) will not be allowed to take the examination without an IDENTITY CARD and ADMIT CARD.",
      "No student shall bring into the examination hall any electronic article/book/paper/calculator/cell phone/pager/smart watch/Bluetooth headset to the examination hall after the start of the examination. Further, no extra time will be given after the end of the exam.",
      "No student will be allowed to leave the Examination Hall till the end of the exam.",
      "You will not be allowed to write your Examination/Examinations if you do not submit yourself for verification by the Chief Superintendent of Examination, Invigilators, or security at the entry point.",
      "Flying squad members are empowered to check any candidate in the examination hall or outside the examination hall during the examination for detecting any malpractice.",
      "Students using unfair means shall be disqualified and excluded from this and any subsequent examination held by the Institute.",
      "Students will be permitted to put their representations regarding any discrepancy in their results within 7 days of the publication of the results.",
    ].join("\n"),
    bank: {
      accountNo: "66120100000006",
      micr: "508012010",
      ifsc: "BARB0DBCHND",
      branch: "AIIMS Bibinagar Branch, Bank of Baroda",
      upiId: "",
    },
    logoDataUrl: null,
    paymentQrImageUrl: null,
    studentLoginEnabled: true,
    studentLoginMethod: "rollDob",
    rollNoAllowedSpecialChars: ",\\/-",
    adminPassword: "admin123",
    registrationOpensAt: "",
    registrationClosesAt: "",
  };
}

function uid() {
  return "APP" + Date.now().toString(36).toUpperCase() + Math.random().toString(36).slice(2, 6).toUpperCase();
}

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function resizeImage(file, maxDim) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read file"));
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        if (width > maxDim || height > maxDim) {
          if (width > height) { height = Math.round(height * (maxDim / width)); width = maxDim; }
          else { width = Math.round(width * (maxDim / height)); height = maxDim; }
        }
        const canvas = document.createElement("canvas");
        canvas.width = width; canvas.height = height;
        const ctx = canvas.getContext("2d");
        ctx.fillStyle = "#fff";
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL("image/jpeg", 0.82));
      };
      img.onerror = () => reject(new Error("Invalid image"));
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

function dataUrlToBlob(dataUrl) {
  const [header, base64] = dataUrl.split(",");
  const mime = /data:(.*?);base64/.exec(header)[1];
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

// Uploads a file (or a resized-image data URL) to the "uploads" Storage
// bucket and returns its public URL. Storing just this short URL in the
// database — instead of the whole file as base64 text — is what keeps
// routine data loading small; the actual file is only fetched over the
// network when something needs to display or download it.
async function uploadToStorage(fileOrDataUrl, path, contentType) {
  const blob = typeof fileOrDataUrl === "string" ? dataUrlToBlob(fileOrDataUrl) : fileOrDataUrl;
  const { error } = await supabase.storage.from("uploads").upload(path, blob, {
    upsert: true,
    contentType: contentType || blob.type || "application/octet-stream",
  });
  if (error) throw error;
  const { data } = supabase.storage.from("uploads").getPublicUrl(path);
  return data.publicUrl;
}

async function urlToBase64(url) {
  const resp = await fetch(url);
  const blob = await resp.blob();
  const buffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
  const base64 = btoa(binary);
  const ext = blob.type.includes("png") ? "png" : (blob.type.includes("jpeg") || blob.type.includes("jpg")) ? "jpg" : "bin";
  return { base64, ext, mime: blob.type };
}

function QRBlock({ text, size = 96 }) {
  const src = `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&margin=2&data=${encodeURIComponent(text || "AIIMS Bibinagar")}`;
  return (
    <img
      src={src}
      width={size}
      height={size}
      alt="QR code"
      style={{ background: "#fff", border: "1px solid #ddd", display: "block" }}
      onError={(e) => { e.target.style.display = "none"; }}
    />
  );
}

function buildUpiUri(bank, instituteName, amount, note) {
  if (!bank?.upiId) return null;
  const params = new URLSearchParams({
    pa: bank.upiId,
    pn: instituteName || "AIIMS Bibinagar",
    am: String(amount || 0),
    cu: "INR",
    tn: note || "Exam fee",
  });
  return `upi://pay?${params.toString()}`;
}

function BankDetails({ bank }) {
  return (
    <div style={{ fontSize: 12.5, color: "#5f6d7a", lineHeight: 1.7 }}>
      <div>Account no.: <b style={{ color: "#1c2b3a" }}>{bank.accountNo}</b></div>
      <div>MICR no.: <b style={{ color: "#1c2b3a" }}>{bank.micr}</b></div>
      <div>IFSC code: <b style={{ color: "#1c2b3a" }}>{bank.ifsc}</b></div>
      <div>Branch: <b style={{ color: "#1c2b3a" }}>{bank.branch}</b></div>
    </div>
  );
}

function Field({ label, children, required, hint }) {
  return (
    <div style={{ display: "block", marginBottom: 14 }}>
      <span style={{ fontSize: 13, fontWeight: 600, color: "#274566" }}>
        {label} {required && <span style={{ color: "#a13a2f" }}>*</span>}
      </span>
      <div style={{ marginTop: 4 }}>{children}</div>
      {hint && <div style={{ fontSize: 11.5, color: "#7a8794", marginTop: 3 }}>{hint}</div>}
    </div>
  );
}

const inputStyle = {
  width: "100%", boxSizing: "border-box", padding: "8px 10px", fontSize: 14,
  border: "1px solid #cfd8e3", borderRadius: 6, background: "#fff", color: "#1c2b3a",
};

function Btn({ children, onClick, variant = "primary", disabled, style, type = "button" }) {
  const base = {
    padding: "9px 16px", fontSize: 13.5, fontWeight: 600, borderRadius: 6, cursor: disabled ? "not-allowed" : "pointer",
    border: "1px solid transparent", display: "inline-flex", alignItems: "center", gap: 6, opacity: disabled ? 0.55 : 1,
  };
  const variants = {
    primary: { background: "#1a3a5c", color: "#fff" },
    gold: { background: "#a9762f", color: "#fff" },
    outline: { background: "#fff", color: "#1a3a5c", border: "1px solid #1a3a5c" },
    danger: { background: "#fff", color: "#a13a2f", border: "1px solid #a13a2f" },
    success: { background: "#2f6b45", color: "#fff" },
    ghost: { background: "transparent", color: "#1a3a5c" },
  };
  return (
    <button type={type} disabled={disabled} onClick={onClick} style={{ ...base, ...variants[variant], ...style }}>
      {children}
    </button>
  );
}

function Header({ title, subtitle, onBack, right }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 22px", background: "#1a3a5c", color: "#fff", flexWrap: "wrap", gap: 8 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        {onBack && (
          <button onClick={onBack} aria-label="Home" style={{ display: "flex", alignItems: "center", gap: 5, background: "rgba(255,255,255,0.08)", border: "none", borderRadius: 6, color: "#cfe0f2", cursor: "pointer", padding: "5px 10px", fontSize: 12, fontWeight: 600 }}>
            <Home size={16} /> Home
          </button>
        )}
        <Building2 size={22} color="#e0b86a" />
        <div>
          <div style={{ fontWeight: 700, fontSize: 15.5, letterSpacing: 0.2 }}>{title}</div>
          {subtitle && <div style={{ fontSize: 11.5, color: "#b9cbe0" }}>{subtitle}</div>}
        </div>
      </div>
      <div>{right}</div>
    </div>
  );
}

function parseUrlIntent() {
  try {
    const params = new URLSearchParams(window.location.search);
    return { course: params.get("course") || "", view: params.get("view") || "", verify: params.get("verify") || "" };
  } catch (e) {
    return { course: "", view: "", verify: "" };
  }
}

function rowsToCourses(courseRows, subjectRows) {
  const courses = {};
  (courseRows || []).forEach((c) => {
    courses[c.name] = {
      id: c.id,
      code: c.code,
      feeTier: c.fee_tier || undefined,
      examTitle: c.exam_title || "",
      active: c.active !== false,
      subjects: (subjectRows || [])
        .filter((s) => s.course_id === c.id)
        .map((s) => ({ id: s.id, name: s.name, fee: Number(s.fee) || 0, date: s.exam_date || "", dateTo: s.exam_date_to || "" })),
    };
  });
  return courses;
}

function rowsToRegs(appRows, appSubjectRows) {
  return (appRows || []).map((a) => ({
    id: a.id,
    hallTicketNo: a.hall_ticket_no || "",
    status: a.status,
    name: a.name,
    father: a.father,
    dob: a.dob,
    mobile: a.mobile,
    guardianMobile: a.guardian_mobile,
    permAddress: a.perm_address,
    commAddress: a.comm_address,
    photo: a.photo_data_url ? { dataUrl: a.photo_data_url } : null,
    signature: a.signature_data_url ? { dataUrl: a.signature_data_url } : null,
    signatureMode: a.signature_mode || "upload",
    course: a.course_name,
    subjects: (appSubjectRows || [])
      .filter((s) => s.application_id === a.id)
      .map((s) => ({ id: s.subject_id, name: s.subject_name, date: s.exam_date || "", dateTo: s.exam_date_to || "" })),
    totalFee: Number(a.total_fee) || 0,
    utr: a.utr,
    receipt: a.receipt_data_url ? { dataUrl: a.receipt_data_url, name: a.receipt_name, type: a.receipt_type, size: a.receipt_size } : null,
    remarks: a.remarks || "",
    history: a.history || [],
    submittedAt: a.submitted_at,
  }));
}

function settingsRowToObject(row) {
  const defaults = defaultSettings();
  if (!row) return defaults;
  return {
    instituteName: row.institute_name || defaults.instituteName,
    publicBaseUrl: row.public_base_url || "",
    examCentre: row.exam_centre || defaults.examCentre,
    signatoryTitle: row.signatory_title || defaults.signatoryTitle,
    signatoryImageUrl: row.signatory_image_url || null,
    signatureMissingMessage: row.signature_missing_message || defaults.signatureMissingMessage,
    rollNoAllowedSpecialChars: row.roll_no_allowed_special_chars !== null && row.roll_no_allowed_special_chars !== undefined ? row.roll_no_allowed_special_chars : defaults.rollNoAllowedSpecialChars,
    instructions: row.instructions || defaults.instructions,
    logoDataUrl: row.logo_data_url || null,
    paymentQrImageUrl: row.payment_qr_image_url || null,
    studentLoginEnabled: row.student_login_enabled !== false,
    adminPassword: row.admin_password || "admin123",
    registrationOpensAt: row.registration_opens_at || "",
    registrationClosesAt: row.registration_closes_at || "",
    bank: {
      accountNo: row.bank_account_no || defaults.bank.accountNo,
      micr: row.bank_micr || defaults.bank.micr,
      ifsc: row.bank_ifsc || defaults.bank.ifsc,
      branch: row.bank_branch || defaults.bank.branch,
      upiId: row.bank_upi_id || "",
    },
  };
}

function settingsObjectToRow(s) {
  return {
    id: 1,
    institute_name: s.instituteName,
    public_base_url: s.publicBaseUrl,
    exam_centre: s.examCentre,
    signatory_title: s.signatoryTitle,
    signatory_image_url: s.signatoryImageUrl,
    signature_missing_message: s.signatureMissingMessage,
    roll_no_allowed_special_chars: s.rollNoAllowedSpecialChars,
    instructions: s.instructions,
    bank_account_no: s.bank.accountNo,
    bank_micr: s.bank.micr,
    bank_ifsc: s.bank.ifsc,
    bank_branch: s.bank.branch,
    bank_upi_id: s.bank.upiId,
    logo_data_url: s.logoDataUrl,
    payment_qr_image_url: s.paymentQrImageUrl,
    student_login_enabled: s.studentLoginEnabled !== false,
    admin_password: s.adminPassword || "admin123",
    registration_opens_at: s.registrationOpensAt || null,
    registration_closes_at: s.registrationClosesAt || null,
  };
}

export default function App() {
  const [loaded, setLoaded] = useState(false);
  const [regs, setRegs] = useState([]);
  const [courses, setCourses] = useState({});
  const [settings, setSettings] = useState(defaultSettings());
  const [studentMaster, setStudentMaster] = useState([]);
  const regsRef = useRef([]);
  const coursesRef = useRef({});
  const urlIntent = useMemo(parseUrlIntent, []);
  const [view, setView] = useState(urlIntent.verify ? "verify" : urlIntent.view === "admin" ? "admin" : (urlIntent.view === "student" || urlIntent.course) ? "student" : "landing");

  async function refreshAll() {
    try {
      const [{ data: courseRows, error: cErr }, { data: subjectRows, error: sErr }] = await Promise.all([
        supabase.from("courses").select("*"),
        supabase.from("subjects").select("*"),
      ]);
      if (cErr) throw cErr;
      if (!courseRows || courseRows.length === 0) {
        const seed = seedCourses();
        await seedCoursesToDB(seed);
        setCourses(seed);
        coursesRef.current = seed;
      } else {
        const built = rowsToCourses(courseRows, subjectRows || []);
        setCourses(built);
        coursesRef.current = built;
      }
    } catch (e) {
      console.error("Could not load courses from Supabase:", e.message);
      if (Object.keys(coursesRef.current).length === 0) {
        const seed = seedCourses();
        setCourses(seed);
        coursesRef.current = seed;
      }
    }

    try {
      const [{ data: appRows, error: aErr }, { data: appSubjectRows, error: asErr }] = await Promise.all([
        supabase.from("applications").select("*").order("submitted_at", { ascending: true }),
        supabase.from("application_subjects").select("*"),
      ]);
      if (aErr) throw aErr;
      const built = rowsToRegs(appRows || [], appSubjectRows || []);
      setRegs(built);
      regsRef.current = built;
    } catch (e) {
      console.error("Could not load applications from Supabase:", e.message);
    }

    try {
      const { data: settingsRow, error: setErr2 } = await supabase.from("settings").select("*").eq("id", 1).maybeSingle();
      if (setErr2) throw setErr2;
      setSettings(settingsRowToObject(settingsRow));
    } catch (e) {
      console.error("Could not load settings from Supabase:", e.message);
    }

    try {
      const { data: masterRows, error: mErr } = await supabase.from("student_master").select("*");
      if (mErr) throw mErr;
      setStudentMaster((masterRows || []).map((r) => ({ roll_no: r.roll_no || "", mobile: r.mobile || "", dob: r.dob || "", name: r.name || "" })));
    } catch (e) {
      console.error("Could not load student master list from Supabase:", e.message);
    }
  }

  // The student master list is always wholesale-replaced (one CSV covers
  // everyone eligible for the current exam cycle), so this just clears the
  // table and re-inserts, rather than diffing row by row like courses/regs.
  async function persistStudentMaster(next) {
    setStudentMaster(next);
    try {
      await supabase.from("student_master").delete().neq("roll_no", "__none__");
      if (next.length > 0) {
        await supabase.from("student_master").insert(next.map((r) => ({ roll_no: r.roll_no || null, mobile: r.mobile || null, dob: r.dob || null, name: r.name || null })));
      }
    } catch (e) {
      console.error("Supabase persist(student_master) error:", e.message);
    }
  }

  async function seedCoursesToDB(seed) {
    for (const [name, c] of Object.entries(seed)) {
      await supabase.from("courses").insert({ id: c.id, name, code: c.code, fee_tier: c.feeTier || null, active: true });
      for (const s of c.subjects) {
        await supabase.from("subjects").insert({ id: s.id, course_id: c.id, name: s.name, fee: s.fee, exam_date: s.date || null, exam_date_to: s.dateTo || null });
      }
    }
  }

  useEffect(() => {
    (async () => {
      await refreshAll();
      setLoaded(true);
    })();

    // Data lives in Supabase now, shared by every device — but this
    // component only holds a copy of it in React state, so a session left
    // open before an edit was made elsewhere would keep showing the old
    // data until reloaded. Refresh whenever the tab regains focus or
    // becomes visible again, and poll periodically as a fallback — but only
    // while the tab is actually visible, and at a much longer interval, since
    // every refresh re-downloads every application's photo/signature/receipt
    // data. Polling every 15s regardless of visibility can burn through a
    // free-tier Supabase project's bandwidth allowance surprisingly fast.
    function onVisible() {
      if (document.visibilityState === "visible") refreshAll();
    }
    window.addEventListener("focus", refreshAll);
    document.addEventListener("visibilitychange", onVisible);
    const pollId = setInterval(() => {
      if (document.visibilityState === "visible") refreshAll();
    }, 120000);
    return () => {
      window.removeEventListener("focus", refreshAll);
      document.removeEventListener("visibilitychange", onVisible);
      clearInterval(pollId);
    };
  }, []);

  // Applications: the rest of the app works with a plain array and just
  // calls persist(wholeNewArray), the same as before. Here we diff that
  // against what we last loaded so only the rows that actually changed get
  // written to Supabase, then rebuild each changed application's subject
  // list from scratch (simpler and safe, since a full application's subject
  // list is always replaced together rather than edited one row at a time).
  async function persist(next) {
    const previous = regsRef.current;
    setRegs(next);
    regsRef.current = next;
    try {
      const prevById = new Map(previous.map((r) => [r.id, r]));
      const nextIds = new Set(next.map((r) => r.id));
      const removed = previous.filter((r) => !nextIds.has(r.id));
      for (const r of removed) {
        await supabase.from("applications").delete().eq("id", r.id);
      }
      for (const r of next) {
        const prev = prevById.get(r.id);
        if (prev === r) continue; // unchanged reference, skip
        const courseId = coursesRef.current[r.course]?.id || null;
        await supabase.from("applications").upsert({
          id: r.id,
          hall_ticket_no: r.hallTicketNo || null,
          status: r.status,
          name: r.name,
          father: r.father,
          dob: r.dob || null,
          mobile: r.mobile,
          guardian_mobile: r.guardianMobile,
          perm_address: r.permAddress,
          comm_address: r.commAddress,
          photo_data_url: r.photo?.dataUrl || null,
          signature_data_url: r.signature?.dataUrl || null,
          signature_mode: r.signatureMode || "upload",
          course_id: courseId,
          course_name: r.course,
          total_fee: r.totalFee || 0,
          utr: r.utr || null,
          receipt_data_url: r.receipt?.dataUrl || null,
          receipt_name: r.receipt?.name || null,
          receipt_type: r.receipt?.type || null,
          receipt_size: r.receipt?.size || null,
          remarks: r.remarks || "",
          history: r.history || [],
          submitted_at: r.submittedAt || new Date().toISOString(),
        });
        await supabase.from("application_subjects").delete().eq("application_id", r.id);
        if (r.subjects && r.subjects.length > 0) {
          await supabase.from("application_subjects").insert(
            r.subjects.map((s) => ({
              application_id: r.id,
              subject_id: s.id || null,
              subject_name: s.name,
              exam_date: s.date || null,
              exam_date_to: s.dateTo || null,
            }))
          );
        }
      }
    } catch (e) {
      console.error("Supabase persist(applications) error:", e.message);
    }
  }

  // Courses: same diff-and-write approach, keyed by each course's stable id
  // (so renaming a course updates its row instead of deleting/recreating it).
  async function persistCourses(next) {
    const previous = coursesRef.current;
    setCourses(next);
    coursesRef.current = next;
    try {
      const nextIds = new Set(Object.values(next).map((c) => c.id));
      const removedCourses = Object.values(previous).filter((c) => !nextIds.has(c.id));
      for (const c of removedCourses) {
        await supabase.from("courses").delete().eq("id", c.id);
      }
      for (const [name, c] of Object.entries(next)) {
        await supabase.from("courses").upsert({
          id: c.id,
          name,
          code: c.code,
          fee_tier: c.feeTier || null,
          exam_title: c.examTitle || null,
          active: c.active !== false,
        });
        const { data: existingSubjectRows } = await supabase.from("subjects").select("id").eq("course_id", c.id);
        const existingIds = new Set((existingSubjectRows || []).map((s) => s.id));
        const nextSubjectIds = new Set(c.subjects.map((s) => s.id));
        const toRemove = [...existingIds].filter((id) => !nextSubjectIds.has(id));
        for (const id of toRemove) {
          await supabase.from("subjects").delete().eq("id", id);
        }
        for (const s of c.subjects) {
          await supabase.from("subjects").upsert({
            id: s.id,
            course_id: c.id,
            name: s.name,
            fee: s.fee || 0,
            exam_date: s.date || null,
            exam_date_to: s.dateTo || null,
          });
        }
      }
    } catch (e) {
      console.error("Supabase persist(courses) error:", e.message);
    }
  }

  async function persistSettings(next) {
    setSettings(next);
    try {
      await supabase.from("settings").upsert(settingsObjectToRow(next));
    } catch (e) {
      console.error("Supabase persist(settings) error:", e.message);
    }
  }

  async function nextSeq(courseCode) {
    let n = 1;
    try {
      const { data } = await supabase.from("hallticket_sequences").select("next_value").eq("course_code", courseCode).maybeSingle();
      n = (data?.next_value || 0) + 1;
      await supabase.from("hallticket_sequences").upsert({ course_code: courseCode, next_value: n });
    } catch (e) {
      console.error("Supabase nextSeq error:", e.message);
    }
    return n;
  }

  if (!loaded) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: 60, color: "#7a8794", fontFamily: "system-ui, sans-serif" }}>
        <Loader2 size={18} style={{ marginRight: 8, animation: "spin 1s linear infinite" }} />
        Loading examination portal...
        <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  return (
    <div className="aiims-app-shell" style={{ fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif", background: "#f2f4f7", borderRadius: 12, overflow: "hidden", border: "1px solid #dde3ea", maxWidth: 920, margin: "0 auto" }}>
      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        input:focus, select:focus, textarea:focus { outline: 2px solid #1a3a5c33; }
        .grid-2col { display: grid; grid-template-columns: 1fr 1fr; align-items: start; gap: 0 20px; }
        @media (max-width: 640px) {
          .grid-2col { grid-template-columns: 1fr; }
        }
        @media print {
          body * { visibility: hidden; }
          .print-area, .print-area * { visibility: visible; }
          .print-area { position: absolute; left: 0; top: 0; width: 100%; }
          .print-page-break { break-after: page; page-break-after: always; }
          * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; color-adjust: exact !important; }
          @page { size: A4; margin: 8mm; }
        }
        @keyframes blink-notice { 0%, 100% { opacity: 1; } 50% { opacity: 0.25; } }
      `}</style>
      {view === "landing" && <Landing onPick={setView} />}
      {view === "verify" && <VerificationView rollNo={urlIntent.verify} settings={settings} onExit={() => { setView("landing"); }} />}
      {view === "student" && <StudentPortal regs={regs} persist={persist} courses={courses} settings={settings} studentMaster={studentMaster} initialCourse={urlIntent.course} onExit={() => setView("landing")} />}
      {view === "admin" && <AdminPortal regs={regs} persist={persist} nextSeq={nextSeq} courses={courses} persistCourses={persistCourses} settings={settings} persistSettings={persistSettings} studentMaster={studentMaster} persistStudentMaster={persistStudentMaster} onRefresh={refreshAll} onExit={() => setView("landing")} />}
    </div>
  );
}

function VerificationView({ rollNo, settings, onExit }) {
  const [status, setStatus] = useState("loading"); // loading | found | notfound | error
  const [record, setRecord] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const { data, error } = await supabase
          .from("applications")
          .select("*")
          .eq("hall_ticket_no", rollNo)
          .eq("status", "approved")
          .maybeSingle();
        if (error) throw error;
        if (!data) { setStatus("notfound"); return; }
        setRecord(data);
        setStatus("found");
      } catch (e) {
        setStatus("error");
      }
    })();
  }, [rollNo]);

  return (
    <div>
      <Header title="Hall ticket verification" subtitle="AIIMS Bibinagar Examination Cell" onBack={onExit} />
      <div style={{ padding: 22, display: "flex", justifyContent: "center" }}>
        <div style={{ background: "#fff", border: "1px solid #dde3ea", borderRadius: 10, padding: 28, maxWidth: 420, width: "100%", textAlign: "center" }}>
          {status === "loading" && (
            <div style={{ color: "#7a8794", fontSize: 13 }}><Loader2 size={18} style={{ animation: "spin 1s linear infinite", verticalAlign: "middle", marginRight: 8 }} />Checking...</div>
          )}
          {status === "error" && (
            <div style={{ color: "#a13a2f", fontSize: 13 }}>Could not verify right now. Please try again in a moment.</div>
          )}
          {status === "notfound" && (
            <>
              <XCircle size={32} color="#a13a2f" />
              <h3 style={{ margin: "12px 0 4px", color: "#1c2b3a" }}>Not a valid hall ticket</h3>
              <p style={{ fontSize: 12.5, color: "#7a8794" }}>Roll No. {rollNo} doesn't match an approved hall ticket. This QR code may be invalid, or the application may not yet be approved.</p>
            </>
          )}
          {status === "found" && record && (
            <>
              <CheckCircle2 size={32} color="#2f6b45" />
              <h3 style={{ margin: "12px 0 14px", color: "#1c2b3a" }}>Valid hall ticket</h3>
              {record.photo_data_url && (
                <img src={record.photo_data_url} style={{ width: 84, height: 100, objectFit: "cover", borderRadius: 6, border: "1px solid #dde3ea", marginBottom: 12 }} />
              )}
              <DetailRow label="Roll No." value={record.hall_ticket_no} />
              <DetailRow label="Candidate name" value={record.name} />
              <DetailRow label="Course" value={record.course_name} />
              <DetailRow label="Examination centre" value={settings?.examCentre || "—"} />
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function Landing({ onPick }) {
  return (
    <div>
      <Header title="AIIMS Bibinagar" subtitle="Examination Cell — Hall Ticket Portal" />
      <div style={{ padding: 40, textAlign: "center" }}>
        <GraduationCap size={40} color="#1a3a5c" />
        <h2 style={{ fontSize: 19, color: "#1c2b3a", margin: "12px 0 4px" }}>Student registration & hall ticket generation</h2>
        <p style={{ fontSize: 13.5, color: "#5f6d7a", maxWidth: 480, margin: "0 auto 28px" }}>
          Register for examinations, upload documents, pay fees, and track your application status.
        </p>
        <div style={{ display: "flex", gap: 16, justifyContent: "center", flexWrap: "wrap" }}>
          <div onClick={() => onPick("student")} role="button" tabIndex={0}
            style={{ cursor: "pointer", width: 220, background: "#fff", border: "1px solid #dde3ea", borderRadius: 10, padding: "22px 18px" }}>
            <GraduationCap size={26} color="#1a3a5c" />
            <div style={{ fontWeight: 700, marginTop: 10, color: "#1c2b3a" }}>Student login</div>
            <div style={{ fontSize: 12, color: "#7a8794", marginTop: 4 }}>Register, pay fees, check status</div>
          </div>
          <div onClick={() => onPick("admin")} role="button" tabIndex={0}
            style={{ cursor: "pointer", width: 220, background: "#fff", border: "1px solid #dde3ea", borderRadius: 10, padding: "22px 18px" }}>
            <ShieldCheck size={26} color="#a9762f" />
            <div style={{ fontWeight: 700, marginTop: 10, color: "#1c2b3a" }}>Administrator login</div>
            <div style={{ fontSize: 12, color: "#7a8794", marginTop: 4 }}>Verify, approve, generate hall tickets</div>
          </div>
        </div>
        <p style={{ fontSize: 11, color: "#a2adb8", marginTop: 30 }}>Prototype build — demo data only, not connected to a live payment gateway.</p>
      </div>
    </div>
  );
}

const emptyForm = {
  name: "", father: "", dob: "", mobile: "", guardianMobile: "",
  permAddress: "", commAddress: "", sameAsPerm: false,
  hallTicketNo: "",
  photo: null, signature: null, signatureMode: "upload",
  course: "", subjects: {}, receipt: null, utr: "", agree: false,
};

function StudentLoginGate({ settings, studentMaster, onVerified }) {
  const [rollNo, setRollNo] = useState("");
  const [dob, setDob] = useState("");
  const [rollErr, setRollErr] = useState("");

  function verifyRollDob() {
    const target = sanitizeRollNo(rollNo, settings.rollNoAllowedSpecialChars);
    const targetDob = normalizeDob(dob);
    const match = studentMaster.find(
      (s) => sanitizeRollNo(s.roll_no, settings.rollNoAllowedSpecialChars) === target && normalizeDob(s.dob) === targetDob
    );
    if (!match) { setRollErr("No matching record found. Check your Roll No. and date of birth, or contact the Examination Cell."); return; }
    setRollErr("");
    onVerified(match);
  }

  return (
    <div style={{ background: "#fff", border: "1px solid #dde3ea", borderRadius: 10, padding: 28 }}>
      <div style={{ textAlign: "center", marginBottom: 18 }}>
        <KeyRound size={26} color="#1a3a5c" />
        <h3 style={{ margin: "10px 0 4px", color: "#1c2b3a" }}>Verify your details to continue</h3>
        <p style={{ fontSize: 12.5, color: "#7a8794" }}>This confirms you're on the current examination's registered student list before you fill out the form.</p>
      </div>

      <div style={{ maxWidth: 340, margin: "0 auto" }}>
        <Field label="Roll No." required>
          <input style={{ ...inputStyle, textTransform: "uppercase" }} value={rollNo} onChange={(e) => setRollNo(sanitizeRollNo(e.target.value, settings.rollNoAllowedSpecialChars))} onKeyDown={(e) => e.key === "Enter" && verifyRollDob()} />
        </Field>
        <Field label="Date of birth" required>
          <input type="date" style={inputStyle} value={dob} onChange={(e) => setDob(e.target.value)} />
        </Field>
        {rollErr && <div style={{ color: "#a13a2f", fontSize: 12.5, marginBottom: 10 }}>{rollErr}</div>}
        <Btn onClick={verifyRollDob} style={{ width: "100%", justifyContent: "center" }}>Verify & continue</Btn>
      </div>
    </div>
  );
}

function StudentPortal({ regs, persist, courses, settings, studentMaster, initialCourse, onExit }) {
  const [sub, setSub] = useState("form");
  const [verified, setVerified] = useState(null);
  const [draftId] = useState(() => uid());
  const [form, setForm] = useState(() => ({
    ...emptyForm,
    course: initialCourse && courses[initialCourse] && courses[initialCourse].active !== false ? initialCourse : "",
  }));
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState({});
  const [myApp, setMyApp] = useState(null);
  const [lookupMobile, setLookupMobile] = useState("");
  const [lookupHallTicket, setLookupHallTicket] = useState("");
  const [lookupResult, setLookupResult] = useState(undefined);

  const availableCourses = Object.keys(courses).filter((c) => courses[c].active !== false);
  const courseSubjects = form.course ? courses[form.course].subjects : [];
  const feeTier = form.course ? courses[form.course].feeTier : null;
  const fee = useMemo(() => {
    if (!form.course) return { count: 0, total: 0, subjects: [] };
    const selected = Object.keys(form.subjects).filter((n) => form.subjects[n]);
    return computeFee(courses, form.course, selected);
  }, [form.course, form.subjects, courses]);
  const upiUri = useMemo(
    () => buildUpiUri(settings.bank, settings.instituteName, fee.total, `Exam fee ${form.hallTicketNo || ""}`.trim()),
    [settings.bank, settings.instituteName, fee.total, form.hallTicketNo]
  );
  const windowStatus = useMemo(() => getRegistrationWindowStatus(settings), [settings.registrationOpensAt, settings.registrationClosesAt]);

  function update(field, val) {
    setForm((f) => ({ ...f, [field]: val }));
  }

  function toggleSubject(name) {
    setForm((f) => {
      const turningOn = !f.subjects[name];
      const nextSubjects = { ...f.subjects, [name]: turningOn };
      const target = courseSubjects.find((s) => s.name === name);
      if (turningOn && target && target.date) {
        courseSubjects.forEach((s) => {
          const linked = target.linkGroup && s.linkGroup === target.linkGroup;
          if (s.name !== name && s.date === target.date && !linked) {
            nextSubjects[s.name] = false;
          }
        });
      }
      if (target && target.linkGroup) {
        courseSubjects.forEach((s) => {
          if (s.name !== name && s.linkGroup === target.linkGroup) {
            nextSubjects[s.name] = turningOn;
          }
        });
      }
      return { ...f, subjects: nextSubjects };
    });
  }

  async function handleImage(e, field, maxBytes, maxDim, label) {
    const file = e.target.files[0];
    if (!file) return;
    if (!["image/jpeg", "image/jpg", "image/png"].includes(file.type)) {
      setError(`${label} must be a JPG or PNG file.`); return;
    }
    if (file.size > maxBytes) {
      setError(`${label} exceeds the maximum allowed size.`); return;
    }
    setError("");
    setUploading((u) => ({ ...u, [field]: true }));
    try {
      const resizedDataUrl = await resizeImage(file, maxDim);
      const url = await uploadToStorage(resizedDataUrl, `${field}s/${draftId}.jpg`, "image/jpeg");
      update(field, { dataUrl: url, name: file.name });
    } catch (err) {
      setError(`Could not upload ${label.toLowerCase()}. Check your internet connection and try again.`);
    }
    setUploading((u) => ({ ...u, [field]: false }));
  }

  async function handleReceipt(e) {
    const file = e.target.files[0];
    if (!file) return;
    const okType = ["image/jpeg", "image/jpg", "image/png", "image/tiff", "image/tif"].includes(file.type);
    if (!okType) { setError("Payment receipt must be an image file (JPG, PNG, or TIFF)."); return; }
    if (file.size > 2 * 1024 * 1024) { setError("Payment receipt exceeds 2 MB."); return; }
    setError("");
    setUploading((u) => ({ ...u, receipt: true }));
    try {
      const ext = file.name.includes(".") ? file.name.split(".").pop() : "jpg";
      const url = await uploadToStorage(file, `receipts/${draftId}.${ext}`, file.type);
      update("receipt", { dataUrl: url, name: file.name, type: file.type, size: file.size });
    } catch (err) {
      setError("Could not upload the receipt. Check your internet connection and try again.");
    }
    setUploading((u) => ({ ...u, receipt: false }));
  }

  function validate() {
    if (!form.hallTicketNo) return "Enter your roll number as intimated by the Examination Cell.";
    if (!form.name || !form.father || !form.dob || !form.mobile || !form.course) return "Please fill in all required personal and course details.";
    if (!/^[0-9]{10}$/.test(form.mobile)) return "Enter a valid 10-digit student mobile number.";
    if (!form.permAddress) return "Permanent address is required.";
    if (!form.sameAsPerm && !form.commAddress) return "Communication address is required.";
    if (!form.photo) return "Please upload your photograph.";
    if (!form.signature) return "Signature to be uploaded.";
    if (fee.count === 0) return "Select at least one subject to appear for.";
    if (!form.utr) return "Enter the UPI transaction reference (UTR) number after payment.";
    if (!form.receipt) return "Please upload your payment receipt.";
    if (!form.agree) return "You must accept the declaration to submit the form.";
    return "";
  }

  async function handleSubmit() {
    const err = validate();
    if (err) { setError(err); return; }
    if (Object.values(uploading).some(Boolean)) { setError("Please wait for uploads to finish before submitting."); return; }
    setBusy(true);
    const appId = draftId;
    const record = {
      id: appId,
      hallTicketNo: form.hallTicketNo.trim(),
      status: "pending",
      submittedAt: new Date().toISOString(),
      name: form.name, father: form.father, dob: form.dob,
      mobile: form.mobile, guardianMobile: form.guardianMobile,
      permAddress: form.permAddress,
      commAddress: form.sameAsPerm ? form.permAddress : form.commAddress,
      photo: form.photo, signature: form.signature, signatureMode: form.signatureMode,
      course: form.course, subjects: fee.subjects,
      totalFee: fee.total, utr: form.utr, receipt: form.receipt,
      remarks: "", history: [{ at: new Date().toISOString(), action: "Application submitted" }],
    };
    await persist([...regs, record]);
    setMyApp(record);
    setBusy(false);
    setSub("confirmation");
  }

  function doLookup() {
    const htq = lookupHallTicket.trim().toLowerCase();
    const mq = lookupMobile.trim();
    const found = regs.filter((r) =>
      (htq && r.hallTicketNo && r.hallTicketNo.toLowerCase() === htq) ||
      (mq && r.mobile === mq)
    );
    setLookupResult(found);
  }

  return (
    <div>
      <Header title="Student portal" subtitle="AIIMS Bibinagar Examination Cell" onBack={onExit}
        right={<div style={{ display: "flex", gap: 6 }}>
          <TabBtn active={sub === "form"} onClick={() => setSub("form")}>Register</TabBtn>
          <TabBtn active={sub === "status"} onClick={() => setSub("status")}>Check status</TabBtn>
        </div>} />
      <div style={{ padding: 22 }}>
        {sub === "form" && !windowStatus.open && (
          <div style={{ background: "#fff", border: "1px solid #dde3ea", borderRadius: 10, padding: 32, textAlign: "center" }}>
            <AlertCircle size={32} color="#a9762f" />
            <h3 style={{ margin: "12px 0 6px", color: "#1c2b3a" }}>
              {windowStatus.reason === "disabled" ? "Registration is currently unavailable"
                : windowStatus.reason === "not_yet_open" ? "Registration hasn't opened yet"
                : "Registration is now closed"}
            </h3>
            {windowStatus.reason === "disabled" && (
              <p style={{ fontSize: 13, color: "#5f6d7a" }}>The administrator has temporarily disabled new registrations. Please check back later.</p>
            )}
            {windowStatus.reason === "not_yet_open" && windowStatus.opensAt && (
              <p style={{ fontSize: 13, color: "#5f6d7a" }}>Registration opens on <b>{formatDateTime(settings.registrationOpensAt)}</b>.</p>
            )}
            {windowStatus.reason === "closed" && windowStatus.closesAt && (
              <p style={{ fontSize: 13, color: "#5f6d7a" }}>The last date and time for submission of the examination fee was <b>{formatDateTime(settings.registrationClosesAt)}</b>.</p>
            )}
            <p style={{ fontSize: 12.5, color: "#7a8794", marginTop: 10 }}>You can still check the status of an application you already submitted using the "Check status" tab above.</p>
          </div>
        )}
        {sub === "form" && windowStatus.open && studentMaster.length > 0 && !verified && (
          <StudentLoginGate
            settings={settings}
            studentMaster={studentMaster}
            onVerified={(rec) => {
              setVerified(rec);
              setForm((f) => ({
                ...f,
                hallTicketNo: rec.roll_no || f.hallTicketNo,
                mobile: rec.mobile || f.mobile,
              }));
            }}
          />
        )}
        {sub === "form" && windowStatus.open && (studentMaster.length === 0 || verified) && (
          <div style={{ background: "#fff", border: "1px solid #dde3ea", borderRadius: 10, padding: 24 }}>
            <h3 style={{ margin: "0 0 4px", color: "#1c2b3a" }}>Examination registration form</h3>
            <p style={{ fontSize: 12.5, color: "#7a8794", margin: "0 0 18px" }}>Fields marked with * are required. Your hall ticket number will be assigned by the administrator after verification.</p>

            {error && (
              <div style={{ display: "flex", gap: 8, background: "#fbeceb", border: "1px solid #e3b3ae", color: "#a13a2f", padding: "10px 12px", borderRadius: 6, marginBottom: 16, fontSize: 13 }}>
                <AlertCircle size={16} style={{ flexShrink: 0, marginTop: 1 }} /> <span>{error}</span>
              </div>
            )}

            <SectionTitle n="1" title="Personal information" />
            <Grid2>
              <Field label="Roll No." required hint="As intimated to you by the Examination Cell (register office)">
                <input style={{ ...inputStyle, textTransform: "uppercase" }} value={form.hallTicketNo} onChange={(e) => update("hallTicketNo", sanitizeRollNo(e.target.value, settings.rollNoAllowedSpecialChars))} />
              </Field>
              <Field label="Candidate name (as per Class 10 certificate)" required>
                <input style={{ ...inputStyle, textTransform: "uppercase" }} value={form.name} onChange={(e) => update("name", e.target.value.toUpperCase())} />
              </Field>
              <Field label="Father / Guardian name" required>
                <input style={{ ...inputStyle, textTransform: "uppercase" }} autoComplete="off" value={form.father} onChange={(e) => update("father", e.target.value.toUpperCase())} />
              </Field>
              <Field label="Date of birth (as per Class 10 certificate)" required>
                <input type="date" style={inputStyle} value={form.dob} onChange={(e) => update("dob", e.target.value)} />
              </Field>
              <Field label="Student mobile number" required hint="10 digits">
                <input style={inputStyle} value={form.mobile} maxLength={10} onChange={(e) => update("mobile", e.target.value.replace(/\D/g, ""))} />
              </Field>
              <Field label="Father / Guardian mobile number">
                <input style={inputStyle} value={form.guardianMobile} maxLength={10} onChange={(e) => update("guardianMobile", e.target.value.replace(/\D/g, ""))} />
              </Field>
            </Grid2>

            <SectionTitle n="2" title="Address details" />
            <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, marginBottom: 10, color: "#5f6d7a" }}>
              <input type="checkbox" checked={form.sameAsPerm} onChange={(e) => update("sameAsPerm", e.target.checked)} /> Communication address is the same as permanent address
            </label>
            <Grid2>
              <Field label="Permanent address" required>
                <textarea style={{ ...inputStyle, minHeight: 60 }} value={form.permAddress} onChange={(e) => update("permAddress", e.target.value)} />
              </Field>
              <Field label="Communication address" required={!form.sameAsPerm}>
                {form.sameAsPerm
                  ? <div style={{ ...inputStyle, minHeight: 60, boxSizing: "border-box", display: "flex", alignItems: "center", color: "#a2adb8", fontStyle: "italic", background: "#f7f9fb" }}>Same as permanent address</div>
                  : <textarea style={{ ...inputStyle, minHeight: 60 }} value={form.commAddress} onChange={(e) => update("commAddress", e.target.value)} />}
              </Field>
            </Grid2>

            <SectionTitle n="3" title="Photograph & signature" />
            <Grid2>
              <Field label="Photograph" required hint="JPG/PNG, max 1 MB">
                <UploadBox onChange={(e) => handleImage(e, "photo", 1024 * 1024, 400, "Photograph")} preview={form.photo?.dataUrl} accept="image/jpeg,image/png" />
                {uploading.photo && <div style={{ fontSize: 11.5, color: "#8a6116", marginTop: 4 }}><Loader2 size={11} style={{ animation: "spin 1s linear infinite", verticalAlign: "middle", marginRight: 4 }} />Uploading...</div>}
              </Field>
              <Field label="Signature" required hint="JPG/PNG, max 500 KB">
                <UploadBox onChange={(e) => handleImage(e, "signature", 500 * 1024, 300, "Signature")} preview={form.signature?.dataUrl} accept="image/jpeg,image/png" />
                {uploading.signature && <div style={{ fontSize: 11.5, color: "#8a6116", marginTop: 4 }}><Loader2 size={11} style={{ animation: "spin 1s linear infinite", verticalAlign: "middle", marginRight: 4 }} />Uploading...</div>}
              </Field>
            </Grid2>

            <SectionTitle n="4" title="Course & subject selection" />
            <Field label="Course" required>
              <select style={inputStyle} value={form.course} onChange={(e) => { update("course", e.target.value); update("subjects", {}); }}>
                <option value="">Select course</option>
                {availableCourses.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
              {availableCourses.length < Object.keys(courses).length && (
                <div style={{ fontSize: 11.5, color: "#a2adb8", marginTop: 4 }}>Only courses currently open for registration are shown.</div>
              )}
            </Field>
            {form.course && (
              <div style={{ background: "#f7f9fb", border: "1px solid #e2e8ef", borderRadius: 8, padding: 14, marginTop: 6 }}>
                <p style={{ fontSize: 12.5, margin: "0 0 6px", color: "#5f6d7a", fontStyle: "italic" }}>
                  I have sufficient attendance and I will appear in the following subjects.
                </p>
                {feeTier && (
                  <p style={{ fontSize: 11.5, color: "#8a6116", margin: "0 0 10px" }}>
                    Fee schedule: {feeTier === "tier1"
                      ? "₹20 for one subject, ₹40 for two or more subjects."
                      : feeTier === "tier3"
                      ? "Flat ₹200 whether you select one subject or all of them."
                      : "₹20 for one subject, ₹30 for two subjects, ₹60 for three or more subjects."}
                  </p>
                )}
                {sortSubjectsByDate(courseSubjects).map((s) => {
                  const clashes = s.date && courseSubjects.some((other) => other.name !== s.name && other.date === s.date && !(s.linkGroup && other.linkGroup === s.linkGroup));
                  const partners = s.linkGroup ? courseSubjects.filter((other) => other.name !== s.name && other.linkGroup === s.linkGroup).map((o) => o.name) : [];
                  return (
                  <label key={s.name} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid #ecf0f4", fontSize: 13.5 }}>
                    <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <input type="checkbox" checked={!!form.subjects[s.name]} onChange={() => toggleSubject(s.name)} />
                      {s.name}
                      {clashes && <span style={{ fontSize: 10, color: "#a13a2f", fontStyle: "italic" }}>(same date — pick only one)</span>}
                      {partners.length > 0 && <span style={{ fontSize: 10, color: "#1a3a5c", fontStyle: "italic" }}>(selected together with {partners.join(", ")})</span>}
                    </span>
                    <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <span style={{ fontSize: 11.5, color: "#8a6116" }}>{formatExamDateRange(s)}</span>
                      {!feeTier && <span style={{ color: "#7a8794" }}>₹{s.fee}</span>}
                    </span>
                  </label>
                  );
                })}
                <div style={{ display: "flex", justifyContent: "space-between", marginTop: 10, fontSize: 13.5 }}>
                  <span style={{ color: "#5f6d7a" }}>{fee.count} subject(s) selected</span>
                  <span style={{ fontWeight: 700, color: "#1a3a5c" }}>Total fee: ₹{fee.total}</span>
                </div>
              </div>
            )}

            <SectionTitle n="5" title="Examination fee payment" />
            <div style={{ background: "#f7f9fb", border: "1px solid #e2e8ef", borderRadius: 8, padding: 14 }}>
              <div style={{ display: "flex", gap: 20, flexWrap: "wrap", alignItems: "center" }}>
                {settings.paymentQrImageUrl
                  ? <img src={settings.paymentQrImageUrl} alt="Payment QR code" style={{ width: 92, height: 92, objectFit: "contain", background: "#fff", border: "1px solid #ddd" }} />
                  : <QRBlock text={upiUri || `AIIMS Bibinagar Exam Fee - Roll No ${form.hallTicketNo || ""} - Rs ${fee.total || 0}`} size={92} />}
                <div style={{ flex: 1, minWidth: 200 }}>
                  <div style={{ fontSize: 13.5, marginBottom: 6 }}>Payable amount: <b>₹{fee.total || 0}</b></div>
                  {settings.paymentQrImageUrl ? (
                    <div style={{ fontSize: 12, color: "#7a8794", marginBottom: 10 }}>Scan using any UPI app (Google Pay, PhonePe, Paytm, BHIM), then enter the transaction details below.</div>
                  ) : upiUri ? (
                    <div style={{ fontSize: 12, color: "#7a8794", marginBottom: 10 }}>Scan using any UPI app (Google Pay, PhonePe, Paytm, BHIM) — it will open pre-filled with the amount. Then enter the transaction details below.</div>
                  ) : (
                    <div style={{ fontSize: 12, color: "#a2adb8", marginBottom: 10 }}>A UPI ID hasn't been set up yet, so this QR code isn't a payment link — use the bank transfer details below instead, or ask the administrator to add a UPI ID in Settings.</div>
                  )}
                  <Field label="UPI transaction reference (UTR / Transaction ID)" required>
                    <input style={inputStyle} value={form.utr} onChange={(e) => update("utr", e.target.value)} placeholder="e.g. 402611223344" />
                  </Field>
                  <Field label="Upload payment receipt" required hint="JPG/PNG/TIFF image, max 2 MB">
                    <UploadBox onChange={handleReceipt} fileName={form.receipt?.name} accept="image/jpeg,image/png,image/tiff,image/tif" />
                    {uploading.receipt && <div style={{ fontSize: 11.5, color: "#8a6116", marginTop: 4 }}><Loader2 size={11} style={{ animation: "spin 1s linear infinite", verticalAlign: "middle", marginRight: 4 }} />Uploading...</div>}
                  </Field>
                </div>
              </div>
              <div style={{ borderTop: "1px solid #e2e8ef", marginTop: 14, paddingTop: 12 }}>
                <div style={{ fontSize: 12.5, fontWeight: 600, color: "#5f6d7a", marginBottom: 6 }}>Or pay by bank transfer (NEFT / RTGS)</div>
                <BankDetails bank={settings.bank} />
              </div>
            </div>

            <SectionTitle n="6" title="Declaration" />
            <div style={{ background: "#fdf7ec", border: "1px solid #ecd9ae", borderRadius: 8, padding: 14, fontSize: 13, color: "#4a3c1f", lineHeight: 1.5 }}>
              I hereby declare that I have read and understood the instructions given above. I also affirm that I
              have submitted the examination fee applicable for the subject(s) filled in this form. If any statement
              is found untrue, I shall have no claim for appearing in the examination. I undertake that I shall
              abide by the rules and regulations of the Institution.
              <div style={{ marginTop: 10, display: "flex", gap: 18 }}>
                <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <input type="radio" name="agree" checked={form.agree === true} onChange={() => update("agree", true)} /> I agree
                </label>
                <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <input type="radio" name="agree" checked={form.agree === false} onChange={() => update("agree", false)} /> I do not agree
                </label>
              </div>
            </div>

            <div style={{ marginTop: 20, display: "flex", justifyContent: "flex-end" }}>
              <Btn onClick={handleSubmit} disabled={busy || form.agree !== true || fee.count === 0 || Object.values(uploading).some(Boolean)}>
                {busy ? <Loader2 size={15} style={{ animation: "spin 1s linear infinite" }} /> : <CheckCircle2 size={15} />}
                Submit examination form
              </Btn>
            </div>

            {settings.registrationClosesAt && (
              <div style={{
                marginTop: 22, padding: "10px 16px", borderRadius: 8, textAlign: "center",
                background: "#fbeceb", border: "1px solid #e3b3ae",
              }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: "#a13a2f", animation: "blink-notice 1.4s ease-in-out infinite" }}>
                  Last Date for Submission: {formatDateTime(settings.registrationClosesAt)}
                </span>
              </div>
            )}
          </div>
        )}

        {sub === "confirmation" && myApp && (
          <div className="print-area" style={{ background: "#fff", border: "1px solid #dde3ea", borderRadius: 10, padding: 28, textAlign: "center" }}>
            <CheckCircle2 size={36} color="#2f6b45" />
            <h3 style={{ margin: "12px 0 4px", color: "#1c2b3a" }}>Application submitted</h3>
            <p style={{ fontSize: 13.5, color: "#5f6d7a" }}>Your application reference number is</p>
            <div style={{ fontFamily: "monospace", fontSize: 18, fontWeight: 700, color: "#1a3a5c", margin: "6px 0 18px" }}>{myApp.id}</div>
            <p style={{ fontSize: 12.5, color: "#7a8794", maxWidth: 420, margin: "0 auto 18px" }}>
              Keep this reference number safe. The administrator will verify your documents and payment, and your
              hall ticket number will be generated after approval. You will not be able to download the hall ticket
              yourself — only the acknowledgement below.
            </p>
            <div style={{ display: "flex", justifyContent: "center", gap: 10 }}>
              <Btn variant="outline" onClick={() => window.print()}><Download size={14} /> Download acknowledgement</Btn>
              <Btn variant="ghost" onClick={() => { setForm(emptyForm); setSub("form"); setMyApp(null); }}>Register another application</Btn>
            </div>
          </div>
        )}

        {sub === "status" && (
          <div style={{ background: "#fff", border: "1px solid #dde3ea", borderRadius: 10, padding: 24 }}>
            <h3 style={{ margin: "0 0 12px", color: "#1c2b3a" }}>Check application status</h3>
            <div style={{ display: "flex", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
              <input style={{ ...inputStyle, maxWidth: 220 }} placeholder="Roll No." value={lookupHallTicket} onChange={(e) => setLookupHallTicket(e.target.value)} />
              <input style={{ ...inputStyle, maxWidth: 220 }} placeholder="Or registered mobile number" value={lookupMobile} onChange={(e) => setLookupMobile(e.target.value.replace(/\D/g, ""))} maxLength={10} />
              <Btn onClick={doLookup}><Search size={14} /> Search</Btn>
            </div>
            <p style={{ fontSize: 11.5, color: "#a2adb8", marginBottom: 12 }}>Enter either your hall ticket number or your registered mobile number.</p>
            {lookupResult !== undefined && lookupResult.length === 0 && (
              <p style={{ fontSize: 13, color: "#7a8794" }}>No applications found for this mobile number.</p>
            )}
            {lookupResult && lookupResult.map((r) => (
              <div key={r.id} style={{ border: "1px solid #e2e8ef", borderRadius: 8, padding: 14, marginBottom: 10 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <div style={{ fontWeight: 700, color: "#1c2b3a" }}>{r.name}</div>
                    <div style={{ fontSize: 12, color: "#7a8794" }}>{r.course} · Ref {r.id}</div>
                  </div>
                  <StatusPill status={r.status} />
                </div>
                {r.status === "approved" && r.hallTicketNo && (
                  <div style={{ marginTop: 8, fontSize: 12.5, color: "#2f6b45" }}>
                    Roll No.: <b>{r.hallTicketNo}</b>. Please contact the Examination Cell to collect your printed hall ticket.
                  </div>
                )}
                {r.status === "rejected" && r.remarks && (
                  <div style={{ marginTop: 8, fontSize: 12.5, color: "#a13a2f" }}>Reason: {r.remarks}</div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function SectionTitle({ n, title }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "22px 0 12px" }}>
      <div style={{ width: 22, height: 22, borderRadius: "50%", background: "#1a3a5c", color: "#fff", fontSize: 11, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center" }}>{n}</div>
      <div style={{ fontSize: 13.5, fontWeight: 700, color: "#1c2b3a" }}>{title}</div>
    </div>
  );
}

function Grid2({ children }) {
  return <div className="grid-2col">{children}</div>;
}

function UploadBox({ onChange, preview, fileName, accept }) {
  const ref = useRef(null);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      {preview && <img src={preview} alt="preview" style={{ width: 44, height: 44, objectFit: "cover", borderRadius: 6, border: "1px solid #dde3ea" }} />}
      <Btn variant="outline" onClick={() => ref.current.click()} style={{ padding: "7px 12px" }}>
        <Upload size={13} /> {preview || fileName ? "Replace file" : "Choose file"}
      </Btn>
      {fileName && !preview && <span style={{ fontSize: 12, color: "#5f6d7a" }}>{fileName}</span>}
      <input ref={ref} type="file" accept={accept} onChange={onChange} style={{ display: "none" }} />
    </div>
  );
}

function TabBtn({ active, children, onClick }) {
  return (
    <button onClick={onClick} style={{
      background: active ? "#fff" : "transparent", color: active ? "#1a3a5c" : "#cfe0f2",
      border: "none", borderRadius: 6, padding: "6px 12px", fontSize: 12.5, fontWeight: 600, cursor: "pointer",
    }}>{children}</button>
  );
}

function StatusPill({ status }) {
  const map = {
    pending: { bg: "#fdf3e3", color: "#8a6116", label: "Pending" },
    approved: { bg: "#e7f3ea", color: "#2f6b45", label: "Approved" },
    rejected: { bg: "#fbeceb", color: "#a13a2f", label: "Rejected" },
  };
  const s = map[status] || map.pending;
  return <span style={{ background: s.bg, color: s.color, fontSize: 11.5, fontWeight: 700, padding: "3px 10px", borderRadius: 12 }}>{s.label}</span>;
}

function AdminPortal({ regs, persist, nextSeq, courses, persistCourses, settings, persistSettings, studentMaster, persistStudentMaster, onRefresh, onExit }) {
  const [authed, setAuthed] = useState(false);
  const [pw, setPw] = useState("");
  const [pwErr, setPwErr] = useState("");
  const [tab, setTab] = useState("dashboard");
  const [refreshing, setRefreshing] = useState(false);

  async function handleRefresh() {
    setRefreshing(true);
    await onRefresh();
    setRefreshing(false);
  }

  function login() {
    const current = settings.adminPassword || "admin123";
    if (pw === current) { setAuthed(true); setPwErr(""); }
    else setPwErr("Incorrect password.");
  }

  if (!authed) {
    return (
      <div>
        <Header title="Administrator login" subtitle="AIIMS Bibinagar Examination Cell" onBack={onExit} />
        <div style={{ padding: 40, display: "flex", justifyContent: "center" }}>
          <div style={{ background: "#fff", border: "1px solid #dde3ea", borderRadius: 10, padding: 26, width: 300 }}>
            <ShieldCheck size={26} color="#a9762f" />
            <p style={{ fontSize: 13, color: "#5f6d7a", margin: "10px 0 16px" }}>Enter the administrator password to continue.</p>
            <input type="password" style={inputStyle} value={pw} onChange={(e) => setPw(e.target.value)} onKeyDown={(e) => e.key === "Enter" && login()} placeholder="Password" />
            {pwErr && <div style={{ color: "#a13a2f", fontSize: 12, marginTop: 6 }}>{pwErr}</div>}
            <Btn onClick={login} style={{ marginTop: 14, width: "100%", justifyContent: "center" }}>Sign in</Btn>
            {(settings.adminPassword || "admin123") === "admin123" && (
              <p style={{ fontSize: 11, color: "#a2adb8", marginTop: 12 }}>Default password: admin123 — change this under Settings once you're in.</p>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <Header title="Administrator portal" subtitle="AIIMS Bibinagar Examination Cell" onBack={onExit}
        right={<div style={{ display: "flex", gap: 4, flexWrap: "wrap", alignItems: "center" }}>
          <TabBtn active={tab === "dashboard"} onClick={() => setTab("dashboard")}>Dashboard</TabBtn>
          <TabBtn active={tab === "students"} onClick={() => setTab("students")}>Applications</TabBtn>
          <TabBtn active={tab === "hallticket"} onClick={() => setTab("hallticket")}>Hall tickets</TabBtn>
          <TabBtn active={tab === "receipts"} onClick={() => setTab("receipts")}>Receipts</TabBtn>
          <TabBtn active={tab === "courses"} onClick={() => setTab("courses")}>Courses</TabBtn>
          <TabBtn active={tab === "students-master"} onClick={() => setTab("students-master")}>Students</TabBtn>
          <TabBtn active={tab === "settings"} onClick={() => setTab("settings")}>Settings</TabBtn>
          <TabBtn active={tab === "reports"} onClick={() => setTab("reports")}>Reports</TabBtn>
          <TabBtn active={tab === "backup"} onClick={() => setTab("backup")}>Backup</TabBtn>
          <button onClick={handleRefresh} title="Refresh data from storage" style={{ display: "flex", alignItems: "center", gap: 4, background: "rgba(255,255,255,0.08)", border: "none", borderRadius: 6, color: "#cfe0f2", cursor: "pointer", padding: "5px 8px", fontSize: 12 }}>
            <Loader2 size={14} style={refreshing ? { animation: "spin 1s linear infinite" } : {}} /> Refresh
          </button>
          <button onClick={onExit} title="Log out" style={{ background: "transparent", border: "none", color: "#cfe0f2", cursor: "pointer", padding: 4 }}><LogOut size={17} /></button>
        </div>} />
      <div style={{ padding: 22 }}>
        {tab === "dashboard" && <Dashboard regs={regs} settings={settings} />}
        {tab === "students" && <Applications regs={regs} persist={persist} nextSeq={nextSeq} courses={courses} settings={settings} />}
        {tab === "hallticket" && <HallTickets regs={regs} courses={courses} settings={settings} />}
        {tab === "courses" && <CoursesAdmin courses={courses} persistCourses={persistCourses} settings={settings} regs={regs} persist={persist} />}
        {tab === "students-master" && <StudentMasterAdmin studentMaster={studentMaster} persistStudentMaster={persistStudentMaster} settings={settings} persistSettings={persistSettings} regs={regs} />}
        {tab === "settings" && <SettingsAdmin settings={settings} persistSettings={persistSettings} />}
        {tab === "receipts" && <ReceiptsSheet regs={regs} />}
        {tab === "reports" && <Reports regs={regs} courses={courses} />}
        {tab === "backup" && <ConfigBackup courses={courses} persistCourses={persistCourses} settings={settings} persistSettings={persistSettings} />}
      </div>
    </div>
  );
}

function emptyCourseDraft() {
  return { id: null, originalName: null, name: "", code: "", feeTier: "", examTitle: "", subjects: [{ id: subjId(), name: "", fee: 100, date: "", dateTo: "", linkGroup: "" }] };
}

function StudentMasterAdmin({ studentMaster, persistStudentMaster, settings, persistSettings, regs }) {
  const fileRef = useRef(null);
  const [err, setErr] = useState("");
  const [info, setInfo] = useState("");
  const [rollCharsDraft, setRollCharsDraft] = useState(settings.rollNoAllowedSpecialChars);
  const [rollCharsSaved, setRollCharsSaved] = useState(false);
  const [showNotApplied, setShowNotApplied] = useState(false);

  const notApplied = useMemo(() => {
    const appliedRolls = new Set(
      (regs || [])
        .map((r) => sanitizeRollNo(r.hallTicketNo, settings.rollNoAllowedSpecialChars))
        .filter(Boolean)
    );
    return studentMaster.filter((s) => {
      const roll = sanitizeRollNo(s.roll_no, settings.rollNoAllowedSpecialChars);
      return roll && !appliedRolls.has(roll);
    });
  }, [studentMaster, regs, settings.rollNoAllowedSpecialChars]);

  function downloadNotApplied() {
    const csv = toCSV(notApplied, [
      { label: "roll_no", get: (r) => r.roll_no },
      { label: "mobile", get: (r) => r.mobile },
      { label: "dob", get: (r) => r.dob },
      { label: "name", get: (r) => r.name },
    ]);
    download("students_not_applied.csv", csv, "text/csv");
  }

  function saveRollChars() {
    persistSettings({ ...settings, rollNoAllowedSpecialChars: rollCharsDraft });
    setRollCharsSaved(true);
    setTimeout(() => setRollCharsSaved(false), 2000);
  }

  function handleUpload(e) {
    const file = e.target.files[0];
    if (!file) return;
    setErr(""); setInfo("");
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const rows = results.data;
        const cleaned = rows
          .map((r) => {
            const rec = {};
            Object.keys(r).forEach((k) => { rec[k.trim().toLowerCase().replace(/\s+/g, "_")] = (r[k] || "").toString().trim(); });
            return { roll_no: sanitizeRollNo(rec.roll_no || rec.rollno || rec.roll || "", settings.rollNoAllowedSpecialChars), mobile: rec.mobile || rec.mobile_no || rec.phone || "", dob: rec.dob || rec.date_of_birth || "", name: rec.name || "" };
          })
          .filter((r) => r.roll_no || r.mobile);
        if (cleaned.length === 0) {
          setErr('No usable rows found. Make sure the CSV has columns named "roll_no", "mobile", and "dob" (a "name" column is optional).');
          return;
        }
        persistStudentMaster(cleaned);
        setInfo(`Loaded ${cleaned.length} student record(s). This replaces the previous list.`);
      },
      error: (parseErr) => setErr("Could not read that file: " + parseErr.message),
    });
    e.target.value = "";
  }

  function downloadTemplate() {
    download("student_list_template.csv", "roll_no,mobile,dob,name\n25001,9876543210,2005-06-15,EXAMPLE STUDENT\n", "text/csv");
  }

  function downloadCurrent() {
    const csv = toCSV(studentMaster, [
      { label: "roll_no", get: (r) => r.roll_no },
      { label: "mobile", get: (r) => r.mobile },
      { label: "dob", get: (r) => r.dob },
      { label: "name", get: (r) => r.name },
    ]);
    download("current_student_list.csv", csv, "text/csv");
  }

  function clearList() {
    if (!window.confirm(`Remove all ${studentMaster.length} record(s) from the student master list? Students will no longer be gated by this list until you upload a new one.`)) return;
    persistStudentMaster([]);
  }

  return (
    <div style={{ background: "#fff", border: "1px solid #dde3ea", borderRadius: 10, padding: 20 }}>
      <div style={{ fontWeight: 700, fontSize: 13.5, color: "#1c2b3a", marginBottom: 4 }}>Student verification</div>
      <p style={{ fontSize: 12.5, color: "#7a8794", marginBottom: 16 }}>
        Before filling the registration form, students confirm they're on your current examination's student list by
        entering their Roll No. and date of birth. Upload one CSV file with everyone eligible for the exam(s)
        currently open — re-upload a new file any time to replace it (e.g. for the next examination cycle). Leave
        this list empty to let anyone register without this check, as before.
      </p>

      <h4 style={{ fontSize: 12.5, color: "#274566", margin: "0 0 8px" }}>Roll No. format</h4>
      <Field label="Allowed special characters" hint='Roll numbers are always automatically trimmed of spaces and converted to CAPITALS before matching, so case and stray spaces never cause a mismatch. Only letters, numbers, and whatever characters you list here are allowed — everything else is stripped as the student types. Default: , \ / -'>
        <div style={{ display: "flex", gap: 8 }}>
          <input style={inputStyle} value={rollCharsDraft} onChange={(e) => setRollCharsDraft(e.target.value)} />
          <Btn onClick={saveRollChars} style={{ flexShrink: 0 }}>{rollCharsSaved ? "Saved!" : "Save"}</Btn>
        </div>
      </Field>

      <h4 style={{ fontSize: 12.5, color: "#274566", margin: "16px 0 8px" }}>Student list</h4>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 10 }}>
        <div style={{ fontSize: 13, color: "#1c2b3a" }}><b>{studentMaster.length}</b> record(s) currently loaded</div>
        <Btn variant="outline" onClick={() => fileRef.current.click()}><Upload size={13} /> Upload CSV</Btn>
        <input ref={fileRef} type="file" accept=".csv,text/csv" onChange={handleUpload} style={{ display: "none" }} />
        <Btn variant="outline" onClick={downloadTemplate}><Download size={13} /> Download template</Btn>
        {studentMaster.length > 0 && <Btn variant="outline" onClick={downloadCurrent}><Download size={13} /> Download current list</Btn>}
        {studentMaster.length > 0 && <Btn variant="danger" onClick={clearList}>Clear list</Btn>}
      </div>
      {err && <div style={{ color: "#a13a2f", fontSize: 12.5, marginBottom: 10 }}>{err}</div>}
      {info && <div style={{ color: "#2f6b45", fontSize: 12.5, marginBottom: 10 }}>{info}</div>}

      {studentMaster.length > 0 && (
        <div style={{ maxHeight: 260, overflowY: "auto", border: "1px solid #eef1f5", borderRadius: 6 }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr style={{ background: "#f7f9fb", textAlign: "left" }}>
                <th style={{ padding: "6px 10px" }}>Roll No.</th>
                <th style={{ padding: "6px 10px" }}>Mobile</th>
                <th style={{ padding: "6px 10px" }}>DOB</th>
                <th style={{ padding: "6px 10px" }}>Name</th>
              </tr>
            </thead>
            <tbody>
              {studentMaster.slice(0, 200).map((s, i) => (
                <tr key={i} style={{ borderTop: "1px solid #eef1f5" }}>
                  <td style={{ padding: "6px 10px" }}>{s.roll_no}</td>
                  <td style={{ padding: "6px 10px" }}>{s.mobile}</td>
                  <td style={{ padding: "6px 10px" }}>{s.dob}</td>
                  <td style={{ padding: "6px 10px" }}>{s.name}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {studentMaster.length > 200 && <div style={{ padding: 8, fontSize: 11, color: "#a2adb8" }}>Showing first 200 of {studentMaster.length}.</div>}
        </div>
      )}

      {studentMaster.length > 0 && (
        <>
          <h4 style={{ fontSize: 12.5, color: "#274566", margin: "18px 0 8px" }}>Who hasn't applied yet</h4>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 10 }}>
            <div style={{ fontSize: 13, color: "#1c2b3a" }}>
              <b>{notApplied.length}</b> of {studentMaster.length} student(s) on the list have not submitted an application
            </div>
            <Btn variant="outline" onClick={() => setShowNotApplied((v) => !v)}>{showNotApplied ? "Hide list" : "Show list"}</Btn>
            {notApplied.length > 0 && <Btn variant="outline" onClick={downloadNotApplied}><Download size={13} /> Download CSV</Btn>}
          </div>
          {showNotApplied && (
            notApplied.length === 0 ? (
              <p style={{ fontSize: 12.5, color: "#7a8794" }}>Everyone on the current list has an application on file.</p>
            ) : (
              <div style={{ maxHeight: 260, overflowY: "auto", border: "1px solid #eef1f5", borderRadius: 6 }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                  <thead>
                    <tr style={{ background: "#f7f9fb", textAlign: "left" }}>
                      <th style={{ padding: "6px 10px" }}>Roll No.</th>
                      <th style={{ padding: "6px 10px" }}>Mobile</th>
                      <th style={{ padding: "6px 10px" }}>Name</th>
                    </tr>
                  </thead>
                  <tbody>
                    {notApplied.slice(0, 200).map((s, i) => (
                      <tr key={i} style={{ borderTop: "1px solid #eef1f5" }}>
                        <td style={{ padding: "6px 10px" }}>{s.roll_no}</td>
                        <td style={{ padding: "6px 10px" }}>{s.mobile}</td>
                        <td style={{ padding: "6px 10px" }}>{s.name}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {notApplied.length > 200 && <div style={{ padding: 8, fontSize: 11, color: "#a2adb8" }}>Showing first 200 of {notApplied.length}.</div>}
              </div>
            )
          )}
        </>
      )}
    </div>
  );
}

function ConfigBackup({ courses, persistCourses, settings, persistSettings }) {
  const fileRef = useRef(null);
  const [err, setErr] = useState("");
  const [info, setInfo] = useState("");

  function exportConfig() {
    const payload = { exportedAt: new Date().toISOString(), courses, settings };
    download("aiims_configuration_backup.json", JSON.stringify(payload, null, 2), "application/json");
  }

  function handleImportFile(e) {
    const file = e.target.files[0];
    if (!file) return;
    setErr(""); setInfo("");
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result);
        if (!parsed.courses || !parsed.settings) throw new Error("This doesn't look like a configuration backup file.");
        const ok = window.confirm("Import this configuration? This replaces your current courses, fees, and settings in this project.");
        if (!ok) return;
        persistCourses(parsed.courses);
        persistSettings(parsed.settings);
        setInfo("Configuration imported. If this backup came from a different Supabase project, the institute logo, signatory signature, and payment QR code image will need to be re-uploaded (Settings tab) — those are files, not text, so they don't travel inside this backup.");
      } catch (err2) {
        setErr("Could not read that file: " + err2.message);
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  }

  return (
    <div style={{ background: "#fff", border: "1px solid #dde3ea", borderRadius: 10, padding: 20 }}>
      <div style={{ fontWeight: 700, fontSize: 13.5, color: "#1c2b3a", marginBottom: 4 }}>Configuration backup</div>
      <p style={{ fontSize: 12.5, color: "#7a8794", marginBottom: 16 }}>
        Save your courses, fees, and settings as one file, and load them straight into a new Supabase project instead
        of re-entering everything by hand. This does not include student applications or the student master list —
        export those separately from the Reports and Students tabs.
      </p>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <Btn onClick={exportConfig}><Download size={14} /> Export configuration</Btn>
        <Btn variant="outline" onClick={() => fileRef.current.click()}><Upload size={14} /> Import configuration</Btn>
        <input ref={fileRef} type="file" accept=".json,application/json" onChange={handleImportFile} style={{ display: "none" }} />
      </div>
      {err && <div style={{ color: "#a13a2f", fontSize: 12.5, marginTop: 10 }}>{err}</div>}
      {info && <div style={{ color: "#2f6b45", fontSize: 12.5, marginTop: 10 }}>{info}</div>}
      <p style={{ fontSize: 11, color: "#a2adb8", marginTop: 12 }}>
        Note: the institute logo, signatory signature, and payment QR image are stored as files (not text), so they
        aren't included here — after importing into a new project, re-upload those three from the Settings tab.
      </p>
    </div>
  );
}

function CoursesAdmin({ courses, persistCourses, settings, regs, persist }) {
  const [draft, setDraft] = useState(null); // null = not editing/adding
  const [linkOpenFor, setLinkOpenFor] = useState("");
  const [err, setErr] = useState("");

  function toggleActive(name) {
    const cur = courses[name];
    persistCourses({ ...courses, [name]: { ...cur, active: cur.active === false } });
  }

  function deleteCourse(name) {
    if (!window.confirm(`Remove "${name}" from the course list? This does not affect existing applications already submitted under this course.`)) return;
    const next = { ...courses };
    delete next[name];
    persistCourses(next);
  }

  async function deleteApplicationsForCourse(name) {
    const matching = regs.filter((r) => r.course === name);
    if (matching.length === 0) {
      window.alert(`There are no applications on file for "${name}".`);
      return;
    }
    const confirmed = window.confirm(
      `Delete all ${matching.length} application(s) submitted for "${name}"? Make sure you've already exported anything you need (Reports tab: student register, receipts, photos & signatures) — this cannot be undone.`
    );
    if (!confirmed) return;
    const remaining = regs.filter((r) => r.course !== name);
    await persist(remaining);
    window.alert(`Deleted ${matching.length} application(s) for "${name}".`);
  }

  function startAdd() {
    setErr("");
    setDraft(emptyCourseDraft());
  }

  function startEdit(name) {
    setErr("");
    const c = courses[name];
    setDraft({ id: c.id || genId("course"), originalName: name, name, code: c.code, feeTier: c.feeTier || "", examTitle: c.examTitle || "", subjects: c.subjects.map((s) => ({ id: s.id || subjId(), name: s.name, fee: s.fee, date: s.date || "", dateTo: s.dateTo || "", linkGroup: s.linkGroup || "" })) });
  }

  function updateDraftSubject(i, field, val) {
    setDraft((d) => ({ ...d, subjects: d.subjects.map((s, idx) => idx === i ? { ...s, [field]: val } : s) }));
  }

  function addSubjectRow() {
    setDraft((d) => ({ ...d, subjects: [...d.subjects, { id: subjId(), name: "", fee: 0, date: "", dateTo: "", linkGroup: "" }] }));
  }

  function removeSubjectRow(i) {
    setDraft((d) => ({ ...d, subjects: d.subjects.filter((_, idx) => idx !== i) }));
  }

  async function saveDraft() {
    if (!draft.name.trim() || !draft.code.trim()) { setErr("Course name and code are required."); return; }
    const cleanSubjects = draft.subjects.filter((s) => s.name.trim());
    if (cleanSubjects.length === 0) { setErr("Add at least one subject."); return; }
    if (!draft.originalName && courses[draft.name]) { setErr("A course with this name already exists."); return; }
    if (draft.originalName && draft.originalName !== draft.name && courses[draft.name]) { setErr("A course with this name already exists."); return; }
    const renamed = draft.originalName && draft.originalName !== draft.name;
    const next = { ...courses };
    if (renamed) delete next[draft.originalName];
    next[draft.name] = {
      id: draft.id || genId("course"),
      code: draft.code.trim(),
      feeTier: draft.feeTier || undefined,
      examTitle: draft.examTitle || "",
      subjects: cleanSubjects.map((s) => ({ id: s.id || subjId(), name: s.name.trim(), fee: draft.feeTier ? 0 : Number(s.fee) || 0, date: s.date || "", dateTo: s.dateTo || "", linkGroup: (s.linkGroup || "").trim() })),
      active: draft.originalName ? (courses[draft.originalName]?.active !== false) : true,
    };
    await persistCourses(next);
    if (renamed) {
      const oldName = draft.originalName;
      const newName = draft.name;
      const affected = regs.filter((r) => r.course === oldName);
      if (affected.length > 0) {
        const updatedRegs = regs.map((r) => r.course === oldName ? { ...r, course: newName } : r);
        await persist(updatedRegs);
      }
    }
    setDraft(null);
    setErr("");
  }

  function toggleLink(name) {
    setLinkOpenFor((cur) => (cur === name ? "" : name));
  }

  return (
    <div style={{ background: "#fff", border: "1px solid #dde3ea", borderRadius: 10, padding: 20 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 13.5, color: "#1c2b3a" }}>Courses & fees</div>
          <p style={{ fontSize: 12.5, color: "#7a8794", margin: "4px 0 0", maxWidth: 560 }}>
            Add, edit, or retire courses and subject fees here — students always see the current version. Turn a
            course off when its examination isn't currently being conducted; existing applications aren't affected.
            Each course also has a direct registration link you can share with students for that exam.
          </p>
        </div>
        {!draft && <Btn onClick={startAdd}>+ Add course</Btn>}
      </div>

      {draft && (
        <div style={{ background: "#f7f9fb", border: "1px solid #e2e8ef", borderRadius: 8, padding: 16, margin: "14px 0" }}>
          <div style={{ fontWeight: 700, fontSize: 13, color: "#1c2b3a", marginBottom: 10 }}>{draft.originalName ? "Edit course" : "Add course"}</div>
          {err && <div style={{ color: "#a13a2f", fontSize: 12.5, marginBottom: 10 }}>{err}</div>}
          <Grid2>
            <Field label="Course name" required hint={draft.originalName ? "Renaming updates every existing application filed under this course too." : undefined}>
              <input style={inputStyle} value={draft.name} onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))} />
            </Field>
            <Field label="Hall ticket code" required hint="Short code used in hall ticket numbering, e.g. MB1">
              <input style={inputStyle} value={draft.code} onChange={(e) => setDraft((d) => ({ ...d, code: e.target.value.toUpperCase() }))} />
            </Field>
          </Grid2>
          <Field label="Examination title" hint='Printed on the hall ticket above "Examination Hall Ticket", e.g. "B.Sc. Nursing Regular Final Professional Examination". Leave blank to not show one.'>
            <input style={inputStyle} value={draft.examTitle} onChange={(e) => setDraft((d) => ({ ...d, examTitle: e.target.value }))} placeholder="e.g. B.Sc. Nursing Regular Final Professional Examination" />
          </Field>
          <Field label="Fee structure" hint="Flat sums each selected subject's fee below. Tiered structures ignore individual subject fees.">
            <select style={inputStyle} value={draft.feeTier} onChange={(e) => setDraft((d) => ({ ...d, feeTier: e.target.value }))}>
              <option value="">Flat — sum of subject fees</option>
              <option value="tier1">Tier 1 — ₹20 for one subject, ₹40 for two or more</option>
              <option value="tier2">Tier 2 — ₹20 for one, ₹30 for two, ₹60 for three or more</option>
              <option value="tier3">Tier 3 — Flat ₹200 for one or all subjects</option>
            </select>
          </Field>
          <div style={{ fontSize: 12.5, fontWeight: 600, color: "#5f6d7a", margin: "10px 0 6px" }}>Subjects & exam dates</div>
          <div style={{ fontSize: 11, color: "#a2adb8", marginBottom: 6 }}>For subjects held over more than one day (e.g. Practical), set both a "from" and "to" date. To require two entries to always be selected together (e.g. "Anatomy Paper I" and "Anatomy Paper II"), give both the same Paper group name — selecting one will automatically select the other, and they can't be selected separately.</div>
          <div style={{ display: "grid", gridTemplateColumns: `minmax(140px, 1fr) 112px 14px 112px 110px ${draft.feeTier ? "" : "70px "}22px`, gap: 8, alignItems: "center", marginBottom: 4 }}>
            <div style={{ fontSize: 10.5, color: "#a2adb8", fontWeight: 600 }}>SUBJECT NAME</div>
            <div style={{ fontSize: 10.5, color: "#a2adb8", fontWeight: 600 }}>FROM</div>
            <div />
            <div style={{ fontSize: 10.5, color: "#a2adb8", fontWeight: 600 }}>TO</div>
            <div style={{ fontSize: 10.5, color: "#a2adb8", fontWeight: 600 }}>PAPER GROUP</div>
            {!draft.feeTier && <div style={{ fontSize: 10.5, color: "#a2adb8", fontWeight: 600 }}>FEE</div>}
            <div />
          </div>
          {draft.subjects.map((s, i) => (
            <div key={s.id} style={{ display: "grid", gridTemplateColumns: `minmax(140px, 1fr) 112px 14px 112px 110px ${draft.feeTier ? "" : "70px "}22px`, gap: 8, marginBottom: 6, alignItems: "center" }}>
              <input style={inputStyle} placeholder="Subject name" value={s.name} onChange={(e) => updateDraftSubject(i, "name", e.target.value)} />
              <input style={inputStyle} type="date" title="From date" value={s.date} onChange={(e) => updateDraftSubject(i, "date", e.target.value)} />
              <span style={{ fontSize: 11, color: "#a2adb8", textAlign: "center" }}>to</span>
              <input style={inputStyle} type="date" title="To date (optional)" value={s.dateTo} onChange={(e) => updateDraftSubject(i, "dateTo", e.target.value)} />
              <input style={inputStyle} placeholder="e.g. Anatomy" title="Paper group (optional)" value={s.linkGroup} onChange={(e) => updateDraftSubject(i, "linkGroup", e.target.value)} />
              {!draft.feeTier && (
                <input style={inputStyle} type="number" placeholder="Fee" value={s.fee} onChange={(e) => updateDraftSubject(i, "fee", e.target.value)} />
              )}
              <button onClick={() => removeSubjectRow(i)} style={{ background: "transparent", border: "none", color: "#a13a2f", cursor: "pointer", justifySelf: "center" }}><XCircle size={16} /></button>
            </div>
          ))}
          <Btn variant="outline" onClick={addSubjectRow} style={{ marginTop: 4 }}>+ Add subject</Btn>
          <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
            <Btn onClick={saveDraft}><CheckCircle2 size={14} /> Save course</Btn>
            <Btn variant="ghost" onClick={() => { setDraft(null); setErr(""); }}>Cancel</Btn>
          </div>
        </div>
      )}

      {Object.keys(courses).map((name) => {
        const c = courses[name];
        const active = c.active !== false;
        return (
          <div key={name} style={{ padding: "12px 0", borderBottom: "1px solid #eef1f5" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: "#1c2b3a" }}>{name}</div>
                <div style={{ fontSize: 11.5, color: "#7a8794" }}>
                  Code {c.code} · {c.subjects.length} subject(s) · {c.feeTier ? (c.feeTier === "tier1" ? "Tiered (₹20/₹40)" : c.feeTier === "tier3" ? "Flat ₹200" : "Tiered (₹20/₹30/₹60)") : "Flat, sum of subject fees"}
                </div>
                {c.examTitle && <div style={{ fontSize: 11, color: "#a9762f", marginTop: 2, fontStyle: "italic" }}>{c.examTitle}</div>}
              </div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                <Btn variant={active ? "success" : "outline"} onClick={() => toggleActive(name)}>
                  {active ? <CheckCircle2 size={13} /> : <XCircle size={13} />} {active ? "Open" : "Closed"}
                </Btn>
                <Btn variant="outline" onClick={() => toggleLink(name)}>{linkOpenFor === name ? "Hide link" : "Get registration link"}</Btn>
                <Btn variant="outline" onClick={() => startEdit(name)}>Edit</Btn>
                <Btn variant="danger" onClick={() => deleteCourse(name)}>Remove</Btn>
                <Btn variant="danger" onClick={() => deleteApplicationsForCourse(name)}>Delete applications</Btn>
              </div>
            </div>
            {linkOpenFor === name && <LinkRow url={buildLink(settings, `course=${encodeURIComponent(name)}`).url} />}
          </div>
        );
      })}
    </div>
  );
}

function StatCard({ label, value, color }) {
  return (
    <div style={{ background: "#fff", border: "1px solid #dde3ea", borderRadius: 8, padding: "14px 16px", minWidth: 130 }}>
      <div style={{ fontSize: 11.5, color: "#7a8794", marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, color: color || "#1c2b3a" }}>{value}</div>
    </div>
  );
}

function Dashboard({ regs, settings }) {
  const [linkOpen, setLinkOpen] = useState(false);
  const stats = useMemo(() => {
    const total = regs.length;
    const pending = regs.filter((r) => r.status === "pending").length;
    const approved = regs.filter((r) => r.status === "approved").length;
    const rejected = regs.filter((r) => r.status === "rejected").length;
    const feeCollected = regs.filter((r) => r.status === "approved").reduce((s, r) => s + r.totalFee, 0);
    const today = regs.filter((r) => r.submittedAt.slice(0, 10) === todayStr()).length;
    const byCourse = {};
    regs.forEach((r) => { byCourse[r.course] = (byCourse[r.course] || 0) + 1; });
    const bySubject = {};
    regs.forEach((r) => (r.subjects || []).forEach((s) => { bySubject[s.name] = (bySubject[s.name] || 0) + 1; }));
    return { total, pending, approved, rejected, feeCollected, today, byCourse, bySubject };
  }, [regs]);

  const maxCourse = Math.max(1, ...Object.values(stats.byCourse));

  return (
    <div>
      <div style={{ background: "#f7f9fb", border: "1px solid #e2e8ef", borderRadius: 10, padding: "12px 16px", marginBottom: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#1c2b3a" }}>Share the student registration link</div>
            <div style={{ fontSize: 11.5, color: "#7a8794" }}>Students can register directly from this URL — no need to navigate the landing page. Per-course links are on the Courses tab.</div>
          </div>
          <Btn variant="outline" onClick={() => setLinkOpen((v) => !v)}>{linkOpen ? "Hide link" : "Get student portal link"}</Btn>
        </div>
        {linkOpen && <LinkRow url={buildLink(settings, "view=student").url} />}
        {linkOpen && !settings?.publicBaseUrl && (
          <div style={{ fontSize: 11, color: "#a2adb8", marginTop: 6 }}>
            This link is only correct once hosted on your real domain — set it under Settings → Public site URL.
          </div>
        )}
      </div>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 20 }}>
        <StatCard label="Total applications" value={stats.total} />
        <StatCard label="Pending" value={stats.pending} color="#8a6116" />
        <StatCard label="Approved" value={stats.approved} color="#2f6b45" />
        <StatCard label="Rejected" value={stats.rejected} color="#a13a2f" />
        <StatCard label="Fee collected" value={"₹" + stats.feeCollected} />
        <StatCard label="Today's registrations" value={stats.today} />
      </div>
      <div style={{ background: "#fff", border: "1px solid #dde3ea", borderRadius: 10, padding: 18 }}>
        <div style={{ fontWeight: 700, fontSize: 13.5, color: "#1c2b3a", marginBottom: 12 }}>Course-wise registrations</div>
        {Object.keys(stats.byCourse).length === 0 && <p style={{ fontSize: 13, color: "#7a8794" }}>No applications yet.</p>}
        {Object.entries(stats.byCourse).map(([course, count]) => (
          <div key={course} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
            <div style={{ width: 150, fontSize: 12.5, color: "#5f6d7a" }}>{course}</div>
            <div style={{ flex: 1, background: "#eef2f6", borderRadius: 4, height: 10 }}>
              <div style={{ width: `${(count / maxCourse) * 100}%`, background: "#1a3a5c", height: 10, borderRadius: 4 }} />
            </div>
            <div style={{ width: 24, textAlign: "right", fontSize: 12.5 }}>{count}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Applications({ regs, persist, nextSeq, courses, settings }) {
  const [q, setQ] = useState("");
  const [courseFilter, setCourseFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [openId, setOpenId] = useState(null);
  const [remarksDraft, setRemarksDraft] = useState({});
  const [editId, setEditId] = useState(null);
  const [editDraft, setEditDraft] = useState(null);

  function startEdit(r) {
    setEditId(r.id);
    setEditDraft({
      hallTicketNo: r.hallTicketNo || "",
      name: r.name, father: r.father, dob: r.dob, mobile: r.mobile, guardianMobile: r.guardianMobile,
      permAddress: r.permAddress, commAddress: r.commAddress, course: r.course,
      subjects: (r.subjects || []).map((s) => liveSubject(courses, r.course, s).name),
    });
  }

  function cancelEdit() {
    setEditId(null);
    setEditDraft(null);
  }

  function toggleEditSubject(name) {
    setEditDraft((d) => {
      const has = d.subjects.includes(name);
      const turningOn = !has;
      let nextList = has ? d.subjects.filter((s) => s !== name) : [...d.subjects, name];
      const courseSubjectList = courses[d.course]?.subjects || [];
      const target = courseSubjectList.find((s) => s.name === name);
      if (target && target.linkGroup) {
        const partners = courseSubjectList.filter((s) => s.name !== name && s.linkGroup === target.linkGroup).map((s) => s.name);
        partners.forEach((pName) => {
          const already = nextList.includes(pName);
          if (turningOn && !already) nextList = [...nextList, pName];
          if (!turningOn && already) nextList = nextList.filter((s) => s !== pName);
        });
      }
      return { ...d, subjects: nextList };
    });
  }

  async function saveEdit(reg) {
    const { total: totalFee, subjects } = computeFee(courses, editDraft.course, editDraft.subjects);
    const updated = regs.map((r) => r.id === reg.id ? {
      ...r,
      hallTicketNo: editDraft.hallTicketNo.trim(),
      name: editDraft.name, father: editDraft.father, dob: editDraft.dob,
      mobile: editDraft.mobile, guardianMobile: editDraft.guardianMobile,
      permAddress: editDraft.permAddress, commAddress: editDraft.commAddress,
      course: editDraft.course, subjects, totalFee,
      history: [...r.history, { at: new Date().toISOString(), action: "Details edited by administrator" }],
    } : r);
    await persist(updated);
    setEditId(null);
    setEditDraft(null);
  }

  async function deleteApplication(reg) {
    if (!window.confirm(`Permanently delete the application for "${reg.name}" (${reg.id})? This cannot be undone.`)) return;
    const updated = regs.filter((r) => r.id !== reg.id);
    await persist(updated);
    setOpenId(null);
  }

  const filtered = sortByRoll(regs.filter((r) => {
    if (courseFilter && r.course !== courseFilter) return false;
    if (statusFilter && r.status !== statusFilter) return false;
    if (q) {
      const s = q.toLowerCase();
      if (!(r.name.toLowerCase().includes(s) || r.mobile.includes(s) || (r.hallTicketNo || "").toLowerCase().includes(s) || r.id.toLowerCase().includes(s))) return false;
    }
    return true;
  }));

  async function setStatus(reg, status) {
    let hallTicketNo = reg.hallTicketNo;
    if (status === "approved" && !hallTicketNo) {
      const seq = await nextSeq(courses[reg.course].code);
      hallTicketNo = `AIIMS/${courses[reg.course].code}/${new Date().getFullYear()}/${String(seq).padStart(4, "0")}`;
    }
    const remarks = remarksDraft[reg.id] ?? reg.remarks;
    const updated = regs.map((r) => r.id === reg.id ? {
      ...r, status, hallTicketNo, remarks,
      history: [...r.history, { at: new Date().toISOString(), action: `Status set to ${status}${remarks ? " — " + remarks : ""}` }],
    } : r);
    await persist(updated);
  }

  return (
    <div>
      <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
        <input style={{ ...inputStyle, maxWidth: 220 }} placeholder="Search name, mobile, roll no." value={q} onChange={(e) => setQ(e.target.value)} />
        <select style={{ ...inputStyle, maxWidth: 200 }} value={courseFilter} onChange={(e) => setCourseFilter(e.target.value)}>
          <option value="">All courses</option>
          {Object.keys(courses).map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <select style={{ ...inputStyle, maxWidth: 160 }} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="">All statuses</option>
          <option value="pending">Pending</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
        </select>
      </div>

      {filtered.length === 0 && <p style={{ fontSize: 13, color: "#7a8794" }}>No applications match these filters.</p>}

      {filtered.map((r) => (
        <div key={r.id} style={{ background: "#fff", border: "1px solid #dde3ea", borderRadius: 10, marginBottom: 10, overflow: "hidden" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", cursor: "pointer" }} onClick={() => setOpenId(openId === r.id ? null : r.id)}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              {r.photo?.dataUrl && <img src={r.photo.dataUrl} alt="" style={{ width: 36, height: 36, borderRadius: 6, objectFit: "cover" }} />}
              <div>
                <div style={{ fontWeight: 700, fontSize: 13.5, color: "#1c2b3a" }}>{r.name}</div>
                <div style={{ fontSize: 11.5, color: "#7a8794" }}>{r.course} · {r.mobile} · {r.id}</div>
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <StatusPill status={r.status} />
              <ChevronRight size={16} style={{ transform: openId === r.id ? "rotate(90deg)" : "none", color: "#7a8794" }} />
            </div>
          </div>
          {openId === r.id && (
            <div style={{ borderTop: "1px solid #eef1f5", padding: 16 }}>
              {editId === r.id ? (
                <>
                  <Grid2>
                    <div>
                      <Field label="Roll No."><input style={{ ...inputStyle, textTransform: "uppercase" }} value={editDraft.hallTicketNo} onChange={(e) => setEditDraft((d) => ({ ...d, hallTicketNo: sanitizeRollNo(e.target.value, settings.rollNoAllowedSpecialChars) }))} /></Field>
                      <Field label="Candidate name"><input style={{ ...inputStyle, textTransform: "uppercase" }} value={editDraft.name} onChange={(e) => setEditDraft((d) => ({ ...d, name: e.target.value.toUpperCase() }))} /></Field>
                      <Field label="Father / Guardian name"><input style={{ ...inputStyle, textTransform: "uppercase" }} value={editDraft.father} onChange={(e) => setEditDraft((d) => ({ ...d, father: e.target.value.toUpperCase() }))} /></Field>
                      <Field label="Date of birth"><input type="date" style={inputStyle} value={editDraft.dob} onChange={(e) => setEditDraft((d) => ({ ...d, dob: e.target.value }))} /></Field>
                      <Field label="Student mobile"><input style={inputStyle} value={editDraft.mobile} maxLength={10} onChange={(e) => setEditDraft((d) => ({ ...d, mobile: e.target.value.replace(/\D/g, "") }))} /></Field>
                      <Field label="Guardian mobile"><input style={inputStyle} value={editDraft.guardianMobile} maxLength={10} onChange={(e) => setEditDraft((d) => ({ ...d, guardianMobile: e.target.value.replace(/\D/g, "") }))} /></Field>
                    </div>
                    <div>
                      <Field label="Permanent address"><textarea style={{ ...inputStyle, minHeight: 50 }} value={editDraft.permAddress} onChange={(e) => setEditDraft((d) => ({ ...d, permAddress: e.target.value }))} /></Field>
                      <Field label="Communication address"><textarea style={{ ...inputStyle, minHeight: 50 }} value={editDraft.commAddress} onChange={(e) => setEditDraft((d) => ({ ...d, commAddress: e.target.value }))} /></Field>
                      <Field label="Course">
                        <select style={inputStyle} value={editDraft.course} onChange={(e) => setEditDraft((d) => ({ ...d, course: e.target.value, subjects: [] }))}>
                          {Object.keys(courses).map((c) => <option key={c} value={c}>{c}</option>)}
                        </select>
                      </Field>
                    </div>
                  </Grid2>
                  <div style={{ background: "#f7f9fb", border: "1px solid #e2e8ef", borderRadius: 8, padding: 12, marginBottom: 14 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: "#5f6d7a", marginBottom: 8 }}>Subjects</div>
                    {courses[editDraft.course]?.feeTier && (
                      <div style={{ fontSize: 11, color: "#8a6116", marginBottom: 8 }}>
                        Fee schedule: {courses[editDraft.course].feeTier === "tier1"
                          ? "₹20 for one subject, ₹40 for two or more subjects."
                          : courses[editDraft.course].feeTier === "tier3"
                          ? "Flat ₹200 whether one subject or all of them are selected."
                          : "₹20 for one subject, ₹30 for two subjects, ₹60 for three or more subjects."}
                      </div>
                    )}
                    {sortSubjectsByDate(courses[editDraft.course]?.subjects || []).map((s) => {
                      const partners = s.linkGroup ? (courses[editDraft.course]?.subjects || []).filter((o) => o.name !== s.name && o.linkGroup === s.linkGroup).map((o) => o.name) : [];
                      return (
                      <label key={s.name} style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", fontSize: 13 }}>
                        <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <input type="checkbox" checked={editDraft.subjects.includes(s.name)} onChange={() => toggleEditSubject(s.name)} /> {s.name}
                          {partners.length > 0 && <span style={{ fontSize: 9.5, color: "#1a3a5c", fontStyle: "italic" }}>(with {partners.join(", ")})</span>}
                        </span>
                        <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <span style={{ fontSize: 10.5, color: "#8a6116" }}>{formatExamDateRange(s)}</span>
                          {!courses[editDraft.course]?.feeTier && <span style={{ color: "#7a8794" }}>₹{s.fee}</span>}
                        </span>
                      </label>
                      );
                    })}
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <Btn onClick={() => saveEdit(r)}><CheckCircle2 size={14} /> Save changes</Btn>
                    <Btn variant="ghost" onClick={cancelEdit}>Cancel</Btn>
                  </div>
                </>
              ) : (
                <>
                  <Grid2>
                    <div>
                      <DetailRow label="Father / Guardian" value={r.father} />
                      <DetailRow label="Date of birth" value={r.dob} />
                      <DetailRow label="Guardian mobile" value={r.guardianMobile || "—"} />
                      <DetailRow label="Permanent address" value={r.permAddress} />
                      <DetailRow label="Communication address" value={r.commAddress} />
                    </div>
                    <div>
                      <DetailRow label="Subjects" value={(r.subjects || []).map((s) => liveSubject(courses, r.course, s).name).join(", ")} />
                      <DetailRow label="Total fee" value={"₹" + r.totalFee} />
                      <DetailRow label="UTR / Transaction ID" value={r.utr} />
                      <DetailRow label="Receipt" value={r.receipt?.name || "—"} />
                      <DetailRow label="Roll No." value={r.hallTicketNo || "Not yet assigned"} />
                    </div>
                  </Grid2>
                  <div style={{ display: "flex", gap: 16, marginTop: 10 }}>
                    {r.signature?.dataUrl
                      ? <div><div style={{ fontSize: 11, color: "#7a8794", marginBottom: 4 }}>Signature</div><img src={r.signature.dataUrl} style={{ height: 40, border: "1px solid #eee", background: "#fff" }} /></div>
                      : <div><div style={{ fontSize: 11, color: "#7a8794", marginBottom: 4 }}>Signature</div><div style={{ fontSize: 12, color: "#a2adb8", fontStyle: "italic" }}>{settings?.signatureMissingMessage || "Signature Not Uploaded"}</div></div>}
                    {r.receipt?.dataUrl && (
                      <div>
                        <div style={{ fontSize: 11, color: "#7a8794", marginBottom: 4 }}>Receipt</div>
                        {r.receipt.type === "application/pdf"
                          ? <a href={r.receipt.dataUrl} target="_blank" rel="noreferrer" style={{ fontSize: 11.5, color: "#1a3a5c" }}>View PDF ({r.receipt.name})</a>
                          : <img src={r.receipt.dataUrl} style={{ height: 40, border: "1px solid #eee" }} />}
                      </div>
                    )}
                  </div>
                  <div style={{ marginTop: 14 }}>
                    <Field label="Verification remarks">
                      <textarea style={{ ...inputStyle, minHeight: 44 }} value={remarksDraft[r.id] ?? r.remarks} onChange={(e) => setRemarksDraft((d) => ({ ...d, [r.id]: e.target.value }))} placeholder="Optional notes for the student record" />
                    </Field>
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <Btn variant="success" onClick={() => setStatus(r, "approved")}><CheckCircle2 size={14} /> Approve</Btn>
                    <Btn variant="danger" onClick={() => setStatus(r, "rejected")}><XCircle size={14} /> Reject</Btn>
                    <Btn variant="outline" onClick={() => startEdit(r)}>Edit details</Btn>
                    <Btn variant="danger" onClick={() => deleteApplication(r)}>Delete record</Btn>
                  </div>
                  {r.history.length > 0 && (
                    <div style={{ marginTop: 14, fontSize: 11.5, color: "#9aa5b1" }}>
                      {r.history.map((h, i) => <div key={i}>{new Date(h.at).toLocaleString()} — {h.action}</div>)}
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function DetailRow({ label, value }) {
  return (
    <div style={{ display: "flex", fontSize: 12.5, marginBottom: 6, gap: 8 }}>
      <span style={{ color: "#7a8794", minWidth: 140 }}>{label}</span>
      <span style={{ color: "#1c2b3a", fontWeight: 500 }}>{value}</span>
    </div>
  );
}

function SettingsAdmin({ settings, persistSettings }) {
  const [draft, setDraft] = useState(settings);
  const [saved, setSaved] = useState(false);
  const fileRef = useRef(null);
  const signatoryFileRef = useRef(null);
  const paymentQrFileRef = useRef(null);

  function set(field, val) {
    setDraft((d) => ({ ...d, [field]: val }));
  }
  function setBank(field, val) {
    setDraft((d) => ({ ...d, bank: { ...d.bank, [field]: val } }));
  }

  async function handleLogo(e) {
    const file = e.target.files[0];
    if (!file) return;
    if (!["image/jpeg", "image/jpg", "image/png"].includes(file.type)) return;
    try {
      const dataUrl = await resizeImage(file, 240);
      const url = await uploadToStorage(dataUrl, "branding/logo.jpg", "image/jpeg");
      set("logoDataUrl", url);
    } catch (err) {}
  }

  async function handleSignatoryImage(e) {
    const file = e.target.files[0];
    if (!file) return;
    if (!["image/jpeg", "image/jpg", "image/png"].includes(file.type)) return;
    try {
      const dataUrl = await resizeImage(file, 200);
      const url = await uploadToStorage(dataUrl, "branding/signatory.jpg", "image/jpeg");
      set("signatoryImageUrl", url);
    } catch (err) {}
  }

  async function handlePaymentQr(e) {
    const file = e.target.files[0];
    if (!file) return;
    if (!["image/jpeg", "image/jpg", "image/png"].includes(file.type)) return;
    try {
      const dataUrl = await resizeImage(file, 400);
      const url = await uploadToStorage(dataUrl, "branding/payment-qr.jpg", "image/jpeg");
      set("paymentQrImageUrl", url);
    } catch (err) {}
  }

  const [saveErr, setSaveErr] = useState("");

  function save() {
    if (!draft.adminPassword || !draft.adminPassword.trim()) {
      setSaveErr("Admin password cannot be empty.");
      return;
    }
    setSaveErr("");
    persistSettings(draft);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <div style={{ background: "#fff", border: "1px solid #dde3ea", borderRadius: 10, padding: 20 }}>
      <div style={{ fontWeight: 700, fontSize: 13.5, color: "#1c2b3a", marginBottom: 4 }}>Hall ticket & payment settings</div>
      <p style={{ fontSize: 12.5, color: "#7a8794", marginBottom: 16 }}>Everything here is editable for future needs — it updates the printed hall ticket, the payment section, and the back-side instructions.</p>

      <h4 style={{ fontSize: 12.5, color: "#274566", margin: "0 0 8px" }}>Registration link</h4>
      <Field label="Public site URL" hint="Once this app is hosted on a real domain, enter it here so the registration links generated on the Dashboard and Courses tabs are correct. Leave blank while testing in this preview.">
        <input style={inputStyle} placeholder="https://exams.aiimsbibinagar.edu.in/" value={draft.publicBaseUrl} onChange={(e) => set("publicBaseUrl", e.target.value)} />
      </Field>

      <h4 style={{ fontSize: 12.5, color: "#274566", margin: "16px 0 8px" }}>Admin login</h4>
      <Field label="Admin password" hint="Change this from the default before sharing the site's link with anyone. Keep it somewhere safe — if you forget it, you'll need direct access to the database to reset it.">
        <input type="password" style={inputStyle} value={draft.adminPassword} onChange={(e) => set("adminPassword", e.target.value)} />
      </Field>

      <h4 style={{ fontSize: 12.5, color: "#274566", margin: "16px 0 8px" }}>Student registration access</h4>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: "#f7f9fb", border: "1px solid #e2e8ef", borderRadius: 8, padding: "10px 14px", marginBottom: 6 }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, color: "#1c2b3a" }}>Student registration</div>
          <div style={{ fontSize: 11.5, color: "#7a8794" }}>Turn off instantly to stop new registrations, regardless of the window below. The admin console is never affected.</div>
        </div>
        <Btn variant={draft.studentLoginEnabled !== false ? "success" : "danger"} onClick={() => set("studentLoginEnabled", draft.studentLoginEnabled === false)}>
          {draft.studentLoginEnabled !== false ? <CheckCircle2 size={14} /> : <XCircle size={14} />}
          {draft.studentLoginEnabled !== false ? "Enabled" : "Disabled"}
        </Btn>
      </div>

      <h4 style={{ fontSize: 12.5, color: "#274566", margin: "16px 0 8px" }}>Registration window</h4>
      <p style={{ fontSize: 11.5, color: "#7a8794", margin: "0 0 10px" }}>
        Leave either blank to not enforce it. Once the closing date/time passes, students see a "registration closed"
        message instead of the form — this does not affect the admin console, which is always accessible.
      </p>
      <Grid2>
        <Field label="Registration opens at" hint="Optional">
          <input type="datetime-local" style={inputStyle} value={draft.registrationOpensAt} onChange={(e) => set("registrationOpensAt", e.target.value)} />
        </Field>
        <Field label="Last date & time for fee submission" hint="Registration closes at this moment">
          <input type="datetime-local" style={inputStyle} value={draft.registrationClosesAt} onChange={(e) => set("registrationClosesAt", e.target.value)} />
        </Field>
      </Grid2>

      <h4 style={{ fontSize: 12.5, color: "#274566", margin: "16px 0 8px" }}>Institute logo</h4>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 18 }}>
        <div style={{ width: 56, height: 56, borderRadius: "50%", border: "1px dashed #cfd8e3", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
          {draft.logoDataUrl ? <img src={draft.logoDataUrl} style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <Building2 size={22} color="#a2adb8" />}
        </div>
        <Btn variant="outline" onClick={() => fileRef.current.click()}><Upload size={13} /> Upload logo</Btn>
        <input ref={fileRef} type="file" accept="image/jpeg,image/png" onChange={handleLogo} style={{ display: "none" }} />
      </div>

      <h4 style={{ fontSize: 12.5, color: "#274566", margin: "0 0 8px" }}>Hall ticket details</h4>
      <Field label="Institute name">
        <input style={inputStyle} value={draft.instituteName} onChange={(e) => set("instituteName", e.target.value)} />
      </Field>
      <Grid2>
        <Field label="Examination centre">
          <input style={inputStyle} value={draft.examCentre} onChange={(e) => set("examCentre", e.target.value)} />
        </Field>
        <Field label="Signatory title (shown under Sd/-)">
          <input style={inputStyle} value={draft.signatoryTitle} onChange={(e) => set("signatoryTitle", e.target.value)} />
        </Field>
      </Grid2>

      <Field label="Message when a student hasn't uploaded a signature" hint='Shown on the hall ticket in place of a signature image. "Sd/-" is reserved for the administrator/Dean signature only, never shown for students.'>
        <input style={inputStyle} value={draft.signatureMissingMessage} onChange={(e) => set("signatureMissingMessage", e.target.value)} />
      </Field>

      <Field label="Dean (Examination) signature" hint="Optional — upload a scanned signature image to print instead of the plain \u201cSd/-\u201d text.">
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 90, height: 44, border: "1px dashed #cfd8e3", borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", background: "#f7f9fb" }}>
            {draft.signatoryImageUrl
              ? <img src={draft.signatoryImageUrl} style={{ maxHeight: "100%", maxWidth: "100%", objectFit: "contain" }} />
              : <span style={{ fontSize: 11, fontStyle: "italic", color: "#a2adb8" }}>Sd/-</span>}
          </div>
          <Btn variant="outline" onClick={() => signatoryFileRef.current.click()}><Upload size={13} /> {draft.signatoryImageUrl ? "Replace" : "Upload"} signature</Btn>
          {draft.signatoryImageUrl && <Btn variant="ghost" onClick={() => set("signatoryImageUrl", null)}>Remove</Btn>}
          <input ref={signatoryFileRef} type="file" accept="image/jpeg,image/png" onChange={handleSignatoryImage} style={{ display: "none" }} />
        </div>
      </Field>

      <Field label="Back-side instructions" hint="One instruction per line — printed on the reverse of the hall ticket.">
        <textarea style={{ ...inputStyle, minHeight: 180, fontFamily: "inherit" }} value={draft.instructions} onChange={(e) => set("instructions", e.target.value)} />
      </Field>

      <h4 style={{ fontSize: 12.5, color: "#274566", margin: "16px 0 8px" }}>Bank account for fee payment</h4>
      <Grid2>
        <Field label="Account no."><input style={inputStyle} value={draft.bank.accountNo} onChange={(e) => setBank("accountNo", e.target.value)} /></Field>
        <Field label="MICR no."><input style={inputStyle} value={draft.bank.micr} onChange={(e) => setBank("micr", e.target.value)} /></Field>
        <Field label="IFSC code"><input style={inputStyle} value={draft.bank.ifsc} onChange={(e) => setBank("ifsc", e.target.value)} /></Field>
        <Field label="Branch"><input style={inputStyle} value={draft.bank.branch} onChange={(e) => setBank("branch", e.target.value)} /></Field>
      </Grid2>
      <Field label="UPI ID (VPA) for scan-to-pay QR code" hint='Your bank issues this once your account is UPI-enabled (e.g. "aiimsbibinagar@sbi"). It is not the same as the account number — a raw account number cannot be scanned as a UPI payment. Once entered here, the QR code shown to students becomes a real scan-to-pay code that opens their UPI app with the amount pre-filled. Leave blank to just show the bank details for manual NEFT/RTGS transfer.'>
        <input style={inputStyle} placeholder="yourinstitute@bankname" value={draft.bank.upiId} onChange={(e) => setBank("upiId", e.target.value)} />
      </Field>

      <Field label="Payment QR code image" hint="Optional — upload your bank/UPI app's own QR code image (e.g. a screenshot or the printed QR your bank gave you) to show students that exact code instead of the one generated from the UPI ID above.">
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 70, height: 70, border: "1px dashed #cfd8e3", borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", background: "#f7f9fb" }}>
            {draft.paymentQrImageUrl ? <img src={draft.paymentQrImageUrl} style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }} /> : <QrCode size={22} color="#a2adb8" />}
          </div>
          <Btn variant="outline" onClick={() => paymentQrFileRef.current.click()}><Upload size={13} /> {draft.paymentQrImageUrl ? "Replace" : "Upload"} QR code</Btn>
          {draft.paymentQrImageUrl && <Btn variant="ghost" onClick={() => set("paymentQrImageUrl", null)}>Remove</Btn>}
          <input ref={paymentQrFileRef} type="file" accept="image/jpeg,image/png" onChange={handlePaymentQr} style={{ display: "none" }} />
        </div>
      </Field>

      {saveErr && <div style={{ color: "#a13a2f", fontSize: 12.5, marginBottom: 8 }}>{saveErr}</div>}
      <Btn onClick={save} style={{ marginTop: 8 }}><CheckCircle2 size={14} /> {saved ? "Saved!" : "Save settings"}</Btn>
    </div>
  );
}

function courseAccent(course) {
  if (/MBBS/i.test(course)) return { main: "#8b2635", soft: "#fbeceb" };
  if (/Nursing/i.test(course)) return { main: "#0f766e", soft: "#e6f4f2" };
  if (/A&H/i.test(course)) return { main: "#6d28d9", soft: "#f1eafc" };
  return { main: "#1a3a5c", soft: "#eaf0f7" };
}

const CHIP_PALETTE = ["#a9762f", "#0f766e", "#8b2635", "#1a3a5c", "#6d28d9", "#2f6b45"];

function HallTicketCard({ r, settings, courses }) {
  const accent = courseAccent(r.course);
  const qrText = `Roll No: ${r.hallTicketNo || ""}\nName: ${r.name || ""}\nCourse: ${r.course || ""}`;
  return (
    <div style={{ maxWidth: 580, margin: "0 auto", borderRadius: 12, padding: 3, background: `linear-gradient(135deg, ${accent.main}, #e0b86a)` }}>
      <div style={{ borderRadius: 10, background: "#fff", overflow: "hidden", position: "relative" }}>
        <div style={{ background: `linear-gradient(120deg, ${accent.main}, #274566)`, padding: "14px 18px", position: "relative" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ width: 40, height: 40, borderRadius: "50%", background: "#e0b86a", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, overflow: "hidden" }}>
              {settings?.logoDataUrl
                ? <img src={settings.logoDataUrl} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                : <Building2 size={22} color="#1a3a5c" />}
            </div>
            <div>
              <div style={{ fontWeight: 700, color: "#fff", fontSize: 15 }}>{settings?.instituteName || "All India Institute of Medical Sciences, Bibinagar"}</div>
              {courses?.[r.course]?.examTitle && (
                <div style={{ fontSize: 12, color: "#fff", fontWeight: 600, marginTop: 1 }}>{courses[r.course].examTitle}</div>
              )}
              <div style={{ fontSize: 11.5, color: "#e0b86a", fontWeight: 600, letterSpacing: 0.3 }}>EXAMINATION HALL TICKET</div>
            </div>
          </div>
          <div style={{ position: "absolute", top: 14, right: 0, background: "#e0b86a", color: "#1a3a5c", fontWeight: 700, fontSize: 10.5, padding: "4px 14px 4px 10px", borderRadius: "14px 0 0 14px", letterSpacing: 0.4 }}>
            {(r.course || "").split(" - ")[0]}
          </div>
        </div>

        <div style={{ padding: 14 }}>
          <div style={{ display: "flex", gap: 18 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 10.5, fontWeight: 700, color: accent.main, letterSpacing: 0.3, marginBottom: 2 }}>HALL TICKET NUMBER</div>
              <div style={{ display: "inline-block", background: accent.soft, color: accent.main, fontWeight: 700, fontSize: 13, padding: "4px 10px", borderRadius: 6, marginBottom: 10, fontFamily: "monospace" }}>
                {r.hallTicketNo}
              </div>
              <DetailRow label="Candidate name" value={r.name} />
              <DetailRow label="Father / Guardian" value={r.father} />
              <DetailRow label="Course" value={r.course} />
              <DetailRow label="Examination centre" value={settings?.examCentre || "AIIMS Bibinagar — Examination Hall"} />
            </div>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
              <div style={{ padding: 3, background: `linear-gradient(135deg, ${accent.main}, #e0b86a)`, borderRadius: 6 }}>
                {r.photo?.dataUrl
                  ? <img src={r.photo.dataUrl} style={{ width: 76, height: 90, objectFit: "cover", display: "block", borderRadius: 3 }} />
                  : <div style={{ width: 76, height: 90, background: "#f2f4f7" }} />}
              </div>
              <div style={{ padding: 4, border: `2px solid ${accent.main}`, borderRadius: 6 }}>
                <QRBlock text={qrText} size={64} />
              </div>
            </div>
          </div>

          <div style={{ marginTop: 12 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: accent.main, marginBottom: 6, letterSpacing: 0.3 }}>SUBJECTS & EXAMINATION DATES</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
              {sortSubjectsByDate((r.subjects || []).map((raw) => liveSubject(courses, r.course, raw))).map((s, i) => (
                <div key={s.id || s.name} style={{
                  display: "flex", justifyContent: "space-between", alignItems: "center", padding: "5px 10px",
                  borderRadius: 6, background: accent.soft, borderLeft: `4px solid ${CHIP_PALETTE[i % CHIP_PALETTE.length]}`,
                }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: "#1c2b3a" }}>{s.name}</span>
                  <span style={{ fontSize: 11, color: "#5f6d7a" }}>{formatExamDateRange(s)}</span>
                </div>
              ))}
            </div>
          </div>

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginTop: 20, paddingTop: 12, borderTop: `2px dashed ${accent.soft}` }}>
            <div>
              {r.signature?.dataUrl
                ? <img src={r.signature.dataUrl} style={{ height: 32 }} />
                : <div style={{ fontSize: 11, fontStyle: "italic", color: "#a2adb8", height: 32, display: "flex", alignItems: "center" }}>{settings?.signatureMissingMessage || "Signature Not Uploaded"}</div>}
              <div style={{ fontSize: 11, color: "#7a8794", marginTop: 2 }}>Candidate signature</div>
            </div>
            <div style={{ width: 58, height: 58, borderRadius: "50%", border: `2px dashed ${accent.main}`, display: "flex", alignItems: "center", justifyContent: "center", textAlign: "center", flexShrink: 0, overflow: "hidden" }}>
              {settings?.logoDataUrl
                ? <img src={settings.logoDataUrl} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                : <span style={{ fontSize: 8.5, fontWeight: 700, color: accent.main, lineHeight: 1.2 }}>AIIMS<br />BIBINAGAR</span>}
            </div>
            <div style={{ textAlign: "right" }}>
              {settings?.signatoryImageUrl
                ? <img src={settings.signatoryImageUrl} style={{ height: 30, marginBottom: 2 }} />
                : <div style={{ fontSize: 12, fontStyle: "italic", color: "#1c2b3a" }}>Sd/-</div>}
              <div style={{ width: 130, height: 1, background: "#c7cfd8", margin: "6px 0" }} />
              <div style={{ fontSize: 10.5, color: "#7a8794" }}>{settings?.signatoryTitle || "Dean (Examination), AIIMS Bibinagar"}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function InstructionsPage({ settings }) {
  const lines = (settings?.instructions || "").split("\n").map((l) => l.trim()).filter(Boolean);
  return (
    <div className="print-page-break" style={{ maxWidth: 580, margin: "10px auto 0", border: "1px solid #dde3ea", borderRadius: 10, padding: 14, background: "#fff" }}>
      <div style={{ fontWeight: 700, fontSize: 12.5, color: "#1a3a5c", marginBottom: 8, letterSpacing: 0.3 }}>INSTRUCTIONS</div>
      <ul style={{ margin: 0, paddingLeft: 16 }}>
        {lines.map((line, i) => (
          <li key={i} style={{ fontSize: 10.5, color: "#1c2b3a", lineHeight: 1.4, marginBottom: 5 }}>{line}</li>
        ))}
      </ul>
    </div>
  );
}

function HallTickets({ regs, courses, settings }) {
  const approved = sortByRoll(regs.filter((r) => r.status === "approved"));
  const [selectedId, setSelectedId] = useState("");
  const [bulkCourse, setBulkCourse] = useState("");
  const selected = approved.find((r) => r.id === selectedId);
  const bulkList = bulkCourse ? approved.filter((r) => r.course === bulkCourse) : [];

  return (
    <div>
      <div style={{ background: "#fff", border: "1px solid #dde3ea", borderRadius: 10, padding: 20, marginBottom: 16 }}>
        <div style={{ fontWeight: 700, fontSize: 13.5, color: "#1c2b3a", marginBottom: 10 }}>Single hall ticket</div>
        {approved.length === 0 ? (
          <p style={{ fontSize: 13, color: "#7a8794" }}>No approved applications yet. Approve applications first in the Applications tab.</p>
        ) : (
          <>
            <select style={{ ...inputStyle, maxWidth: 340, marginBottom: 14 }} value={selectedId} onChange={(e) => setSelectedId(e.target.value)}>
              <option value="">Select an approved candidate</option>
              {approved.map((r) => <option key={r.id} value={r.id}>{r.name} — {r.hallTicketNo}</option>)}
            </select>
            {selected && (
              <>
                <div className="print-area">
                  <HallTicketCard r={selected} settings={settings} courses={courses} />
                  <InstructionsPage settings={settings} />
                </div>
                <div style={{ display: "flex", justifyContent: "center", gap: 10, marginTop: 14 }}>
                  <Btn variant="outline" onClick={() => window.print()}><Printer size={14} /> Print</Btn>
                </div>
              </>
            )}
          </>
        )}
      </div>

      <div style={{ background: "#fff", border: "1px solid #dde3ea", borderRadius: 10, padding: 20 }}>
        <div style={{ fontWeight: 700, fontSize: 13.5, color: "#1c2b3a", marginBottom: 10 }}>Bulk hall ticket generation</div>
        <select style={{ ...inputStyle, maxWidth: 340, marginBottom: 14 }} value={bulkCourse} onChange={(e) => setBulkCourse(e.target.value)}>
          <option value="">Select course</option>
          {Object.keys(courses).map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        {bulkCourse && (
          bulkList.length === 0 ? (
            <p style={{ fontSize: 13, color: "#7a8794" }}>No approved applications for this course yet.</p>
          ) : (
            <>
              <p style={{ fontSize: 12.5, color: "#5f6d7a", marginBottom: 12 }}>{bulkList.length} hall ticket(s) ready.</p>
              <div className="print-area" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                {bulkList.map((r) => (
                  <div key={r.id} className="print-page-break">
                    <HallTicketCard r={r} settings={settings} courses={courses} />
                    <InstructionsPage settings={settings} />
                  </div>
                ))}
              </div>
              <div style={{ display: "flex", justifyContent: "center", marginTop: 14 }}>
                <Btn variant="outline" onClick={() => window.print()}><Printer size={14} /> Print all</Btn>
              </div>
            </>
          )
        )}
      </div>
    </div>
  );
}

function lastFiveDigits(hallTicketNo) {
  const digitsOnly = (hallTicketNo || "").replace(/\D/g, "");
  return digitsOnly.slice(-5);
}

function sortSubjectsByDate(list) {
  return [...list].sort((a, b) => (a.date || "9999-99-99").localeCompare(b.date || "9999-99-99"));
}

function sortByRoll(list) {
  return [...list].sort((a, b) => {
    const rollCompare = lastFiveDigits(a.hallTicketNo).localeCompare(lastFiveDigits(b.hallTicketNo), undefined, { numeric: true, sensitivity: "base" });
    if (rollCompare !== 0) return rollCompare;
    return (a.name || "").localeCompare(b.name || "");
  });
}

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function ReceiptCard({ r }) {
  return (
    <div style={{ border: "1px solid #dde3ea", borderRadius: 8, padding: 10, display: "flex", flexDirection: "column", height: "100%", minHeight: 0, overflow: "hidden", boxSizing: "border-box" }}>
      <div style={{ fontSize: 11.5, marginBottom: 6, flexShrink: 0 }}>
        <div style={{ fontWeight: 700, color: "#1c2b3a" }}>{r.name}</div>
        <div style={{ color: "#7a8794" }}>Roll No. {r.hallTicketNo || "—"} · {r.course}</div>
        <div style={{ color: "#7a8794" }}>Amount: ₹{r.totalFee} · UTR: {r.utr || "—"}</div>
      </div>
      <div style={{ flex: 1, minHeight: 0, border: "1px dashed #dde3ea", borderRadius: 6, overflow: "hidden", background: "#f7f9fb" }}>
        {r.receipt?.dataUrl && r.receipt.type !== "application/pdf" ? (
          <img src={r.receipt.dataUrl} style={{ width: "100%", height: "100%", objectFit: "contain", display: "block" }} />
        ) : (
          <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 6, padding: 8, boxSizing: "border-box" }}>
            {r.receipt?.dataUrl && r.receipt.type === "application/pdf" ? (
              <>
                <FileSpreadsheet size={22} color="#a9762f" />
                <div style={{ fontSize: 11, color: "#5f6d7a", textAlign: "center" }}>PDF receipt<br /><span style={{ color: "#a2adb8" }}>{r.receipt.name}</span></div>
              </>
            ) : (
              <div style={{ fontSize: 11, color: "#a2adb8", textAlign: "center" }}>
                {r.receipt?.name ? `File not available for preview: ${r.receipt.name}` : "No receipt on file"}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function ReceiptsSheet({ regs }) {
  const withReceipts = sortByRoll(regs.filter((r) => r.receipt));
  const pages = chunk(withReceipts, 4);

  return (
    <div style={{ background: "#fff", border: "1px solid #dde3ea", borderRadius: 10, padding: 20 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 4, flexWrap: "wrap", gap: 10 }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 13.5, color: "#1c2b3a" }}>Fee receipts</div>
          <p style={{ fontSize: 12.5, color: "#7a8794", margin: "4px 0 0" }}>
            Every application with a payment receipt uploaded, laid out four to a page (2 rows × 2 columns) for printing or filing.
          </p>
        </div>
        {pages.length > 0 && (
          <Btn variant="outline" onClick={() => window.print()}><Printer size={14} /> Print / Save as PDF</Btn>
        )}
      </div>

      {pages.length === 0 ? (
        <p style={{ fontSize: 13, color: "#7a8794", marginTop: 12 }}>No payment receipts have been uploaded yet.</p>
      ) : (
        <div className="print-area" style={{ marginTop: 16 }}>
          {pages.map((page, pi) => (
            <div
              key={pi}
              className={pi < pages.length - 1 ? "print-page-break" : ""}
              style={{ display: "flex", flexDirection: "column", gap: 12, height: 700, marginBottom: 24, boxSizing: "border-box" }}
            >
              <div style={{ display: "flex", gap: 12, height: 344, minHeight: 0 }}>
                <div style={{ flex: 1, minWidth: 0, minHeight: 0 }}>{page[0] && <ReceiptCard r={page[0]} />}</div>
                <div style={{ flex: 1, minWidth: 0, minHeight: 0 }}>{page[1] && <ReceiptCard r={page[1]} />}</div>
              </div>
              <div style={{ display: "flex", gap: 12, height: 344, minHeight: 0 }}>
                <div style={{ flex: 1, minWidth: 0, minHeight: 0 }}>{page[2] && <ReceiptCard r={page[2]} />}</div>
                <div style={{ flex: 1, minWidth: 0, minHeight: 0 }}>{page[3] && <ReceiptCard r={page[3]} />}</div>
              </div>
            </div>
          ))}
        </div>
      )}
      <p style={{ fontSize: 11, color: "#a2adb8", marginTop: 8 }}>
        In the print dialog, choose "Save as PDF" as the destination to download it as a file. Each receipt is
        cropped to fill its quarter of the page at a uniform size rather than being stretched or shrunk to fit, so
        portrait phone screenshots and landscape scans all print the same size. Any older receipts uploaded as a PDF
        before image-only uploads were enforced still show as a labelled placeholder rather than the live document —
        open one of those individually (from the Applications tab) if you need to print it on its own.
      </p>
    </div>
  );
}

function toCSV(rows, columns) {
  const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const header = columns.map((c) => esc(c.label)).join(",");
  const body = rows.map((r) => columns.map((c) => esc(c.get(r))).join(",")).join("\n");
  return header + "\n" + body;
}

function download(filename, content, mime) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

let __jsZipPromise = null;
function loadJSZip() {
  if (window.JSZip) return Promise.resolve(window.JSZip);
  if (__jsZipPromise) return __jsZipPromise;
  __jsZipPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js";
    script.onload = () => (window.JSZip ? resolve(window.JSZip) : reject(new Error("JSZip did not load correctly")));
    script.onerror = () => reject(new Error("Could not load the ZIP helper library (no internet access?)"));
    document.head.appendChild(script);
  });
  return __jsZipPromise;
}

function parseDataUrl(dataUrl) {
  const match = /^data:([^;]+);base64,(.*)$/.exec(dataUrl || "");
  if (!match) return null;
  const mime = match[1];
  const ext = mime.includes("png") ? "png" : (mime.includes("jpeg") || mime.includes("jpg")) ? "jpg" : "bin";
  return { mime, base64: match[2], ext };
}

function safeFileToken(value, fallback) {
  const cleaned = String(value || "").trim().replace(/[^a-zA-Z0-9_-]+/g, "_");
  return cleaned || fallback;
}

async function downloadPhotosAndSignaturesZip(regs, scope, onProgress) {
  const JSZip = await loadJSZip();
  const zip = new JSZip();
  const list = scope === "approved" ? regs.filter((r) => r.status === "approved") : regs;
  let included = 0;
  let failed = 0;
  const jobs = [];
  list.forEach((r) => {
    const roll = safeFileToken(r.hallTicketNo, r.id);
    if (r.photo?.dataUrl) jobs.push({ url: r.photo.dataUrl, name: `${roll}_photo` });
    if (r.signature?.dataUrl) jobs.push({ url: r.signature.dataUrl, name: `${roll}_signature` });
  });
  for (let i = 0; i < jobs.length; i++) {
    const { url, name } = jobs[i];
    try {
      if (url.startsWith("data:")) {
        const parsed = parseDataUrl(url);
        if (parsed) { zip.file(`${name}.${parsed.ext}`, parsed.base64, { base64: true }); included++; }
      } else {
        const { base64, ext } = await urlToBase64(url);
        zip.file(`${name}.${ext}`, base64, { base64: true });
        included++;
      }
    } catch (e) {
      failed++;
    }
    onProgress && onProgress(Math.round(((i + 1) / jobs.length) * 90));
  }
  if (included === 0) return { ok: false, count: 0, failed };
  const blob = await zip.generateAsync({ type: "blob" }, (meta) => onProgress && onProgress(90 + Math.round(meta.percent * 0.1)));
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = "aiims_photos_signatures.zip";
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
  return { ok: true, count: included, failed };
}

function PhotoSignatureExport({ regs }) {
  const [scope, setScope] = useState("approved");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [err, setErr] = useState("");
  const [done, setDone] = useState("");

  async function run() {
    setBusy(true);
    setErr("");
    setDone("");
    setProgress(0);
    try {
      const result = await downloadPhotosAndSignaturesZip(regs, scope, setProgress);
      if (!result.ok) setErr("No photos or signatures found for the selected applications.");
      else setDone(`Downloaded ${result.count} file(s).${result.failed ? ` (${result.failed} couldn't be fetched and were skipped.)` : ""}`);
    } catch (e) {
      setErr(e.message || "Could not build the ZIP file. Check your internet connection and try again.");
    }
    setBusy(false);
  }

  return (
    <div style={{ background: "#fff", border: "1px solid #dde3ea", borderRadius: 10, padding: 20, marginTop: 16 }}>
      <div style={{ fontWeight: 700, fontSize: 13.5, color: "#1c2b3a", marginBottom: 4 }}>Photos & signatures</div>
      <p style={{ fontSize: 12.5, color: "#7a8794", margin: "4px 0 14px" }}>
        Download every uploaded photograph and signature as a ZIP file, each named by Roll No. (e.g.
        "123456_photo.jpg", "123456_signature.jpg") so they can be dropped straight into a folder.
      </p>
      <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        <select style={{ ...inputStyle, maxWidth: 220 }} value={scope} onChange={(e) => setScope(e.target.value)}>
          <option value="approved">Approved applications only</option>
          <option value="all">All applications</option>
        </select>
        <Btn onClick={run} disabled={busy}>
          {busy ? <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} /> : <Download size={14} />}
          {busy ? `Preparing ZIP... ${progress}%` : "Download ZIP"}
        </Btn>
      </div>
      {err && <div style={{ color: "#a13a2f", fontSize: 12.5, marginTop: 10 }}>{err}</div>}
      {done && <div style={{ color: "#2f6b45", fontSize: 12.5, marginTop: 10 }}>{done}</div>}
      <p style={{ fontSize: 11, color: "#a2adb8", marginTop: 10 }}>
        Signatures marked "Digital signature (Sd/-)" have no image file and are skipped. This needs a brief internet
        connection the first time, to load a small ZIP-building helper.
      </p>
    </div>
  );
}

function Reports({ regs, courses }) {
  const baseCols = [
    { label: "Application ID", get: (r) => r.id },
    { label: "Roll No.", get: (r) => r.hallTicketNo || "" },
    { label: "Name", get: (r) => r.name },
    { label: "Father/Guardian", get: (r) => r.father },
    { label: "Mobile", get: (r) => r.mobile },
    { label: "Course", get: (r) => r.course },
    { label: "Subjects", get: (r) => (r.subjects || []).map((raw) => { const s = liveSubject(courses, r.course, raw); return s.date ? `${s.name} (${formatExamDateRange(s)})` : s.name; }).join("; ") },
    { label: "Total fee", get: (r) => r.totalFee },
    { label: "UTR", get: (r) => r.utr },
    { label: "Status", get: (r) => r.status },
    { label: "Submitted at", get: (r) => r.submittedAt },
  ];

  const reportsList = [
    { name: "Student register (all applications)", rows: sortByRoll(regs) },
    { name: "Approved applications", rows: sortByRoll(regs.filter((r) => r.status === "approved")) },
    { name: "Pending applications", rows: sortByRoll(regs.filter((r) => r.status === "pending")) },
    { name: "Rejected applications", rows: sortByRoll(regs.filter((r) => r.status === "rejected")) },
  ];

  return (
    <>
    <div style={{ background: "#fff", border: "1px solid #dde3ea", borderRadius: 10, padding: 20 }}>
      <div style={{ fontWeight: 700, fontSize: 13.5, color: "#1c2b3a", marginBottom: 4 }}>Reports & exports</div>
      <p style={{ fontSize: 12.5, color: "#7a8794", marginBottom: 16 }}>Export application data as CSV (opens in Excel) for record-keeping and reconciliation.</p>
      {reportsList.map((rep) => (
        <div key={rep.name} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderBottom: "1px solid #eef1f5" }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: "#1c2b3a" }}>{rep.name}</div>
            <div style={{ fontSize: 11.5, color: "#7a8794" }}>{rep.rows.length} record(s)</div>
          </div>
          <Btn variant="outline" disabled={rep.rows.length === 0} onClick={() => download(rep.name.replace(/\s+/g, "_").toLowerCase() + ".csv", toCSV(rep.rows, baseCols), "text/csv")}>
            <FileSpreadsheet size={14} /> Export CSV
          </Btn>
        </div>
      ))}
    </div>
    <PhotoSignatureExport regs={regs} />
    </>
  );
}
