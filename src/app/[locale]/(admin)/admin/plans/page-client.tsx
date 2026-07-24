"use client";

import { useState } from "react";
import Link from "next/link";

import { cn } from "@/lib/utils";
import { Plus, Edit, Trash2 } from "lucide-react";

import { createPlanAction, deletePlanAction, upsertPlanLimitAction, deletePlanLimitAction, upsertPlanFeatureAction, deletePlanFeatureAction, upsertOrgOverrideAction, deleteOrgOverrideAction } from "@/features/admin/plans-data";

interface PlanData {
  id: string;
  code: string;
  name: string;
  stripePriceId: string | null;
  isCustom: boolean;
  isActive: boolean;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
}

interface OverrideData {
  id: string;
  organizationId: string;
  limitKey: string;
  limitValue: number | null;
}

interface AdminPlansClientProps {
  initialPlans: PlanData[];
  initialOverrides: OverrideData[];
}

const LIMIT_KEYS = ["max_students", "max_groups", "max_trainers", "max_locations", "max_sessions_per_month"] as const;
const FEATURE_KEYS = ["subscriptions_enabled", "multi_location", "policy_documents", "invoice_tracking"] as const;

function formatLimitKey(key: string): string {
  const labels: Record<string, string> = {
    max_students: "Max Students",
    max_groups: "Max Groups",
    max_trainers: "Max Trainers",
    max_locations: "Max Locations",
    max_sessions_per_month: "Max Sessions/Month",
  };
  return labels[key] || key;
}

function formatFeatureKey(key: string): string {
  const labels: Record<string, string> = {
    subscriptions_enabled: "Subscriptions",
    multi_location: "Multi Location",
    policy_documents: "Policy Documents",
    invoice_tracking: "Invoice Tracking",
  };
  return labels[key] || key;
}

