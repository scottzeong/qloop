import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { useLocation } from "wouter";
import { useState } from "react";
import { toast } from "sonner";
import PageHeader from "@/components/PageHeader";
import { Settings, Layers, Grid3X3, BookOpen, Save, ChevronDown, ChevronUp, Users } from "lucide-react";

type Tab = "question_types" | "dimensions" | "weights" | "policies" | "users";

// ── Question Type Manager ──────────────────────────────────────────────────
function QuestionTypeManager() {
  const { data: types, refetch } = trpc.socratic.getQuestionTypes.useQuery();
  const updateMutation = trpc.socratic.updateQuestionType.useMutation();
  const [editing, setEditing] = useState<number | null>(null);
  const [form, setForm] = useState<Record<string, string>>({});

  const startEdit = (t: typeof types extends (infer U)[] | undefined ? U : never) => {
    if (!t) return;
    setEditing((t as { id: number }).id);
    setForm({
      displayName: (t as { displayName?: string | null }).displayName ?? "",
      description: (t as { description?: string | null }).description ?? "",
      purpose: (t as { purpose?: string | null }).purpose ?? "",
      promptInstruction: (t as { promptInstruction?: string | null }).promptInstruction ?? "",
    });
  };

  const save = async (id: number) => {
    try {
      await updateMutation.mutateAsync({ id, ...form });
      toast.success("저장되었습니다.");
      setEditing(null);
      refetch();
    } catch { toast.error("저장 실패"); }
  };

  return (
    <div>
      <p className="pm-label mb-5">질문 유형 관리 <span className="text-[#0F0F0F] font-bold">12개</span></p>
      <div className="space-y-2.5">
        {(types ?? []).map((t) => {
          const isEditing = editing === t.id;
          return (
            <div key={t.id} className="pm-card overflow-hidden">
              <button
                className="w-full px-5 py-4 flex items-center justify-between text-left hover:bg-[#F8F7F5] transition-colors"
                onClick={() => isEditing ? setEditing(null) : startEdit(t)}
              >
                <div className="flex items-center gap-4">
                  <span className="text-xs font-mono text-[#A3A3A3] w-24 flex-shrink-0">{t.name}</span>
                  <span className="text-sm font-semibold">{t.displayName ?? t.name}</span>
                  <span className="text-xs text-[#737373] truncate max-w-xs hidden md:block">{t.description}</span>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className="pm-badge pm-badge-gray">Edit</span>
                  {isEditing ? <ChevronUp size={13} className="text-[#A3A3A3]" /> : <ChevronDown size={13} className="text-[#A3A3A3]" />}
                </div>
              </button>
              {isEditing && (
                <div className="border-t border-[#E5E5E3] px-5 py-4 bg-[#F8F7F5] space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="pm-label mb-1 block">표시 이름</label>
                      <input className="pm-input text-sm" value={form.displayName} onChange={(e) => setForm({ ...form, displayName: e.target.value })} />
                    </div>
                    <div>
                      <label className="pm-label mb-1 block">목적</label>
                      <input className="pm-input text-sm" value={form.purpose} onChange={(e) => setForm({ ...form, purpose: e.target.value })} />
                    </div>
                  </div>
                  <div>
                    <label className="pm-label mb-1 block">설명</label>
                    <textarea className="pm-input text-sm resize-y" style={{ minHeight: "80px" }} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
                  </div>
                  <div>
                    <label className="pm-label mb-1 block">프롬프트 지시문</label>
                    <p className="text-xs text-[#A3A3A3] mb-1">AI가 이 질문 유형을 생성할 때 사용하는 지시문입니다.</p>
                    <textarea className="pm-input text-sm resize-y" style={{ minHeight: "120px" }} value={form.promptInstruction} onChange={(e) => setForm({ ...form, promptInstruction: e.target.value })} />
                  </div>
                  <div className="flex justify-end gap-3">
                    <button className="text-xs text-[#737373] hover:text-[#0F0F0F] transition-colors" onClick={() => setEditing(null)}>취소</button>
                    <button
                      className="flex items-center gap-1.5 text-xs font-semibold px-4 py-2 rounded-lg text-white transition-colors hover:opacity-90"
                      style={{ backgroundColor: "var(--pm-indigo)" }}
                      onClick={() => save(t.id)}
                    >
                      <Save size={11} /> 저장
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Evaluation Dimension Manager ──────────────────────────────────────────
function DimensionManager() {
  const { data: dims, refetch } = trpc.socratic.getEvaluationDimensions.useQuery();
  const updateMutation = trpc.socratic.updateEvaluationDimension.useMutation();
  const [editing, setEditing] = useState<number | null>(null);
  const [form, setForm] = useState<Record<string, string>>({});

  const startEdit = (d: NonNullable<typeof dims>[0]) => {
    setEditing(d.id);
    setForm({ displayName: d.displayName ?? "", description: d.description ?? "" });
  };

  const save = async (id: number) => {
    try {
      await updateMutation.mutateAsync({ id, ...form });
      toast.success("저장되었습니다.");
      setEditing(null);
      refetch();
    } catch { toast.error("저장 실패"); }
  };

  return (
    <div>
      <p className="pm-label mb-5">평가 요소 관리 <span className="text-[#0F0F0F] font-bold">6개</span></p>
      <div className="space-y-2.5">
        {(dims ?? []).map((d) => {
          const isEditing = editing === d.id;
          return (
            <div key={d.id} className="pm-card overflow-hidden">
              <div className="px-5 py-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 mb-1.5">
                      <span className="text-xs font-mono text-[#A3A3A3] w-24 flex-shrink-0">{d.name}</span>
                      <span className="text-sm font-semibold">{d.displayName ?? d.name}</span>
                    </div>
                    <p className="text-xs text-[#737373] leading-relaxed">{d.description}</p>
                  </div>
                  <button
                    className="flex items-center gap-1.5 pm-badge pm-badge-gray flex-shrink-0 cursor-pointer"
                    onClick={() => isEditing ? setEditing(null) : startEdit(d)}
                  >
                    Edit {isEditing ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
                  </button>
                </div>
              </div>
              {isEditing && (
                <div className="border-t border-[#E5E5E3] px-5 py-4 bg-[#F8F7F5] space-y-3">
                  <div>
                    <label className="pm-label mb-1 block">표시 이름</label>
                    <input className="pm-input text-sm" value={form.displayName} onChange={(e) => setForm({ ...form, displayName: e.target.value })} />
                  </div>
                  <div>
                    <label className="pm-label mb-1 block">설명</label>
                    <textarea className="pm-input text-sm resize-y" style={{ minHeight: "100px" }} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
                  </div>
                  <div className="flex justify-end gap-3">
                    <button className="text-xs text-[#737373] hover:text-[#0F0F0F] transition-colors" onClick={() => setEditing(null)}>취소</button>
                    <button
                      className="flex items-center gap-1.5 text-xs font-semibold px-4 py-2 rounded-lg text-white hover:opacity-90"
                      style={{ backgroundColor: "var(--pm-indigo)" }}
                      onClick={() => save(d.id)}
                    >
                      <Save size={11} /> 저장
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Weight Matrix Editor ──────────────────────────────────────────────────
function WeightMatrixEditor() {
  const { data: matrix, refetch } = trpc.socratic.getWeightMatrix.useQuery();
  const updateMutation = trpc.socratic.updateWeights.useMutation();
  const [localWeights, setLocalWeights] = useState<Record<string, Record<string, number>>>({});
  const [saving, setSaving] = useState<number | null>(null);

  const getWeight = (typeId: number, dimId: number) => {
    const local = localWeights[typeId]?.[dimId];
    if (local !== undefined) return local;
    return matrix?.weights.find((w) => w.questionTypeId === typeId && w.evaluationDimensionId === dimId)?.weight ?? 0;
  };

  const setWeight = (typeId: number, dimId: number, val: number) => {
    setLocalWeights((prev) => ({ ...prev, [typeId]: { ...(prev[typeId] ?? {}), [dimId]: val } }));
  };

  const saveRow = async (typeId: number) => {
    const dims = matrix?.dims ?? [];
    const weights = dims.map((d) => ({ evaluationDimensionId: d.id, weight: getWeight(typeId, d.id) }));
    const total = weights.reduce((s, w) => s + w.weight, 0);
    if (total !== 100) { toast.error(`가중치 합계가 ${total}입니다. 100이 되어야 합니다.`); return; }
    setSaving(typeId);
    try {
      await updateMutation.mutateAsync({ questionTypeId: typeId, weights });
      toast.success("저장되었습니다.");
      setLocalWeights((prev) => { const n = { ...prev }; delete n[typeId]; return n; });
      refetch();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "저장 실패");
    } finally { setSaving(null); }
  };

  if (!matrix) return <div className="pm-label text-[#A3A3A3]">로딩 중...</div>;

  return (
    <div>
      <p className="pm-label mb-1.5">가중치 매트릭스</p>
      <p className="text-xs text-[#737373] mb-6">각 질문유형별로 평가요소 가중치를 설정합니다. 행의 합계는 반드시 100이어야 합니다.</p>
      <div className="pm-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-[#E5E5E3] bg-[#F8F7F5]">
                <th className="text-left py-3 px-4 font-semibold text-[#525252] w-36">질문유형</th>
                {matrix.dims.map((d) => (
                  <th key={d.id} className="text-center py-3 px-2 font-semibold text-[#525252] w-20">
                    {d.displayName ?? d.name}
                  </th>
                ))}
                <th className="text-center py-3 px-2 font-semibold text-[#525252] w-16">합계</th>
                <th className="w-16 py-3 px-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-[#F0EFED]">
              {matrix.types.map((t) => {
                const total = matrix.dims.reduce((s, d) => s + getWeight(t.id, d.id), 0);
                const isDirty = localWeights[t.id] !== undefined;
                return (
                  <tr key={t.id} className="hover:bg-[#F8F7F5] transition-colors">
                    <td className="py-3 px-4">
                      <div className="font-semibold text-[#0F0F0F]">{t.displayName ?? t.name}</div>
                      <div className="text-[#A3A3A3] font-mono text-[10px]">{t.name}</div>
                    </td>
                    {matrix.dims.map((d) => (
                      <td key={d.id} className="py-2 px-2 text-center">
                        <input
                          type="number" min={0} max={100}
                          className="w-14 text-center border border-[#E5E5E3] rounded-lg py-1 text-xs focus:outline-none focus:border-[var(--pm-indigo)] bg-white"
                          value={getWeight(t.id, d.id)}
                          onChange={(e) => setWeight(t.id, d.id, Number(e.target.value))}
                        />
                      </td>
                    ))}
                    <td className={`py-2 px-2 text-center font-bold ${total === 100 ? "text-green-600" : "text-red-600"}`}>
                      {total}
                    </td>
                    <td className="py-2 px-2 text-center">
                      {isDirty && (
                        <button
                          className="text-xs px-2.5 py-1 rounded-lg font-semibold text-white disabled:opacity-50 hover:opacity-90"
                          style={{ backgroundColor: "var(--pm-indigo)" }}
                          disabled={saving === t.id}
                          onClick={() => saveRow(t.id)}
                        >
                          {saving === t.id ? "..." : "저장"}
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ── Policy Editor ──────────────────────────────────────────────────────────
function PolicyEditor() {
  const { data: policies, refetch } = trpc.socratic.getPolicies.useQuery();
  const { data: types } = trpc.socratic.getQuestionTypes.useQuery();
  const { data: dims } = trpc.socratic.getEvaluationDimensions.useQuery();
  const upsertMutation = trpc.socratic.upsertPolicy.useMutation();

  const [editing, setEditing] = useState<number | "new" | null>(null);
  const [form, setForm] = useState({
    name: "",
    description: "",
    mode: "socratic" as "socratic" | "exam_prep" | "project" | "critical_thinking" | "custom",
    enabledQuestionTypeIds: [] as number[],
    enabledDimensionIds: [] as number[],
    isDefault: 0,
    maxQuestionsPerSession: 15,
    minQuestionsPerSession: 10,
  });

  const startNew = () => {
    setForm({
      name: "", description: "", mode: "socratic",
      enabledQuestionTypeIds: (types ?? []).map((t) => t.id),
      enabledDimensionIds: (dims ?? []).map((d) => d.id),
      isDefault: 0, maxQuestionsPerSession: 15, minQuestionsPerSession: 10,
    });
    setEditing("new");
  };

  const startEdit = (p: NonNullable<typeof policies>[0]) => {
    setForm({
      name: p.name, description: p.description ?? "",
      mode: (p.mode ?? "socratic") as typeof form.mode,
      enabledQuestionTypeIds: (p.enabledQuestionTypeIdsJson as number[]) ?? [],
      enabledDimensionIds: (p.enabledDimensionIdsJson as number[]) ?? [],
      isDefault: p.isDefault ?? 0,
      maxQuestionsPerSession: ((p.constraintsJson as { maxQuestionsPerSession?: number }) ?? {}).maxQuestionsPerSession ?? 15,
      minQuestionsPerSession: ((p.constraintsJson as { minQuestionsPerSession?: number }) ?? {}).minQuestionsPerSession ?? 10,
    });
    setEditing(p.id);
  };

  const save = async () => {
    try {
      await upsertMutation.mutateAsync({
        id: editing !== "new" ? (editing ?? undefined) : undefined,
        name: form.name, description: form.description, mode: form.mode,
        enabledQuestionTypeIds: form.enabledQuestionTypeIds,
        enabledDimensionIds: form.enabledDimensionIds,
        isDefault: form.isDefault,
        constraintsJson: { maxQuestionsPerSession: form.maxQuestionsPerSession, minQuestionsPerSession: form.minQuestionsPerSession },
      });
      toast.success("정책이 저장되었습니다.");
      setEditing(null);
      refetch();
    } catch (e: unknown) { toast.error(e instanceof Error ? e.message : "저장 실패"); }
  };

  const toggleId = (arr: number[], id: number) => arr.includes(id) ? arr.filter((x) => x !== id) : [...arr, id];

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <p className="pm-label">평가 정책 관리</p>
        <button
          className="text-xs font-semibold px-4 py-2 rounded-lg text-white hover:opacity-90 transition-colors"
          style={{ backgroundColor: "var(--pm-indigo)" }}
          onClick={startNew}
        >
          + 새 정책
        </button>
      </div>

      <div className="space-y-2.5 mb-8">
        {(policies ?? []).map((p) => (
          <div key={p.id} className="pm-card px-5 py-4 flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2.5 mb-1">
                <span className="text-sm font-semibold">{p.name}</span>
                <span className="pm-badge pm-badge-gray">{p.mode}</span>
                {p.isDefault ? <span className="pm-badge pm-badge-green">기본값</span> : null}
              </div>
              <div className="text-xs text-[#737373]">{p.description}</div>
            </div>
            <button
              className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-[#E5E5E3] hover:bg-[#F0EFED] transition-colors"
              onClick={() => startEdit(p)}
            >
              편집
            </button>
          </div>
        ))}
      </div>

      {editing !== null && (
        <div className="pm-card p-6 border-t-4" style={{ borderTopColor: "var(--pm-indigo)" }}>
          <p className="pm-label mb-5">{editing === "new" ? "새 정책 생성" : "정책 편집"}</p>
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div>
              <label className="pm-label mb-1 block">정책 이름</label>
              <input className="pm-input text-sm" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div>
              <label className="pm-label mb-1 block">모드</label>
              <select className="pm-input text-sm" value={form.mode} onChange={(e) => setForm({ ...form, mode: e.target.value as typeof form.mode })}>
                <option value="socratic">Socratic</option>
                <option value="exam_prep">Exam Prep</option>
                <option value="project">Project</option>
                <option value="critical_thinking">Critical Thinking</option>
                <option value="custom">Custom</option>
              </select>
            </div>
          </div>
          <div className="mb-4">
            <label className="pm-label mb-1 block">설명</label>
            <textarea className="pm-input text-sm h-16 resize-none" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div>
              <label className="pm-label mb-1 block">최소 질문 수</label>
              <input type="number" min={10} className="pm-input text-sm" value={form.minQuestionsPerSession} onChange={(e) => setForm({ ...form, minQuestionsPerSession: Math.max(10, Number(e.target.value)) })} />
            </div>
            <div>
              <label className="pm-label mb-1 block">최대 질문 수</label>
              <input type="number" className="pm-input text-sm" value={form.maxQuestionsPerSession} onChange={(e) => setForm({ ...form, maxQuestionsPerSession: Number(e.target.value) })} />
            </div>
          </div>
          <div className="mb-4">
            <label className="pm-label mb-2 block">활성 질문유형</label>
            <div className="flex flex-wrap gap-2">
              {(types ?? []).map((t) => (
                <button
                  key={t.id}
                  className={`pm-badge cursor-pointer transition-colors ${form.enabledQuestionTypeIds.includes(t.id) ? "pm-badge-indigo" : "pm-badge-gray hover:bg-[#E8E8FD] hover:text-[#4343B0]"}`}
                  onClick={() => setForm({ ...form, enabledQuestionTypeIds: toggleId(form.enabledQuestionTypeIds, t.id) })}
                >
                  {t.displayName ?? t.name}
                </button>
              ))}
            </div>
          </div>
          <div className="mb-5">
            <label className="pm-label mb-2 block">활성 평가요소</label>
            <div className="flex flex-wrap gap-2">
              {(dims ?? []).map((d) => (
                <button
                  key={d.id}
                  className={`pm-badge cursor-pointer transition-colors ${form.enabledDimensionIds.includes(d.id) ? "pm-badge-indigo" : "pm-badge-gray hover:bg-[#E8E8FD] hover:text-[#4343B0]"}`}
                  onClick={() => setForm({ ...form, enabledDimensionIds: toggleId(form.enabledDimensionIds, d.id) })}
                >
                  {d.displayName ?? d.name}
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-3 mb-6">
            <input type="checkbox" id="isDefault" checked={form.isDefault === 1} onChange={(e) => setForm({ ...form, isDefault: e.target.checked ? 1 : 0 })} className="rounded" />
            <label htmlFor="isDefault" className="text-sm text-[#525252]">기본 정책으로 설정</label>
          </div>
          <div className="flex justify-end gap-3">
            <button className="text-xs text-[#737373] hover:text-[#0F0F0F] transition-colors" onClick={() => setEditing(null)}>취소</button>
            <button
              className="flex items-center gap-1.5 text-xs font-semibold px-4 py-2 rounded-lg text-white hover:opacity-90"
              style={{ backgroundColor: "var(--pm-indigo)" }}
              onClick={save}
            >
              <Save size={11} /> 저장
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── User Manager ──────────────────────────────────────────────────────────
const ROLE_LABELS: Record<string, string> = {
  user: "일반 사용자",
  instructor: "교수자",
  admin: "관리자",
  superadmin: "슈퍼관리자",
};

const ROLE_BADGE: Record<string, string> = {
  superadmin: "pm-badge-red",
  admin: "pm-badge-indigo",
  instructor: "pm-badge-amber",
  user: "pm-badge-gray",
};

function UserManager() {
  const { user: me } = useAuth();
  const { data: users, refetch } = trpc.auth.listUsers.useQuery();
  const updateRole = trpc.auth.updateUserRole.useMutation({
    onSuccess: () => { toast.success("역할이 변경되었습니다"); refetch(); },
    onError: (e) => toast.error(e.message),
  });

  return (
    <div>
      <p className="pm-label mb-6">전체 사용자 목록 및 역할 관리 <span className="text-[#0F0F0F]">(슈퍼관리자 전용)</span></p>
      <div className="pm-card overflow-hidden">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-[#E5E5E3] bg-[#F8F7F5]">
              <th className="text-left py-3 px-5 font-semibold text-[#525252]">이름</th>
              <th className="text-left py-3 px-4 font-semibold text-[#525252]">이메일</th>
              <th className="text-left py-3 px-4 font-semibold text-[#525252]">현재 역할</th>
              <th className="text-left py-3 px-4 font-semibold text-[#525252]">역할 변경</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#F0EFED]">
            {users?.map((u) => (
              <tr key={u.openId} className="hover:bg-[#F8F7F5] transition-colors">
                <td className="py-3.5 px-5 font-medium">{u.name || "—"}</td>
                <td className="py-3.5 px-4 text-[#737373]">{u.email || "—"}</td>
                <td className="py-3.5 px-4">
                  <span className={`pm-badge ${ROLE_BADGE[u.role ?? "user"] ?? "pm-badge-gray"}`}>
                    {ROLE_LABELS[u.role ?? "user"] ?? u.role}
                  </span>
                </td>
                <td className="py-3.5 px-4">
                  {u.openId === me?.openId ? (
                    <span className="text-[#D4D4D2]">본인</span>
                  ) : (
                    <select
                      className="border border-[#E5E5E3] rounded-lg text-xs px-2.5 py-1.5 bg-white focus:outline-none focus:border-[var(--pm-indigo)] cursor-pointer"
                      value={u.role ?? "user"}
                      onChange={(e) => updateRole.mutate({ openId: u.openId, role: e.target.value as "user" | "admin" | "instructor" | "superadmin" })}
                    >
                      <option value="user">일반 사용자</option>
                      <option value="instructor">교수자</option>
                      <option value="admin">관리자</option>
                      <option value="superadmin">슈퍼관리자</option>
                    </select>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────
export default function AdminSocratic() {
  const [, navigate] = useLocation();
  const { user, isAuthenticated } = useAuth();
  const [activeTab, setActiveTab] = useState<Tab>("question_types");

  const isAdminOrAbove = user?.role === "admin" || user?.role === "superadmin";
  if (!isAuthenticated || !isAdminOrAbove) {
    return (
      <div className="min-h-screen bg-[#EDECEA] flex items-center justify-center">
        <p className="pm-label text-[#A3A3A3]">관리자 권한이 필요합니다.</p>
      </div>
    );
  }

  const tabs: { id: Tab; label: string; icon: React.ReactNode; superadminOnly?: boolean }[] = [
    { id: "question_types", label: "질문 유형", icon: <Settings size={13} /> },
    { id: "dimensions", label: "평가 요소", icon: <Layers size={13} /> },
    { id: "weights", label: "가중치 매트릭스", icon: <Grid3X3 size={13} /> },
    { id: "policies", label: "평가 정책", icon: <BookOpen size={13} /> },
    { id: "users", label: "사용자 관리", icon: <Users size={13} />, superadminOnly: true },
  ].filter((t) => !t.superadminOnly || user?.role === "superadmin");

  return (
    <div className="min-h-screen bg-[#EDECEA]">
      <PageHeader title="NEURAL SYSTEM SET" />

      <div className="max-w-6xl mx-auto px-8 py-8">
        {/* Tabs - pill segment */}
        <div className="flex items-center gap-1 bg-[#F0EFED] rounded-xl p-1 mb-8 w-fit">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              className={`flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-lg transition-all ${
                activeTab === tab.id
                  ? "bg-white shadow-sm text-[#0F0F0F]"
                  : "text-[#737373] hover:text-[#0F0F0F]"
              }`}
              onClick={() => setActiveTab(tab.id)}
            >
              <span className={activeTab === tab.id ? "" : "opacity-60"}>{tab.icon}</span>
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        {activeTab === "question_types" && <QuestionTypeManager />}
        {activeTab === "dimensions" && <DimensionManager />}
        {activeTab === "weights" && <WeightMatrixEditor />}
        {activeTab === "policies" && <PolicyEditor />}
        {activeTab === "users" && <UserManager />}
      </div>
    </div>
  );
}
