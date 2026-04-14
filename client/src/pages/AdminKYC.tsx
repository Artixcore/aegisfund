import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  ExternalLink,
  FileText,
  RefreshCw,
  Shield,
  ShieldCheck,
  User,
  XCircle,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Link } from "wouter";

type KycEntry = {
  id: number;
  userId: number;
  status: string | null;
  tier: string | null;
  fullName: string | null;
  dateOfBirth: string | null;
  nationality: string | null;
  countryOfResidence: string | null;
  documentType: string | null;
  documentNumber: string | null;
  documentFrontUrl: string | null;
  documentBackUrl: string | null;
  selfieUrl: string | null;
  rejectionReason: string | null;
  submittedAt: Date | null;
  reviewedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  userName: string | null;
  userEmail: string | null;
  userOpenId: string | null;
};

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  approved: { label: "Approved", color: "text-aegis-green", icon: <ShieldCheck size={13} /> },
  under_review: { label: "Under Review", color: "text-aegis-gold", icon: <Clock size={13} /> },
  rejected: { label: "Rejected", color: "text-aegis-red", icon: <XCircle size={13} /> },
  pending: { label: "Pending", color: "text-muted-foreground", icon: <Clock size={13} /> },
  not_started: { label: "Not Started", color: "text-muted-foreground", icon: <User size={13} /> },
};