export default function AdminPlansClient({ initialPlans, initialOverrides }: AdminPlansClientProps) {
  const [plans] = useState<PlanData[]>(initialPlans);
  const [overrides] = useState<OverrideData[]>(initialOverrides);
  const [limits, setLimits] = useState<Record<string, Record<string, number | null>>>({});
  const [features, setFeatures] = useState<Record<string, Record<string, boolean>>>({});

  return (
    <div className="space-y-8">
      {/* Plans List */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold">Plans</h2>
          <PlanCreateDialog />
        </div>

        <div className="rounded-lg border bg-card">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-muted">
                  <th className="text-left p-4 font-medium">Code</th>
                  <th className="text-left p-4 font-medium">Name</th>
                  <th className="text-left p-4 font-medium">Stripe Price</th>
                  <th className="text-left p-4 font-medium">Type</th>
                  <th className="text-left p-4 font-medium">Status</th>
                  <th className="text-left p-4 font-medium">Order</th>
                  <th className="text-right p-4 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {plans.map((p) => (
                  <PlanRow key={p.id} plan={p} />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* Plan Limits & Features */}
      <section className="space-y-4">
        <h2 className="text-xl font-semibold">Plan Limits & Features</h2>
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {plans.map((p) => (
            <PlanLimitsCard
              key={p.id}
              plan={p}
              limits={limits[p.id] || {}}
              features={features[p.id] || {}}
              onLimitChange={(limitKey, value) => setLimits((prev) => ({ ...prev, [p.id]: { ...prev[p.id], [limitKey]: value } }))}
              onFeatureChange={(featureKey, value) => setFeatures((prev) => ({ ...prev, [p.id]: { ...prev[p.id], [featureKey]: value } }))}
            />
          ))}
        </div>
      </section>

      {/* Organization Overrides */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold">Organization Limit Overrides</h2>
          <OverrideCreateDialog />
        </div>

        {overrides.length > 0 ? (
          <div className="rounded-lg border bg-card">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-muted">
                    <th className="text-left p-4 font-medium">Organization</th>
                    <th className="text-left p-4 font-medium">Limit Key</th>
                    <th className="text-left p-4 font-medium">Value</th>
                    <th className="text-right p-4 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {overrides.map((o) => (
                    <tr key={`${o.organizationId}:${o.limitKey}`} className="border-b border-muted/50">
                      <td className="p-4 font-mono text-sm">{o.organizationId.slice(0, 8)}…</td>
                      <td className="p-4">{formatLimitKey(o.limitKey)}</td>
                      <td className="p-4 font-mono">{o.limitValue ?? "∞ (unlimited)"}</td>
                      <td className="p-4 text-right">
                        <OverrideDeleteButton orgId={o.organizationId} limitKey={o.limitKey} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <div className="rounded-lg border bg-card p-8 text-center text-muted-foreground">
            No organization overrides configured.
          </div>
        )}
      </section>
    </div>
  );
}

function PlanRow({ plan }: { plan: PlanData }) {
  const [deleteState, deleteAction] = useActionState(deletePlanAction, { error: null, success: null });
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDelete = async () => {
    if (!confirm(`Delete plan "${plan.name}"? This cannot be undone.`)) return;
    setIsDeleting(true);
    const fd = new FormData();
    fd.append("id", plan.id);
    await deleteAction(fd);
    setIsDeleting(false);
  };

  return (
    <tr className="border-b border-muted/50 hover:bg-muted/30">
      <td className="p-4 font-mono text-sm">{plan.code}</td>
      <td className="p-4">{plan.name}</td>
      <td className="p-4 font-mono text-sm text-muted-foreground">
        {plan.stripePriceId || "—"}
      </td>
      <td className="p-4">
        <span className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs", plan.isCustom ? "bg-purple-100 text-purple-800" : "bg-blue-100 text-blue-800")}>
          {plan.isCustom ? "Custom" : "Standard"}
        </span>
      </td>
      <td className="p-4">
        <span className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs", plan.isActive ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-600")}>
          {plan.isActive ? "Active" : "Inactive"}
        </span>
      </td>
      <td className="p-4 text-sm">{plan.sortOrder}</td>
      <td className="p-4 text-right">
        <div className="flex items-center justify-end gap-2">
          <Link href={`/admin/plans/${plan.id}/edit`} className="text-muted-foreground hover:text-foreground">
            <Edit className="h-4 w-4" />
          </Link>
          <button
            onClick={handleDelete}
            disabled={isDeleting || deleteState.error}
            className="text-muted-foreground hover:text-destructive disabled:opacity-50"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </td>
    </tr>
  );
}

