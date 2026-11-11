"use client";

import { useEffect, useState } from "react";
import { createWorker } from "tesseract.js";

type History = {
  id: number;
  date: string;
  content: string;
};

type Customer = {
  id: number;
  name: string;
  phone: string;
  carrier: string;
  device: string;
  plan: string;
  openDate: string;
  endDate: string;
  status: string;
  history?: History[];
  followupDate?: string;
  followupStatus?: string;
};

const emptyCustomer = {
  name: "",
  phone: "",
  carrier: "SKT",
  device: "",
  plan: "",
  openDate: "",
  endDate: "",
  status: "개통완료",
  followupDate: "",
  followupStatus: "연락예정",
};

// 기본 약정: 개통일 기준 24개월, 만료일은 그 전날입니다.
function calculateContractEnd(openDate: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(openDate)) return "";
  const [year, month, day] = openDate.split("-").map(Number);
  const start = new Date(Date.UTC(year, month - 1, day));
  if (start.getUTCFullYear() !== year || start.getUTCMonth() !== month - 1 || start.getUTCDate() !== day) return "";
  const end = new Date(Date.UTC(year + 2, month - 1, day));
  // 윤년 2월 29일은 2년 후 3월 1일의 전날인 2월 28일로 처리됩니다.
  end.setUTCDate(end.getUTCDate() - 1);
  return end.toISOString().slice(0, 10);
}

function parseKoreanDate(value: string): string {
  const match = value.match(/(20\d{2})\s*[.\-/년]\s*(\d{1,2})\s*[.\-/월]\s*(\d{1,2})\s*일?/);
  if (!match) return "";
  const date = `${match[1]}-${match[2].padStart(2, "0")}-${match[3].padStart(2, "0")}`;
  const [year, month, day] = date.split("-").map(Number);
  const test = new Date(Date.UTC(year, month - 1, day));
  return test.getUTCFullYear() === year && test.getUTCMonth() === month - 1 && test.getUTCDate() === day ? date : "";
}

function findLabeledDate(text: string, labels: string[]): string {
  for (const label of labels) {
    const safe = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const match = text.match(new RegExp(safe + "\\s*[:：]?\\s*([^\\n\\r]{0,45})", "i"));
    if (match) {
      const date = parseKoreanDate(match[1]);
      if (date) return date;
    }
  }
  return "";
}

function daysUntil(date?: string) {
  if (!date) return null;

  const [year, month, day] = date.split("-").map(Number);
  if (!year || !month || !day) return null;

  const target = Date.UTC(year, month - 1, day);
  const now = new Date();
  const today = Date.UTC(
    now.getFullYear(),
    now.getMonth(),
    now.getDate()
  );

  return Math.round((target - today) / 86400000);
}

function contractLabel(date?: string) {
  const days = daysUntil(date);

  if (days === null) return "날짜 미등록";
  if (days < 0) return "만료";
  if (days <= 30) return "긴급";
  if (days <= 60) return "주의";
  if (days <= 90) return "예정";
  return "일반";
}


type AutoTask = {
  key: string;
  customer: Customer;
  kind: string;
  date: string;
};

function shiftDate(date: string, days: number): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return "";
  const [y, m, d] = date.split("-").map(Number);
  const value = new Date(Date.UTC(y, m - 1, d));
  if (value.getUTCFullYear() !== y || value.getUTCMonth() !== m - 1 || value.getUTCDate() !== d) return "";
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function createAutoTasks(customers: Customer[]): AutoTask[] {
  const tasks: AutoTask[] = [];
  for (const customer of customers) {
    const stages = [
      { kind: "개통 7일 후 확인", date: shiftDate(customer.openDate, 7) },
      { kind: "개통 30일 후 확인", date: shiftDate(customer.openDate, 30) },
      { kind: "만료 90일 전 상담", date: shiftDate(customer.endDate, -90) },
      { kind: "만료 30일 전 상담", date: shiftDate(customer.endDate, -30) },
      { kind: "만료 7일 전 상담", date: shiftDate(customer.endDate, -7) },
    ];
    for (const stage of stages) {
      if (stage.date) {
        tasks.push({
          key: `${customer.id}:${stage.kind}:${stage.date}`,
          customer,
          kind: stage.kind,
          date: stage.date,
        });
      }
    }
  }
  return tasks.sort((a, b) => a.date.localeCompare(b.date));
}