function KycRow({ entry, onRefresh }: { entry: KycEntry; onRefresh: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [showRejectInput, setShowRejectInput] = useState(false);

  const reviewKyc = trpc.admin.reviewKyc.useMutation({
    onSuccess: (_, vars) => {
      toast.success(`KYC ${vars.decision === "approved" ? "approved" : "rejected"} successfully`);
      setShowRejectInput(false);
      setRejectReason("");
      onRefresh();
    },
    onError: (e) => toast.error(e.message),
  });

  const statusCfg = STATUS_CONFIG[entry.status ?? "not_started"] ?? STATUS_CONFIG["not_started"];

  return (
    <div className="aegis-card mb-3 overflow-hidden">
      {/* Row header */}
      <div className="flex items-center gap-4">
        <div className="w-8 h-8 rounded-full bg-foreground/10 flex items-center justify-center shrink-0">
          <User size={14} className="text-muted-foreground" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium truncate">{entry.fullName ?? entry.userName ?? "Unknown"}</span>
            <span className={`inline-flex items-center gap-1 text-[11px] font-mono px-2 py-0.5 rounded-full border ${
              entry.status === "approved" ? "border-aegis-green/30 bg-aegis-green/10 text-aegis-green" :
              entry.status === "under_review" ? "border-aegis-gold/30 bg-aegis-gold/10 text-aegis-gold" :
              entry.status === "rejected" ? "border-aegis-red/30 bg-aegis-red/10 text-aegis-red" :
              "border-border bg-background text-muted-foreground"
            }`}>
              {statusCfg.icon}
              {statusCfg.label}
            </span>
            {entry.tier && (
              <span className="text-[11px] font-mono text-muted-foreground px-2 py-0.5 rounded border border-border">
                {entry.tier.toUpperCase()}
              </span>
            )}
          </div>
          <div className="flex items-center gap-3 mt-0.5">
            <span className="text-xs text-muted-foreground">{entry.userEmail ?? entry.userOpenId ?? `User #${entry.userId}`}</span>
            {entry.submittedAt && (
              <span className="text-xs text-muted-foreground">
                Submitted {new Date(entry.submittedAt).toLocaleDateString()}
              </span>
            )}
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-2 shrink-0">
          {entry.status === "under_review" && (
            <>
              <button
                onClick={() => reviewKyc.mutate({ profileId: entry.id, decision: "approved" })}
                disabled={reviewKyc.isPending}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-aegis-green/10 text-aegis-green border border-aegis-green/30 rounded-lg hover:bg-aegis-green/20 transition-colors disabled:opacity-50"
              >
                <CheckCircle2 size={12} />
                Approve
              </button>
              <button
                onClick={() => setShowRejectInput(!showRejectInput)}
                disabled={reviewKyc.isPending}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-aegis-red/10 text-aegis-red border border-aegis-red/30 rounded-lg hover:bg-aegis-red/20 transition-colors disabled:opacity-50"
              >
                <XCircle size={12} />
                Reject
              </button>
            </>
          )}
          <button
            onClick={() => setExpanded(!expanded)}
            className="p-1.5 rounded-lg border border-border hover:border-foreground/30 transition-colors text-muted-foreground"
          >
            {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
        </div>
      </div>

      {/* Reject reason input */}
      {showRejectInput && (
        <div className="mt-3 pt-3 border-t border-border">
          <label className="text-xs font-mono text-muted-foreground block mb-1.5">Rejection Reason</label>
          <div className="flex gap-2">
            <input
              type="text"
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="Explain why the submission was rejected..."
              className="flex-1 bg-background border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:border-foreground/40 transition-colors"
            />
            <button
              onClick={() => {
                if (!rejectReason.trim()) { toast.error("Please provide a rejection reason"); return; }
                reviewKyc.mutate({ profileId: entry.id, decision: "rejected", rejectionReason: rejectReason });
              }}
              disabled={reviewKyc.isPending}
              className="px-4 py-2 text-sm font-medium bg-aegis-red/10 text-aegis-red border border-aegis-red/30 rounded-lg hover:bg-aegis-red/20 transition-colors disabled:opacity-50"
            >
              {reviewKyc.isPending ? "Rejecting..." : "Confirm Reject"}
            </button>
          </div>
        </div>
      )}

      {/* Expanded details */}
      {expanded && (
        <div className="mt-4 pt-4 border-t border-border">
          <div className="grid grid-cols-2 gap-x-8 gap-y-2 mb-4">
            {[
              { label: "Full Name", value: entry.fullName },
              { label: "Date of Birth", value: entry.dateOfBirth },
              { label: "Nationality", value: entry.nationality },
              { label: "Country of Residence", value: entry.countryOfResidence },
              { label: "Document Type", value: entry.documentType },
              { label: "Document Number", value: entry.documentNumber },
              { label: "Verification Tier", value: entry.tier?.toUpperCase() },
              { label: "User ID", value: `#${entry.userId}` },
            ].map(({ label, value }) => (
              <div key={label} className="flex items-center justify-between py-1.5 border-b border-border/50 last:border-0">
                <span className="text-xs font-mono text-muted-foreground">{label}</span>
                <span className="text-xs font-medium">{value ?? "—"}</span>
              </div>
            ))}
          </div>

          {/* Document images */}
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: "Document Front", url: entry.documentFrontUrl },
              { label: "Document Back", url: entry.documentBackUrl },
              { label: "Selfie", url: entry.selfieUrl },
            ].map(({ label, url }) => (
              <div key={label}>
                <div className="text-xs font-mono text-muted-foreground mb-1.5">{label}</div>
                {url ? (
                  <a
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block relative group"
                  >
                    <img
                      src={url}
                      alt={label}
                      className="w-full h-28 object-cover rounded-lg border border-border group-hover:border-foreground/30 transition-colors"
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.display = "none";
                      }}
                    />
                    <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 bg-background/60 rounded-lg transition-opacity">
                      <ExternalLink size={16} className="text-foreground" />
                    </div>
                  </a>
                ) : (
                  <div className="w-full h-28 rounded-lg border border-dashed border-border flex items-center justify-center">
                    <span className="text-xs text-muted-foreground">Not uploaded</span>
                  </div>
                )}
              </div>
            ))}
          </div>

          {entry.rejectionReason && (
            <div className="mt-3 p-3 rounded-lg bg-aegis-red/5 border border-aegis-red/20">
              <div className="flex items-start gap-2">
                <AlertCircle size={13} className="text-aegis-red mt-0.5 shrink-0" />
                <div>
                  <div className="text-xs font-mono text-aegis-red mb-0.5">Rejection Reason</div>
                  <p className="text-xs text-muted-foreground">{entry.rejectionReason}</p>
                </div>
              </div>
            </div>
          )}

          {entry.reviewedAt && (
            <div className="mt-2 text-xs text-muted-foreground font-mono">
              Reviewed: {new Date(entry.reviewedAt).toLocaleString()}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function AdminKYC() {
  const { user } = useAuth();
  const [filter, setFilter] = useState<"all" | "pending">("pending");

  const allKyc = trpc.admin.listAllKyc.useQuery(undefined, { enabled: user?.role === "admin" });
  const pendingKyc = trpc.admin.listPendingKyc.useQuery(undefined, { enabled: user?.role === "admin" });

  const currentQuery = filter === "all" ? allKyc : pendingKyc;
  const entries = (currentQuery.data ?? []) as KycEntry[];

  const pendingCount = pendingKyc.data?.length ?? 0;

  if (user?.role !== "admin") {
    return (
      <div className="p-6 max-w-2xl mx-auto">
        <div className="aegis-card text-center py-12">
          <Shield size={48} className="text-aegis-red mx-auto mb-4" />
          <h2 className="text-xl font-semibold mb-2">Access Denied</h2>
          <p className="text-muted-foreground text-sm mb-6">This panel is restricted to administrators.</p>
          <Link href="/dashboard" className="px-6 py-2.5 bg-foreground text-background text-sm font-medium rounded-lg hover:opacity-90 transition-opacity">
            Back to Dashboard
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl mx-auto animate-fade-up">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <div className="flex items-center gap-2 text-xs font-mono text-muted-foreground mb-1">
            <Shield size={12} />
            <span>ADMIN PANEL</span>
          </div>
          <h1 className="text-xl font-semibold tracking-tight">KYC Review</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Review and approve identity verification submissions.</p>
        </div>
        <button
          onClick={() => { allKyc.refetch(); pendingKyc.refetch(); }}
          className="flex items-center gap-1.5 px-3 py-2 text-xs font-mono border border-border rounded-lg hover:border-foreground/30 transition-colors text-muted-foreground"
        >
          <RefreshCw size={12} className={currentQuery.isFetching ? "animate-spin" : ""} />
          Refresh
        </button>
      </div>

      {/* Stats strip */}
      <div className="grid grid-cols-4 gap-3 mb-6">
        {[
          { label: "Total Submissions", value: allKyc.data?.length ?? 0, color: "text-foreground" },
          { label: "Pending Review", value: pendingCount, color: "text-aegis-gold" },
          { label: "Approved", value: allKyc.data?.filter((e) => e.status === "approved").length ?? 0, color: "text-aegis-green" },
          { label: "Rejected", value: allKyc.data?.filter((e) => e.status === "rejected").length ?? 0, color: "text-aegis-red" },
        ].map(({ label, value, color }) => (
          <div key={label} className="aegis-card text-center py-3">
            <div className={`text-2xl font-bold font-mono ${color}`}>{value}</div>
            <div className="text-xs text-muted-foreground mt-0.5">{label}</div>
          </div>
        ))}
      </div>

      {/* Filter tabs */}
      <div className="flex items-center gap-1 mb-4 p-1 bg-background border border-border rounded-lg w-fit">
        {(["pending", "all"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-4 py-1.5 text-xs font-mono rounded-md transition-colors ${
              filter === f ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {f === "pending" ? `Pending Review${pendingCount > 0 ? ` (${pendingCount})` : ""}` : "All Submissions"}
          </button>
        ))}
      </div>

      {/* Submissions list */}
      {currentQuery.isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="aegis-card h-16 animate-pulse bg-foreground/5" />
          ))}
        </div>
      ) : entries.length === 0 ? (
        <div className="aegis-card text-center py-12">
          {filter === "pending" ? (
            <>
              <CheckCircle2 size={36} className="text-aegis-green mx-auto mb-3" />
              <p className="text-sm font-medium mb-1">All caught up</p>
              <p className="text-xs text-muted-foreground">No pending KYC submissions to review.</p>
            </>
          ) : (
            <>
              <FileText size={36} className="text-muted-foreground mx-auto mb-3" />
              <p className="text-sm font-medium mb-1">No submissions yet</p>
              <p className="text-xs text-muted-foreground">KYC submissions will appear here once users begin verification.</p>
            </>
          )}
        </div>
      ) : (
        <div>
          {entries.map((entry) => (
            <KycRow
              key={entry.id}
              entry={entry}
              onRefresh={() => { allKyc.refetch(); pendingKyc.refetch(); }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