function PlanLimitsCard({
  plan,
  limits,
  features,
  onLimitChange,
  onFeatureChange,
}: {
  plan: PlanData;
  limits: Record<string, number | null>;
  features: Record<string, boolean>;
  onLimitChange: (key: string, value: number | null) => void;
  onFeatureChange: (key: string, value: boolean) => void;
}) {
  const [activeTab, setActiveTab] = useState<"limits" | "features">("limits");

  return (
    <div className="rounded-lg border bg-card p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold">{plan.name}</h3>
          <p className="text-sm text-muted-foreground font-mono">{plan.code}</p>
        </div>
        <div className="flex gap-1">
          {["limits", "features"].map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab as "limits" | "features")}
              className={cn(
                "px-3 py-1 text-sm rounded transition-colors",
                activeTab === tab
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted"
              )}
            >
              {tab === "limits" ? "Limits" : "Features"}
            </button>
          ))}
        </div>
      </div>

      {activeTab === "limits" ? (
        <div className="space-y-2">
          {LIMIT_KEYS.map((key) => (
            <LimitRow
              key={key}
              planId={plan.id}
              limitKey={key}
              limitValue={limits[key] ?? null}
              onSave={(value) => onLimitChange(key, value === "" ? null : Number(value))}
            />
          ))}
        </div>
      ) : (
        <div className="space-y-2">
          {FEATURE_KEYS.map((key) => (
            <FeatureRow
              key={key}
              planId={plan.id}
              featureKey={key}
              isEnabled={features[key] ?? false}
              onSave={(value) => onFeatureChange(key, value)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function LimitRow({
  planId,
  limitKey,
  limitValue,
  onSave,
}: {
  planId: string;
  limitKey: string;
  limitValue: number | null;
  onSave: (value: string) => void;
}) {
  const [value, setValue] = useState(limitValue?.toString() || "");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(value);
  };

  return (
    <form onSubmit={handleSubmit} className="flex items-center gap-2 p-2 rounded border border-muted/50">
      <label className="w-40 text-sm font-medium text-muted-foreground">{formatLimitKey(limitKey)}</label>
      <input
        type="number"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="∞"
        className="flex-1 max-w-xs px-2 py-1 text-sm border rounded bg-background"
        min="0"
      />
      <button type="submit" className="px-2 py-1 text-sm bg-primary text-primary-foreground rounded hover:bg-primary/90">
        Save
      </button>
      <PlanLimitDeleteButton planId={planId} limitKey={limitKey} />
    </form>
  );
}

function FeatureRow({
  planId,
  featureKey,
  isEnabled,
  onSave,
}: {
  planId: string;
  featureKey: string;
  isEnabled: boolean;
  onSave: (value: boolean) => void;
}) {
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(!isEnabled);
  };

  return (
    <form onSubmit={handleSubmit} className="flex items-center gap-2 p-2 rounded border border-muted/50">
      <label className="w-40 text-sm font-medium text-muted-foreground">{formatFeatureKey(featureKey)}</label>
      <label className="flex items-center gap-2 cursor-pointer flex-1">
        <input
          type="checkbox"
          checked={isEnabled}
          onChange={(e) => e.target.checked}
          className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
        />
        <span className="text-sm">{isEnabled ? "Enabled" : "Disabled"}</span>
      </label>
      <button type="submit" className="px-2 py-1 text-sm bg-primary text-primary-foreground rounded hover:bg-primary/90">
        Save
      </button>
      <PlanFeatureDeleteButton planId={planId} featureKey={featureKey} />
    </form>
  );
}

function PlanCreateDialog() {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    setSuccess(null);
    const fd = new FormData(e.currentTarget);
    const result = await createPlanAction({ error: null, success: null }, fd);
    if (result.error) setError(result.error);
    if (result.success) {
      setSuccess(result.success);
      setTimeout(() => {
        setOpen(false);
        setSuccess(null);
      }, 1500);
    }
    setSubmitting(false);
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded hover:bg-primary/90"
      >
        <Plus className="h-4 w-4" />
        New Plan
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-md rounded-lg bg-card p-6 shadow-lg">
            <h3 className="mb-4 text-lg font-semibold">Create Plan</h3>
            <form onSubmit={handleSubmit} className="space-y-4">
              {error && <div className="text-sm text-destructive">{error}</div>}
              {success && <div className="text-sm text-green-600">{success}</div>}

              <div>
                <label className="block text-sm font-medium mb-1">Code (slug)</label>
                <input name="code" type="text" required className="w-full px-3 py-2 border rounded" placeholder="basic" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Name</label>
                <input name="name" type="text" required className="w-full px-3 py-2 border rounded" placeholder="Basic Plan" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Stripe Price ID (optional)</label>
                <input name="stripePriceId" type="text" className="w-full px-3 py-2 border rounded" placeholder="price_..." />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <label className="flex items-center gap-2">
                  <input name="isCustom" type="checkbox" className="h-4 w-4" />
                  <span className="text-sm">Custom plan</span>
                </label>
                <label className="flex items-center gap-2">
                  <input name="isActive" type="checkbox" defaultChecked className="h-4 w-4" />
                  <span className="text-sm">Active</span>
                </label>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Sort Order</label>
                <input name="sortOrder" type="number" defaultValue="0" className="w-full px-3 py-2 border rounded" />
              </div>

              <div className="flex justify-end gap-2 pt-4">
                <button type="button" onClick={() => setOpen(false)} className="px-4 py-2 border rounded hover:bg-muted">
                  Cancel
                </button>
                <button type="submit" disabled={submitting} className="px-4 py-2 bg-primary text-primary-foreground rounded hover:bg-primary/90 disabled:opacity-50">
                  {submitting ? "Creating..." : "Create"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}

function OverrideCreateDialog() {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    setSuccess(null);
    const fd = new FormData(e.currentTarget);
    const result = await upsertOrgOverrideAction({ error: null, success: null }, fd);
    if (result.error) setError(result.error);
    if (result.success) {
      setSuccess(result.success);
      setTimeout(() => {
        setOpen(false);
        setSuccess(null);
      }, 1500);
    }
    setSubmitting(false);
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded hover:bg-primary/90"
      >
        <Plus className="h-4 w-4" />
        New Override
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-md rounded-lg bg-card p-6 shadow-lg">
            <h3 className="mb-4 text-lg font-semibold">Create Organization Override</h3>
            <form onSubmit={handleSubmit} className="space-y-4">
              {error && <div className="text-sm text-destructive">{error}</div>}
              {success && <div className="text-sm text-green-600">{success}</div>}

              <div>
                <label className="block text-sm font-medium mb-1">Organization ID</label>
                <input name="organizationId" type="text" required className="w-full px-3 py-2 border rounded" placeholder="org_..." />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Limit Key</label>
                <select name="limitKey" required className="w-full px-3 py-2 border rounded">
                  <option value="">Select limit…</option>
                  {LIMIT_KEYS.map((k) => (
                    <option key={k} value={k}>{formatLimitKey(k)}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Limit Value (empty = unlimited)</label>
                <input name="limitValue" type="number" min="0" className="w-full px-3 py-2 border rounded" placeholder="10" />
              </div>

              <div className="flex justify-end gap-2 pt-4">
                <button type="button" onClick={() => setOpen(false)} className="px-4 py-2 border rounded hover:bg-muted">
                  Cancel
                </button>
                <button type="submit" disabled={submitting} className="px-4 py-2 bg-primary text-primary-foreground rounded hover:bg-primary/90 disabled:opacity-50">
                  {submitting ? "Creating..." : "Create"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}

function PlanLimitDeleteButton({ planId, limitKey }: { planId: string; limitKey: string }) {
  const [state, action] = useActionState(deletePlanLimitAction, { error: null, success: null });

  const handleClick = async () => {
    if (!confirm(`Delete limit "${limitKey}" for this plan?`)) return;
    const fd = new FormData();
    fd.append("planId", planId);
    fd.append("limitKey", limitKey);
    await action(fd);
  };

  return (
    <button
      onClick={handleClick}
      disabled={state.error || state.success}
      className="text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded p-1 disabled:opacity-50"
    >
      <Trash2 className="h-4 w-4" />
    </button>
  );
}

function PlanFeatureDeleteButton({ planId, featureKey }: { planId: string; featureKey: string }) {
  const [state, action] = useActionState(deletePlanFeatureAction, { error: null, success: null });

  const handleClick = async () => {
    if (!confirm(`Delete feature flag "${featureKey}" for this plan?`)) return;
    const fd = new FormData();
    fd.append("planId", planId);
    fd.append("featureKey", featureKey);
    await action(fd);
  };

  return (
    <button
      onClick={handleClick}
      disabled={state.error || state.success}
      className="text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded p-1 disabled:opacity-50"
    >
      <Trash2 className="h-4 w-4" />
    </button>
  );
}

function OverrideDeleteButton({ orgId, limitKey }: { orgId: string; limitKey: string }) {
  const [deleting, setDeleting] = useState(false);

  const handleClick = async () => {
    if (!confirm(`Delete override for organization ${orgId.slice(0, 8)}… limit "${limitKey}"?`)) return;
    setDeleting(true);
    const fd = new FormData();
    fd.append("organizationId", orgId);
    fd.append("limitKey", limitKey);
    await deleteOrgOverrideAction({ error: null, success: null }, fd);
    setDeleting(false);
  };

  return (
    <button
      onClick={handleClick}
      disabled={deleting}
      className="text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded p-1 disabled:opacity-50"
    >
      <Trash2 className="h-4 w-4" />
    </button>
  );
}