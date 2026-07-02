import { useEffect, useState } from "react";
import { ExternalLink, Share2 } from "lucide-react";
import { PageHeader } from "../components/PageHeader";
import { EmptyState } from "../components/EmptyState";
import { LoadingState } from "../components/LoadingState";
import { supabase } from "../lib/supabase";

const { data: _td } = supabase.storage.from("topology").getPublicUrl("ospf_topology.html");
const TOPOLOGY_URL = _td.publicUrl;

export function Topology() {
  const [status, setStatus] = useState<"loading" | "ok" | "missing">("loading");
  const [blobUrl, setBlobUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let objectUrl: string | null = null;

    fetch(TOPOLOGY_URL)
      .then((res) => {
        if (!res.ok) throw new Error("not found");
        return res.text();
      })
      .then((html) => {
        if (cancelled) return;
        const blob = new Blob([html], { type: "text/html" });
        objectUrl = URL.createObjectURL(blob);
        setBlobUrl(objectUrl);
        setStatus("ok");
      })
      .catch(() => {
        if (!cancelled) setStatus("missing");
      });

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, []);

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <PageHeader title="Topology" description="Sơ đồ topology OSPF do engine topology hiện có tạo ra (chỉ đọc, nhúng sẵn)." />
        {status === "ok" && (
          <a
            href={blobUrl ?? TOPOLOGY_URL}
            target="_blank"
            rel="noreferrer"
            className="inline-flex flex-shrink-0 items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm transition-colors hover:bg-slate-50"
          >
            <ExternalLink className="h-4 w-4" />
            Mở trong tab mới
          </a>
        )}
      </div>

      {status === "loading" && <LoadingState label="Đang tải topology..." />}

      {status === "missing" && (
        <EmptyState
          icon={Share2}
          title="Không tìm thấy file topology"
          description="Chưa có file topology trên Supabase Storage. Hãy đặt file ospf_topology_*.html vào thư mục nguồn và chạy import_data.py để upload lên."
        />
      )}

      {status === "ok" && blobUrl && (
        <div className="overflow-hidden rounded-xl border border-slate-200/80 bg-white shadow-card">
          <iframe src={blobUrl} title="OSPF Topology" className="h-[75vh] w-full" />
        </div>
      )}
    </div>
  );
}
