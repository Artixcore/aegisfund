import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  ChevronRight,
  Clock,
  FileText,
  Shield,
  ShieldCheck,
  Upload,
  User,
  XCircle,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { KYC_COUNTRY_NAMES } from "@/data/kycCountries";

const TIERS = [
  { id: "basic", label: "Basic", limit: "$10,000 / day", features: ["Identity verification", "Standard trading limits", "Basic wallet access"] },
  { id: "enhanced", label: "Enhanced", limit: "$100,000 / day", features: ["Enhanced due diligence", "Higher trading limits", "Multi-chain access", "Priority support"] },
  { id: "institutional", label: "Institutional", limit: "Unlimited", features: ["Full institutional access", "Unlimited trading", "Dedicated account manager", "API access", "Custom reporting"] },
];

const STEPS = [
  { id: "welcome", label: "Welcome", icon: Shield },
  { id: "personal", label: "Personal Info", icon: User },
  { id: "document", label: "Document", icon: FileText },
  { id: "selfie", label: "Selfie", icon: Upload },
  { id: "review", label: "Review", icon: CheckCircle2 },
];

const DOC_TYPES = ["Passport", "National ID Card", "Driver's License", "Residence Permit"];

export default function KYC() {
  const { user } = useAuth();
  const [step, setStep] = useState(0);
  const [selectedTier, setSelectedTier] = useState("basic");

  const [personal, setPersonal] = useState({
    fullName: user?.name ?? "",
    dateOfBirth: "",
    nationality: "",
    countryOfResidence: "",
  });

  const [docInfo, setDocInfo] = useState({
    documentType: "Passport",
    documentNumber: "",
    documentFrontUrl: "",
    documentBackUrl: "",
  });

  const [selfieUrl1, setSelfieUrl1] = useState("");
  const [selfieUrl2, setSelfieUrl2] = useState("");
  const [selfieUrl3, setSelfieUrl3] = useState("");

  const { data: kycStatus, refetch } = trpc.kyc.getStatus.useQuery();

  const savePersonal = trpc.kyc.savePersonalInfo.useMutation({
    onSuccess: () => { setStep(2); },
    onError: (e) => toast.error(e.message),
  });

  const saveDocument = trpc.kyc.saveDocumentInfo.useMutation({
    onSuccess: () => { setStep(3); },
    onError: (e) => toast.error(e.message),
  });

  const uploadDocument = trpc.kyc.uploadDocument.useMutation({
    onError: (e) => toast.error(`Upload failed: ${e.message}`),
  });
  const uploadSelfie = trpc.kyc.uploadSelfie.useMutation({
    onError: (e) => toast.error(`Upload failed: ${e.message}`),
  });

  // Convert a File to base64 string
  const fileToBase64 = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve((reader.result as string).split(",")[1]);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });

  const handleDocumentUpload = async (side: "front" | "back", file: File) => {
    if (file.size > 16 * 1024 * 1024) { toast.error("File too large (max 16 MB)"); return; }
    const toastId = `upload-doc-${side}`;
    toast.loading(`Uploading ${side} document...`, { id: toastId });
    try {
      const fileBase64 = await fileToBase64(file);
      const result = await uploadDocument.mutateAsync({ fileBase64, mimeType: file.type, side });
      const key = side === "front" ? "documentFrontUrl" : "documentBackUrl";
      setDocInfo((prev) => ({ ...prev, [key]: result.url }));
      toast.success(`${side === "front" ? "Front" : "Back"} document uploaded`, { id: toastId });
    } catch { toast.dismiss(toastId); }
  };

  const handleSelfieUpload = async (slot: "1" | "2" | "3", file: File) => {
    if (file.size > 16 * 1024 * 1024) { toast.error("File too large (max 16 MB)"); return; }
    const tid = `upload-selfie-${slot}`;
    toast.loading("Uploading...", { id: tid });
    try {
      const fileBase64 = await fileToBase64(file);
      const result = await uploadSelfie.mutateAsync({ fileBase64, mimeType: file.type, slot });
      if (slot === "1") setSelfieUrl1(result.url);
      if (slot === "2") setSelfieUrl2(result.url);
      if (slot === "3") setSelfieUrl3(result.url);
      toast.success(`Selfie ${slot} saved`, { id: tid });
    } catch { toast.dismiss(tid); }
  };

  const submitVerification = trpc.kyc.submitVerification.useMutation({
    onSuccess: (data) => {
      if (data.status === "approved") {
        toast.success("Identity verified. Welcome to Aegis Fund.");
      } else {
        toast.error(data.rejectionReason ?? "Verification did not pass.");
      }
      refetch();
    },
    onError: (e) => toast.error(e.message),
  });

  if (kycStatus && (kycStatus.status === "approved" || kycStatus.status === "under_review" || kycStatus.status === "rejected")) {
    return (
      <div className="p-6 max-w-2xl mx-auto animate-fade-up">
        <div className="aegis-card text-center py-12">
          {kycStatus.status === "approved" && (
            <>
              <ShieldCheck size={48} className="text-aegis-green mx-auto mb-4" />
              <h2 className="text-xl font-semibold mb-2">Identity Verified</h2>
              <p className="text-muted-foreground text-sm mb-6">Your KYC has been approved. You have full access to Aegis Fund.</p>
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-aegis-green/10 text-aegis-green text-sm font-mono">
                <CheckCircle2 size={14} />
                Tier: {kycStatus.tier?.toUpperCase() ?? "BASIC"}
              </div>
            </>
          )}
          {kycStatus.status === "under_review" && (
            <>
              <Clock size={48} className="text-aegis-gold mx-auto mb-4" />
              <h2 className="text-xl font-semibold mb-2">Under Review</h2>
              <p className="text-muted-foreground text-sm mb-6">Your submission is being reviewed. This typically takes 24-48 hours.</p>
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-aegis-gold/10 text-aegis-gold text-sm font-mono">
                <Clock size={14} />
                Review in progress
              </div>
            </>
          )}
          {kycStatus.status === "rejected" && (
            <>
              <XCircle size={48} className="text-aegis-red mx-auto mb-4" />
              <h2 className="text-xl font-semibold mb-2">Verification Failed</h2>
              <p className="text-muted-foreground text-sm mb-6">
                {(kycStatus as { rejectionReason?: string }).rejectionReason ?? "Your submission was rejected. Please resubmit with valid documents."}
              </p>
              <button
                onClick={() => setStep(0)}
                className="px-6 py-2.5 bg-foreground text-background text-sm font-medium rounded-lg hover:opacity-90 transition-opacity"
              >
                Resubmit
              </button>
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-3xl mx-auto animate-fade-up">
      <div className="mb-8">
        <div className="flex items-center gap-2 text-xs font-mono text-muted-foreground mb-2">
          <Shield size={12} />
          <span>IDENTITY VERIFICATION</span>
        </div>
        <h1 className="text-xl font-semibold tracking-tight">KYC Onboarding</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Complete identity verification to unlock full platform access. Submissions are checked automatically (document + selfie).
        </p>
      </div>

      {/* Progress steps */}
      <div className="flex items-center gap-0 mb-8">
        {STEPS.map((s, i) => {
          const Icon = s.icon;
          const isActive = step === i;
          const isDone = step > i;
          return (
            <div key={s.id} className="flex items-center flex-1 last:flex-none">
              <div className={`flex items-center gap-2 ${isActive ? "text-foreground" : isDone ? "text-aegis-green" : "text-muted-foreground"}`}>
                <div className={`w-7 h-7 rounded-full flex items-center justify-center border shrink-0 transition-all ${
                  isActive ? "border-foreground bg-foreground text-background" :
                  isDone ? "border-aegis-green bg-aegis-green/10 text-aegis-green" :
                  "border-border bg-transparent"
                }`}>
                  {isDone ? <CheckCircle2 size={14} /> : <Icon size={13} />}
                </div>
                <span className="text-xs font-mono hidden sm:block">{s.label}</span>
              </div>
              {i < STEPS.length - 1 && (
                <div className={`flex-1 h-px mx-2 ${isDone ? "bg-aegis-green/40" : "bg-border"}`} />
              )}
            </div>
          );
        })}
      </div>

      {/* Step 0: Welcome + Tier Selection */}
      {step === 0 && (
        <div className="space-y-6">
          <div className="aegis-card">
            <div className="flex items-start gap-3 mb-4">
              <AlertCircle size={16} className="text-aegis-gold mt-0.5 shrink-0" />
              <p className="text-sm text-muted-foreground">
                Aegis Fund is a regulated financial intelligence platform. To comply with AML/KYC regulations,
                all users must complete identity verification before accessing trading and wallet features.
              </p>
            </div>
          </div>
          <div>
            <div className="mono-label mb-3">Select Verification Tier</div>
            <div className="grid grid-cols-3 gap-3">
              {TIERS.map((tier) => (
                <button
                  key={tier.id}
                  onClick={() => setSelectedTier(tier.id)}
                  className={`aegis-card text-left transition-all ${selectedTier === tier.id ? "border-foreground/50 bg-foreground/5" : "hover:border-border/80"}`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-semibold">{tier.label}</span>
                    {selectedTier === tier.id && <CheckCircle2 size={14} className="text-aegis-green" />}
                  </div>
                  <div className="text-xs font-mono text-aegis-green mb-3">{tier.limit}</div>
                  <ul className="space-y-1">
                    {tier.features.map((f) => (
                      <li key={f} className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                        <ChevronRight size={10} className="shrink-0" />
                        {f}
                      </li>
                    ))}
                  </ul>
                </button>
              ))}
            </div>
          </div>
          <button
            onClick={() => setStep(1)}
            className="w-full flex items-center justify-center gap-2 py-3 bg-foreground text-background text-sm font-medium rounded-lg hover:opacity-90 transition-opacity"
          >
            Begin Verification
            <ArrowRight size={15} />
          </button>
        </div>
      )}

      {/* Step 1: Personal Information */}
      {step === 1 && (
        <div className="aegis-card space-y-5">
          <div className="mono-label">Personal Information</div>
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="text-xs font-mono text-muted-foreground block mb-1.5">Full Legal Name</label>
              <input
                type="text"
                value={personal.fullName}
                onChange={(e) => setPersonal({ ...personal, fullName: e.target.value })}
                placeholder="As it appears on your ID"
                className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:border-foreground/40 transition-colors"
              />
            </div>
            <div>
              <label className="text-xs font-mono text-muted-foreground block mb-1.5">Date of Birth</label>
              <input
                type="date"
                value={personal.dateOfBirth}
                onChange={(e) => setPersonal({ ...personal, dateOfBirth: e.target.value })}
                className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:border-foreground/40 transition-colors"
              />
            </div>
            <div>
              <label className="text-xs font-mono text-muted-foreground block mb-1.5">Nationality</label>
              <select
                value={personal.nationality}
                onChange={(e) => setPersonal({ ...personal, nationality: e.target.value })}
                className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:border-foreground/40 transition-colors"
              >
                <option value="">Select country</option>
                {KYC_COUNTRY_NAMES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div className="col-span-2">
              <label className="text-xs font-mono text-muted-foreground block mb-1.5">Country of Residence</label>
              <select
                value={personal.countryOfResidence}
                onChange={(e) => setPersonal({ ...personal, countryOfResidence: e.target.value })}
                className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:border-foreground/40 transition-colors"
              >
                <option value="">Select country</option>
                {KYC_COUNTRY_NAMES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>
          <div className="flex gap-3">
            <button onClick={() => setStep(0)} className="flex-1 py-2.5 border border-border rounded-lg text-sm hover:border-foreground/30 transition-colors">Back</button>
            <button
              onClick={() => {
                if (!personal.fullName || !personal.dateOfBirth || !personal.nationality || !personal.countryOfResidence) {
                  toast.error("Please fill in all fields"); return;
                }
                savePersonal.mutate(personal);
              }}
              disabled={savePersonal.isPending}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-foreground text-background text-sm font-medium rounded-lg hover:opacity-90 disabled:opacity-50 transition-opacity"
            >
              {savePersonal.isPending ? "Saving..." : "Continue"} <ArrowRight size={14} />
            </button>
          </div>
        </div>
      )}

      {/* Step 2: Document Upload */}
      {step === 2 && (
        <div className="aegis-card space-y-5">
          <div className="mono-label">Identity Document</div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-mono text-muted-foreground block mb-1.5">Document Type</label>
              <select
                value={docInfo.documentType}
                onChange={(e) => setDocInfo({ ...docInfo, documentType: e.target.value })}
                className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:border-foreground/40 transition-colors"
              >
                {DOC_TYPES.map((d) => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-mono text-muted-foreground block mb-1.5">Document Number</label>
              <input
                type="text"
                value={docInfo.documentNumber}
                onChange={(e) => setDocInfo({ ...docInfo, documentNumber: e.target.value })}
                placeholder="e.g. A12345678"
                className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:border-foreground/40 transition-colors"
              />
            </div>
          </div>
          {docInfo.documentType !== "Passport" && (
            <p className="text-xs text-muted-foreground">
              For this document type, both front and back images are required for verification.
            </p>
          )}
          <div className="grid grid-cols-2 gap-4">
            {(["front", "back"] as const).map((side) => {
              const key = side === "front" ? "documentFrontUrl" : "documentBackUrl";
              const isUploaded = !!docInfo[key];
              const isUploading = uploadDocument.isPending;
              return (
                <div key={side}>
                  <label className="text-xs font-mono text-muted-foreground block mb-1.5">
                    {side === "front" ? "Front of Document" : docInfo.documentType === "Passport" ? "Back (optional)" : "Back of Document"}
                  </label>
                  <label className={`w-full h-28 border-2 border-dashed rounded-lg flex flex-col items-center justify-center gap-2 transition-colors cursor-pointer ${
                    isUploaded ? "border-aegis-green/40 bg-aegis-green/5" : "border-border hover:border-foreground/30"
                  }`}>
                    <input
                      type="file"
                      accept="image/*,application/pdf"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) handleDocumentUpload(side, file);
                      }}
                    />
                    {isUploaded ? (
                      <><CheckCircle2 size={20} className="text-aegis-green" /><span className="text-xs font-mono text-aegis-green">Uploaded ✓</span></>
                    ) : isUploading ? (
                      <><Upload size={20} className="text-muted-foreground animate-pulse" /><span className="text-xs text-muted-foreground">Uploading...</span></>
                    ) : (
                      <><Upload size={20} className="text-muted-foreground" /><span className="text-xs text-muted-foreground">Click to upload</span><span className="text-[10px] text-muted-foreground/60">JPG, PNG, PDF · max 16 MB</span></>
                    )}
                  </label>
                </div>
              );
            })}
          </div>
          <div className="flex gap-3">
            <button onClick={() => setStep(1)} className="flex-1 py-2.5 border border-border rounded-lg text-sm hover:border-foreground/30 transition-colors">Back</button>
            <button
              onClick={() => {
                if (!docInfo.documentNumber) { toast.error("Please enter document number"); return; }
                if (docInfo.documentType !== "Passport" && !docInfo.documentBackUrl) {
                  toast.error("Please upload the back of your document for this ID type.");
                  return;
                }
                saveDocument.mutate(docInfo);
              }}
              disabled={saveDocument.isPending}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-foreground text-background text-sm font-medium rounded-lg hover:opacity-90 disabled:opacity-50 transition-opacity"
            >
              {saveDocument.isPending ? "Saving..." : "Continue"} <ArrowRight size={14} />
            </button>
          </div>
        </div>
      )}

      {/* Step 3: Three selfies */}
      {step === 3 && (
        <div className="aegis-card space-y-5">
          <div className="mono-label">Three verification photos</div>
          <p className="text-sm text-muted-foreground">
            Upload three different photos. Automated checks compare them to your ID and to each other—similar or duplicate shots will fail.
          </p>
          {(
            [
              { slot: "1" as const, title: "1 — Neutral face", hint: "Face centered, even lighting, looking at the camera." },
              { slot: "2" as const, title: "2 — Head turn", hint: "Turn your head slightly left or right (different angle than photo 1)." },
              { slot: "3" as const, title: "3 — Holding ID", hint: "Hold your ID next to your face; both must be clearly visible." },
            ] as const
          ).map(({ slot, title, hint }) => {
            const url = slot === "1" ? selfieUrl1 : slot === "2" ? selfieUrl2 : selfieUrl3;
            const done = !!url;
            return (
              <div key={slot} className="space-y-2">
                <div className="text-xs font-mono text-muted-foreground">{title}</div>
                <p className="text-[11px] text-muted-foreground/90">{hint}</p>
                <label className={`w-full min-h-36 border-2 border-dashed rounded-lg flex flex-col items-center justify-center gap-2 py-6 px-3 transition-colors cursor-pointer ${
                  done ? "border-aegis-green/40 bg-aegis-green/5" : uploadSelfie.isPending ? "border-border" : "border-border hover:border-foreground/30"
                }`}>
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleSelfieUpload(slot, file);
                    }}
                  />
                  {done ? (
                    <><CheckCircle2 size={28} className="text-aegis-green" /><span className="text-sm font-mono text-aegis-green">Uploaded ✓</span><span className="text-xs text-muted-foreground">Click to replace</span></>
                  ) : (
                    <><User size={24} className="text-muted-foreground" /><span className="text-sm text-muted-foreground">Click to upload</span><span className="text-[10px] text-muted-foreground/60">JPG or PNG · max 16 MB</span></>
                  )}
                </label>
              </div>
            );
          })}
          <div className="flex gap-3">
            <button onClick={() => setStep(2)} className="flex-1 py-2.5 border border-border rounded-lg text-sm hover:border-foreground/30 transition-colors">Back</button>
            <button
              onClick={() => {
                if (!selfieUrl1 || !selfieUrl2 || !selfieUrl3) {
                  toast.error("Please upload all three verification photos.");
                  return;
                }
                setStep(4);
              }}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-foreground text-background text-sm font-medium rounded-lg hover:opacity-90 transition-opacity"
            >
              Continue <ArrowRight size={14} />
            </button>
          </div>
        </div>
      )}

      {/* Step 4: Review & Submit */}
      {step === 4 && (
        <div className="space-y-4">
          <div className="aegis-card">
            <div className="mono-label mb-4">Review Submission</div>
            <div className="space-y-3">
              {[
                { label: "Full Name", value: personal.fullName },
                { label: "Date of Birth", value: personal.dateOfBirth },
                { label: "Nationality", value: personal.nationality },
                { label: "Country of Residence", value: personal.countryOfResidence },
                { label: "Document Type", value: docInfo.documentType },
                { label: "Document Number", value: docInfo.documentNumber },
                { label: "Verification Tier", value: selectedTier.charAt(0).toUpperCase() + selectedTier.slice(1) },
                { label: "Selfie 1 (neutral)", value: selfieUrl1 ? "Uploaded" : "—" },
                { label: "Selfie 2 (angle)", value: selfieUrl2 ? "Uploaded" : "—" },
                { label: "Selfie 3 (with ID)", value: selfieUrl3 ? "Uploaded" : "—" },
              ].map(({ label, value }) => (
                <div key={label} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                  <span className="text-xs font-mono text-muted-foreground">{label}</span>
                  <span className="text-xs font-medium">{value || "—"}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="aegis-card" style={{ background: "oklch(0.18 0.04 85 / 0.3)", borderColor: "oklch(0.65 0.15 85 / 0.3)" }}>
            <div className="flex items-start gap-2.5">
              <AlertCircle size={14} className="text-aegis-gold mt-0.5 shrink-0" />
              <p className="text-xs text-muted-foreground">
                By submitting, you confirm that all information provided is accurate and you consent to identity verification
                in accordance with AML/KYC regulations. False information may result in account suspension.
              </p>
            </div>
          </div>
          <div className="flex gap-3">
            <button onClick={() => setStep(3)} className="flex-1 py-2.5 border border-border rounded-lg text-sm hover:border-foreground/30 transition-colors">Back</button>
            <button
              onClick={() =>
                submitVerification.mutate({
                  tier: selectedTier as "basic" | "enhanced" | "institutional",
                })
              }
              disabled={submitVerification.isPending}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-foreground text-background text-sm font-medium rounded-lg hover:opacity-90 disabled:opacity-50 transition-opacity"
            >
              {submitVerification.isPending ? "Verifying..." : "Verify identity"} <ShieldCheck size={14} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
