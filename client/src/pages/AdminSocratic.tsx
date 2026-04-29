import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { useLocation } from "wouter";
import { useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, Settings, Layers, Grid3X3, BookOpen, Save, ChevronDown, ChevronUp } from "lucide-react";

type Tab = "question_types" | "dimensions" | "weights" | "policies";

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
    } catch {
      toast.error("저장 실패");
    }
  };

  return (
    <div>
      <div className="swiss-label mb-6">질문 유형 관리 (12개)</div>
      <div className="space-y-3">
        {(types ?? []).map((t) => {
          const isEditing = editing === t.id;
          return (
            <div key={t.id} className="border border-gray-200">
              <button
                className="w-full p-4 flex items-center justify-between text-left hover:bg-gray-50"
                onClick={() => isEditing ? setEditing(null) : startEdit(t)}
              >
                <div className="flex items-center gap-4">
                  <span className="text-xs font-mono text-gray-400 w-24">{t.name}</span>
                  <span className="text-sm font-bold">{t.displayName ?? t.name}</span>
                  <span className="text-xs text-gray-500 truncate max-w-xs">{t.description}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className={`text-xs px-2 py-0.5 border ${t.defaultEnabled ? "border-green-300 text-green-700 bg-green-50" : "border-gray-200 text-gray-400"}`}>
                    {t.defaultEnabled ? "활성" : "비활성"}
                  </span>
                  {isEditing ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                </div>
              </button>
              {isEditing && (
                <div className="border-t border-gray-100 p-4 bg-gray-50 space-y-3">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="swiss-label mb-1">표시 이름</label>
                      <input
                        className="w-full border border-gray-300 px-3 py-2 text-sm"
                        value={form.displayName}
                        onChange={(e) => setForm({ ...form, displayName: e.target.value })}
                      />
                    </div>
                    <div>
                      <label className="swiss-label mb-1">목적</label>
                      <input
                        className="w-full border border-gray-300 px-3 py-2 text-sm"
                        value={form.purpose}
                        onChange={(e) => setForm({ ...form, purpose: e.target.value })}
                      />
                    </div>
                  </div>
                  <div>
                    <label className="swiss-label mb-1">설명</label>
                    <textarea
                      className="w-full border border-gray-300 px-3 py-2 text-sm h-16 resize-none"
                      value={form.description}
                      onChange={(e) => setForm({ ...form, description: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="swiss-label mb-1">프롬프트 지시문</label>
                    <textarea
                      className="w-full border border-gray-300 px-3 py-2 text-sm h-24 resize-none font-mono text-xs"
                      value={form.promptInstruction}
                      onChange={(e) => setForm({ ...form, promptInstruction: e.target.value })}
                    />
                  </div>
                  <div className="flex justify-end gap-3">
                    <button
                      className="text-xs text-gray-500 hover:text-black"
                      onClick={() => setEditing(null)}
                    >취소</button>
                    <button
                      className="flex items-center gap-1 text-xs font-bold px-4 py-2 bg-black text-white hover:bg-gray-800"
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
    setForm({
      displayName: d.displayName ?? "",
      description: d.description ?? "",
    });
  };

  const save = async (id: number) => {
    try {
      await updateMutation.mutateAsync({ id, ...form });
      toast.success("저장되었습니다.");
      setEditing(null);
      refetch();
    } catch {
      toast.error("저장 실패");
    }
  };

  return (
    <div>
      <div className="swiss-label mb-6">평가 요소 관리 (6개)</div>
      <div className="space-y-3">
        {(dims ?? []).map((d) => {
          const isEditing = editing === d.id;
          return (
            <div key={d.id} className="border border-gray-200">
              <button
                className="w-full p-4 flex items-center justify-between text-left hover:bg-gray-50"
                onClick={() => isEditing ? setEditing(null) : startEdit(d)}
              >
                <div className="flex items-center gap-4">
                  <span className="text-xs font-mono text-gray-400 w-24">{d.name}</span>
                  <span className="text-sm font-bold">{d.displayName ?? d.name}</span>
                  <span className="text-xs text-gray-500 truncate max-w-sm">{d.description}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className={`text-xs px-2 py-0.5 border ${d.enabled ? "border-green-300 text-green-700 bg-green-50" : "border-gray-200 text-gray-400"}`}>
                    {d.enabled ? "활성" : "비활성"}
                  </span>
                  {isEditing ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                </div>
              </button>
              {isEditing && (
                <div className="border-t border-gray-100 p-4 bg-gray-50 space-y-3">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="swiss-label mb-1">표시 이름</label>
                      <input
                        className="w-full border border-gray-300 px-3 py-2 text-sm"
                        value={form.displayName}
                        onChange={(e) => setForm({ ...form, displayName: e.target.value })}
                      />
                    </div>
                  </div>
                  <div>
                    <label className="swiss-label mb-1">설명</label>
                    <textarea
                      className="w-full border border-gray-300 px-3 py-2 text-sm h-16 resize-none"
                      value={form.description}
                      onChange={(e) => setForm({ ...form, description: e.target.value })}
                    />
                  </div>
                  <div className="flex justify-end gap-3">
                    <button className="text-xs text-gray-500 hover:text-black" onClick={() => setEditing(null)}>취소</button>
                    <button
                      className="flex items-center gap-1 text-xs font-bold px-4 py-2 bg-black text-white hover:bg-gray-800"
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
    const found = matrix?.weights.find((w) => w.questionTypeId === typeId && w.evaluationDimensionId === dimId);
    return found?.weight ?? 0;
  };

  const setWeight = (typeId: number, dimId: number, val: number) => {
    setLocalWeights((prev) => ({
      ...prev,
      [typeId]: { ...(prev[typeId] ?? {}), [dimId]: val },
    }));
  };

  const saveRow = async (typeId: number) => {
    const dims = matrix?.dims ?? [];
    const weights = dims.map((d) => ({ evaluationDimensionId: d.id, weight: getWeight(typeId, d.id) }));
    const total = weights.reduce((s, w) => s + w.weight, 0);
    if (total !== 100) {
      toast.error(`가중치 합계가 ${total}입니다. 100이 되어야 합니다.`);
      return;
    }
    setSaving(typeId);
    try {
      await updateMutation.mutateAsync({ questionTypeId: typeId, weights });
      toast.success("저장되었습니다.");
      setLocalWeights((prev) => { const n = { ...prev }; delete n[typeId]; return n; });
      refetch();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "저장 실패");
    } finally {
      setSaving(null);
    }
  };

  if (!matrix) return <div className="swiss-label text-gray-400">로딩 중...</div>;

  return (
    <div>
      <div className="swiss-label mb-2">가중치 매트릭스</div>
      <p className="text-xs text-gray-500 mb-6">각 질문유형별로 평가요소 가중치를 설정합니다. 행의 합계는 반드시 100이어야 합니다.</p>
      <div className="overflow-x-auto">
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="border-b-2 border-black">
              <th className="text-left py-3 pr-4 font-bold w-36">질문유형</th>
              {matrix.dims.map((d) => (
                <th key={d.id} className="text-center py-3 px-2 font-bold w-20">
                  {d.displayName ?? d.name}
                </th>
              ))}
              <th className="text-center py-3 px-2 font-bold w-16">합계</th>
              <th className="w-16" />
            </tr>
          </thead>
          <tbody>
            {matrix.types.map((t) => {
              const total = matrix.dims.reduce((s, d) => s + getWeight(t.id, d.id), 0);
              const isDirty = localWeights[t.id] !== undefined;
              return (
                <tr key={t.id} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="py-3 pr-4">
                    <div className="font-bold">{t.displayName ?? t.name}</div>
                    <div className="text-gray-400 font-mono">{t.name}</div>
                  </td>
                  {matrix.dims.map((d) => (
                    <td key={d.id} className="py-2 px-2 text-center">
                      <input
                        type="number"
                        min={0}
                        max={100}
                        className="w-14 text-center border border-gray-200 py-1 text-xs"
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
                        className="text-xs px-2 py-1 bg-black text-white hover:bg-gray-800 disabled:opacity-50"
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
    minQuestionsPerSession: 5,
  });

  const startNew = () => {
    setForm({
      name: "",
      description: "",
      mode: "socratic",
      enabledQuestionTypeIds: (types ?? []).map((t) => t.id),
      enabledDimensionIds: (dims ?? []).map((d) => d.id),
      isDefault: 0,
      maxQuestionsPerSession: 15,
      minQuestionsPerSession: 5,
    });
    setEditing("new");
  };

  const startEdit = (p: NonNullable<typeof policies>[0]) => {
    setForm({
      name: p.name,
      description: p.description ?? "",
      mode: (p.mode ?? "socratic") as typeof form.mode,
      enabledQuestionTypeIds: (p.enabledQuestionTypeIdsJson as number[]) ?? [],
      enabledDimensionIds: (p.enabledDimensionIdsJson as number[]) ?? [],
      isDefault: p.isDefault ?? 0,
      maxQuestionsPerSession: ((p.constraintsJson as { maxQuestionsPerSession?: number }) ?? {}).maxQuestionsPerSession ?? 15,
      minQuestionsPerSession: ((p.constraintsJson as { minQuestionsPerSession?: number }) ?? {}).minQuestionsPerSession ?? 5,
    });
    setEditing(p.id);
  };

  const save = async () => {
    try {
      await upsertMutation.mutateAsync({
        id: editing !== "new" ? (editing ?? undefined) : undefined,
        name: form.name,
        description: form.description,
        mode: form.mode,
        enabledQuestionTypeIds: form.enabledQuestionTypeIds,
        enabledDimensionIds: form.enabledDimensionIds,
        isDefault: form.isDefault,
        constraintsJson: {
          maxQuestionsPerSession: form.maxQuestionsPerSession,
          minQuestionsPerSession: form.minQuestionsPerSession,
        },
      });
      toast.success("정책이 저장되었습니다.");
      setEditing(null);
      refetch();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "저장 실패");
    }
  };

  const toggleId = (arr: number[], id: number) =>
    arr.includes(id) ? arr.filter((x) => x !== id) : [...arr, id];

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div className="swiss-label">평가 정책 관리</div>
        <button
          className="text-xs font-bold px-4 py-2 bg-black text-white hover:bg-gray-800"
          onClick={startNew}
        >
          + 새 정책
        </button>
      </div>

      {/* Policy list */}
      <div className="space-y-3 mb-8">
        {(policies ?? []).map((p) => (
          <div key={p.id} className="border border-gray-200 p-4 flex items-center justify-between">
            <div>
              <div className="flex items-center gap-3">
                <span className="text-sm font-bold">{p.name}</span>
                <span className="text-xs px-2 py-0.5 border border-gray-200 text-gray-500">{p.mode}</span>
                {p.isDefault ? (
                  <span className="text-xs px-2 py-0.5 border border-green-300 text-green-700 bg-green-50">기본값</span>
                ) : null}
              </div>
              <div className="text-xs text-gray-500 mt-1">{p.description}</div>
            </div>
            <button
              className="text-xs text-gray-500 hover:text-black border border-gray-200 px-3 py-1"
              onClick={() => startEdit(p)}
            >
              편집
            </button>
          </div>
        ))}
      </div>

      {/* Edit form */}
      {editing !== null && (
        <div className="border-2 border-black p-6 bg-gray-50">
          <div className="swiss-label mb-4">{editing === "new" ? "새 정책 생성" : "정책 편집"}</div>
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div>
              <label className="swiss-label mb-1">정책 이름</label>
              <input
                className="w-full border border-gray-300 px-3 py-2 text-sm"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>
            <div>
              <label className="swiss-label mb-1">모드</label>
              <select
                className="w-full border border-gray-300 px-3 py-2 text-sm"
                value={form.mode}
                onChange={(e) => setForm({ ...form, mode: e.target.value as typeof form.mode })}
              >
                <option value="socratic">Socratic</option>
                <option value="exam_prep">Exam Prep</option>
                <option value="project">Project</option>
                <option value="critical_thinking">Critical Thinking</option>
                <option value="custom">Custom</option>
              </select>
            </div>
          </div>
          <div className="mb-4">
            <label className="swiss-label mb-1">설명</label>
            <textarea
              className="w-full border border-gray-300 px-3 py-2 text-sm h-16 resize-none"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          </div>
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div>
              <label className="swiss-label mb-1">최소 질문 수</label>
              <input
                type="number"
                className="w-full border border-gray-300 px-3 py-2 text-sm"
                value={form.minQuestionsPerSession}
                onChange={(e) => setForm({ ...form, minQuestionsPerSession: Number(e.target.value) })}
              />
            </div>
            <div>
              <label className="swiss-label mb-1">최대 질문 수</label>
              <input
                type="number"
                className="w-full border border-gray-300 px-3 py-2 text-sm"
                value={form.maxQuestionsPerSession}
                onChange={(e) => setForm({ ...form, maxQuestionsPerSession: Number(e.target.value) })}
              />
            </div>
          </div>
          <div className="mb-4">
            <label className="swiss-label mb-2">활성 질문유형</label>
            <div className="flex flex-wrap gap-2">
              {(types ?? []).map((t) => (
                <button
                  key={t.id}
                  className={`text-xs px-3 py-1 border transition-colors ${
                    form.enabledQuestionTypeIds.includes(t.id)
                      ? "border-black bg-black text-white"
                      : "border-gray-300 text-gray-600 hover:border-black"
                  }`}
                  onClick={() => setForm({ ...form, enabledQuestionTypeIds: toggleId(form.enabledQuestionTypeIds, t.id) })}
                >
                  {t.displayName ?? t.name}
                </button>
              ))}
            </div>
          </div>
          <div className="mb-4">
            <label className="swiss-label mb-2">활성 평가요소</label>
            <div className="flex flex-wrap gap-2">
              {(dims ?? []).map((d) => (
                <button
                  key={d.id}
                  className={`text-xs px-3 py-1 border transition-colors ${
                    form.enabledDimensionIds.includes(d.id)
                      ? "border-black bg-black text-white"
                      : "border-gray-300 text-gray-600 hover:border-black"
                  }`}
                  onClick={() => setForm({ ...form, enabledDimensionIds: toggleId(form.enabledDimensionIds, d.id) })}
                >
                  {d.displayName ?? d.name}
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-3 mb-6">
            <input
              type="checkbox"
              id="isDefault"
              checked={form.isDefault === 1}
              onChange={(e) => setForm({ ...form, isDefault: e.target.checked ? 1 : 0 })}
            />
            <label htmlFor="isDefault" className="text-sm">기본 정책으로 설정</label>
          </div>
          <div className="flex justify-end gap-3">
            <button className="text-xs text-gray-500 hover:text-black" onClick={() => setEditing(null)}>취소</button>
            <button
              className="flex items-center gap-1 text-xs font-bold px-4 py-2 bg-black text-white hover:bg-gray-800"
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

// ── Main Page ──────────────────────────────────────────────────────────────
export default function AdminSocratic() {
  const [, navigate] = useLocation();
  const { user, isAuthenticated } = useAuth();
  const [activeTab, setActiveTab] = useState<Tab>("question_types");

  if (!isAuthenticated || user?.role !== "admin") {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <p className="swiss-label text-gray-400">관리자 권한이 필요합니다.</p>
      </div>
    );
  }

  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: "question_types", label: "질문 유형", icon: <Settings size={13} /> },
    { id: "dimensions", label: "평가 요소", icon: <Layers size={13} /> },
    { id: "weights", label: "가중치 매트릭스", icon: <Grid3X3 size={13} /> },
    { id: "policies", label: "평가 정책", icon: <BookOpen size={13} /> },
  ];

  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <header className="border-b-2 border-black sticky top-0 bg-white z-50">
        <div className="max-w-6xl mx-auto px-8 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={() => navigate("/dashboard")}
              className="flex items-center gap-2 swiss-label hover:text-black transition-colors"
            >
              <ArrowLeft size={12} /> 대시보드
            </button>
            <div className="w-px h-4 bg-black" />
            <span className="text-sm font-bold">Socratic 시스템 관리</span>
          </div>
          <span className="text-xs text-gray-400">Admin</span>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-8 py-8">
        {/* Tabs */}
        <div className="flex border-b-2 border-black mb-8">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              className={`flex items-center gap-2 px-6 py-3 text-xs font-bold transition-colors ${
                activeTab === tab.id
                  ? "border-b-2 border-black -mb-0.5 text-black"
                  : "text-gray-400 hover:text-black"
              }`}
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        {activeTab === "question_types" && <QuestionTypeManager />}
        {activeTab === "dimensions" && <DimensionManager />}
        {activeTab === "weights" && <WeightMatrixEditor />}
        {activeTab === "policies" && <PolicyEditor />}
      </div>
    </div>
  );
}