export default function Home() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [selected, setSelected] = useState<Customer | null>(null);
  const [search, setSearch] = useState("");
  const [form, setForm] = useState(emptyCustomer);
  const [historyText, setHistoryText] = useState("");
  const [followupDate, setFollowupDate] = useState("");
  const [followupStatus, setFollowupStatus] = useState("연락예정");
  const [loaded, setLoaded] = useState(false);
  const [autoDone, setAutoDone] = useState<Record<string, boolean>>({});
  const [tab, setTab] = useState("고객관리");
const [ocrFile, setOcrFile] = useState<File | null>(null);
const [ocrText, setOcrText] = useState("");
const [ocrLoading, setOcrLoading] = useState(false);
  const [ocrProgress, setOcrProgress] = useState("");

  useEffect(() => {
    try {
      const saved = localStorage.getItem("smart-crm-customers");
      const done = localStorage.getItem("smart-crm-auto-followup-done");
      if (done) setAutoDone(JSON.parse(done));
      if (saved) {
        setCustomers(JSON.parse(saved));
      }
    } catch {
      alert("저장된 고객정보를 읽지 못했습니다.");
    }
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (loaded) {
      localStorage.setItem(
        "smart-crm-customers",
        JSON.stringify(customers)
      );
    }
  }, [customers, loaded]);

  useEffect(() => {
    if (loaded) {
      localStorage.setItem("smart-crm-auto-followup-done", JSON.stringify(autoDone));
    }
  }, [autoDone, loaded]);

  function toggleAutoTask(task: AutoTask) {
    const isCurrentlyDone = !!autoDone[task.key];
    const historyMarker = `[자동 사후관리:${task.key}]`;

    // 완료 처리 시 이력 추가, 완료 취소 시 해당 자동 이력만 삭제합니다.
    setCustomers(prev => prev.map(customer => {
      if (customer.id !== task.customer.id) return customer;
      const previousHistory = customer.history || [];
      const cleanedHistory = previousHistory.filter(h => !h.content.includes(historyMarker));
      if (isCurrentlyDone) return { ...customer, history: cleanedHistory };
      const record: History = {
        id: Date.now(),
        date: new Date().toLocaleString("ko-KR"),
        content: `${task.kind} 완료 (예정일: ${task.date}) ${historyMarker}`,
      };
      return { ...customer, history: [record, ...cleanedHistory] };
    }));
    setAutoDone(prev => ({ ...prev, [task.key]: !isCurrentlyDone }));
    setSelected(prev => {
      if (!prev || prev.id !== task.customer.id) return prev;
      const cleanedHistory = (prev.history || []).filter(h => !h.content.includes(historyMarker));
      if (isCurrentlyDone) return { ...prev, history: cleanedHistory };
      return {
        ...prev,
        history: [{
          id: Date.now(),
          date: new Date().toLocaleString("ko-KR"),
          content: `${task.kind} 완료 (예정일: ${task.date}) ${historyMarker}`,
        }, ...cleanedHistory],
      };
    });
  }

  function addCustomer(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim() || !form.phone.trim()) {
      alert("고객명과 연락처를 입력하세요.");
      return;
    }
    const customer: Customer = { ...form, id: Date.now(), history: [] };
    setCustomers(prev => [customer, ...prev]);
    setForm({ ...emptyCustomer });
    alert("고객이 등록되었습니다.");
  }

  function openDetail(c: Customer) {
    setSelected(c);
    setHistoryText("");
    setFollowupDate(c.followupDate || "");
    setFollowupStatus(c.followupStatus || "연락예정");
  }

  function updateCustomer(updated: Customer) {
    setCustomers(prev =>
      prev.map(c => c.id === updated.id ? updated : c)
    );
    setSelected(updated);
  }

  function saveFollowup() {
    if (!selected) return;

    const updated = {
      ...selected,
      followupDate,
      followupStatus,
    };

    updateCustomer(updated);
    alert("사후관리 일정이 저장되었습니다.");
  }

  function addHistory() {
    if (!selected || !historyText.trim()) {
      alert("상담 내용을 입력하세요.");
      return;
    }

    const updated: Customer = {
      ...selected,
      history: [
        {
          id: Date.now(),
          date: new Date().toLocaleString("ko-KR"),
          content: historyText.trim(),
        },
        ...(selected.history || []),
      ],
    };

    updateCustomer(updated);
    setHistoryText("");
    alert("상담이력이 저장되었습니다.");
  }

  function updateStatus(c: Customer, status: string) {
    updateCustomer({
      ...c,
      followupStatus: status,
    });
  }

  function deleteCustomer(id: number) {
    if (!confirm("이 고객정보를 삭제하시겠습니까?")) return;
    setCustomers(prev => prev.filter(c => c.id !== id));
    if (selected?.id === id) setSelected(null);
  }

  const filtered = customers.filter(c =>
    [c.name, c.phone, c.device, c.carrier]
      .join(" ")
      .toLowerCase()
      .includes(search.toLowerCase())
  );

  const contractCustomers = customers.filter(c => {
    const days = daysUntil(c.endDate);
    return days !== null && days <= 90;
  });

  const urgentCount = customers.filter(c => {
    const days = daysUntil(c.endDate);
    return days !== null && days >= 0 && days <= 30;
  }).length;

  const overdueCount = customers.filter(c => {
    const days = daysUntil(c.endDate);
    return days !== null && days < 0;
  }).length;

  const autoTasks = createAutoTasks(customers);
  const dueAutoTasks = autoTasks.filter(t => !autoDone[t.key] && (daysUntil(t.date) ?? 1) <= 0);

  const pendingCount = customers.filter(c =>
    c.followupStatus !== "연락완료"
  ).length;

  async function recognizeImage() {
    if (!ocrFile) {
      alert("먼저 가입신청서 사진 또는 PDF를 선택하세요.");
      return;
    }
    const supported = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
    if (!supported.includes(ocrFile.type)) {
      alert("JPG, PNG, WEBP, PDF 파일만 선택할 수 있습니다.");
      return;
    }
    if (ocrFile.size > 20 * 1024 * 1024) {
      alert("20MB 이하 파일을 선택하세요.");
      return;
    }
    setOcrLoading(true);
    setOcrText("");
    setOcrProgress("OCR 준비 중...");
    let worker: Awaited<ReturnType<typeof createWorker>> | undefined;
    try {
      const images: (File | HTMLCanvasElement)[] = [];
      if (ocrFile.type === "application/pdf") {
        setOcrProgress("PDF 페이지를 이미지로 변환 중...");
        const pdfjs = await import("pdfjs-dist");
        
pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";

        const bytes = new Uint8Array(await ocrFile.arrayBuffer());
        const pdf = await pdfjs.getDocument({ data: bytes }).promise;
        if (pdf.numPages > 10) {
          alert("PDF는 한 번에 최대 10페이지까지 지원합니다. 파일을 나누어 주세요.");
          return;
        }
        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i);
          const viewport = page.getViewport({ scale: 2 });
          const canvas = document.createElement("canvas");
          canvas.width = Math.ceil(viewport.width);
          canvas.height = Math.ceil(viewport.height);
          const context = canvas.getContext("2d");
          if (!context) throw new Error("PDF 이미지 변환에 실패했습니다.");
          await page.render({ canvasContext: context, canvas, viewport }).promise;
          // PNG 파일로 변환하여 PDF 페이지의 렌더링 리소스와 분리합니다.
          const pngBlob = await new Promise<Blob>((resolve, reject) => {
            canvas.toBlob(blob => {
              if (blob) resolve(blob);
              else reject(new Error("PDF 페이지를 PNG로 변환하지 못했습니다."));
            }, "image/png");
          });
          images.push(new File([pngBlob], `page-${i}.png`, { type: "image/png" }));
          page.cleanup();
          canvas.width = 0;
          canvas.height = 0;
        }
        // PDF 페이지가 모두 PNG 파일로 변환된 뒤 문서 자원을 정리합니다.
        if (typeof pdf.cleanup === "function") await pdf.cleanup();
      } else {
        images.push(ocrFile);
      }
      worker = await createWorker("kor+eng");
      const pages: string[] = [];
      for (let i = 0; i < images.length; i++) {
        setOcrProgress(`${i + 1} / ${images.length} 페이지 인식 중...`);
        const result = await worker.recognize(images[i]);
        pages.push(result.data.text);
      }
      const text = pages.join("\n\n----- 다음 페이지 -----\n\n");
      setOcrText(text);
      applyOcrText(text);
      setOcrProgress("인식 완료. 고객정보를 확인하세요.");
    } catch (error) {
      console.error("OCR 오류", error);
      setOcrProgress("인식 실패");
      alert("문서 인식에 실패했습니다. PDF가 암호화되었는지 또는 사진이 선명한지 확인하세요.");
    } finally {
      if (worker) await worker.terminate();
      setOcrLoading(false);
    }
  }

  function applyOcrText(text: string) {
    const phoneMatch = text.match(/01[016789][-\s]?\d{3,4}[-\s]?\d{4}/);
    const findField = (labels: string[]) => {
      for (const label of labels) {
        const safe = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const match = text.match(new RegExp(safe + "\\s*[:：]?\\s*([^\\n\\r]+)", "i"));
        if (match?.[1]) return match[1].trim().slice(0, 60);
      }
      return "";
    };
    const name = findField(["고객명", "가입자명", "성명"]);
    const device = findField(["휴대폰기종", "단말기명", "모델명", "기종"]);
    const plan = findField(["가입요금제", "요금제"]);
    const carrier = /SKT|SK텔레콤/i.test(text) ? "SKT"
      : /LG\s*U\+|LG유플러스/i.test(text) ? "LG U+"
      : /\bKT\b|케이티/.test(text) ? "KT" : "";
    const openDate = findLabeledDate(text, ["개통일", "개통일자", "가입일", "가입일자"]);
    const explicitEndDate = findLabeledDate(text, ["약정 만료일", "약정만료일", "약정 종료일", "약정종료일"]);
    setForm(prev => ({
      ...prev,
      openDate: openDate || prev.openDate,
      endDate: explicitEndDate || (openDate ? calculateContractEnd(openDate) : prev.endDate),
      name: name || prev.name,
      phone: phoneMatch ? phoneMatch[0].replace(/\s/g, "") : prev.phone,
      device: device || prev.device,
      plan: plan || prev.plan,
      carrier: carrier || prev.carrier,
    }));
  }

  return (
    <main className="min-h-screen bg-slate-100 text-slate-800">

      <header className="bg-slate-950 text-white p-6">
        <h1 className="text-2xl font-bold">SMART CRM</h1>
        <p className="text-slate-400 text-sm mt-2">
          MOBILE SALES · AI OCR · CUSTOMER CARE
        </p>
      </header>

      <div className="max-w-7xl mx-auto p-5 md:p-8">

        <h2 className="text-2xl font-bold mb-6">
          고객관리 대시보드
        </h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          {[
            ["전체 고객", customers.length],
            ["30일 이내 만료", urgentCount],
            ["약정 만료", overdueCount],
            ["미완료 후속관리", pendingCount],
          ].map(([title, value]) => (
            <div key={String(title)}
              className="bg-white rounded-xl p-5 shadow-sm">
              <p className="text-slate-500">{title}</p>
              <strong className="text-3xl">{value}</strong>
              <span className="ml-2">명</span>
            </div>
          ))}
        </div>

        <div className="flex gap-2 mb-6 flex-wrap">
          <button
            onClick={() => setTab("고객관리")}
            className={`px-5 py-3 rounded-lg font-bold ${
              tab === "고객관리"
                ? "bg-blue-600 text-white"
                : "bg-white"
            }`}>
            고객관리
          </button>

          <button
            onClick={() => setTab("약정관리")}
            className={`px-5 py-3 rounded-lg font-bold ${
              tab === "약정관리"
                ? "bg-blue-600 text-white"
                : "bg-white"
            }`}>
            약정 만료 관리
          </button>

          <button
            onClick={() => setTab("사후관리")}
            className={`px-5 py-3 rounded-lg font-bold ${
              tab === "사후관리"
                ? "bg-blue-600 text-white"
                : "bg-white"
            }`}>
            사후관리 일정
          </button>

<button
  onClick={() => setTab("OCR")}
  className={`px-5 py-3 rounded-lg font-bold ${
    tab === "OCR"
      ? "bg-blue-600 text-white"
      : "bg-white"
  }`}>
  AI 신청서 OCR
</button>
        </div>

{tab === "OCR" && (
  <section className="bg-white rounded-xl p-6 shadow-sm mb-8">
    <h3 className="text-xl font-bold mb-4">
      AI 가입신청서 자동 인식
    </h3>

    <p className="text-slate-500 mb-4">
      가입신청서 사진(JPG, PNG, WEBP) 또는 PDF(최대 10페이지, 20MB)를 선택하세요.
    </p>

    <input
      type="file"
      accept="image/jpeg,image/png,image/webp,application/pdf"
      className="border rounded-lg p-3 w-full mb-4"
      onChange={e =>
        setOcrFile(e.target.files?.[0] || null)
      }
    />

    <button
      type="button"
      onClick={recognizeImage}
      disabled={!ocrFile || ocrLoading}
      className="bg-blue-600 text-white rounded-lg px-6 py-3 font-bold disabled:bg-gray-400"
    >
      {ocrLoading ? "문서 인식 중..." : "사진 / PDF 인식 시작"}
    </button>

    {ocrProgress && <p className="mt-3 text-sm text-slate-600" role="status">{ocrProgress}</p>}

    {ocrText && (
      <div className="mt-6">
        <h4 className="font-bold mb-2">인식 결과</h4>

        <textarea
          className="border rounded-lg p-3 w-full"
          rows={10}
          value={ocrText}
          onChange={e => setOcrText(e.target.value)}
        />
        <p className="text-sm text-slate-500 mt-2">인식 결과를 수정한 뒤 아래 버튼을 누르면 고객등록 항목에 다시 반영됩니다. 정확하지 않은 값은 직접 확인해 주세요.</p>
        <button type="button" onClick={() => applyOcrText(ocrText)} className="bg-slate-700 text-white rounded-lg px-5 py-3 mt-3 mr-2">수정 내용 다시 반영</button>

        <button
          type="button"
          onClick={() => setTab("고객관리")}
          className="bg-emerald-600 text-white rounded-lg px-6 py-3 mt-4"
        >
          고객등록 화면으로 이동
        </button>
      </div>
    )}
  </section>
)}        
{tab === "고객관리" && (
          <>
            <section className="bg-white rounded-xl p-6 shadow-sm mb-8">
              <h3 className="text-xl font-bold mb-5">
                + 신규 고객 등록
              </h3>

              <form onSubmit={addCustomer}>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">

                  <input required placeholder="고객명"
                    className="border rounded-lg p-3"
                    value={form.name}
                    onChange={e => setForm({...form,name:e.target.value})}/>

                  <input required placeholder="연락처"
                    className="border rounded-lg p-3"
                    value={form.phone}
                    onChange={e => setForm({...form,phone:e.target.value})}/>

                  <select className="border rounded-lg p-3"
                    value={form.carrier}
                    onChange={e => setForm({...form,carrier:e.target.value})}>
                    <option>SKT</option>
                    <option>KT</option>
                    <option>LG U+</option>
                    <option>알뜰폰</option>
                  </select>

                  <input placeholder="휴대폰 기종"
                    className="border rounded-lg p-3"
                    value={form.device}
                    onChange={e => setForm({...form,device:e.target.value})}/>

                  <input placeholder="요금제"
                    className="border rounded-lg p-3"
                    value={form.plan}
                    onChange={e => setForm({...form,plan:e.target.value})}/>

                  <select className="border rounded-lg p-3"
                    value={form.status}
                    onChange={e => setForm({...form,status:e.target.value})}>
                    <option>개통완료</option>
                    <option>상담중</option>
                    <option>사후관리</option>
                    <option>재약정예정</option>
                  </select>

                  <div>
                    <label className="text-sm">개통일</label>
                    <input type="date"
                      className="border rounded-lg p-3 w-full"
                      value={form.openDate}
                      onChange={e => setForm(prev => ({...prev,openDate:e.target.value,endDate:calculateContractEnd(e.target.value)}))}/>
                  </div>

                  <div>
                    <label className="text-sm">약정 만료일</label>
                    <input type="date"
                      className="border rounded-lg p-3 w-full"
                      value={form.endDate}
                      onChange={e => setForm({...form,endDate:e.target.value})}/>
                  </div>
                </div>

                <button type="submit"
                  className="mt-5 bg-blue-600 text-white rounded-lg px-8 py-3 font-bold">
                  고객 등록하기
                </button>
              </form>
            </section>

            <section className="bg-white rounded-xl p-6 shadow-sm">
              <h3 className="text-xl font-bold mb-4">
                고객 목록 ({filtered.length}명)
              </h3>

              <input
                placeholder="고객명, 연락처, 기종 검색"
                className="border rounded-lg p-3 w-full mb-5"
                value={search}
                onChange={e => setSearch(e.target.value)}
              />

              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                  <thead className="bg-slate-100">
                    <tr>
                      <th className="p-3">고객명</th>
                      <th className="p-3">연락처</th>
                      <th className="p-3">통신사</th>
                      <th className="p-3">기종</th>
                      <th className="p-3">약정 만료</th>
                      <th className="p-3">만료 구분</th>
                      <th className="p-3">관리</th>
                    </tr>
                  </thead>

                  <tbody>
                    {filtered.map(c => (
                      <tr key={c.id} className="border-b">
                        <td className="p-3">
                          <button onClick={() => openDetail(c)}
                            className="text-blue-600 font-bold underline">
                            {c.name}
                          </button>
                        </td>
                        <td className="p-3">{c.phone}</td>
                        <td className="p-3">{c.carrier}</td>
                        <td className="p-3">{c.device}</td>
                        <td className="p-3">{c.endDate || "-"}</td>
                        <td className="p-3">{contractLabel(c.endDate)}</td>
                        <td className="p-3">
                          <button onClick={() => deleteCustomer(c.id)}
                            className="text-red-600">삭제</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        )}

        {tab === "약정관리" && (
          <section className="bg-white rounded-xl p-6 shadow-sm">
            <h3 className="text-xl font-bold mb-2">
              약정 만료 대상 고객
            </h3>
            <p className="text-sm text-slate-500 mb-5">
              만료일까지 남은 날짜를 자동 계산합니다.
            </p>

            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="bg-slate-100">
                  <tr>
                    <th className="p-3">고객명</th>
                    <th className="p-3">연락처</th>
                    <th className="p-3">만료일</th>
                    <th className="p-3">남은 기간</th>
                    <th className="p-3">분류</th>
                  </tr>
                </thead>
                <tbody>
                  {contractCustomers.map(c => {
                    const days = daysUntil(c.endDate);
                    return (
                      <tr key={c.id} className="border-b">
                        <td className="p-3">
                          <button onClick={() => openDetail(c)}
                            className="text-blue-600 underline font-bold">
                            {c.name}
                          </button>
                        </td>
                        <td className="p-3">{c.phone}</td>
                        <td className="p-3">{c.endDate}</td>
                        <td className="p-3">
                          {days !== null && days < 0
                            ? `${Math.abs(days)}일 경과`
                            : `${days}일 남음`}
                        </td>
                        <td className="p-3 font-bold">
                          {contractLabel(c.endDate)}
                        </td>
                      </tr>
                    );
                  })}
                  {contractCustomers.length === 0 && (
                    <tr>
                      <td colSpan={5}
                        className="p-8 text-center text-slate-400">
                        현재 약정 만료 관리 대상이 없습니다.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {tab === "사후관리" && (
          <section className="bg-white rounded-xl p-6 shadow-sm">
            <h3 className="text-xl font-bold mb-2">
              고객 사후관리 일정
            </h3>
            <p className="text-sm text-slate-600 mb-4">
              개통일과 약정 만료일을 기준으로 5가지 연락 일정을 자동 계산합니다.
              이 화면은 자동 발송이 아닌 내부 연락 체크리스트입니다.
            </p>
            <div className="bg-blue-50 rounded-lg p-4 mb-5">
              <strong>오늘까지 처리할 자동 일정: {dueAutoTasks.length}건</strong>
              <p className="text-sm text-slate-600 mt-1">지난 일정도 미완료 상태이면 포함됩니다.</p>
            </div>
            <div className="overflow-x-auto mb-8">
              <table className="w-full text-sm text-left">
                <thead className="bg-slate-100">
                  <tr>
                    <th className="p-3">연락 예정일</th>
                    <th className="p-3">고객명</th>
                    <th className="p-3">자동관리 항목</th>
                    <th className="p-3">상태</th>
                    <th className="p-3">처리</th>
                  </tr>
                </thead>
                <tbody>
                  {autoTasks.map(task => {
                    const done = !!autoDone[task.key];
                    const days = daysUntil(task.date);
                    return (
                      <tr key={task.key} className="border-b">
                        <td className="p-3">{task.date}</td>
                        <td className="p-3">
                          <button className="text-blue-700 underline" onClick={() => openDetail(task.customer)}>
                            {task.customer.name}
                          </button>
                        </td>
                        <td className="p-3">{task.kind}</td>
                        <td className="p-3">{done ? "완료" : days !== null && days < 0 ? "기한 경과" : days === 0 ? "오늘 예정" : "예정"}</td>
                        <td className="p-3">
                          <button type="button" onClick={() => toggleAutoTask(task)}
                            className="bg-slate-800 text-white rounded px-3 py-2">
                            {done ? "완료 취소" : "완료 처리"}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                  {autoTasks.length === 0 && (
                    <tr><td colSpan={5} className="p-6 text-center text-slate-500">개통일 또는 약정 만료일이 등록된 고객이 없습니다.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
            <h3 className="text-lg font-bold mb-4">직접 등록한 사후관리 일정</h3>

            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="bg-slate-100">
                  <tr>
                    <th className="p-3">고객명</th>
                    <th className="p-3">연락처</th>
                    <th className="p-3">연락 예정일</th>
                    <th className="p-3">처리 상태</th>
                    <th className="p-3">상세관리</th>
                  </tr>
                </thead>
                <tbody>
                  {customers.map(c => (
                    <tr key={c.id} className="border-b">
                      <td className="p-3">{c.name}</td>
                      <td className="p-3">{c.phone}</td>
                      <td className="p-3">{c.followupDate || "미정"}</td>
                      <td className="p-3">{c.followupStatus || "연락예정"}</td>
                      <td className="p-3">
                        <button onClick={() => openDetail(c)}
                          className="text-blue-600 underline">
                          관리하기
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {selected && (
          <div className="fixed inset-0 z-50 bg-black/50 overflow-y-auto p-4 flex items-start justify-center">
            <section className="bg-white rounded-2xl shadow-xl w-full max-w-2xl p-6 my-8">

              <div className="flex justify-between mb-6">
                <div>
                  <h2 className="text-2xl font-bold">
                    {selected.name}
                  </h2>
                  <p className="text-slate-500">{selected.phone}</p>
                </div>
                <button onClick={() => setSelected(null)}
                  className="text-2xl">✕</button>
              </div>

              <div className="grid grid-cols-2 gap-3 bg-slate-50 p-4 rounded-xl">
                <p>통신사: {selected.carrier}</p>
                <p>기종: {selected.device || "-"}</p>
                <p>요금제: {selected.plan || "-"}</p>
                <p>상태: {selected.status}</p>
                <p>개통일: {selected.openDate || "-"}</p>
                <p>약정 만료: {selected.endDate || "-"}</p>
                <p>만료 분류: {contractLabel(selected.endDate)}</p>
                <p>
                  남은 기간: {daysUntil(selected.endDate) === null
                    ? "미등록"
                    : daysUntil(selected.endDate)! < 0
                      ? `${Math.abs(daysUntil(selected.endDate)!)}일 경과`
                      : `${daysUntil(selected.endDate)}일`}
                </p>
              </div>

              <div className="mt-7 border-t pt-5">
                <h3 className="text-lg font-bold mb-4">
                  사후관리 일정 설정
                </h3>

                <label className="text-sm text-slate-500">
                  연락 예정일
                </label>
                <input type="date"
                  className="border rounded-lg p-3 w-full mt-1 mb-4"
                  value={followupDate}
                  onChange={e => setFollowupDate(e.target.value)}
                />

                <label className="text-sm text-slate-500">
                  처리 상태
                </label>
                <select
                  className="border rounded-lg p-3 w-full mt-1"
                  value={followupStatus}
                  onChange={e => setFollowupStatus(e.target.value)}>
                  <option>연락예정</option>
                  <option>연락완료</option>
                  <option>재연락필요</option>
                </select>

                <button onClick={saveFollowup}
                  className="w-full bg-blue-600 text-white rounded-lg p-3 mt-4 font-bold">
                  사후관리 일정 저장
                </button>

                {selected.followupDate && (
                  <p className="text-sm text-slate-500 mt-2">
                    저장된 일정: {selected.followupDate} /
                    {selected.followupStatus || "연락예정"}
                  </p>
                )}
              </div>

              <div className="mt-7 border-t pt-5">
                <h3 className="text-lg font-bold mb-3">
                  상담 및 사후관리 이력
                </h3>

                <textarea
                  className="border rounded-lg p-3 w-full"
                  rows={3}
                  placeholder="통화 내용, 재약정 상담, 고객 요청사항 등을 입력하세요."
                  value={historyText}
                  onChange={e => setHistoryText(e.target.value)}
                />

                <button onClick={addHistory}
                  className="bg-emerald-600 text-white rounded-lg px-6 py-3 mt-2">
                  상담이력 등록
                </button>

                <div className="mt-5 space-y-3">
                  {(selected.history || []).map(h => (
                    <div key={h.id}
                      className="border-l-4 border-blue-500 bg-slate-50 p-4 rounded-r-lg">
                      <p className="text-xs text-slate-500">{h.date}</p>
                      <p className="mt-2 whitespace-pre-wrap">{h.content}</p>
                    </div>
                  ))}
                  {(selected.history || []).length === 0 && (
                    <p className="text-center text-slate-400 py-5">
                      아직 등록된 이력이 없습니다.
                    </p>
                  )}
                </div>
              </div>

              <button onClick={() => setSelected(null)}
                className="w-full bg-slate-800 text-white rounded-lg p-3 mt-7">
                닫기
              </button>
            </section>
          </div>
        )}
      </div>
    </main>
  );
}
